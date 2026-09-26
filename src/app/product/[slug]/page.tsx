import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { productVariants } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { imagesFor, productBySlug, productReviews, relatedProducts, productsWithImages } from "@/lib/queries";
import ProductBuyBox from "@/components/ProductBuyBox";
import ReviewForm from "@/components/ReviewForm";
import { ProductRow } from "@/components/Sections";
import ProductDetailsTabs from "@/components/ProductDetailsTabs";
import Stars from "@/components/Stars";
import { toShopProduct, type ShopProduct } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = await productBySlug(slug);
  if (!p) return { title: "Product not found" };
  // A nested `openGraph` replaces the parent's rather than inheriting `images`, so share cards
  // need the image set here. Falls back to the first image when none is flagged primary.
  const imgs = await imagesFor(p.id);
  const share = (imgs.find((i) => i.isPrimary) ?? imgs[0])?.url || undefined;
  return {
    title: p.seoTitle || p.name,
    description: p.seoDescription || p.shortDescription,
    keywords: p.seoKeywords || p.tags,
    alternates: { canonical: p.canonicalUrl || `/product/${p.slug}` },
    openGraph: {
      title: p.name,
      description: p.seoDescription || p.shortDescription,
      type: "website",
      images: share ? [{ url: share }] : undefined,
    },
    // twitter does not fall back to openGraph.images, so the card is set explicitly
    // to keep the X/Twitter preview on the same image as Open Graph.
    twitter: {
      card: "summary_large_image",
      title: p.name,
      description: p.seoDescription || p.shortDescription,
      images: share ? [share] : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await productBySlug(slug);
  if (!p) notFound();

  const [variants, revs, relatedRows, imgs] = await Promise.all([
    db.select().from(productVariants).where(eq(productVariants.productId, p.id)).orderBy(asc(productVariants.sortOrder)),
    productReviews(p.id),
    relatedProducts(p, 4),
    imagesFor(p.id),
  ]);

  const shopProduct = toShopProduct(p, imgs);
  const allForRelated = await productsWithImages(false);
  const related: ShopProduct[] = relatedRows
    .map((r) => {
      const found = allForRelated.find((x) => x.id === r.id);
      return found ? toShopProduct(found, found.images) : null;
    })
    .filter((x): x is ShopProduct => Boolean(x));

  const blocks: [string, string, boolean][] = [
    ["Description", p.description, true],
    ["Benefits", p.benefits, false],
    ["Ingredients", p.ingredients, false],
    ["How to Use", p.howToUse, true],
    ["Product Details", `Size: ${p.size}\nVolume: ${p.volume || p.size}\nSKU: ${p.sku}${p.barcode ? `\nBarcode: ${p.barcode}` : ""}\nBrand: ${p.brand}\nSuitable for: ${p.skinType || p.hairType || "all"}`, false],
    ["Shipping & Returns", "Delivery in 1-8 days depending on your wilaya with Cash on Delivery. Free delivery over 9 000 DA. Unopened items can be returned within 14 days.", false],
    ["Warnings", p.warnings, false],
  ];

  return (
    <>
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <ProductBuyBox
          p={shopProduct}
          variants={variants.map((v) => ({
            id: v.id,
            label: v.label,
            price: v.price || p.price + v.priceDelta,
            stock: v.stock,
            imageUrl: v.imageUrl,
          }))}
        />
      </section>

      <ProductDetailsTabs
        description={p.description}
        benefits={p.benefits}
        ingredients={p.ingredients}
        howToUse={p.howToUse}
        productDetails={`Size: ${p.size}\nVolume: ${p.volume || p.size}\nSKU: ${p.sku}${p.barcode ? `\nBarcode: ${p.barcode}` : ""}\nBrand: ${p.brand}\nSuitable for: ${p.skinType || p.hairType || "all"}`}
        shipping="Delivery in 1-8 days depending on your wilaya with Cash on Delivery. Free delivery over 9 000 DA. Unopened items can be returned within 14 days."
        warnings={p.warnings}
      />

      <section className="mx-auto max-w-4xl px-6 py-10">
        <h2 className="section-title">Customer Reviews</h2>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <Stars rating={p.rating} />
          <span className="text-cocoa-soft">{p.rating.toFixed(1)} out of 5 · {revs.length} reviews</span>
        </div>
        <ul className="mt-6 space-y-4">
          {revs.slice(0, 8).map((r) => (
            <li key={r.id} className="border border-cocoa/10 bg-white p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Stars rating={r.rating} />
                <span className="font-medium">{r.customerName}</span>
                <span className="text-cocoa-soft">{new Date(r.createdAt).toLocaleDateString()}</span>
                {r.verified && <span className="text-gold">Verified Purchase ✓</span>}
              </div>
              <p className="mt-2 text-sm text-cocoa-soft">“{r.body}”</p>
            </li>
          ))}
        </ul>
        <ReviewForm productId={p.id} />
      </section>

      <ProductRow title="You May Also Like" subtitle="Frequently bought together to complete your routine." items={related} href="/shop" />

      <script
        type="application/ld+json"
         
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: p.name,
            description: p.seoDescription || p.shortDescription,
            sku: p.sku,
            brand: { "@type": "Brand", name: p.brand },
            image: imgs.filter((i) => i.url).map((i) => i.url),
            aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: Math.max(1, p.reviewsCount) },
            offers: {
              "@type": "Offer",
              price: p.price,
              priceCurrency: p.currency || "DZD",
              availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            },
            review: revs.slice(0, 5).map((r) => ({
              "@type": "Review",
              author: { "@type": "Person", name: r.customerName },
              reviewRating: { "@type": "Rating", ratingValue: r.rating },
              reviewBody: r.body,
            })),
          }),
        }}
      />
    </>
  );
}
