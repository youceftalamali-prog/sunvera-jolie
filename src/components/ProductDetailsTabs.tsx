"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/components/StoreProvider";
import { sanitizeHtml } from "@/lib/sanitize";

type Props = {
  description: string;
  benefits: string;
  ingredients: string;
  howToUse: string;
  productDetails: string;
  shipping: string;
  warnings: string;
};

const COPY = {
  en: { description: "Description", benefits: "Benefits", ingredients: "Ingredients", howToUse: "How to Use", details: "Product Details", shipping: "Shipping & Delivery", warnings: "Warnings" },
  fr: { description: "Description", benefits: "Bienfaits", ingredients: "Ingrédients", howToUse: "Mode d'emploi", details: "Détails du produit", shipping: "Livraison & retours", warnings: "Avertissements" },
  ar: { description: "الوصف", benefits: "الفوائد", ingredients: "المكونات", howToUse: "طريقة الاستخدام", details: "تفاصيل المنتج", shipping: "الشحن والتوصيل", warnings: "التحذيرات" },
} as const;

function splitLines(value: string) {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "\n")
    .split(/\r?\n|•|;/)
    .map((item) => item.replace(/^[-–—*]\s*/, "").trim())
    .filter(Boolean);
}

export default function ProductDetailsTabs(props: Props) {
  const { lang } = useStore();
  const copy = COPY[lang] ?? COPY.en;
  const tabs = useMemo(
    () => [
      { key: "description", label: copy.description, value: props.description, html: true },
      { key: "benefits", label: copy.benefits, value: props.benefits, html: false },
      { key: "ingredients", label: copy.ingredients, value: props.ingredients, html: false },
      { key: "howToUse", label: copy.howToUse, value: props.howToUse, html: true },
      { key: "details", label: copy.details, value: props.productDetails, html: false },
      { key: "shipping", label: copy.shipping, value: props.shipping, html: false },
      { key: "warnings", label: copy.warnings, value: props.warnings, html: false },
    ].filter((tab) => tab.value.trim()),
    [copy, props],
  );
  const [active, setActive] = useState(tabs[0]?.key ?? "description");
  const selected = tabs.find((tab) => tab.key === active) ?? tabs[0];

  if (!selected) return null;

  const selectedLines = splitLines(selected.value);

  return (
    <section dir={lang === "ar" ? "rtl" : "ltr"} className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
      <div className="overflow-hidden rounded-[28px] border border-[#eadfd5] bg-white shadow-[0_14px_40px_rgba(58,43,34,0.05)]">
        <div className="overflow-x-auto border-b border-[#eadfd5] bg-[#fcfaf6]">
          <div className="flex min-w-max items-end gap-1 px-3 pt-2 sm:px-5">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActive(tab.key)}
                className={
                  active === tab.key
                    ? "border-b-2 border-gold bg-white px-4 py-3 text-xs font-semibold tracking-[0.08em] text-cocoa shadow-[0_-2px_12px_rgba(58,43,34,0.03)]"
                    : "border-b-2 border-transparent px-4 py-3 text-xs font-medium tracking-[0.06em] text-cocoa-soft hover:text-cocoa"
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-8 px-5 py-7 sm:px-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.95fr)] lg:py-9">
          <div>
            {selected.html ? (
              <div className="rich-content max-w-3xl text-sm leading-8 text-cocoa-soft" dangerouslySetInnerHTML={{ __html: sanitizeHtml(selected.value) }} />
            ) : selected.key === "benefits" || selected.key === "ingredients" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {selectedLines.map((line, index) => (
                  <div key={index + "-" + line} className="flex items-start gap-3 rounded-2xl border border-[#eee3d8] bg-[#fcfaf6] p-4">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-white text-gold">
                      {selected.key === "ingredients" ? "◌" : "✦"}
                    </span>
                    <span className="text-sm leading-6 text-cocoa">{line}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {selectedLines.map((line, index) => (
                  <div key={index + "-" + line} className="flex gap-3 text-sm leading-7 text-cocoa-soft">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="rounded-[24px] border border-[#eadfd5] bg-[#fbf6ef] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">{lang === "ar" ? "معلومات إضافية" : lang === "fr" ? "Informations utiles" : "Useful information"}</p>
            <div className="mt-4 space-y-3 text-sm text-cocoa-soft">
              <div className="flex items-start gap-3">
                <span className="text-gold">✓</span>
                <span>{lang === "ar" ? "الدفع عند الاستلام متوفر" : lang === "fr" ? "Paiement à la livraison disponible" : "Cash on Delivery available"}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-gold">✓</span>
                <span>{lang === "ar" ? "التوصيل إلى جميع الولايات" : lang === "fr" ? "Livraison dans toutes les wilayas" : "Delivery across Algeria"}</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-gold">✓</span>
                <span>{lang === "ar" ? "14 يومًا لإرجاع المنتجات غير المفتوحة" : lang === "fr" ? "Retour sous 14 jours pour les produits non ouverts" : "14-day returns on unopened items"}</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
