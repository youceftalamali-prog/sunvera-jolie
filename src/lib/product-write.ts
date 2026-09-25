import { db } from "@/db";
import { media, productImages, productVariants, products } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { slugify } from "@/lib/format";
import { sanitizeHtml } from "@/lib/sanitize";
import { mediaPublicUrl } from "@/lib/storage";

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

export async function writeImages(productId: number, images: ImageIn[]) {
  await db.delete(productImages).where(eq(productImages.productId, productId));

  // A slot that points at a media row takes its URL from that row, never from the payload.
  // Otherwise a stale form (opened before a replacement) would write an outdated URL back
  // and the storefront would keep serving a cached copy of the old file.
  const mediaIds = images.map((i) => Number(i.mediaId)).filter((id) => Number.isFinite(id) && id > 0);
  const mediaRows = mediaIds.length ? await db.select().from(media).where(inArray(media.id, mediaIds)) : [];
  const urlByMediaId = new Map(mediaRows.map((row) => [row.id, mediaPublicUrl(row)]));

  const cleaned = images
    .filter((i) => i.url || (i.mediaId && urlByMediaId.has(Number(i.mediaId))))
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
  if (cleaned.length) await db.insert(productImages).values(cleaned);
  return cleaned.length;
}

export async function writeVariants(productId: number, variants: VariantIn[]) {
  await db.delete(productVariants).where(eq(productVariants.productId, productId));
  const cleaned = variants
    .filter((v) => String(v.label ?? "").trim())
    .map((v, index) => ({
      productId,
      label: String(v.label),
      sku: String(v.sku ?? ""),
      price: Number(v.price ?? 0),
      comparePrice: Number(v.comparePrice ?? 0),
      priceDelta: Number(v.priceDelta ?? 0),
      stock: Number(v.stock ?? 0),
      imageUrl: String(v.imageUrl ?? ""),
      sortOrder: v.sortOrder ?? index,
    }));
  if (cleaned.length) await db.insert(productVariants).values(cleaned);
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
    await db.insert(productVariants).values(vars.map(({ id: _i, productId: _p, ...rest }) => ({ ...rest, productId: copy.id })));
  }
  return copy;
}
