import { notFound } from "next/navigation";
import { db } from "@/db";
import { media, productImages, productVariants, products } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { allCategories } from "@/lib/queries";
import ProductForm, { type ProductDraft } from "@/components/admin/ProductForm";
import { storageWarning } from "@/lib/storage";
import { getSettingsMap } from "@/lib/settings";
import { uploadLimitsFrom } from "@/lib/upload-limits";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isFinite(productId)) notFound();

  const [[p], imgRows, vars, cats, settings] = await Promise.all([
    db.select().from(products).where(eq(products.id, productId)).limit(1),
    // Left join so the gallery can show the library filename + intrinsic size next to each slot.
    db
      .select({ image: productImages, media })
      .from(productImages)
      .leftJoin(media, eq(media.id, productImages.mediaId))
      .where(eq(productImages.productId, productId))
      .orderBy(asc(productImages.sortOrder)),
    db.select().from(productVariants).where(eq(productVariants.productId, productId)).orderBy(asc(productVariants.sortOrder)),
    allCategories(false),
    getSettingsMap(),
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
    images: imgRows
      .filter(({ image }) => image.url)
      .map(({ image: i, media: m }) => ({
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
        filename: m?.filename ?? "",
        width: m?.width ?? 0,
        height: m?.height ?? 0,
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
      uploadLimits={uploadLimitsFrom(settings.security)}
      categories={cats.filter((c) => c.active).map((c) => ({ name: c.name, slug: c.slug }))}
    />
  );
}
