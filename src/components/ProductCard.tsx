"use client";

import Link from "next/link";
import { useState } from "react";
import { useStore } from "@/components/StoreProvider";
import ProductMedia from "@/components/ProductMedia";
import Stars from "@/components/Stars";
import { money, discountPct } from "@/lib/format";
import type { ShopProduct } from "@/lib/types";

export default function ProductCard({ p }: { p: ShopProduct }) {
  const { addItem, wishlist, toggleWish } = useStore();
  const [quick, setQuick] = useState(false);
  const off = discountPct(p.price, p.comparePrice);
  const wished = wishlist.includes(p.id);
  const primary = p.images.find((i) => i.isPrimary && i.url) ?? p.images.find((i) => i.url);

  const add = (qty = 1) =>
    addItem(
      {
        productId: p.id,
        slug: p.slug,
        name: p.name,
        price: p.price,
        emoji: p.emoji,
        tone: p.tone,
        size: p.size,
        variant: p.size,
        image: primary?.url ?? "",
      },
      qty,
    );

  return (
    <article className="group relative flex flex-col bg-white transition-shadow duration-300 hover:shadow-[0_8px_40px_rgba(58,43,34,0.08)]">
      <div className="absolute start-3 top-3 z-10 flex flex-col gap-1.5">
        {off > 0 && (
          <span className="bg-cocoa px-2 py-1 text-[10px] font-semibold tracking-widest text-ivory">{off}% OFF</span>
        )}
        {p.newArrival && <span className="bg-gold px-2 py-1 text-[10px] font-semibold tracking-widest text-white">NEW</span>}
        {p.bestSeller && (
          <span className="border border-gold bg-white px-2 py-1 text-[10px] font-semibold tracking-widest text-gold">BEST SELLER</span>
        )}
        {p.stock > 0 && p.stock <= (p.lowStockThreshold || 10) && (
          <span className="bg-[#a3582f] px-2 py-1 text-[10px] font-semibold tracking-widest text-white">ONLY {p.stock} LEFT</span>
        )}
      </div>

      <button
        type="button"
        onClick={() => toggleWish(p.id)}
        aria-label={wished ? `Remove ${p.name} from wishlist` : `Add ${p.name} to wishlist`}
        aria-pressed={wished}
        className="absolute end-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-sm shadow-sm transition hover:bg-white"
      >
        <span aria-hidden>{wished ? "❤️" : "🤍"}</span>
      </button>

      <Link href={`/product/${p.slug}`} className="block overflow-hidden">
        <ProductMedia
          url={primary?.url}
          emoji={p.emoji}
          tone={p.tone}
          name={primary?.alt || p.name}
          sizes="(max-width: 640px) 50vw, 25vw"
          className="aspect-[4/5] w-full transition-transform duration-500 group-hover:scale-[1.04]"
        />
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-[10px] uppercase tracking-[0.18em] text-cocoa-soft/70">{p.productType || p.categorySlug}</p>
        <h3 className="mt-1 font-display text-[15px] leading-snug text-cocoa">
          <Link href={`/product/${p.slug}`} className="hover:text-gold">{p.name}</Link>
        </h3>
        <p className="mt-1 line-clamp-2 text-xs text-cocoa-soft">{p.shortDescription}</p>
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <Stars rating={p.rating} />
          <span className="text-cocoa-soft">{p.rating.toFixed(1)} ({p.reviewsCount})</span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-base font-semibold text-cocoa">{money(p.price)}</span>
          {p.comparePrice > p.price && <span className="text-xs text-cocoa-soft line-through">{money(p.comparePrice)}</span>}
        </div>

        <div className="mt-auto flex gap-2 pt-4">
          <button onClick={() => add()} disabled={p.stock <= 0} className="btn-primary flex-1 !px-3 !py-2.5 text-[10px]">
            {p.stock > 0 ? "Add to Cart" : "Sold Out"}
          </button>
          <button
            onClick={() => setQuick(true)}
            aria-label={`Quick view ${p.name}`}
            className="border border-cocoa/20 px-3 text-xs text-cocoa transition hover:border-gold hover:text-gold"
          >
            👁
          </button>
        </div>
      </div>

      {quick && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-cocoa/50 p-4" onClick={() => setQuick(false)} role="dialog" aria-modal="true">
          <div className="grid max-h-[90vh] w-full max-w-2xl gap-6 overflow-y-auto bg-white p-6 sm:grid-cols-2" onClick={(e) => e.stopPropagation()}>
            <ProductMedia url={primary?.url} emoji={p.emoji} tone={p.tone} name={primary?.alt || p.name} className="aspect-square w-full" sizes="400px" />
            <div>
              <h3 className="font-display text-2xl">{p.name}</h3>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <Stars rating={p.rating} /> <span className="text-cocoa-soft">({p.reviewsCount} reviews)</span>
              </div>
              <p className="mt-3 text-sm text-cocoa-soft">{p.shortDescription}</p>
              <p className="mt-4 text-xl font-semibold">{money(p.price)}</p>
              <div className="mt-5 flex flex-col gap-2">
                <button onClick={() => add()} className="btn-primary w-full">Add to Cart</button>
                <Link href={`/product/${p.slug}`} className="btn-outline w-full">Full details</Link>
                <button onClick={() => setQuick(false)} className="text-xs text-cocoa-soft underline">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
