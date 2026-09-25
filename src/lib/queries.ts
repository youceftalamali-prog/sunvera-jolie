import { db } from "@/db";
import { categories, productImages, products, reviews, type Product, type ProductImage } from "@/db/schema";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { ensureSeed } from "@/lib/seed";

export async function allProducts(includeUnpublished = false) {
  await ensureSeed();
  const rows = await db
    .select()
    .from(products)
    .where(includeUnpublished ? ne(products.status, "never") : eq(products.status, "published"))
    .orderBy(desc(products.id));
  return rows;
}

export type ProductWithImages = Product & { images: ProductImage[] };

export async function productsWithImages(includeUnpublished = false): Promise<ProductWithImages[]> {
  const rows = await allProducts(includeUnpublished);
  if (rows.length === 0) return [];
  const imgs = await db
    .select()
    .from(productImages)
    .where(inArray(productImages.productId, rows.map((r) => r.id)))
    .orderBy(asc(productImages.sortOrder));

  const imagesByProductId = new Map<number, ProductImage[]>();
  for (const image of imgs) {
    const bucket = imagesByProductId.get(image.productId);
    if (bucket) bucket.push(image);
    else imagesByProductId.set(image.productId, [image]);
  }

  return rows.map((p) => ({ ...p, images: imagesByProductId.get(p.id) ?? [] }));
}

export async function allCategories(onlyActive = true) {
  await ensureSeed();
  const rows = await db.select().from(categories).orderBy(asc(categories.sortOrder));
  return onlyActive ? rows.filter((c) => c.active) : rows;
}

export async function productBySlug(slug: string, includeUnpublished = false) {
  await ensureSeed();
  const [p] = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
  if (!p) return null;
  if (!includeUnpublished && p.status !== "published") return null;
  return p;
}

export async function imagesFor(productId: number) {
  return db.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder));
}

export async function productReviews(productId: number) {
  return db.select().from(reviews).where(eq(reviews.productId, productId)).orderBy(desc(reviews.id));
}

export async function relatedProducts(p: Product, limit = 4) {
  return db
    .select()
    .from(products)
    .where(
      and(
        ne(products.id, p.id),
        eq(products.status, "published"),
        or(eq(products.categorySlug, p.categorySlug), eq(products.routineStep, p.routineStep)),
      ),
    )
    .limit(limit);
}

export type Filters = {
  category?: string;
  q?: string;
  min?: number;
  max?: number;
  skin?: string;
  hair?: string;
  type?: string;
  brand?: string;
  rating?: number;
  inStock?: boolean;
  sort?: string;
};

export function filterAndSort(items: Product[], f: Filters) {
  let out = items.filter((p) => {
    if (f.category && f.category !== "all" && p.categorySlug !== f.category) return false;
    if (f.skin && p.skinType !== f.skin) return false;
    if (f.hair && p.hairType !== f.hair) return false;
    if (f.type && p.productType !== f.type) return false;
    if (f.brand && p.brand !== f.brand) return false;
    if (f.min != null && p.price < f.min) return false;
    if (f.max != null && p.price > f.max) return false;
    if (f.rating && p.rating < f.rating) return false;
    if (f.inStock && p.stock <= 0) return false;
    if (f.q) {
      const hay =
        `${p.name} ${p.tags} ${p.shortDescription} ${p.productType} ${p.categorySlug} ${p.seoKeywords} ${p.brand}`.toLowerCase();
      if (!f.q.toLowerCase().split(/\s+/).every((t) => hay.includes(t))) return false;
    }
    return true;
  });
  switch (f.sort) {
    case "price-asc":
      out = out.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      out = out.sort((a, b) => b.price - a.price);
      break;
    case "newest":
      out = out.sort((a, b) => b.id - a.id);
      break;
    case "rating":
      out = out.sort((a, b) => b.rating - a.rating);
      break;
    case "best-selling":
      out = out.sort((a, b) => b.reviewsCount - a.reviewsCount);
      break;
    default:
      out = out.sort((a, b) => Number(b.featured) - Number(a.featured) || b.rating - a.rating);
  }
  return out;
}

export async function recalcRating(productId: number) {
  const [agg] = await db
    .select({ avg: sql<number>`coalesce(avg(rating),0)::float`, n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(eq(reviews.productId, productId));
  if (agg) {
    await db
      .update(products)
      .set({ rating: Math.round(agg.avg * 10) / 10, reviewsCount: agg.n })
      .where(eq(products.id, productId));
  }
}
