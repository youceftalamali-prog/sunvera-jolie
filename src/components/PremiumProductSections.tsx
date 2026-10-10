"use client";

import Image from "next/image";
import { useStore } from "@/components/StoreProvider";
import Stars from "@/components/Stars";
import ReviewForm from "@/components/ReviewForm";
import { isVideoMedia, type ShopImage } from "@/lib/types";

type Product = {
  id: number;
  name: string;
  brand: string;
  description: string;
  benefits: string;
  ingredients: string;
  howToUse: string;
  warnings: string;
  skinType: string;
  hairType: string;
  rating: number;
  reviewsCount: number;
};

type Review = {
  id: number;
  customerName: string;
  rating: number;
  body: string;
  verified: boolean;
  createdAt: Date | string;
};

function splitLines(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "\n")
    .split(/\r?\n|•|;/)
    .map((item) => item.replace(/^[-–—*]\s*/, "").trim())
    .filter(Boolean);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function PremiumProductSections({
  product,
  images,
  reviews,
}: {
  product: Product;
  images: ShopImage[];
  reviews: Review[];
}) {
  const { lang } = useStore();
  const benefitLines = splitLines(product.benefits).slice(0, 6);
  const ingredientLines = splitLines(product.ingredients).slice(0, 8);
  const howToLines = splitLines(product.howToUse).slice(0, 3);
  const gallery = images.filter((image) => image.url && !isVideoMedia(image)).sort((a, b) => a.sortOrder - b.sortOrder);
  const featureLabels =
    lang === "ar"
      ? ["مناسب لروتينك اليومي", "منتجات أصلية", "الدفع عند الاستلام", "توصيل عبر الجزائر"]
      : lang === "fr"
        ? ["Rituel quotidien", "Produits authentiques", "Paiement à la livraison", "Livraison en Algérie"]
        : ["Daily beauty ritual", "Authentic products", "Cash on Delivery", "Delivery across Algeria"];

  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"} className="mx-auto max-w-7xl px-4 sm:px-6">
      <section className="rounded-[26px] border border-[#eadfd5] bg-white shadow-[0_14px_40px_rgba(58,43,34,0.05)]">
        <div className="grid grid-cols-2 divide-x divide-y divide-[#eadfd5] sm:grid-cols-4 sm:divide-y-0">
          {featureLabels.map((label, index) => (
            <div key={label} className="flex items-center gap-3 p-4 sm:p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/35 bg-[#fbf6ef] text-gold">
                {["✦", "✓", "▣", "🚚"][index]}
              </span>
              <span className="text-xs font-medium leading-5 text-cocoa">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <article className="rounded-[26px] border border-[#eadfd5] bg-white p-6 sm:p-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">
            {lang === "ar" ? "وصف المنتج" : lang === "fr" ? "Description du produit" : "Product description"}
          </p>
          <h2 className="mt-2 font-display text-3xl leading-tight text-cocoa">
            {lang === "ar" ? "طقس جمال يومي فاخر" : lang === "fr" ? "Un rituel beauté raffiné" : "A refined daily beauty ritual"}
          </h2>
          <div
            className="rich-content mt-5 max-w-3xl text-sm leading-8 text-cocoa-soft"
            dangerouslySetInnerHTML={{ __html: product.description || "<p>No description yet.</p>" }}
          />
          {benefitLines.length > 0 && (
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {benefitLines.slice(0, 4).map((benefit, index) => (
                <div key={index + benefit} className="flex items-start gap-3 rounded-2xl bg-[#fbf6ef] p-4">
                  <span className="text-gold">✦</span>
                  <span className="text-sm leading-6 text-cocoa">{benefit}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="relative min-h-[320px] overflow-hidden rounded-[26px] bg-[#f4ede4]">
          {gallery[1]?.url || gallery[0]?.url ? (
            <Image
              src={(gallery[1]?.url || gallery[0]?.url) as string}
              alt={product.name}
              fill
              sizes="(max-width: 1024px) 100vw, 45vw"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full min-h-[320px] items-center justify-center text-7xl">✨</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-cocoa/75 via-cocoa/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#f1d79f]">
              {product.brand || "SunVera Jolie"}
            </p>
            <h3 className="mt-2 font-display text-3xl leading-tight">
              {lang === "ar" ? "تفاصيل تستحق الاكتشاف" : lang === "fr" ? "Des détails à découvrir" : "Details worth discovering"}
            </h3>
          </div>
        </article>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <article className="rounded-[26px] border border-[#eadfd5] bg-white p-6 sm:p-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">
            {lang === "ar" ? "طريقة الاستخدام" : lang === "fr" ? "Mode d'emploi" : "How to use"}
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {(howToLines.length ? howToLines : ["Apply to clean skin.", "Massage gently.", "Continue your routine."]).map((step, index) => (
              <div key={index + step} className="rounded-2xl border border-[#eee3d8] bg-[#fcfaf6] p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cocoa text-xs font-semibold text-white">
                  {index + 1}
                </span>
                {gallery[index]?.url && (
                  <div className="relative mt-3 aspect-[1.35] overflow-hidden rounded-xl">
                    <Image src={gallery[index].url} alt={product.name} fill sizes="220px" className="object-cover" />
                  </div>
                )}
                <p className="mt-3 text-sm leading-6 text-cocoa-soft">{step}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[26px] border border-[#eadfd5] bg-white p-6 sm:p-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">
            {lang === "ar" ? "المكونات الرئيسية" : lang === "fr" ? "Ingrédients clés" : "Key ingredients"}
          </p>
          {ingredientLines.length ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {ingredientLines.slice(0, 6).map((ingredient, index) => (
                <div key={index + ingredient} className="rounded-2xl border border-[#eee3d8] bg-[#fcfaf6] p-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/35 bg-white text-gold">◌</span>
                    <span className="text-sm font-medium text-cocoa">{ingredient}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm leading-7 text-cocoa-soft">Ingredient information will appear here when provided in the product record.</p>
          )}
        </article>
      </section>

      <section className="mt-6 rounded-[26px] border border-[#eadfd5] bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">
              {lang === "ar" ? "تقييمات العملاء" : lang === "fr" ? "Avis clients" : "Customer reviews"}
            </p>
            <h2 className="mt-2 font-display text-3xl text-cocoa">
              {product.rating.toFixed(1)} / 5
            </h2>
          </div>
          <div className="text-end">
            <Stars rating={product.rating} />
            <p className="mt-1 text-xs text-cocoa-soft">{product.reviewsCount} reviews</p>
          </div>
        </div>

        {reviews.length ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {reviews.slice(0, 6).map((review) => (
              <article key={review.id} className="rounded-2xl border border-[#eee3d8] bg-[#fcfaf6] p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ead9c7] text-xs font-semibold text-cocoa">
                    {initials(review.customerName)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-cocoa">{review.customerName}</span>
                      {review.verified && <span className="text-[10px] font-medium text-green-700">✓ Verified</span>}
                    </div>
                    <Stars rating={review.rating} />
                  </div>
                </div>
                <p className="mt-4 text-sm leading-7 text-cocoa-soft">“{review.body}”</p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-6 text-sm text-cocoa-soft">
            {lang === "ar" ? "كن أول من يقيّم هذا المنتج." : lang === "fr" ? "Soyez le premier à laisser un avis." : "Be the first to review this product."}
          </p>
        )}

        <div className="mt-7 border-t border-[#eadfd5] pt-7">
          <ReviewForm productId={product.id} />
        </div>
      </section>

      <section className="mt-6 rounded-[26px] border border-[#eadfd5] bg-white p-6 sm:p-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">
          {lang === "ar" ? "الأسئلة الشائعة" : lang === "fr" ? "Questions fréquentes" : "Frequently asked questions"}
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <details className="rounded-2xl border border-[#eee3d8] bg-[#fcfaf6] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-cocoa">{lang === "ar" ? "هل الدفع عند الاستلام متوفر؟" : "Is Cash on Delivery available?"}</summary>
            <p className="mt-3 text-sm leading-6 text-cocoa-soft">{lang === "ar" ? "نعم، الدفع عند الاستلام متوفر في المتجر." : "Yes. Cash on Delivery is available across the store."}</p>
          </details>
          <details className="rounded-2xl border border-[#eee3d8] bg-[#fcfaf6] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-cocoa">{lang === "ar" ? "كم تستغرق مدة التوصيل؟" : "How long does delivery take?"}</summary>
            <p className="mt-3 text-sm leading-6 text-cocoa-soft">{lang === "ar" ? "تختلف حسب الولاية وعادةً بين يوم و8 أيام." : "Delivery typically takes 1–8 days depending on your wilaya."}</p>
          </details>
          <details className="rounded-2xl border border-[#eee3d8] bg-[#fcfaf6] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-cocoa">{lang === "ar" ? "هل يمكن إرجاع المنتج؟" : "Can I return the product?"}</summary>
            <p className="mt-3 text-sm leading-6 text-cocoa-soft">{lang === "ar" ? "يمكن إرجاع المنتجات غير المفتوحة خلال 14 يومًا." : "Unopened items can be returned within 14 days."}</p>
          </details>
          <details className="rounded-2xl border border-[#eee3d8] bg-[#fcfaf6] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-cocoa">{lang === "ar" ? "أين أجد المكونات وطريقة الاستخدام؟" : "Where can I find ingredients and usage information?"}</summary>
            <p className="mt-3 text-sm leading-6 text-cocoa-soft">{lang === "ar" ? "ستجدها في تبويبات المكونات وطريقة الاستخدام في صفحة المنتج." : "They are shown in the Ingredients and How to Use tabs above."}</p>
          </details>
        </div>
      </section>
    </div>
  );
}
