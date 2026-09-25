import { db } from "@/db";
import { media, productImages, productVariants, products } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { slugify } from "@/lib/format";
import { sanitizeHtml } from "@/lib/sanitize";
import { mediaPublicUrl } from "@/lib/storage";

type DbExecutor = Pick<typeof db, "select" | "insert" | "update" | "delete">;

type ImageIn = {
  url?: string;
  alt?: string;
  imageType?: string;
  sortOrder?: number;
  isPrimary?: boolean;
  mediaId?: number | null;
  title?: string;
  caption?: string;
  focalX?: number;
  focalY?: number;
};
type VariantIn = { label?: string; sku?: string; price?: number; comparePrice?: number; priceDelta?: number; stock?: number; imageUrl?: string; sortOrder?: number };

 

async function assertUniqueProductSku(sku: string, productId?: number) {
  const normalized = sku.trim().toLowerCase();
  const predicate = productId
    ? sql`lower(btrim(${products.sku})) = ${normalized} and ${products.id} <> ${productId}`
    : sql`lower(btrim(${products.sku})) = ${normalized}`;
  const [existing] = await db.select({ id: products.id }).from(products).where(predicate).limit(1);
  if (existing) throw new Error("SKU already exists for another product.");
}

export function validateProduct(b: Record<string, any>, requireImages = false) {
  const errors: string[] = [];
  if (!String(b.name ?? "").trim()) errors.push("Product name is required");
  if (!String(b.sku ?? "").trim()) errors.push("SKU is required");
  if (!String(b.categorySlug ?? "").trim()) errors.push("Category is required");
  const price = Number(b.price ?? 0);
  if (!(price > 0)) errors.push("Price must be a positive number");
  const compare = Number(b.comparePrice ?? 0);
  if (compare && compare < price) errors.push("Compare-at price must be higher than the price");
  const stock = Number(b.stock ?? 0);
  if (stock < 0) errors.push("Stock cannot be negative");
  if (requireImages) {
    const images = (b.images ?? []) as ImageIn[];
    if (!images.some((i) => i.url)) errors.push("At least one product image is required to publish");
  }
  return errors;
}

export function normalizeProduct(b: Record<string, any>) {
  return {
    name: String(b.name).trim(),
    slug: String(b.slug ?? "").trim() || `${slugify(String(b.name))}-${Date.now().toString(36)}`,
    sku: String(b.sku).trim(),
    barcode: String(b.barcode ?? "").trim(),
    brand: String(b.brand ?? "SunVera Jolie").trim(),
    categorySlug: String(b.categorySlug).trim(),
    subcategorySlug: String(b.subcategorySlug ?? "").trim(),
    shortDescription: String(b.shortDescription ?? ""),
    description: sanitizeHtml(String(b.description ?? "")),
    benefits: String(b.benefits ?? ""),
    ingredients: String(b.ingredients ?? ""),
    howToUse: sanitizeHtml(String(b.howToUse ?? "")),
    warnings: String(b.warnings ?? ""),
    size: String(b.size ?? "50ml"),
    volume: String(b.volume ?? ""),
    skinType: String(b.skinType ?? "All skin types"),
    hairType: String(b.hairType ?? ""),
    productType: String(b.productType ?? ""),
    routineStep: String(b.routineStep ?? ""),
    tags: String(b.tags ?? ""),
    price: Number(b.price),
    comparePrice: Number(b.comparePrice ?? 0),
    costPrice: Number(b.costPrice ?? 0),
    currency: String(b.currency ?? "DZD"),
    stock: Number(b.stock ?? 0),
    lowStockThreshold: Number(b.lowStockThreshold ?? 10),
    trackInventory: b.trackInventory !== false,
    allowBackorders: Boolean(b.allowBackorders),
    tone: String(b.tone ?? "beige"),
    emoji: String(b.emoji ?? "🧴"),
    bestSeller: Boolean(b.bestSeller),
    newArrival: Boolean(b.newArrival),
    featured: Boolean(b.featured),
    status: ["draft", "published", "archived"].includes(String(b.status)) ? String(b.status) : "draft",
    seoTitle: String(b.seoTitle ?? ""),
    seoDescription: String(b.seoDescription ?? ""),
    seoKeywords: String(b.seoKeywords ?? ""),
    canonicalUrl: String(b.canonicalUrl ?? ""),
  };
}

const FLAG_PATCH_FIELDS = ["featured", "bestSeller", "newArrival", "status", "active", "price", "stock"] as const;

// Whitelist for bulk/flag patches. Blocks id, slug, createdAt, updatedAt and any other column.
export function sanitizeFlagsPatch(patch: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const key of FLAG_PATCH_FIELDS) {
    if (!(key in patch)) continue;
    const v = patch[key];
    if (key === "featured" || key === "bestSeller" || key === "newArrival" || key === "active") {
      out[key] = Boolean(v);
    } else if (key === "status") {
      const s = String(v);
      if (!["draft", "published", "archived"].includes(s)) return null;
      out.status = s;
    } else if (key === "price") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return null;
      out.price = n;
    } else if (key === "stock") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return null;
      out.stock = Math.floor(n);
    }
  }
  return Object.keys(out).length ? out : null;
}

export async function validateProductSku(sku: string, productId?: number) {
  await assertUniqueProductSku(sku, productId);
}

