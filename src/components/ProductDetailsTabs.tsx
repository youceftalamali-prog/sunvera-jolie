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

  return (
    <section dir={lang === "ar" ? "rtl" : "ltr"} className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
      <div className="overflow-hidden rounded-[24px] border border-cocoa/10 bg-white">
        <div className="flex gap-6 overflow-x-auto border-b border-cocoa/10 px-5 pt-1 sm:px-7">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={`shrink-0 border-b-2 px-1 py-4 text-sm font-medium transition ${
                active === tab.key ? "border-gold text-cocoa" : "border-transparent text-cocoa-soft hover:text-cocoa"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="px-5 py-6 sm:px-7 sm:py-8">
          {selected.html ? (
            <div className="rich-content max-w-5xl text-sm leading-7 text-cocoa-soft" dangerouslySetInnerHTML={{ __html: sanitizeHtml(selected.value) }} />
          ) : (
            <div className="whitespace-pre-line text-sm leading-7 text-cocoa-soft">{selected.value}</div>
          )}
        </div>
      </div>
    </section>
  );
}
