import { NextResponse } from "next/server";
import { publicProductError } from "@/lib/api-errors";
import { db } from "@/db";
import { categories, productImages, productVariants, products } from "@/db/schema";
import { desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import { assertPublishableProductImage, duplicateProduct, normalizeProduct, sanitizeFlagsPatch, validateProduct, validateProductSku, writeImages, writeVariants } from "@/lib/product-write";

export const dynamic = "force-dynamic";

type Body = Record<string, unknown> & {
  id?: number;
  action?: "duplicate" | "bulk" | "flags";
  ids?: number[];
  patch?: Record<string, unknown>;
  images?: unknown[];
  variants?: unknown[];
};

async function guard() {
  return (await isAdmin()) ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

async function assertPublishImages(executor: Pick<typeof db, "select">, ids: number[]) {
  for (const id of ids) await assertPublishableProductImage(executor, id);
}

async function productCategoryError(categorySlug: string, status: string) {
  const [category] = await db
    .select({ slug: categories.slug, active: categories.active })
    .from(categories)
    .where(eq(categories.slug, categorySlug))
    .limit(1);
  if (!category) return "Category not found.";
  if (status === "published" && !category.active) return "An active category is required to publish this product.";
  return null;
}

export async function GET(req: Request) {
  if (await guard()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const rows = q
    ? await db
        .select()
        .from(products)
        .where(
          or(
            ilike(products.name, `%${escapeLikePattern(q)}%`),
            ilike(products.sku, `%${escapeLikePattern(q)}%`),
            ilike(products.categorySlug, `%${escapeLikePattern(q)}%`),
            ilike(products.brand, `%${escapeLikePattern(q)}%`),
          ),
        )
        .orderBy(desc(products.id))
    : await db.select().from(products).orderBy(desc(products.id));

  return NextResponse.json({ products: rows });
}

export async function POST(req: Request) {
  const bad = await guard();
  if (bad) return bad;
  let b: Body;
  try {
    b = (await req.json()) as Body;
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("Invalid body");
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  const images = (b.images ?? []) as never[];
  const errors = validateProduct(b, false);
  if (errors.length) return NextResponse.json({ errors }, { status: 400 });
  const categoryError = await productCategoryError(String(b.categorySlug ?? ""), String(b.status ?? "draft"));
  if (categoryError) return NextResponse.json({ error: categoryError }, { status: 400 });
  try {
    await validateProductSku(String(b.sku ?? ""));
    const base = normalizeProduct(b);
    const normalized = {
      ...base,
      ...(base.status === "published" ? { active: true } : base.status === "archived" ? { active: false } : {}),
    };
    const [slugMatch] = await db.select({ id: products.id }).from(products).where(eq(products.slug, normalized.slug)).limit(1);
    if (slugMatch) {
      return NextResponse.json({ error: "A product with this slug already exists." }, { status: 409 });
    }
    const created = await db.transaction(async (tx) => {
      const [row] = await tx.insert(products).values(normalized).returning();
      if (!row) throw new Error("Product creation failed.");
      await writeImages(tx, row.id, images);
      await writeVariants(tx, row.id, (b.variants ?? []) as never[]);
      if (row.status === "published") await assertPublishImages(tx, [row.id]);
      return row;
    });
    return NextResponse.json({ product: created }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: publicProductError(e, "Could not save product. Please try again.") }, { status: 409 });
  }
}

export async function PATCH(req: Request) {
  const bad = await guard();
  if (bad) return bad;
  let b: Body;
  try {
    b = (await req.json()) as Body;
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error("Invalid body");
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (b.action === "duplicate" && b.id) {
    try {
      const copy = await duplicateProduct(b.id);
      return NextResponse.json({ product: copy }, { status: 201 });
    } catch (e) {
      return NextResponse.json(
        { error: publicProductError(e, "Could not duplicate product. Please try again.") },
        { status: 409 },
      );
    }
  }

  if (b.action === "bulk" && b.ids?.length && b.patch) {
    const safe = sanitizeFlagsPatch(b.patch);
    if (!safe) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    const ids = [...new Set(b.ids.map(Number))];
    if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      return NextResponse.json({ error: "Product ids must be positive integers." }, { status: 400 });
    }
    const patch = {
      ...safe,
      ...(safe.status === "published" ? { active: true } : safe.status === "archived" ? { active: false } : {}),
    };
    try {
      await db.transaction(async (tx) => {
        const found = await tx.select({ id: products.id }).from(products).where(inArray(products.id, ids)).for("update");
        if (found.length !== ids.length) throw new Error("Product not found");
        if (patch.status === "published") await assertPublishImages(tx, ids);
        await tx.update(products).set(patch as never).where(inArray(products.id, ids));
      });
      return NextResponse.json({ ok: true, updated: ids.length });
    } catch (e) {
      return NextResponse.json({ error: publicProductError(e, "Could not update products. Please try again.") }, { status: 409 });
    }
  }

  if (b.action === "flags" && b.id && b.patch) {
    const safe = sanitizeFlagsPatch(b.patch);
    if (!safe) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    try {
      const row = await db.transaction(async (tx) => {
        const [existing] = await tx.select({ id: products.id }).from(products).where(eq(products.id, b.id!)).for("update");
        if (!existing) throw new Error("Product not found");
        if (safe.status === "published") await assertPublishImages(tx, [b.id!]);
        const patch = {
          ...safe,
          ...(safe.status === "published" ? { active: true } : safe.status === "archived" ? { active: false } : {}),
        };
        const [updated] = await tx.update(products).set(patch as never).where(eq(products.id, b.id!)).returning();
        if (!updated) throw new Error("Product not found");
        return updated;
      });
      return NextResponse.json({ product: row });
    } catch (e) {
      return NextResponse.json({ error: publicProductError(e, "Could not update product flags. Please try again.") }, { status: 409 });
    }
  }

  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const errors = validateProduct(b, false);
  if (errors.length) return NextResponse.json({ errors }, { status: 400 });
  const categoryError = await productCategoryError(String(b.categorySlug ?? ""), String(b.status ?? "draft"));
  if (categoryError) return NextResponse.json({ error: categoryError }, { status: 400 });

  try {
    await validateProductSku(String(b.sku ?? ""), b.id);
    const base = normalizeProduct(b);
    const normalized = {
      ...base,
      ...(base.status === "published" ? { active: true } : base.status === "archived" ? { active: false } : {}),
    };
    const [slugMatch] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, normalized.slug))
      .limit(1);
    if (slugMatch && slugMatch.id !== b.id) {
      return NextResponse.json({ error: "A product with this slug already exists." }, { status: 409 });
    }
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(products).set(normalized).where(eq(products.id, b.id!)).returning();
      if (!row) throw new Error("Product not found");
      if (b.images) await writeImages(tx, b.id!, b.images as never[]);
      if (b.variants) await writeVariants(tx, b.id!, b.variants as never[]);
      if (row.status === "published") await assertPublishImages(tx, [row.id]);
      return row;
    });
    return NextResponse.json({ product: updated });
  } catch (e) {
    return NextResponse.json({ error: publicProductError(e, "Could not update product. Please try again.") }, { status: 409 });
  }
}

export async function DELETE(req: Request) {
  const bad = await guard();
  if (bad) return bad;
  const params = new URL(req.url).searchParams;
  const id = Number(params.get("id"));
  const hard = params.get("hard") === "1";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (hard) {
    await db.delete(products).where(eq(products.id, id));
    return NextResponse.json({ ok: true, hard: true });
  }
  await db.update(products).set({ status: "archived", active: false }).where(eq(products.id, id));
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const bad = await guard();
  if (bad) return bad;
  let productId: number | undefined;
  try {
    const body = (await req.json()) as { productId?: unknown };
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const parsed = Number(body.productId);
      if (Number.isSafeInteger(parsed) && parsed > 0) productId = parsed;
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });
  const [imgs, vars] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.productId, productId)),
    db.select().from(productVariants).where(eq(productVariants.productId, productId)),
  ]);
  const [usage] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.id, productId));
  return NextResponse.json({ images: imgs, variants: vars, usage });
}