/** Id of the media row addressed by a local `/api/media/<id>` URL, or null for other URLs. */
function localMediaIdFromUrl(url: unknown): number | null {
  const match = /^\/api\/media\/(\d+)/.exec(String(url ?? "").trim());
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function writeImages(
  executor: DbExecutor,
  productId: number,
  images: ImageIn[],
) {
  await executor.delete(productImages).where(eq(productImages.productId, productId));

  // A slot that points at a media row takes its URL from that row, never from the payload.
  // Otherwise a stale form (opened before a replacement) would write an outdated URL back
  // and the storefront would keep serving a cached copy of the old file.
  // Ids named by `mediaId` *and* ids embedded in a local URL are resolved together, so a slot
  // can never be re-created for an asset that has already been deleted (P2-9).
  const requestedMediaIds = new Set<number>();
  for (const image of images) {
    const byField = Number(image.mediaId);
    if (Number.isInteger(byField) && byField > 0) requestedMediaIds.add(byField);
    const byUrl = localMediaIdFromUrl(image.url);
    if (byUrl) requestedMediaIds.add(byUrl);
  }
  const mediaRows = requestedMediaIds.size
    ? await executor.select().from(media).where(inArray(media.id, [...requestedMediaIds]))
    : [];
  const existingMediaIds = new Set(mediaRows.map((row) => row.id));
  const urlByMediaId = new Map(mediaRows.map((row) => [row.id, mediaPublicUrl(row)]));

  const cleaned = images
    .filter((i) => {
      const mediaId = Number(i.mediaId);
      const namesMediaRow = Number.isInteger(mediaId) && mediaId > 0;
      // Dangling FK: the asset is gone, so the slot would render as a broken image.
      if (namesMediaRow && !existingMediaIds.has(mediaId)) return false;
      // Dead local URL: same problem for slots that only carry the address of the asset.
      const urlMediaId = localMediaIdFromUrl(i.url);
      if (urlMediaId && !existingMediaIds.has(urlMediaId)) return false;
      return Boolean(i.url) || (namesMediaRow && urlByMediaId.has(mediaId));
    })
    // Stable ordering: honour the requested sortOrder, keep the incoming sequence as the tiebreaker.
    .map((i, index) => ({ i, index }))
    .sort((a, b) => (Number(a.i.sortOrder ?? a.index) - Number(b.i.sortOrder ?? b.index)) || a.index - b.index)
    .map(({ i }, sortOrder) => ({
      productId,
      url: (i.mediaId && urlByMediaId.get(Number(i.mediaId))) || String(i.url),
      mediaId: i.mediaId ?? null,
      alt: String(i.alt ?? ""),
      imageType: String(i.imageType || "gallery"),
      sortOrder,
      isPrimary: Boolean(i.isPrimary),
      title: String(i.title ?? ""),
      caption: String(i.caption ?? ""),
      focalX: Number.isFinite(Number(i.focalX)) ? Number(i.focalX) : 50,
      focalY: Number.isFinite(Number(i.focalY)) ? Number(i.focalY) : 50,
    }));
  // Exactly one primary, deterministically: the first flagged row wins, otherwise position 0.
  if (cleaned.length) {
    const primaryIndex = Math.max(
      0,
      cleaned.findIndex((i) => i.isPrimary),
    );
    cleaned.forEach((row, idx) => {
      row.isPrimary = idx === primaryIndex;
    });
  }
  if (cleaned.length) await executor.insert(productImages).values(cleaned);
  return cleaned.length;
}

export async function writeVariants(
  executor: DbExecutor,
  productId: number,
  variants: VariantIn[],
) {
  const cleaned = variants
    .filter((v) => String(v.label ?? "").trim())
    .map((v, index) => ({
      productId,
      label: String(v.label).trim(),
      sku: String(v.sku ?? "").trim(),
      price: Number(v.price ?? 0),
      comparePrice: Number(v.comparePrice ?? 0),
      priceDelta: Number(v.priceDelta ?? 0),
      stock: Number(v.stock ?? 0),
      imageUrl: String(v.imageUrl ?? ""),
      sortOrder: v.sortOrder ?? index,
    }));

  const seen = new Set<string>();
  for (const row of cleaned) {
    if (!row.sku) continue;
    const key = row.sku.toLowerCase();
    if (seen.has(key)) throw new Error("Variant SKUs must be unique within a product.");
    seen.add(key);
  }

  if (seen.size) {
    const existing = await executor
      .select({ sku: sql<string>`lower(btrim(${productVariants.sku}))` })
      .from(productVariants)
      .where(sql`btrim(${productVariants.sku}) <> '' and ${productVariants.productId} <> ${productId}`);
    const existingSet = new Set(existing.map((row) => row.sku));
    for (const key of seen) {
      if (existingSet.has(key)) throw new Error("Variant SKU already exists for another product.");
    }
  }

  await executor.delete(productVariants).where(eq(productVariants.productId, productId));
  if (cleaned.length) await executor.insert(productVariants).values(cleaned);
  return cleaned.length;
}

export async function duplicateProduct(id: number) {
  const [p] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!p) throw new Error("Product not found");
  const suffix = Date.now().toString(36).toUpperCase();
  const [copy] = await db
    .insert(products)
    .values({
      ...p,
      id: undefined as unknown as number,
      name: `${p.name} (Copy)`,
      slug: `${p.slug}-copy-${suffix.toLowerCase()}`,
      sku: `${p.sku}-${suffix}`,
      status: "draft",
      createdAt: new Date(),
    })
    .returning();
  const imgs = await db.select().from(productImages).where(eq(productImages.productId, id));
  const vars = await db.select().from(productVariants).where(eq(productVariants.productId, id));
  if (imgs.length) {
    await db.insert(productImages).values(imgs.map(({ id: _i, productId: _p, ...rest }) => ({ ...rest, productId: copy.id })));
  }
  if (vars.length) {
    await db.insert(productVariants).values(
      vars.map(({ id: _i, productId: _p, ...rest }) => ({
        ...rest,
        productId: copy.id,
        sku: rest.sku ? `${rest.sku}-${suffix}` : "",
      })),
    );
  }
  return copy;
}
