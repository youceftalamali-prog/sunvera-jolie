"use client";

import Link from "next/link";
import { useStore } from "@/components/StoreProvider";
import Stars from "@/components/Stars";
import RotatingProductImage, { type RotationMode } from "@/components/RotatingProductImage";
import { money, discountPct } from "@/lib/format";
import type { ShopProduct } from "@/lib/types";

export default function EditorialProductCard({
  product,
  rotationMode = "static",
  intervalMs = 3500,
  compact = false,
  showBadges = true,
}: {
  product: ShopProduct;
  rotationMode?: RotationMode;
  intervalMs?: number;
  compact?: boolean;
  showBadges?: boolean;
}) {
  const { addItem, wishlist, toggleWish } = useStore();
  const primary = product.images.find((i) => i.isPrimary && i.url) ?? product.images.find((i) => i.url);
  const images = product.images.filter((i) => i.url).sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.url);
  const off = discountPct(product.price, product.comparePrice);
  const wished = wishlist.includes(product.id);

  function add() {
    addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      emoji: product.emoji,
      tone: product.tone,
      size: product.size,
      variant: product.size,
      image: primary?.url ?? "",
    }, 1);
  }

  return (
    <article className={\`group relative overflow-hidden rounded-2xl border border-cocoa/10 bg-white shadow-[0_10px_30px_rgba(58,43,34,0.05)] \${compact ? "" : "h-full"}\`}>
      <div className="relative">
        {showBadges && (
          <div className="absolute start-3 top-3 z-10 flex flex-col gap-1">
            {off > 0 && <span className="bg-cocoa px-2 py-1 text-[9px] font-semibold tracking-[0.18em] text-ivory">{off}% OFF</span>}
            {product.newArrival && <span className="bg-gold px-2 py-1 text-[9px] font-semibold tracking-[0.18em] text-white">NEW</span>}
            {product.bestSeller && <span className="border border-gold bg-white/95 px-2 py-1 text-[9px] font-semibold tracking-[0.16em] text-gold">BEST SELLER</span>}
          </div>
        )}
        <button type="button" onClick={() => toggleWish(product.id)} aria-label={wished ? "Remove from wishlist" : "Add to wishlist"} className="absolute end-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-sm shadow-sm">
          <span aria-hidden>{wished ? "❤️" : "♡"}</span>
        </button>
        <Link href={\`/product/\${product.slug}\`} className="block aspect-[4/5] overflow-hidden bg-beige">
          <RotatingProductImage images={images} alt={primary?.alt || product.name} mode={rotationMode} intervalMs={intervalMs} />
        </Link>
      </div>
      <div className="p-4 pb-5">
        <p className="text-[9px] uppercase tracking-[0.2em] text-cocoa-soft/70">{product.productType || product.categorySlug}</p>
        <Link href={\`/product/\${product.slug}\`} className="mt-1 block font-display text-lg leading-tight text-cocoa hover:text-gold">{product.name}</Link>
        {!compact && <p className="mt-1 line-clamp-2 text-xs text-cocoa-soft">{product.shortDescription}</p>}
        <div className="mt-2 flex items-center gap-1.5 text-xs"><Stars rating={product.rating} /><span className="text-cocoa-soft">{product.rating.toFixed(1)} ({product.reviewsCount})</span></div>
        <div className="mt-3 flex items-baseline gap-2"><span className="font-semibold text-cocoa">{money(product.price)}</span>{product.comparePrice > product.price && <span className="text-xs text-cocoa-soft line-through">{money(product.comparePrice)}</span>}</div>
        <div className="mt-4 flex gap-2">
          <button onClick={add} disabled={product.stock <= 0} className="btn-primary flex-1 !px-3 !py-2.5 text-[10px]">{product.stock > 0 ? "Add to Cart" : "Sold Out"}</button>
          <Link href={\`/product/\${product.slug}\`} className="btn-outline !px-3 !py-2.5 text-[10px]">View</Link>
        </div>
      </div>
    </article>
  );
}
