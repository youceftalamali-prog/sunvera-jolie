import { notFound } from "next/navigation";
import { db } from "@/db";
import { productImages, productVariants, products } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { allCategories } from "@/lib/queries";
import ProductForm, { type ProductDraft } from "@/components/admin/ProductForm";
import { storageWarning } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isFinite(productId)) notFound();

  const [[p], imgs, vars, cats] = await Promise.all([
    db.select().from(products).where(eq(products.id, productId)).limit(1),
    db.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder)),
    db.select().from(productVariants).where(eq(productVariants.productId, productId)).orderBy(asc(productVariants.sortOrder)),
    allCategories(false),
  ]);
  if (!p) notFound();

  const initial: ProductDraft = {
    id: p.id,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    barcode: p.barcode,
    brand: p.brand,
    categorySlug: p.categorySlug,
    subcategorySlug: p.subcategorySlug,
    productType: p.productType,
    status: p.status,
    featured: p.featured,
    bestSeller: p.bestSeller,
    newArrival: p.newArrival,
    price: p.price,
    comparePrice: p.comparePrice,
    costPrice: p.costPrice,
    currency: p.currency,
    stock: p.stock,
    lowStockThreshold: p.lowStockThreshold,
    trackInventory: p.trackInventory,
    allowBackorders: p.allowBackorders,
    size: p.size,
    volume: p.volume,
    emoji: p.emoji,
    tone: p.tone,
    skinType: p.skinType,
    hairType: p.hairType,
    routineStep: p.routineStep,
    shortDescription: p.shortDescription,
    description: p.description,
    benefits: p.benefits,
    ingredients: p.ingredients,
    howToUse: p.howToUse,
    warnings: p.warnings,
    tags: p.tags,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    seoKeywords: p.seoKeywords,
    canonicalUrl: p.canonicalUrl,
    images: imgs
      .filter((i) => i.url)
      .map((i) => ({
        url: i.url,
        alt: i.alt,
        imageType: i.imageType,
        sortOrder: i.sortOrder,
        isPrimary: i.isPrimary,
        mediaId: i.mediaId ?? null,
        title: i.title,
        caption: i.caption,
        focalX: i.focalX,
        focalY: i.focalY,
      })),
    variants: vars.map((v) => ({
      label: v.label,
      sku: v.sku,
      price: v.price || p.price + v.priceDelta,
      comparePrice: v.comparePrice,
      stock: v.stock,
      imageUrl: v.imageUrl,
    })),
  };

  return (
    <ProductForm
      mode="edit"
      initial={initial}
      storageWarning={storageWarning()}
      categories={cats.filter((c) => c.active).map((c) => ({ name: c.name, slug: c.slug }))}
    />
  );
}
