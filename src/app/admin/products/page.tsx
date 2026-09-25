"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { money } from "@/lib/format";

type Row = {
  id: number;
  name: string;
  sku: string;
  categorySlug: string;
  price: number;
  stock: number;
  status: string;
  bestSeller: boolean;
  newArrival: boolean;
  featured: boolean;
  emoji: string;
};

export default function AdminProductsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<number[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgErr, setMsgErr] = useState(false);

  const notify = (text: string, isError = false) => {
    setMsg(text);
    setMsgErr(isError);
  };
  const errText = async (res: Response) => {
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    return d.error ?? `HTTP ${res.status}`;
  };

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/data?type=products");
    const d = (await res.json()) as { products: Row[] };
    setRows(d.products ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.categorySlug))).sort(), [rows]);
  const shown = rows.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (category === "all" || r.categorySlug === category) &&
      (!q || `${r.name} ${r.sku} ${r.categorySlug}`.toLowerCase().includes(q.toLowerCase())),
  );

  async function patchBulk(patch: Record<string, unknown>) {
    if (!selected.length) return notify("Select at least one product first.", true);
    const res = await fetch("/api/admin/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk", ids: selected, patch }),
    });
    if (!res.ok) return notify(`Bulk update failed: ${await errText(res)}`, true);
    notify(`Applied to ${selected.length} product(s) ✓`);
    setSelected([]);
    void load();
  }

  async function rowAction(id: number, action: "duplicate" | "archive" | "delete" | "flags", patch?: Record<string, unknown>) {
    if (action === "duplicate") {
      const res = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate", id }),
      });
      const d = (await res.json().catch(() => ({}))) as { product?: { id: number }; error?: string };
      if (!res.ok) return notify(`Duplicate failed: ${d.error ?? `HTTP ${res.status}`}`, true);
      notify("Product duplicated as a draft ✓");
      if (d.product) window.location.href = `/admin/products/${d.product.id}/edit`;
      return;
    }
    if (action === "flags") {
      const res = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flags", id, patch }),
      });
      if (!res.ok) return notify(`Flag update failed: ${await errText(res)}`, true);
      void load();
      return;
    }
    if (action === "archive") {
      const res = await fetch(`/api/admin/products?id=${id}`, { method: "DELETE" });
      if (!res.ok) return notify(`Archive failed: ${await errText(res)}`, true);
      notify("Product archived ✓");
      void load();
      return;
    }
    const res = await fetch(`/api/admin/products?id=${id}&hard=1`, { method: "DELETE" });
    if (!res.ok) return notify(`Delete failed: ${await errText(res)}`, true);
    notify("Product permanently deleted");
    void load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl">Products</h1>
        <Link href="/admin/products/new" className="btn-primary ms-auto !py-2">+ Add product</Link>
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-white p-4">
        <label className="block">
          <span className="label">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, SKU, category…" className="inp !py-2 text-xs" />
        </label>
        <label className="block">
          <span className="label">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="inp !py-2 text-xs">
            {["all", "published", "draft", "archived"].map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </label>
        <label className="block">
          <span className="label">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="inp !py-2 text-xs">
            <option value="all">All</option>
            {categories.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
        </label>
        <p className="text-[11px] text-[var(--svj-muted)]">{shown.length} of {rows.length} products</p>
      </div>

      {msg && (
        <p
          className={
            msgErr
              ? "border border-red-200 bg-red-50 p-3 text-[12px] text-red-800"
              : "border border-green-200 bg-green-50 p-3 text-[12px] text-green-800"
          }
        >
          {msg}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 bg-white p-3 text-[11px]">
        <span className="text-[var(--svj-muted)]">Bulk ({selected.length}):</span>
        <button onClick={() => patchBulk({ status: "published" })} className="border border-[var(--svj-border)] px-2 py-1">Publish</button>
        <button onClick={() => patchBulk({ status: "draft" })} className="border border-[var(--svj-border)] px-2 py-1">Draft</button>
        <button onClick={() => patchBulk({ status: "archived", active: false })} className="border border-[var(--svj-border)] px-2 py-1">Archive</button>
        <button onClick={() => patchBulk({ featured: true })} className="border border-[var(--svj-border)] px-2 py-1">Featured ON</button>
        <button onClick={() => patchBulk({ bestSeller: true })} className="border border-[var(--svj-border)] px-2 py-1">Best Seller ON</button>
        <button onClick={() => patchBulk({ newArrival: true })} className="border border-[var(--svj-border)] px-2 py-1">New ON</button>
        <button onClick={() => setSelected(shown.map((s) => s.id))} className="border border-[var(--svj-border)] px-2 py-1">Select all shown</button>
        <button onClick={() => setSelected([])} className="border border-[var(--svj-border)] px-2 py-1">Clear</button>
      </div>

      <div className="overflow-x-auto bg-white p-3">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-widest text-[var(--svj-muted)]">
            <tr>
              <th className="py-2">#</th><th>Image</th><th>Product</th><th>SKU</th><th>Category</th>
              <th>Price</th><th>Stock</th><th>Status</th><th>Flags</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-[var(--svj-border)]">
                <td className="py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.name}`}
                    checked={selected.includes(r.id)}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))}
                  />
                </td>
                <td className="py-2 text-xl">{r.emoji}</td>
                <td className="py-2"><Link href={`/admin/products/${r.id}/edit`} className="underline">{r.name}</Link></td>
                <td className="py-2">{r.sku}</td>
                <td className="py-2">{r.categorySlug}</td>
                <td className="py-2">{money(r.price)}</td>
                <td className={`py-2 ${r.stock <= 10 ? "text-amber-700" : ""}`}>{r.stock}</td>
                <td className="py-2">{r.status}</td>
                <td className="py-2 space-x-1">
                  <button onClick={() => rowAction(r.id, "flags", { featured: !r.featured })} className={r.featured ? "text-[var(--svj-primary)]" : "text-[var(--svj-muted)]"} title="Featured">★</button>
                  <button onClick={() => rowAction(r.id, "flags", { bestSeller: !r.bestSeller })} className={r.bestSeller ? "text-[var(--svj-primary)]" : "text-[var(--svj-muted)]"} title="Best seller">🏆</button>
                  <button onClick={() => rowAction(r.id, "flags", { newArrival: !r.newArrival })} className={r.newArrival ? "text-[var(--svj-primary)]" : "text-[var(--svj-muted)]"} title="New arrival">✦</button>
                </td>
                <td className="space-x-2 py-2">
                  <Link href={`/admin/products/${r.id}/edit`} className="underline">Edit</Link>
                  <Link href={`/admin/products/${r.id}/preview`} className="underline">Preview</Link>
                  <button onClick={() => rowAction(r.id, "duplicate")} className="underline">Duplicate</button>
                  <button onClick={() => rowAction(r.id, "archive")} className="underline">Archive</button>
                  <button
                    onClick={() => {
                      if (confirm(`Permanently delete ${r.name}? This cannot be undone.`)) void rowAction(r.id, "delete");
                    }}
                    className="text-red-700 underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="py-8 text-center text-[12px] text-[var(--svj-muted)]">No products match your filters.</p>}
      </div>
    </div>
  );
}
