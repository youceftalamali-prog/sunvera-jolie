"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import ImageManager, { type ManagedImage } from "@/components/admin/ImageManager";

type Section = {
  id: number;
  key: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
  title: string;
  subtitle: string;
  body: string;
  imageUrl: string;
  imageMobileUrl: string;
  imageTabletUrl: string;
  buttonText: string;
  buttonUrl: string;
  button2Text: string;
  button2Url: string;
  background: string;
  textColor: string;
  textPosition: string;
  overlayOpacity: number;
  productMode: string;
  productCount: number;
  productIds: number[];
  items: { icon?: string; title: string; text?: string; url?: string }[];
};

type Banner = {
  id: number;
  title: string;
  subtitle: string;
  imageDesktop: string;
  imageMobile: string;
  buttonText: string;
  buttonUrl: string;
  active: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
};

type Badge = { id: number; icon: string; title: string; description: string; active: boolean; sortOrder: number };
type ProductLite = { id: number; name: string; price: number; status: string };

export default function HomepageEditor() {
  const [sections, setSections] = useState<Section[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<{ sectionId: number; field: keyof Section } | null>(null);
  const dragIndex = useRef<number | null>(null);

  const load = useCallback(async () => {
    const [s, b, p] = await Promise.all([
      fetch("/api/admin/cms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "sections-list" }),
      }).then((r) => r.json()),
      fetch("/api/admin/data?type=products").then((r) => r.json()),
      fetch("/api/admin/data?type=products").then((r) => r.json()),
    ]);
    void b;
    setSections((s as { sections: Section[] }).sections ?? []);
    setProducts((p as { products: ProductLite[] }).products ?? []);
  }, []);

  const loadMarketing = useCallback(async () => {
    const res = await fetch("/api/admin/marketing-data");
    if (!res.ok) return;
    const d = (await res.json()) as { banners: Banner[]; badges: Badge[] };
    setBanners(d.banners ?? []);
    setBadges(d.badges ?? []);
  }, []);

  useEffect(() => {
    void load();
    void loadMarketing();
  }, [load, loadMarketing]);

  const active = sections.find((s) => s.id === activeId) ?? null;

  async function save(patch: Partial<Section>, id = activeId) {
    if (!id) return;
    await fetch("/api/admin/cms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "section-update", id, ...patch }),
    });
    setMsg("Saved ✓");
    void load();
  }

  async function reorder(next: Section[]) {
    setSections(next.map((s, i) => ({ ...s, sortOrder: i })));
    await fetch("/api/admin/cms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "section-reorder", order: next.map((s) => s.id) }),
    });
    setMsg("Section order saved ✓");
  }

  async function uploadImage(file: File, folder: string) {
    const form = new FormData();
    form.append("files", file);
    form.append("folder", folder);
    const res = await fetch("/api/admin/media", { method: "POST", body: form });
    const d = (await res.json()) as { created?: { id: number; url: string; provider: string }[] };
    const m = d.created?.[0];
    if (!m) return "";
    return m.provider === "local" ? `/api/media/${m.id}` : m.url;
  }

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl">Homepage CMS</h1>
        <Link href="/" target="_blank" className="btn-outline ms-auto !py-2">Preview homepage</Link>
      </div>
      {msg && <p className="border border-green-200 bg-green-50 p-3 text-[12px] text-green-800">{msg}</p>}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="bg-white p-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--svj-muted)]">
            Sections — drag to reorder
          </h2>
          <ul className="mt-3 space-y-1">
            {sections.map((s, i) => (
              <li
                key={s.id}
                draggable
                onDragStart={() => (dragIndex.current = i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex.current === null) return;
                  const next = [...sections];
                  const [moved] = next.splice(dragIndex.current, 1);
                  next.splice(i, 0, moved);
                  dragIndex.current = null;
                  void reorder(next);
                }}
                className={`flex items-center gap-2 px-2 py-2 text-[12px] ${activeId === s.id ? "bg-[var(--svj-background)]" : ""}`}
              >
                <span className="cursor-grab" title="Drag to reorder">☰</span>
                <button onClick={() => setActiveId(s.id)} className="flex-1 text-start">{s.label}</button>
                <label className="flex items-center gap-1 text-[10px]">
                  <input type="checkbox" checked={s.enabled} onChange={(e) => save({ enabled: e.target.checked }, s.id)} />
                  on
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-6">
          {!active && <p className="bg-white p-6 text-[12px] text-[var(--svj-muted)]">Select a section on the left to edit its content.</p>}

          {active && (
            <section className="bg-white p-5">
              <h2 className="text-[12px] font-semibold uppercase tracking-widest">Edit · {active.label}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Title">
                  <input defaultValue={active.title} onBlur={(e) => save({ title: e.target.value })} className="inp" />
                </Field>
                <Field label="Subtitle">
                  <input defaultValue={active.subtitle} onBlur={(e) => save({ subtitle: e.target.value })} className="inp" />
                </Field>
                <Field label="Button text">
                  <input defaultValue={active.buttonText} onBlur={(e) => save({ buttonText: e.target.value })} className="inp" />
                </Field>
                <Field label="Button URL">
                  <input defaultValue={active.buttonUrl} onBlur={(e) => save({ buttonUrl: e.target.value })} className="inp" />
                </Field>
                <Field label="Secondary button text">
                  <input defaultValue={active.button2Text} onBlur={(e) => save({ button2Text: e.target.value })} className="inp" />
                </Field>
                <Field label="Secondary button URL">
                  <input defaultValue={active.button2Url} onBlur={(e) => save({ button2Url: e.target.value })} className="inp" />
                </Field>
                <Field label="Background (CSS color/gradient)">
                  <input defaultValue={active.background} onBlur={(e) => save({ background: e.target.value })} className="inp" placeholder="#f3ece2" />
                </Field>
                <Field label="Text color">
                  <input defaultValue={active.textColor} onBlur={(e) => save({ textColor: e.target.value })} className="inp" placeholder="#3a2b22" />
                </Field>
                <Field label="Text position">
                  <select defaultValue={active.textPosition} onChange={(e) => save({ textPosition: e.target.value })} className="inp">
                    {["left", "center", "right"].map((p) => (<option key={p} value={p}>{p}</option>))}
                  </select>
                </Field>
                <Field label={`Overlay opacity (${active.overlayOpacity}%)`}>
                  <input type="range" min={0} max={90} defaultValue={active.overlayOpacity} onMouseUp={(e) => save({ overlayOpacity: Number((e.target as HTMLInputElement).value) })} className="w-full" />
                </Field>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                {([
                  ["imageUrl", "Desktop image"],
                  ["imageTabletUrl", "Tablet image"],
                  ["imageMobileUrl", "Mobile image"],
                ] as [keyof Section, string][]).map(([field, label]) => (
                  <div key={String(field)}>
                    <span className="label">{label}</span>
                    <div className="border border-[var(--svj-border)] p-2">
                      {active[field] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={String(active[field])} alt={label} className="h-24 w-full object-cover" />
                      ) : (
                        <p className="py-6 text-center text-[10px] text-[var(--svj-muted)]">No image</p>
                      )}
                      <label className="mt-2 block cursor-pointer border border-[var(--svj-border)] px-2 py-1 text-center text-[10px]">
                        Replace / upload
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const url = await uploadImage(file, active.key === "promo_banner" ? "banners" : "homepage");
                            if (url) await save({ [field]: url } as Partial<Section>);
                          }}
                        />
                      </label>
                      <input defaultValue={String(active[field] ?? "")} onBlur={(e) => save({ [field]: e.target.value } as Partial<Section>)} placeholder="or paste image URL" className="inp mt-1 !py-1 text-[10px]" />
                    </div>
                  </div>
                ))}
              </div>

              {["best_sellers", "new_arrivals", "featured"].includes(active.key) && (
                <div className="mt-6 border-t border-[var(--svj-border)] pt-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest">Products</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Mode">
                      <select defaultValue={active.productMode} onChange={(e) => save({ productMode: e.target.value })} className="inp">
                        <option value="auto">Automatic (sales / newest / featured)</option>
                        <option value="manual">Manual selection</option>
                      </select>
                    </Field>
                    <Field label={`Products to show (${active.productCount})`}>
                      <select defaultValue={active.productCount} onChange={(e) => save({ productCount: Number(e.target.value) })} className="inp">
                        {[4, 6, 8, 10, 12].map((n) => (<option key={n} value={n}>{n}</option>))}
                      </select>
                    </Field>
                  </div>
                  {active.productMode === "manual" && (
                    <div className="mt-3 max-h-56 overflow-y-auto border border-[var(--svj-border)] p-2 text-[11px]">
                      {products.map((p) => (
                        <label key={p.id} className="flex items-center gap-2 py-1">
                          <input
                            type="checkbox"
                            checked={active.productIds.includes(p.id)}
                            onChange={(e) => {
                              const ids = e.target.checked
                                ? [...active.productIds, p.id]
                                : active.productIds.filter((x) => x !== p.id);
                              void save({ productIds: ids });
                            }}
                          />
                          {p.name} <span className="text-[var(--svj-muted)]">({p.status})</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {active.items.length > 0 && (
                <div className="mt-6 border-t border-[var(--svj-border)] pt-4">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest">Items / steps / testimonials</h3>
                  <div className="mt-3 space-y-2">
                    {active.items.map((it, i) => (
                      <div key={i} className="grid gap-2 border border-[var(--svj-border)] p-2 sm:grid-cols-4">
                        <input defaultValue={it.icon ?? ""} placeholder="Icon" className="inp !py-1 text-[11px]" onBlur={(e) => { const items = [...active.items]; items[i] = { ...items[i], icon: e.target.value }; void save({ items }); }} />
                        <input defaultValue={it.title} placeholder="Title" className="inp !py-1 text-[11px]" onBlur={(e) => { const items = [...active.items]; items[i] = { ...items[i], title: e.target.value }; void save({ items }); }} />
                        <input defaultValue={it.text ?? ""} placeholder="Text" className="inp !py-1 text-[11px]" onBlur={(e) => { const items = [...active.items]; items[i] = { ...items[i], text: e.target.value }; void save({ items }); }} />
                        <input defaultValue={it.url ?? ""} placeholder="URL" className="inp !py-1 text-[11px]" onBlur={(e) => { const items = [...active.items]; items[i] = { ...items[i], url: e.target.value }; void save({ items }); }} />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => save({ items: [...active.items, { title: "New item", url: "/shop" }] })}
                    className="btn-outline mt-2 !py-1.5 text-[10px]"
                  >
                    + Add item
                  </button>
                </div>
              )}
            </section>
          )}

          <section className="bg-white p-5">
            <h2 className="text-[12px] font-semibold uppercase tracking-widest">Trust badges</h2>
            <div className="mt-3 space-y-2">
              {badges.map((b) => (
                <div key={b.id} className="grid gap-2 border border-[var(--svj-border)] p-2 sm:grid-cols-5">
                  <input defaultValue={b.icon} className="inp !py-1 text-[11px]" onBlur={(e) => postBadge({ id: b.id, icon: e.target.value })} />
                  <input defaultValue={b.title} className="inp !py-1 text-[11px]" onBlur={(e) => postBadge({ id: b.id, title: e.target.value })} />
                  <input defaultValue={b.description} className="inp col-span-2 !py-1 text-[11px]" onBlur={(e) => postBadge({ id: b.id, description: e.target.value })} />
                  <div className="flex items-center gap-2 text-[10px]">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" defaultChecked={b.active} onChange={(e) => postBadge({ id: b.id, active: e.target.checked })} /> active
                    </label>
                    <button onClick={async () => { await fetch("/api/admin/cms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "badge-delete", id: b.id }) }); void loadMarketing(); }} className="text-red-700 underline">delete</button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={async () => {
                await fetch("/api/admin/cms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "badge-save", icon: "✨", title: "New badge", description: "", active: true, sortOrder: badges.length }) });
                void loadMarketing();
              }}
              className="btn-outline mt-2 !py-1.5 text-[10px]"
            >
              + Add badge
            </button>
          </section>

          <section className="bg-white p-5">
            <h2 className="text-[12px] font-semibold uppercase tracking-widest">Banners</h2>
            <div className="mt-3 space-y-3">
              {banners.map((b) => (
                <div key={b.id} className="border border-[var(--svj-border)] p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input defaultValue={b.title} placeholder="Title" className="inp !py-1 text-[11px]" onBlur={(e) => postBanner({ id: b.id, title: e.target.value })} />
                    <input defaultValue={b.subtitle} placeholder="Subtitle" className="inp !py-1 text-[11px]" onBlur={(e) => postBanner({ id: b.id, subtitle: e.target.value })} />
                    <input defaultValue={b.buttonText} placeholder="Button text" className="inp !py-1 text-[11px]" onBlur={(e) => postBanner({ id: b.id, buttonText: e.target.value })} />
                    <input defaultValue={b.buttonUrl} placeholder="Button URL" className="inp !py-1 text-[11px]" onBlur={(e) => postBanner({ id: b.id, buttonUrl: e.target.value })} />
                    <input defaultValue={b.imageDesktop} placeholder="Desktop image URL" className="inp !py-1 text-[11px]" onBlur={(e) => postBanner({ id: b.id, imageDesktop: e.target.value })} />
                    <input defaultValue={b.imageMobile} placeholder="Mobile image URL" className="inp !py-1 text-[11px]" onBlur={(e) => postBanner({ id: b.id, imageMobile: e.target.value })} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px]">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" defaultChecked={b.active} onChange={(e) => postBanner({ id: b.id, active: e.target.checked })} /> active
                    </label>
                    <label className="flex items-center gap-1">
                      Start <input type="date" className="inp !w-auto !py-0.5 text-[10px]" onChange={(e) => postBanner({ id: b.id, startsAt: e.target.value })} />
                    </label>
                    <label className="flex items-center gap-1">
                      End <input type="date" className="inp !w-auto !py-0.5 text-[10px]" onChange={(e) => postBanner({ id: b.id, endsAt: e.target.value })} />
                    </label>
                    <label className="flex cursor-pointer items-center gap-1 border border-[var(--svj-border)] px-2 py-0.5">
                      Upload banner
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const url = await uploadImage(file, "banners");
                          if (url) await postBanner({ id: b.id, imageDesktop: url, imageMobile: url });
                        }}
                      />
                    </label>
                    <button onClick={async () => { await fetch("/api/admin/cms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "banner-delete", id: b.id }) }); void loadMarketing(); }} className="text-red-700 underline">delete</button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={async () => {
                await fetch("/api/admin/cms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "banner-save", title: "New banner", active: true, sortOrder: banners.length }) });
                void loadMarketing();
              }}
              className="btn-outline mt-2 !py-1.5 text-[10px]"
            >
              + Add banner
            </button>
          </section>

          {uploadFor && (
            <div className="bg-white p-5">
              <ImageManager
                images={[]}
                onChange={() => setUploadFor(null)}
                folder="homepage"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  async function postBadge(body: Record<string, unknown>) {
    await fetch("/api/admin/cms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "badge-save", ...body }),
    });
    void loadMarketing();
  }

  async function postBanner(body: Record<string, unknown>) {
    await fetch("/api/admin/cms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "banner-save", ...body }),
    });
    void loadMarketing();
  }
}
