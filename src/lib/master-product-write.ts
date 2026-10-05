import { db } from "@/db";
import { media, productImages, productVariants, products } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { slugify } from "@/lib/format";
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
type VariantIn = {
  label?: string;
  sku?: string;
  price?: number;
  comparePrice?: number;
  priceDelta?: number;
  stock?: number;
  imageUrl?: string;
  sortOrder?: number;
};

const FONT_FAMILIES = new Set(["system", "arabic", "cairo", "tajawal", "serif", "playfair", "amiri", "mono"]);
const FONT_WEIGHTS = new Set(["400", "500", "600", "700"]);

function cleanAIText(value: unknown) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTypography(input: unknown) {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const defaults = {
    title: { fontFamily: "playfair", fontSize: 40, fontWeight: "600", color: "#3a2b22" },
    shortDescription: { fontFamily: "system", fontSize: 16, fontWeight: "400", color: "#6b5749" },
    description: { fontFamily: "system", fontSize: 14, fontWeight: "400", color: "#6b5749" },
  };
  const clean = (key: keyof typeof defaults) => {
    const value = source[key] && typeof source[key] === "object" ? source[key] as Record<string, unknown> : {};
    const fontFamily = FONT_FAMILIES.has(String(value.fontFamily)) ? String(value.fontFamily) : defaults[key].fontFamily;
    const fontWeight = FONT_WEIGHTS.has(String(value.fontWeight)) ? String(value.fontWeight) : defaults[key].fontWeight;
    const fontSize = Math.min(96, Math.max(10, Number(value.fontSize) || defaults[key].fontSize));
    const color = /^#[0-9a-fA-F]{6}$/.test(String(value.color)) ? String(value.color) : defaults[key].color;
    return { fontFamily, fontWeight, fontSize, color };
  };
  return { title: clean("title"), shortDescription: clean("shortDescription"), description: clean("description") };
}

async function assertUniqueProductSku(sku: string, productId?: number) {
  const normalized = sku.trim().toLowerCase();
  const predicate = productId
    ? sql`lower(btrim(${products.sku})) = ${normalized} and ${products.id} <> ${productId}\`
    : sql`lower(btrim(${products.sku})) = ${normalized}\`;
  const [existing] = await db.select({ id: products.id }).from(products).where(predicate).limit(1);
  if (existing) throw new Error("SKU already exists for another product.");
}

export function validateProduct(b: Record<string, unknown>, requireImages = false) {
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
    const images = Array.isArray(b.images) ? b.images as ImageIn[] : [];
    if (!images.some((image) => image.url)) errors.push("At least one product image is required to publish");
  }
  return errors;
}

export function normalizeProduct(b: Record<string, unknown>) {
  const name = String(b.name ?? "").trim();
  return {
    name,
    slug: String(b.slug ?? "").trim() || slugify(name) + "-" + Date.now().toString(36),
    sku: String(b.sku ?? "").trim(),
    barcode: String(b.barcode ?? "").trim(),
    brand: String(b.brand ?? "SunVera Jolie").trim(),
    categorySlug: String(b.categorySlug ?? "").trim(),
    subcategorySlug: String(b.subcategorySlug ?? "").trim(),
    shortDescription: String(b.shortDescription ?? ""),
    description: cleanAIText(b.description),
    typography: normalizeTypography(b.typography),
    benefits: String(b.benefits ?? ""),
    ingredients: String(b.ingredients ?? ""),
    howToUse: cleanAIText(b.howToUse),
    warnings: String(b.warnings ?? ""),
    size: String(b.size ?? "50ml"),
    volume: String(b.volume ?? ""),
    skinType: String(b.skinType ?? "All skin types"),
    hairType: String(b.hairType ?? ""),
    productType: String(b.productType ?? ""),
    routineStep: String(b.routineStep ?? ""),
    tags: String(b.tags ?? ""),
    price: Number(b.price ?? 0),
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

export async function validateProductSku(sku: string, productId?: number) {
  await assertUniqueProductSku(sku, productId);
}

function localMediaIdFromUrl(url: unknown): number | null {
  const match = /^\/api\/media\/(\d+)/.exec(String(url ?? "").trim());
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function writeImages(executor: DbExecutor, productId: number, images: ImageIn[]) {
  await executor.delete(productImages).where(eq(productImages.productId, productId));

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
    .filter((image) => {
      const mediaId = Number(image.mediaId);
      if (Number.isInteger(mediaId) && mediaId > 0 && !existingMediaIds.has(mediaId)) return false;
      const urlMediaId = localMediaIdFromUrl(image.url);
      if (urlMediaId && !existingMediaIds.has(urlMediaId)) return false;
      return Boolean(image.url) || (Number.isInteger(mediaId) && mediaId > 0 && urlByMediaId.has(mediaId));
    })
    .map((image, index) => ({ image, index }))
    .sort((a, b) => (Number(a.image.sortOrder ?? a.index) - Number(b.image.sortOrder ?? b.index)) || a.index - b.index)
    .map(({ image }, sortOrder) => ({
      productId,
      url: (image.mediaId && urlByMediaId.get(Number(image.mediaId))) || String(image.url ?? ""),
      mediaId: image.mediaId ?? null,
      alt: String(image.alt ?? ""),
      imageType: String(image.imageType || "gallery"),
      sortOrder,
      isPrimary: Boolean(image.isPrimary),
      title: String(image.title ?? ""),
      caption: String(image.caption ?? ""),
      focalX: Number.isFinite(Number(image.focalX)) ? Number(image.focalX) : 50,
      focalY: Number.isFinite(Number(image.focalY)) ? Number(image.focalY) : 50,
    }));

  if (cleaned.length) {
    const primaryIndex = Math.max(0, cleaned.findIndex((image) => image.isPrimary));
    cleaned.forEach((row, index) => { row.isPrimary = index === primaryIndex; });
  }
  if (cleaned.length) await executor.insert(productImages).values(cleaned);
  return cleaned.length;
}

export async function writeVariants(executor: DbExecutor, productId: number, variants: VariantIn[]) {
  const cleaned = variants
    .filter((variant) => String(variant.label ?? "").trim())
    .map((variant, index) => ({
      productId,
      label: String(variant.label).trim(),
      sku: String(variant.sku ?? "").trim(),
      price: Number(variant.price ?? 0),
      comparePrice: Number(variant.comparePrice ?? 0),
      priceDelta: Number(variant.priceDelta ?? 0),
      stock: Number(variant.stock ?? 0),
      imageUrl: String(variant.imageUrl ?? ""),
      sortOrder: variant.sortOrder ?? index,
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
      .select({ sku: sql<string>\`lower(btrim(${productVariants.sku}))\` })
      .from(productVariants)
      .where(sql`btrim(${productVariants.sku}) <> '' and ${productVariants.productId} <> ${productId}\`);
    const existingSet = new Set(existing.map((row) => row.sku));
    for (const key of seen) {
      if (existingSet.has(key)) throw new Error("Variant SKU already exists for another product.");
    }
  }

  await executor.delete(productVariants).where(eq(productVariants.productId, productId));
  if (cleaned.length) await executor.insert(productVariants).values(cleaned);
  return cleaned.length;
}
