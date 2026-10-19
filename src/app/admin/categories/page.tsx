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
  const [uploadingCategoryId, setUploadingCategoryId] = useState<number | null>(null);

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
    if (res.ok) await load();
  }

  async function uploadCategoryImage(category: Cat, file: File) {
    setUploadingCategoryId(category.id);
    setMsg(null);
    try {
      if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
      const form = new FormData();
      form.append("files", file);
      form.append("folder", "categories");
      const uploadResponse = await fetch("/api/admin/media", { method: "POST", body: form });
      const uploadData = (await uploadResponse.json()) as {
        error?: string;
        errors?: string[];
        created?: Array<{ url?: string }>;
      };
      const imageUrl = uploadData.created?.[0]?.url?.trim();
      if (!uploadResponse.ok || !imageUrl) {
        throw new Error(uploadData.error || uploadData.errors?.[0] || "Image upload failed.");
      }

      const saveResponse = await fetch("/api/admin/cms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "category-save", ...category, id: category.id, imageUrl }),
      });
      const saveData = (await saveResponse.json()) as { error?: string };
      if (!saveResponse.ok) throw new Error(saveData.error || "Image uploaded, but the category could not be saved.");

      setMsg(`Image uploaded and saved for “${category.name}” ✓`);
      await load();
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Could not upload category image.");
    } finally {
      setUploadingCategoryId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl">Categories, Menus & Coupons</h1>
      </div>
      {msg && <p className="border border-[var(--svj-border)] bg-white p-3 text-[12px]" role="status">{msg}</p>}

      <section className="bg-white p-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--svj-muted)]">Categories</h2>
        <p className="mt-2 text-[11px] text-[var(--svj-muted)]">Upload a category image here. It is saved to the media library and linked to this category for the homepage.</p>
        <div className="mt-3 space-y-3">
          {cats.map((c) => (
            <div key={c.id} className="grid gap-2 border border-[var(--svj-border)] p-3 sm:grid-cols-6">
              <input aria-label={`${c.name} name`} defaultValue={c.name} className="inp !py-1 text-[11px]" onBlur={(e) => post({ kind: "category-save", ...c, id: c.id, name: e.target.value })} />
              <input aria-label={`${c.name} slug`} defaultValue={c.slug} className="inp !py-1 text-[11px]" onBlur={(e) => post({ kind: "category-save", ...c, id: c.id, slug: e.target.value })} />
              <input aria-label={`${c.name} tagline`} defaultValue={c.tagline} placeholder="Tagline" className="inp !py-1 text-[11px]" onBlur={(e) => post({ kind: "category-save", ...c, id: c.id, tagline: e.target.value })} />
              <input aria-label={`${c.name} icon`} defaultValue={c.image} placeholder="Icon/emoji" className="inp !py-1 text-[11px]" onBlur={(e) => post({ kind: "category-save", ...c, id: c.id, image: e.target.value })} />
              <input aria-label={`${c.name} image URL`} defaultValue={c.imageUrl} placeholder="Image URL" className="inp !py-1 text-[11px]" onBlur={(e) => post({ kind: "category-save", ...c, id: c.id, imageUrl: e.target.value })} />
              <div className="flex items-center gap-2 text-[10px]">
                <label className="flex items-center gap-1">
                  <input type="checkbox" defaultChecked={c.active} onChange={(e) => post({ kind: "category-save", ...c, id: c.id, active: e.target.checked })} /> active
                </label>
                <button onClick={() => post({ kind: "category-delete", id: c.id })} className="text-red-700 underline">deactivate</button>
              </div>
              <div className="flex items-center gap-3 sm:col-span-6">
                {c.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageUrl} alt={`${c.name} preview`} className="h-16 w-16 rounded object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded bg-[var(--svj-background)] text-2xl" aria-label="No category image">{c.image || "✦"}</div>
                )}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-[var(--svj-border)] px-3 py-2 text-[11px] hover:bg-[var(--svj-background)]">
                  <span>{uploadingCategoryId === c.id ? "Uploading…" : c.imageUrl ? "Replace image" : "Upload image"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={uploadingCategoryId !== null}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      if (file) void uploadCategoryImage(c, file);
                    }}
                  />
                </label>
                <span className="min-w-0 break-all text-[10px] text-[var(--svj-muted)]">{c.imageUrl || "No image linked"}</span>
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
