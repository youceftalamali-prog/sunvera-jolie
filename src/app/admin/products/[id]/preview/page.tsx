import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { productImages, productVariants, products } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { money, discountPct } from "@/lib/format";
import { sanitizeHtml } from "@/lib/sanitize";
import { allCategories } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProductPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isFinite(productId)) notFound();

  const [[p], imgs, vars, cats] = await Promise.all([
    db.select().from(products).where(eq(products.id, productId)).limit(1),
    db.select().from(productImages).where(eq(productImages.productId, productId)).orderBy(asc(productImages.sortOrder)),
    db.select().from(productVariants).where(eq(productVariants.productId, productId)),
    allCategories(false),
  ]);
  if (!p) notFound();

  const cat = cats.find((c) => c.slug === p.categorySlug);
  const gallery = imgs.filter((i) => i.url);
  const off = discountPct(p.price, p.comparePrice);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 bg-white p-4">
        <h1 className="font-display text-xl">Preview · {p.name}</h1>
        <span className="border border-[var(--svj-border)] px-2 py-1 text-[10px] uppercase tracking-widest">{p.status}</span>
        <div className="ms-auto flex gap-2">
          <Link href={`/admin/products/${p.id}/edit`} className="btn-outline !py-2">Back to editor</Link>
          {p.status === "published" && <Link href={`/product/${p.slug}`} target="_blank" className="btn-primary !py-2">Open live page</Link>}
        </div>
      </div>

      <div className="grid gap-8 bg-white p-6 lg:grid-cols-2">
        <div>
          {gallery.length ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={gallery[0].url}
                alt={gallery[0].alt}
                className="aspect-square w-full object-cover"
              />
              <div className="grid grid-cols-5 gap-2">
                {gallery.slice(0, 10).map((g) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={g.id} src={g.url} alt={g.alt} loading="lazy" className="aspect-square w-full border border-[var(--svj-border)] object-cover" />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex aspect-square items-center justify-center bg-[var(--svj-background)] text-7xl">{p.emoji}</div>
          )}
        </div>

        <div>
          <nav className="text-[11px] uppercase tracking-widest text-[var(--svj-muted)]">
            Home / Shop / {cat?.name ?? p.categorySlug}
          </nav>
          <h1 className="mt-2 font-display text-3xl">{p.name}</h1>
          <div className="mt-2 text-xs text-[var(--svj-muted)]">
            ★ {p.rating.toFixed(1)} · {p.reviewsCount} reviews · SKU {p.sku}
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="text-2xl font-semibold">{money(p.price)}</span>
            {p.comparePrice > p.price && (
              <>
                <span className="text-sm line-through text-[var(--svj-muted)]">{money(p.comparePrice)}</span>
                <span className="bg-[var(--svj-text)] px-2 py-0.5 text-[10px] text-white">{off}% OFF</span>
              </>
            )}
          </div>
          <p className={`mt-2 text-xs ${p.stock > 0 ? "text-green-700" : "text-red-700"}`}>
            {p.stock > 0 ? `In stock — ${p.stock} available` : "Sold out"}
          </p>
          <p className="mt-4 text-sm text-[var(--svj-muted)]">{p.shortDescription}</p>
          {vars.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {vars.map((v) => (
                <span key={v.id} className="border border-[var(--svj-border)] px-3 py-1.5">
                  {v.label} · {money(v.price || p.price + v.priceDelta)}
                </span>
              ))}
            </div>
          )}
          <div className="mt-5 flex gap-2">
            <span className="btn-primary flex-1">Add to Cart</span>
            <span className="btn-gold flex-1">Buy Now</span>
          </div>
          <p className="mt-4 text-[11px] text-[var(--svj-muted)]">
            Storefront preview only — customers see this layout on /product/{p.slug} once the product is published.
          </p>
        </div>
      </div>

      <div className="grid gap-4 bg-white p-6 lg:grid-cols-2">
        <div>
          <h2 className="text-[12px] font-semibold uppercase tracking-widest">Description</h2>
          <div className="rich-content mt-2 text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(p.description) || "<p>No description</p>" }} />
        </div>
        <dl className="space-y-3 text-xs">
          {([
            ["Benefits", p.benefits],
            ["Ingredients", p.ingredients],
            ["How to use", p.howToUse],
            ["Warnings", p.warnings],
            ["Size", `${p.size} ${p.volume ? `· ${p.volume}` : ""}`],
            ["Skin type", p.skinType],
            ["Hair type", p.hairType || "—"],
            ["SEO title", p.seoTitle],
            ["SEO description", p.seoDescription],
          ] as [string, string][]).map(([label, value]) => (
            <div key={label}>
              <dt className="text-[10px] uppercase tracking-widest text-[var(--svj-muted)]">{label}</dt>
              <dd className="mt-0.5 whitespace-pre-line">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
