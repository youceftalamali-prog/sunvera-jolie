"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore, track } from "@/components/StoreProvider";
import ProductMedia from "@/components/ProductMedia";
import Stars from "@/components/Stars";
import { money, discountPct } from "@/lib/format";
import type { ShopProduct, ShopImage } from "@/lib/types";

export default function ProductBuyBox({
  p,
  variants,
}: {
  p: ShopProduct;
  variants: { id: number; label: string; price: number; stock: number; imageUrl: string }[];
}) {
  const { addItem, wishlist, toggleWish } = useStore();
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [variant, setVariant] = useState(variants[0]?.label ?? p.size);
  const [zoom, setZoom] = useState(false);
  const [active, setActive] = useState(0);

  const gallery: ShopImage[] = p.images.filter((i) => i.url).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder);
  const v = variants.find((x) => x.label === variant);
  const unit = v?.price && v.price > 0 ? v.price : p.price;
  const off = discountPct(p.price, p.comparePrice);
  const wished = wishlist.includes(p.id);
  const currentImage = gallery[active];

  useEffect(() => {
    track("product_view", { content_ids: [p.id], content_name: p.name, value: p.price, currency: "DZD" });
  }, [p.id, p.name, p.price]);

  const line = {
    productId: p.id,
    slug: p.slug,
    name: p.name,
    price: unit,
    emoji: p.emoji,
    tone: p.tone,
    size: p.size,
    variant,
    image: currentImage?.url ?? "",
  };

  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <div>
        <button type="button" onClick={() => currentImage?.url && setZoom(true)} aria-label={`Zoom image of ${p.name}`} className="block w-full cursor-zoom-in">
          <ProductMedia
            url={currentImage?.url}
            emoji={p.emoji}
            tone={p.tone}
            name={currentImage?.alt || p.name}
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="aspect-square w-full"
            size="text-[9rem]"
          />
        </button>
        {(gallery.length > 0 || true) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {gallery.map((g, i) => (
              <button
                key={g.id}
                onClick={() => setActive(i)}
                aria-label={`View image ${i + 1} (${g.imageType})`}
                className={`h-20 w-20 border ${i === active ? "border-gold" : "border-cocoa/10"}`}
              >
                <ProductMedia url={g.url} emoji={p.emoji} tone={p.tone} name={g.alt} sizes="80px" className="h-full w-full" size="text-2xl" />
              </button>
            ))}
          </div>
        )}
        {zoom && currentImage?.url && (
          <div className="fixed inset-0 z-[100] overflow-auto bg-cocoa/80 p-6" onClick={() => setZoom(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentImage.url} alt={currentImage.alt} className="mx-auto max-h-[90vh] object-contain" />
          </div>
        )}
      </div>

      <div>
        <nav aria-label="Breadcrumb" className="text-[11px] uppercase tracking-widest text-cocoa-soft">
          Home / Shop / {p.categorySlug.replace(/-/g, " ")}
        </nav>
        <h1 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">{p.name}</h1>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Stars rating={p.rating} />
          <span className="text-cocoa-soft">{p.rating.toFixed(1)} · {p.reviewsCount} reviews</span>
        </div>
        <p className="mt-4 text-sm text-cocoa-soft">{p.shortDescription.replace(/<[^>]+>/g, "")}</p>

        <div className="mt-5 flex items-baseline gap-3">
          <span className="text-2xl font-semibold">{money(unit)}</span>
          {p.comparePrice > p.price && (
            <>
              <span className="text-sm text-cocoa-soft line-through">{money(p.comparePrice)}</span>
              <span className="bg-cocoa px-2 py-0.5 text-[10px] tracking-widest text-ivory">{off}% OFF</span>
            </>
          )}
        </div>
        <p className={`mt-2 text-xs ${p.stock > 0 ? "text-green-700" : "text-red-700"}`}>
          {p.stock > 0 ? `✓ In stock — ${p.stock} available` : "Currently sold out"}
        </p>

        {variants.length > 0 && (
          <div className="mt-5">
            <span className="label">Size / Volume</span>
            <div className="flex flex-wrap gap-2">
              {variants.map((x) => (
                <button
                  key={x.id}
                  onClick={() => setVariant(x.label)}
                  className={`border px-4 py-2 text-xs ${variant === x.label ? "border-gold bg-beige text-cocoa" : "border-cocoa/20 text-cocoa-soft"}`}
                >
                  {x.label} {x.price ? `· ${money(x.price)}` : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center gap-4">
          <div className="flex items-center border border-cocoa/20">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="px-4 py-2.5">−</button>
            <span className="w-10 text-center text-sm">{qty}</span>
            <button onClick={() => setQty((q) => Math.min(20, q + 1))} aria-label="Increase quantity" className="px-4 py-2.5">+</button>
          </div>
          <span className="text-sm text-cocoa-soft">Total: <b className="text-cocoa">{money(unit * qty)}</b></span>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button onClick={() => addItem(line, qty)} disabled={p.stock <= 0} className="btn-primary flex-1">Add to Cart</button>
          <button
            onClick={() => {
              addItem(line, qty);
              track("begin_checkout", { value: unit * qty, currency: "DZD" });
              router.push("/checkout");
            }}
            disabled={p.stock <= 0}
            className="btn-gold flex-1"
          >
            Buy Now
          </button>
          <button onClick={() => toggleWish(p.id)} aria-pressed={wished} className="btn-outline sm:!px-4" aria-label="Add to wishlist">
            {wished ? "❤️" : "🤍"}
          </button>
        </div>

        <ul className="mt-6 space-y-1.5 border-t border-cocoa/10 pt-5 text-xs text-cocoa-soft">
          <li>🇩🇿 Cash on Delivery available across all 58 wilayas</li>
          <li>🚚 Free delivery on orders over 9 000 DA</li>
          <li>🔄 14-day easy returns on unopened items</li>
          <li>💎 100% authentic products</li>
        </ul>
      </div>
    </div>
  );
}
