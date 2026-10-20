"use client";

import Link from "next/link";
import RotatingProductImage from "@/components/RotatingProductImage";
import type { ShopProduct } from "@/lib/types";
import { money } from "@/lib/format";

export default function HomepageProductSpotlight({ items }: { items: ShopProduct[] }) {
  const products = items.slice(0, 3);
  if (!products.length) return null;

  return (
    <section className="relative overflow-hidden bg-[#fbf5ed] py-14 sm:py-20" aria-labelledby="svj-spotlight-title">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_15%,rgba(201,164,92,0.13),transparent_30%),radial-gradient(circle_at_88%_85%,rgba(201,164,92,0.10),transparent_28%)]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.38em] text-[#b58a52]">A rotating beauty edit</p>
          <h2 id="svj-spotlight-title" className="mt-2 font-display text-3xl text-[#3a2b22] sm:text-4xl">Discover Your Next Favorite</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#78685d]">A little inspiration for your daily beauty ritual. Product photos change automatically every few seconds.</p>
          <div className="mx-auto mt-5 h-px w-20 bg-[#c9a45c]" />
        </div>
        <div className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const images = product.images
              .filter((image) => image.url && !String(image.mimeType ?? "").startsWith("video/"))
              .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder)
              .map((image) => image.url);
            return (
              <article key={product.id} className="group overflow-hidden rounded-[22px] border border-[#ead9c5] bg-white shadow-[0_12px_32px_rgba(58,43,34,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(58,43,34,0.11)]">
                <Link href={`/product/${product.slug}`} className="block">
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#f4e9dc]">
                    {images.length ? (
                      <RotatingProductImage
                        images={images}
                        alt={product.name}
                        mode="auto"
                        intervalMs={3200}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-5xl text-[#b58a52]" aria-hidden>{product.emoji || "✦"}</div>
                    )}
                    {product.bestSeller && <span className="absolute left-3 top-3 rounded-full bg-[#3a2b22]/90 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-white">Best Seller</span>}
                    {product.newArrival && <span className="absolute right-3 top-3 rounded-full bg-[#f5e8d8] px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6b4b2b]">New</span>}
                  </div>
                  <div className="p-4 sm:p-5">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#b58a52]">{product.categorySlug.replace(/-/g, " ")}</p>
                    <h3 className="mt-2 line-clamp-2 font-display text-xl leading-snug text-[#3a2b22]">{product.name}</h3>
                    {product.shortDescription && <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#78685d]">{product.shortDescription}</p>}
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-[#3a2b22]">{money(product.price)}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#a87937]">Discover →</span>
                    </div>
                  </div>
                </Link>
              </article>
            );
          })}
        </div>
        <div className="mt-8 text-center">
          <Link href="/all-products" className="inline-flex items-center justify-center bg-[#c9a45c] px-7 py-3.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#3a2b22] transition hover:bg-[#b58a52]">
            Explore All Products <span className="ms-2" aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
