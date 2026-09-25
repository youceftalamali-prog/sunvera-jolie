"use client";

import { useMemo, useState } from "react";
import ProductCard from "@/components/ProductCard";
import { money } from "@/lib/format";
import type { ShopProduct } from "@/lib/types";

const SORTS = [
  ["featured", "Featured"],
  ["best-selling", "Best Selling"],
  ["newest", "Newest"],
  ["price-asc", "Price: Low to High"],
  ["price-desc", "Price: High to Low"],
  ["rating", "Highest Rated"],
];

export default function ShopGrid({
  items,
  categories,
  initialSort = "featured",
}: {
  items: ShopProduct[];
  categories: { name: string; slug: string }[];
  initialSort?: string;
}) {
  const [sort, setSort] = useState(initialSort);
  const [cat, setCat] = useState("all");
  const [maxPrice, setMaxPrice] = useState(0);
  const [skin, setSkin] = useState("");
  const [hair, setHair] = useState("");
  const [type, setType] = useState("");
  const [brand, setBrand] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [inStock, setInStock] = useState(false);
  const [openFilters, setOpenFilters] = useState(false);

  const priceCeiling = useMemo(() => Math.max(...items.map((p) => p.price), 5000), [items]);
  const uniq = (get: (p: ShopProduct) => string) =>
    Array.from(new Set(items.map(get).filter(Boolean))).sort();

  const shown = useMemo(() => {
    let out = items.filter(
      (p) =>
        (cat === "all" || p.categorySlug === cat) &&
        (!maxPrice || p.price <= maxPrice) &&
        (!skin || p.skinType === skin) &&
        (!hair || p.hairType === hair) &&
        (!type || p.productType === type) &&
        (!brand || p.brand === brand) &&
        (!minRating || p.rating >= minRating) &&
        (!inStock || p.stock > 0),
    );
    const by: Record<string, (a: ShopProduct, b: ShopProduct) => number> = {
      "price-asc": (a, b) => a.price - b.price,
      "price-desc": (a, b) => b.price - a.price,
      newest: (a, b) => Number(b.newArrival) - Number(a.newArrival) || b.id - a.id,
      rating: (a, b) => b.rating - a.rating,
      "best-selling": (a, b) => b.reviewsCount - a.reviewsCount,
      featured: (a, b) => Number(b.bestSeller) - Number(a.bestSeller) || b.rating - a.rating,
    };
    return [...out].sort(by[sort] ?? by.featured);
  }, [items, cat, maxPrice, skin, hair, type, brand, minRating, inStock, sort]);

  const Select = ({
    label,
    value,
    onChange,
    options,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: string[];
  }) => (
    <div>
      <label className="label" htmlFor={`f-${label}`}>{label}</label>
      <select id={`f-${label}`} value={value} onChange={(e) => onChange(e.target.value)} className="inp !py-2 text-xs">
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );

  const filters = (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="f-cat">Category</label>
        <select id="f-cat" value={cat} onChange={(e) => setCat(e.target.value)} className="inp !py-2 text-xs">
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="f-price">
          Max price: {maxPrice ? money(maxPrice) : "Any"}
        </label>
        <input
          id="f-price"
          type="range"
          min={0}
          max={priceCeiling}
          step={100}
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          className="w-full accent-[#c9a45c]"
        />
      </div>
      <Select label="Skin Type" value={skin} onChange={setSkin} options={uniq((p) => p.skinType)} />
      <Select label="Hair Type" value={hair} onChange={setHair} options={uniq((p) => p.hairType)} />
      <Select label="Product Type" value={type} onChange={setType} options={uniq((p) => p.productType)} />
      <Select label="Brand" value={brand} onChange={setBrand} options={uniq((p) => p.brand)} />
      <div>
        <label className="label" htmlFor="f-rating">Rating</label>
        <select id="f-rating" value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} className="inp !py-2 text-xs">
          <option value={0}>Any rating</option>
          <option value={4}>4★ & up</option>
          <option value={4.5}>4.5★ & up</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} className="accent-[#c9a45c]" />
        In stock only
      </label>
      <button
        onClick={() => {
          setCat("all"); setMaxPrice(0); setSkin(""); setHair(""); setType(""); setBrand(""); setMinRating(0); setInStock(false);
        }}
        className="text-[11px] uppercase tracking-widest text-gold underline"
      >
        Clear filters
      </button>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:flex">
      <aside className="hidden w-60 shrink-0 lg:block">
        <h2 className="mb-5 text-[11px] font-semibold uppercase tracking-[0.18em]">Filters</h2>
        {filters}
      </aside>

      <div className="flex-1">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <p className="text-xs text-cocoa-soft">{shown.length} products</p>
          <button onClick={() => setOpenFilters((o) => !o)} className="btn-outline !px-4 !py-2 lg:hidden">
            Filters
          </button>
          <div className="ms-auto flex items-center gap-2">
            <label htmlFor="sort" className="text-[11px] uppercase tracking-widest text-cocoa-soft">Sort by</label>
            <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)} className="inp !w-auto !py-2 text-xs">
              {SORTS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        {openFilters && <div className="mb-6 border border-cocoa/10 bg-white p-5 lg:hidden">{filters}</div>}

        {shown.length === 0 ? (
          <p className="py-20 text-center text-sm text-cocoa-soft">
            No products match these filters. Try clearing a few.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {shown.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
