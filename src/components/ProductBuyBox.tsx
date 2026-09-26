"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useStore, track } from "@/components/StoreProvider";
import ProductMedia from "@/components/ProductMedia";
import Stars from "@/components/Stars";
import { money, discountPct } from "@/lib/format";
import type { ShopProduct, ShopImage } from "@/lib/types";

type Wilaya = {
  code: string;
  nameFr: string;
  nameAr: string;
  nameEn: string;
  fee: number;
  etaDays: string;
};

const COPY = {
  en: {
    home: "Home",
    shop: "Shop",
    bestSeller: "Best Seller",
    newArrival: "New Arrival",
    reviews: "Reviews",
    sold: "sold",
    inStock: "In Stock",
    outStock: "Out of Stock",
    available: "available",
    selectWilaya: "Select your Wilaya",
    deliveryAcross: "Delivery across Algeria",
    cod: "Cash on Delivery Available",
    freeDelivery: "Free delivery over 9,000 DZD",
    returns: "14-day easy returns on unopened items",
    authentic: "100% authentic products",
    quantity: "Quantity",
    total: "Total",
    addToCart: "Add to Cart",
    buyNow: "Buy Now",
    wishlist: "Add to Wishlist",
    offer: "Special Offer",
    secure: "Secure Checkout",
    premium: "Premium Quality",
    description: "Description",
    benefits: "Benefits",
  },
  fr: {
    home: "Accueil",
    shop: "Boutique",
    bestSeller: "Meilleure vente",
    newArrival: "Nouveauté",
    reviews: "Avis",
    sold: "vendus",
    inStock: "En stock",
    outStock: "Épuisé",
    available: "disponibles",
    selectWilaya: "Choisissez votre wilaya",
    deliveryAcross: "Livraison partout en Algérie",
    cod: "Paiement à la livraison",
    freeDelivery: "Livraison offerte dès 9 000 DZD",
    returns: "Retour sous 14 jours si produit non ouvert",
    authentic: "Produits 100% authentiques",
    quantity: "Quantité",
    total: "Total",
    addToCart: "Ajouter au panier",
    buyNow: "Acheter maintenant",
    wishlist: "Ajouter aux favoris",
    offer: "Offre spéciale",
    secure: "Paiement sécurisé",
    premium: "Qualité premium",
    description: "Description",
    benefits: "Bienfaits",
  },
  ar: {
    home: "الرئيسية",
    shop: "المتجر",
    bestSeller: "الأكثر مبيعًا",
    newArrival: "وصل حديثًا",
    reviews: "تقييم",
    sold: "تم بيعها",
    inStock: "متوفر",
    outStock: "غير متوفر",
    available: "متبقية",
    selectWilaya: "اختر ولايتك",
    deliveryAcross: "توصيل إلى جميع أنحاء الجزائر",
    cod: "الدفع عند الاستلام",
    freeDelivery: "توصيل مجاني ابتداءً من 9,000 دج",
    returns: "إرجاع خلال 14 يومًا للمنتجات غير المفتوحة",
    authentic: "منتجات أصلية 100%",
    quantity: "الكمية",
    total: "المجموع",
    addToCart: "أضف إلى السلة",
    buyNow: "اشتر الآن",
    wishlist: "أضف إلى المفضلة",
    offer: "عرض خاص",
    secure: "دفع آمن",
    premium: "جودة فاخرة",
    description: "الوصف",
    benefits: "الفوائد",
  },
} as const;

