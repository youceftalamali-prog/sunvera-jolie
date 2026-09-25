import { NextResponse } from "next/server";
import { publicProductError } from "@/lib/api-errors";
import { db } from "@/db";
import { productImages, productVariants, products } from "@/db/schema";
import { desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import { duplicateProduct, normalizeProduct, sanitizeFlagsPatch, validateProduct, validateProductSku, writeImages, writeVariants } from "@/lib/product-write";

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
  const b = (await req.json()) as Body;
  const images = (b.images ?? []) as never[];
  const errors = validateProduct(b, false);
  if (errors.length) return NextResponse.json({ errors }, { status: 400 });
  try {
    await validateProductSku(String(b.sku ?? ""));
    const normalized = normalizeProduct(b);
    const [slugMatch] = await db.select({ id: products.id }).from(products).where(eq(products.slug, normalized.slug)).limit(1);
    if (slugMatch) {
      return NextResponse.json({ error: "A product with this slug already exists." }, { status: 409 });
    }
    const created = await db.transaction(async (tx) => {
      const [row] = await tx.insert(products).values(normalized).returning();
      if (!row) throw new Error("Product creation failed.");
      await writeImages(tx, row.id, images);
      await writeVariants(tx, row.id, (b.variants ?? []) as never[]);
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
  const b = (await req.json()) as Body;

  if (b.action === "duplicate" && b.id) {
    const copy = await duplicateProduct(b.id);
    return NextResponse.json({ product: copy });
  }

  if (b.action === "bulk" && b.ids?.length && b.patch) {
    const safe = sanitizeFlagsPatch(b.patch);
    if (!safe) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    await db.update(products).set(safe as never).where(inArray(products.id, b.ids));
    return NextResponse.json({ ok: true, updated: b.ids.length });
  }

  if (b.action === "flags" && b.id && b.patch) {
    const safe = sanitizeFlagsPatch(b.patch);
    if (!safe) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    const [row] = await db.update(products).set(safe as never).where(eq(products.id, b.id)).returning();
    return NextResponse.json({ product: row });
  }

  if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const errors = validateProduct(b, false);
  if (errors.length) return NextResponse.json({ errors }, { status: 400 });

  try {
    await validateProductSku(String(b.sku ?? ""), b.id);
    const normalized = normalizeProduct(b);
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
  const { productId } = (await req.json()) as { productId?: number };
  if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });
  const [imgs, vars] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.productId, productId)),
    db.select().from(productVariants).where(eq(productVariants.productId, productId)),
  ]);
  const [usage] = await db.select({ n: sql<number>`count(*)::int` }).from(products).where(eq(products.id, productId));
  return NextResponse.json({ images: imgs, variants: vars, usage });
}
