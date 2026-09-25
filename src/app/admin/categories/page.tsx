"use client";

import { useCallback, useEffect, useState } from "react";

type Cat = {
  id: number;
  name: string;
  slug: string;
  group: string;
  parentSlug: string;
  tagline: string;
  description: string;
  image: string;
  imageUrl: string;
  seoTitle: string;
  seoDescription: string;
  active: boolean;
  sortOrder: number;
};

type Nav = { id: number; label: string; url: string; location: string; column: string; sortOrder: number; active: boolean };
type Coupon = { id: number; code: string; type: string; value: number; minSubtotal: number; usedCount: number; active: boolean };

export default function AdminCategoriesPage() {
  const [cats, setCats] = useState<Cat[]>([]);
  const [nav, setNav] = useState<Nav[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, m] = await Promise.all([
      fetch("/api/admin/data?type=products").then((r) => r.json()),
      fetch("/api/admin/marketing-data").then((r) => r.json()),
    ]);
    void c;
    const categoriesRes = await fetch("/api/admin/categories-data").then((r) => r.json());
    setCats((categoriesRes as { categories: Cat[] }).categories ?? []);
    setNav((m as { nav: Nav[] }).nav ?? []);
    setCoupons((m as { coupons: Coupon[] }).coupons ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/cms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = (await res.json()) as { error?: string };
    setMsg(res.ok ? "Saved ✓" : (d.error ?? "Could not save"));
    void load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl">Categories, Menus & Coupons</h1>
      </div>
      {msg && <p className="border border-green-200 bg-green-50 p-3 text-[12px] text-green-800">{msg}</p>}

      <section className="bg-white p-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--svj-muted)]">Categories</h2>
        <div className="mt-3 space-y-2">
          {cats.map((c) => (
            <div key={c.id} className="grid gap-2 border border-[var(--svj-border)] p-2 sm:grid-cols-6">
              <input defaultValue={c.name} className="inp !py-1 text-[11px]" onBlur={(e) => post({ kind: "category-save", ...c, id: c.id, name: e.target.value })} />
              <input defaultValue={c.slug} className="inp !py-1 text-[11px]" onBlur={(e) => post({ kind: "category-save", ...c, id: c.id, slug: e.target.value })} />
              <input defaultValue={c.tagline} placeholder="Tagline" className="inp !py-1 text-[11px]" onBlur={(e) => post({ kind: "category-save", ...c, id: c.id, tagline: e.target.value })} />
              <input defaultValue={c.image} placeholder="Icon/emoji" className="inp !py-1 text-[11px]" onBlur={(e) => post({ kind: "category-save", ...c, id: c.id, image: e.target.value })} />
              <input defaultValue={c.imageUrl} placeholder="Image URL" className="inp !py-1 text-[11px]" onBlur={(e) => post({ kind: "category-save", ...c, id: c.id, imageUrl: e.target.value })} />
              <div className="flex items-center gap-2 text-[10px]">
                <label className="flex items-center gap-1">
                  <input type="checkbox" defaultChecked={c.active} onChange={(e) => post({ kind: "category-save", ...c, id: c.id, active: e.target.checked })} /> active
                </label>
                <button onClick={() => post({ kind: "category-delete", id: c.id })} className="text-red-700 underline">delete</button>
              </div>
              <input defaultValue={c.seoTitle} placeholder="SEO title" className="inp !py-1 text-[11px] sm:col-span-3" onBlur={(e) => post({ kind: "category-save", ...c, id: c.id, seoTitle: e.target.value })} />
              <input defaultValue={c.seoDescription} placeholder="SEO description" className="inp !py-1 text-[11px] sm:col-span-3" onBlur={(e) => post({ kind: "category-save", ...c, id: c.id, seoDescription: e.target.value })} />
            </div>
          ))}
        </div>
        <button
          onClick={() => post({ kind: "category-save", name: "New Category", tagline: "", image: "🌷", active: true, sortOrder: cats.length })}
          className="btn-outline mt-3 !py-2"
        >
          + Add category
        </button>
      </section>

      <section className="bg-white p-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--svj-muted)]">Navigation (header & footer)</h2>
        <div className="mt-3 space-y-2">
          {nav.map((n) => (
            <div key={n.id} className="grid gap-2 border border-[var(--svj-border)] p-2 sm:grid-cols-6">
              <input defaultValue={n.label} className="inp !py-1 text-[11px]" onBlur={(e) => post({ kind: "nav-save", ...n, id: n.id, label: e.target.value })} />
              <input defaultValue={n.url} className="inp !py-1 text-[11px]" onBlur={(e) => post({ kind: "nav-save", ...n, id: n.id, url: e.target.value })} />
              <select defaultValue={n.location} className="inp !py-1 text-[11px]" onChange={(e) => post({ kind: "nav-save", ...n, id: n.id, location: e.target.value })}>
                <option value="header">header</option>
                <option value="footer">footer</option>
              </select>
              <input defaultValue={n.column} placeholder="Footer column" className="inp !py-1 text-[11px]" onBlur={(e) => post({ kind: "nav-save", ...n, id: n.id, column: e.target.value })} />
              <label className="flex items-center gap-1 text-[10px]">
                <input type="checkbox" defaultChecked={n.active} onChange={(e) => post({ kind: "nav-save", ...n, id: n.id, active: e.target.checked })} /> active
              </label>
              <button onClick={() => post({ kind: "nav-delete", id: n.id })} className="text-[10px] text-red-700 underline">delete</button>
            </div>
          ))}
        </div>
        <button onClick={() => post({ kind: "nav-save", label: "New link", url: "/shop", location: "header", sortOrder: nav.length })} className="btn-outline mt-3 !py-2">
          + Add link
        </button>
      </section>

      <section className="bg-white p-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--svj-muted)]">Coupons</h2>
        <ul className="mt-2 space-y-1 text-[11px]">
          {coupons.map((c) => (
            <li key={c.id}>
              <b>{c.code}</b> — {c.type} {c.value || ""} · min {c.minSubtotal} DA · used {c.usedCount}× {c.active ? "" : "(inactive)"}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-[var(--svj-muted)]">
          Coupons are applied at checkout and re-validated server-side (percentage, fixed amount or free shipping).
        </p>
      </section>
    </div>
  );
}
