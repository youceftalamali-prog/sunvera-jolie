"use client";

import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import type { ShopProduct } from "@/lib/types";

export function ProductRow({
  title,
  subtitle,
  items,
  href,
  cta = "View all",
  background,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  items: ShopProduct[];
  href: string;
  cta?: string;
  background?: string;
  compact?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6" style={{ background: background || undefined }}>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className={compact ? "font-display text-xl" : "section-title"}>{title}</h2>
          {subtitle && <p className="mt-2 max-w-xl text-sm text-cocoa-soft">{subtitle}</p>}
        </div>
        <Link href={href} className="text-[11px] uppercase tracking-[0.18em] text-gold hover:text-cocoa">
          {cta} →
        </Link>
      </div>
      <div className={`grid grid-cols-2 gap-4 ${compact ? "lg:grid-cols-2" : "lg:grid-cols-4"}`}>
        {items.map((p) => (
          <ProductCard key={p.id} p={p} />
        ))}
      </div>
    </section>
  );
}
