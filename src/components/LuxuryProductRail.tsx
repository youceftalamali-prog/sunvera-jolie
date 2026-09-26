"use client";

import { useRef } from "react";
import Link from "next/link";
import EditorialProductCard from "@/components/EditorialProductCard";
import type { ShopProduct } from "@/lib/types";

export default function LuxuryProductRail({
  title,
  subtitle,
  items,
  href,
}: {
  title: string;
  subtitle?: string;
  items: ShopProduct[];
  href: string;
}) {
  const rail = useRef<HTMLDivElement | null>(null);

  function move(direction: 1 | -1) {
    rail.current?.scrollBy({ left: direction * 500, behavior: "smooth" });
  }

  if (!items.length) return null;

  return (
    <section className="bg-[#f7f1e8] py-16 sm:py-20" aria-label={title}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.38em] text-gold">Customer Favorites</p>
          <h2 className="section-title mt-2">{title || "Our Best Sellers"}</h2>
          {subtitle && <p className="mx-auto mt-2 max-w-2xl text-sm text-cocoa-soft">{subtitle}</p>}
          <div className="gold-line mx-auto mt-4 w-24" />
        </div>

        <div className="mt-8 flex items-center justify-between">
          <div className="flex gap-2">
            <button type="button" onClick={() => move(-1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-cocoa/15 bg-white" aria-label="Previous products">←</button>
            <button type="button" onClick={() => move(1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-cocoa/15 bg-white" aria-label="Next products">→</button>
          </div>
          <Link href={href} className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">View All →</Link>
        </div>

        <div ref={rail} className="mt-5 flex snap-x gap-5 overflow-x-auto pb-4 pr-2 no-scrollbar">
          {items.map((product) => (
            <div key={product.id} className="w-[82vw] shrink-0 snap-start sm:w-[45vw] lg:w-[calc((100%-60px)/4)]">
              <EditorialProductCard product={product} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