function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export default function ProductBuyBox({
  p,
  variants,
}: {
  p: ShopProduct;
  variants: { id: number; label: string; price: number; stock: number; imageUrl: string }[];
}) {
  const { addItem, wishlist, toggleWish, lang } = useStore();
  const router = useRouter();
  const copy = COPY[lang] ?? COPY.en;
  const [qty, setQty] = useState(1);
  const [variant, setVariant] = useState(variants[0]?.label ?? p.size);
  const [zoom, setZoom] = useState(false);
  const [active, setActive] = useState(0);
  const [wilayas, setWilayas] = useState<Wilaya[]>([]);
  const [selectedWilaya, setSelectedWilaya] = useState("");

  const gallery: ShopImage[] = useMemo(
    () => p.images.filter((i) => i.url).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder),
    [p.images],
  );

  const v = variants.find((x) => x.label === variant);
  const unit = v?.price && v.price > 0 ? v.price : p.price;
  const off = discountPct(unit, p.comparePrice);
  const wished = wishlist.includes(p.id);
  const currentImage = gallery[active] ?? gallery[0];
  const selectedWilayaData = wilayas.find((w) => w.code === selectedWilaya);
  const benefits = stripHtml(p.benefits).split(/\r?\n|•|-/).map((x) => x.trim()).filter(Boolean).slice(0, 4);

  useEffect(() => {
    track("product_view", { content_ids: [p.id], content_name: p.name, value: p.price, currency: "DZD" });
  }, [p.id, p.name, p.price]);

  useEffect(() => {
    let activeRequest = true;
    void fetch("/api/locations")
      .then((res) => res.json())
      .then((data) => {
        if (activeRequest && Array.isArray(data?.wilayas)) setWilayas(data.wilayas as Wilaya[]);
      })
      .catch(() => undefined);
    return () => {
      activeRequest = false;
    };
  }, []);

  useEffect(() => {
    if (active >= gallery.length && gallery.length) setActive(0);
  }, [active, gallery.length]);

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
    <div dir={lang === "ar" ? "rtl" : "ltr"} className="grid gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)] lg:gap-12">
      <div>
        <div className="grid gap-4 lg:grid-cols-[86px_minmax(0,1fr)]">
          <div className="order-2 flex gap-2 overflow-x-auto lg:order-1 lg:flex-col">
            {gallery.map((g, i) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`View image ${i + 1}`}
                className={`h-20 w-20 shrink-0 overflow-hidden rounded-xl border bg-white transition sm:h-24 sm:w-24 lg:h-20 lg:w-20 ${i === active ? "border-gold ring-1 ring-gold/30" : "border-cocoa/10 hover:border-gold/50"}`}
              >
                <ProductMedia
                  url={g.url}
                  emoji={p.emoji}
                  tone={p.tone}
                  name={g.alt || p.name}
                  sizes="96px"
                  className="h-full w-full"
                  size="text-2xl"
                />
              </button>
            ))}
          </div>

          <div className="order-1 lg:order-2">
            <button
              type="button"
              onClick={() => currentImage?.url && setZoom(true)}
              aria-label={`Zoom image of ${p.name}`}
              className="group relative block aspect-[4/5] w-full overflow-hidden rounded-[28px] bg-[#f6f1e9] shadow-[0_20px_55px_rgba(58,43,34,0.08)]"
            >
              {currentImage?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentImage.url}
                  alt={currentImage.alt || p.name}
                  className="h-full w-full object-contain p-3 sm:p-5 transition duration-500 group-hover:scale-[1.015]"
                  sizes="(max-width: 1024px) 100vw, 55vw"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-8xl">{p.emoji}</div>
              )}
              <div className="absolute start-4 top-4 flex flex-wrap gap-2">
                {p.bestSeller && <span className="rounded-full bg-[#b58c45] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white shadow-sm">{copy.bestSeller}</span>}
                {!p.bestSeller && p.newArrival && <span className="rounded-full bg-[#3a2b22] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white shadow-sm">{copy.newArrival}</span>}
              </div>
              {gallery.length > 0 && (
                <span className="absolute bottom-4 end-4 rounded-full bg-[#2f2823]/85 px-3 py-1.5 text-[10px] font-medium text-white backdrop-blur">
                  {active + 1} / {gallery.length}
                </span>
              )}
              <span className="absolute bottom-4 start-4 rounded-full border border-white/70 bg-white/85 px-3 py-1.5 text-[10px] font-semibold text-cocoa shadow-sm">
                ⛶
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="self-start lg:sticky lg:top-24">
        <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-cocoa-soft">
          {copy.home} / {copy.shop} / {p.categorySlug.replace(/-/g, " ")}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-lg text-gold">{p.brand}</span>
          {p.bestSeller && <span className="rounded-full bg-[#f4ead7] px-3 py-1 text-[9px] font-semibold uppercase tracking-widest text-[#8b6c35]">{copy.bestSeller}</span>}
          {p.newArrival && !p.bestSeller && <span className="rounded-full bg-[#f4ead7] px-3 py-1 text-[9px] font-semibold uppercase tracking-widest text-[#8b6c35]">{copy.newArrival}</span>}
        </div>

        <h1 className="mt-2 font-display text-4xl leading-[1.05] text-cocoa sm:text-5xl">{p.name}</h1>

        {p.shortDescription && (
          <p className="mt-3 max-w-2xl text-base leading-7 text-cocoa-soft">
            {stripHtml(p.shortDescription)}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Stars rating={p.rating} />
          <span className="font-medium text-cocoa">{p.rating.toFixed(1)}</span>
          <span className="text-cocoa-soft">({p.reviewsCount} {copy.reviews})</span>
        </div>

        {benefits.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-start gap-3 rounded-2xl border border-cocoa/10 bg-white px-4 py-3">
                <span className="mt-0.5 text-gold">✦</span>
                <span className="text-sm leading-6 text-cocoa">{benefit}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-[#ead6c8] bg-[#fff6f1] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a15a42]">{copy.offer}</div>
            <div className="mt-2 flex flex-wrap items-baseline gap-3">
              <span className="text-3xl font-semibold text-cocoa">{money(unit)}</span>
              {p.comparePrice > unit && <span className="text-sm text-cocoa-soft line-through">{money(p.comparePrice)}</span>}
              {p.comparePrice > unit && <span className="rounded-full bg-[#d94855] px-2.5 py-1 text-[10px] font-semibold text-white">{off}% OFF</span>}
            </div>
          </div>
          <div className="rounded-2xl border border-cocoa/10 bg-[#fcfaf6] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cocoa-soft">{copy.premium}</div>
            <p className="mt-2 text-sm leading-6 text-cocoa">{copy.authentic}</p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-cocoa/10 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-cocoa">{copy.deliveryAcross}</span>
            <span className="rounded-full bg-green-50 px-3 py-1 text-[10px] font-semibold text-green-800">
              {p.stock > 0 ? copy.inStock : copy.outStock}
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="flex items-center gap-2 rounded-xl border border-cocoa/15 bg-[#fcfaf6] px-3 py-3">
              <span className="text-base">📍</span>
              <select
                value={selectedWilaya}
                onChange={(event) => setSelectedWilaya(event.target.value)}
                className="w-full bg-transparent text-sm outline-none"
                aria-label={copy.selectWilaya}
              >
                <option value="">{copy.selectWilaya}</option>
                {wilayas.map((w) => (
                  <option key={w.code} value={w.code}>
                    {lang === "ar" ? w.nameAr : lang === "fr" ? w.nameFr : w.nameEn}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-xl border border-cocoa/15 bg-[#fcfaf6] px-4 py-3 text-sm">
              {selectedWilayaData ? (
                <span>{money(selectedWilayaData.fee)} · {selectedWilayaData.etaDays}</span>
              ) : (
                <span className="text-cocoa-soft">1–8 days</span>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-cocoa-soft">
            <span>🚚 {copy.deliveryAcross}</span>
            <span>💳 {copy.cod}</span>
            <span>↩ {copy.returns}</span>
          </div>
        </div>

        {variants.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-cocoa-soft">Size / Volume</div>
            <div className="flex flex-wrap gap-2">
              {variants.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setVariant(x.label)}
                  className={`rounded-full border px-4 py-2.5 text-sm transition ${variant === x.label ? "border-gold bg-[#f4ead7] text-cocoa" : "border-cocoa/15 bg-white text-cocoa-soft hover:border-gold/50"}`}
                >
                  {x.label}{x.price ? ` · ${money(x.price)}` : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-cocoa/10 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-cocoa-soft">{copy.quantity}</div>
              <div className="mt-2 flex items-center overflow-hidden rounded-xl border border-cocoa/15">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" className="h-11 w-11 text-lg hover:bg-beige">−</button>
                <span className="flex h-11 w-12 items-center justify-center border-x border-cocoa/10 text-sm font-medium">{qty}</span>
                <button type="button" onClick={() => setQty((q) => Math.min(20, q + 1))} aria-label="Increase quantity" className="h-11 w-11 text-lg hover:bg-beige">+</button>
              </div>
            </div>
            <div className="text-end">
              <div className="text-xs uppercase tracking-[0.16em] text-cocoa-soft">{copy.total}</div>
              <div className="mt-1 text-2xl font-semibold text-cocoa">{money(unit * qty)}</div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1.25fr_1fr_auto]">
            <button onClick={() => addItem(line, qty)} disabled={p.stock <= 0} className="btn-gold !min-h-12 rounded-xl text-sm font-semibold tracking-[0.12em] uppercase disabled:cursor-not-allowed disabled:opacity-50">
              🛍 {copy.addToCart}
            </button>
            <button
              onClick={() => {
                addItem(line, qty);
                track("begin_checkout", { value: unit * qty, currency: "DZD" });
                router.push("/checkout");
              }}
              disabled={p.stock <= 0}
              className="btn-primary !min-h-12 rounded-xl text-sm font-semibold tracking-[0.12em] uppercase disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copy.buyNow}
            </button>
            <button
              onClick={() => toggleWish(p.id)}
              aria-pressed={wished}
              aria-label={copy.wishlist}
              title={copy.wishlist}
              className="btn-outline !min-h-12 rounded-xl px-4 text-lg"
            >
              {wished ? "♥" : "♡"}
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-cocoa/10 bg-white p-4">
            <div className="text-xl text-gold">🚚</div>
            <div className="mt-2 text-sm font-semibold">{copy.deliveryAcross}</div>
            <div className="mt-1 text-xs leading-5 text-cocoa-soft">58 Wilayas</div>
          </div>
          <div className="rounded-2xl border border-cocoa/10 bg-white p-4">
            <div className="text-xl text-gold">🛡</div>
            <div className="mt-2 text-sm font-semibold">{copy.secure}</div>
            <div className="mt-1 text-xs leading-5 text-cocoa-soft">{copy.authentic}</div>
          </div>
          <div className="rounded-2xl border border-cocoa/10 bg-white p-4">
            <div className="text-xl text-gold">✨</div>
            <div className="mt-2 text-sm font-semibold">{copy.premium}</div>
            <div className="mt-1 text-xs leading-5 text-cocoa-soft">{copy.freeDelivery}</div>
          </div>
        </div>
      </div>

      {zoom && currentImage?.url && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" onClick={() => setZoom(false)}>
          <div className="relative max-h-[94vh] max-w-6xl overflow-hidden rounded-2xl bg-[#f6f1e9]" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setZoom(false)}
              aria-label="Close image"
              className="absolute end-4 top-4 z-10 rounded-full bg-white/90 px-3 py-2 text-sm shadow"
            >
              ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentImage.url} alt={currentImage.alt || p.name} className="max-h-[92vh] max-w-[92vw] object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
