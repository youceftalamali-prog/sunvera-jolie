"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ImageManager, { normalizeImages, type ManagedImage } from "@/components/admin/ImageManager";
import MediaPicker from "@/components/admin/MediaPicker";
import RichTextEditor from "@/components/admin/RichTextEditor";
import { DEFAULT_UPLOAD_LIMITS, type UploadLimits } from "@/components/admin/uploadMedia";
import { money } from "@/lib/format";
import { slugify } from "@/lib/format";
import { EMPTY_DRAFT, type ProductDraft, type VariantRow } from "@/lib/product-draft";
import { sanitizeHtml } from "@/lib/sanitize";

// Kept exported from here so existing imports (`from "@/components/admin/ProductForm"`) keep working.
export { EMPTY_DRAFT };
export type { ProductDraft, VariantRow };

const TABS = [
  "General", "Images", "Description", "Pricing", "Inventory",
  "Variants", "Benefits", "Ingredients", "How To Use", "SEO", "Advanced",
] as const;

export default function ProductForm({
  initial,
  categories,
  storageWarning,
  mode = "edit",
  uploadLimits = DEFAULT_UPLOAD_LIMITS,
}: {
  initial: ProductDraft;
  categories: { name: string; slug: string }[];
  storageWarning?: string | null;
  mode?: "new" | "edit";
  /** Mirrors Admin → Settings → Security & Uploads; enforced client-side before upload. */
  uploadLimits?: UploadLimits;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("General");
  // Merge over the defaults: a partially populated `initial` must never crash the form.
  const [draft, setDraft] = useState<ProductDraft>(() => ({
    ...EMPTY_DRAFT,
    ...initial,
    images: initial.images ?? [],
    variants: initial.variants ?? [],
  }));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [previewImage, setPreviewImage] = useState(0);
  const [variantPicker, setVariantPicker] = useState<number | null>(null);
  const router = useRouter();

  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const off = draft.comparePrice > draft.price ? Math.round(((draft.comparePrice - draft.price) / draft.comparePrice) * 100) : 0;
  const seoTitle = draft.seoTitle || `${draft.name || "Product"} | SunVera Jolie`;
  const seoDescription = draft.seoDescription || draft.shortDescription;
  const slug = draft.slug || slugify(draft.name || "product");

  async function save(status?: string) {
    setErrors([]);
    setBusy(true);
    const payload = {
      ...draft,
      slug,
      status: status ?? draft.status,
      images: normalizeImages(draft.images).map((i, idx) => ({ ...i, sortOrder: idx })),
      variants: draft.variants.map((v, idx) => ({ ...v, priceDelta: Math.max(0, v.price - draft.price), sortOrder: idx })),
    };
    const res = await fetch("/api/admin/products", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = (await res.json()) as { product?: { id: number }; errors?: string[]; error?: string };
    setBusy(false);
    if (!res.ok) {
      setErrors(d.errors ?? [d.error ?? "Could not save the product"]);
      return;
    }
    setSaved(status === "published" ? "Product published ✓" : "Saved ✓");
    if (d.product?.id && !draft.id) {
      setDraft((s) => ({ ...s, id: d.product!.id }));
      router.replace(`/admin/products/${d.product.id}/edit`);
    } else {
      router.refresh();
    }
  }

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl">
          {mode === "new" ? "Add product" : draft.name || "Edit product"}
        </h1>
        <span className="border border-[var(--svj-border)] px-2 py-1 text-[10px] uppercase tracking-widest">
          {draft.status}
        </span>
        <div className="ms-auto flex flex-wrap gap-2">
          <button onClick={() => setPreview(true)} className="btn-outline !py-2">Preview</button>
          <button onClick={() => save("draft")} disabled={busy} className="btn-outline !py-2">Save draft</button>
          <button onClick={() => save("published")} disabled={busy} className="btn-primary !py-2">Publish</button>
          {draft.id && (
            <Link href={`/product/${slug}`} target="_blank" className="btn-outline !py-2">View store</Link>
          )}
        </div>
      </div>

      {errors.length > 0 && (
        <ul className="mt-4 border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
          {errors.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      )}
      {saved && <p className="mt-4 border border-green-200 bg-green-50 p-3 text-[12px] text-green-800">{saved}</p>}

      <div className="mt-5 flex flex-wrap gap-1 border-b border-[var(--svj-border)]">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-[11px] uppercase tracking-widest ${tab === t ? "border border-b-0 border-[var(--svj-border)] bg-white text-[var(--svj-text)]" : "text-[var(--svj-muted)]"}`}
          >
            {t}
            {t === "Images" && draft.images.length > 0 ? ` (${draft.images.length})` : ""}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-6">
        {tab === "General" && (
          <section className="grid gap-4 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Product name *">
              <input value={draft.name} onChange={(e) => { set("name", e.target.value); if (!draft.slug) set("slug", slugify(e.target.value)); }} className="inp" />
            </Field>
            <Field label="Slug (canonical URL)">
              <input value={draft.slug} onChange={(e) => set("slug", slugify(e.target.value))} className="inp" placeholder={slug} />
            </Field>
            <Field label="SKU *">
              <input value={draft.sku} onChange={(e) => set("sku", e.target.value)} className="inp" />
            </Field>
            <Field label="Brand">
              <input value={draft.brand} onChange={(e) => set("brand", e.target.value)} className="inp" />
            </Field>
            <Field label="Category *">
              <select value={draft.categorySlug} onChange={(e) => set("categorySlug", e.target.value)} className="inp">
                {categories.map((c) => (<option key={c.slug} value={c.slug}>{c.name}</option>))}
              </select>
            </Field>
            <Field label="Subcategory">
              <select value={draft.subcategorySlug} onChange={(e) => set("subcategorySlug", e.target.value)} className="inp">
                <option value="">None</option>
                {categories.map((c) => (<option key={c.slug} value={c.slug}>{c.name}</option>))}
              </select>
            </Field>
            <Field label="Product type">
              <input value={draft.productType} onChange={(e) => set("productType", e.target.value)} className="inp" />
            </Field>
            <Field label="Status">
              <select value={draft.status} onChange={(e) => set("status", e.target.value)} className="inp">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
            <Field label="Routine step">
              <input value={draft.routineStep} onChange={(e) => set("routineStep", e.target.value)} className="inp" />
            </Field>
            <div className="flex flex-wrap gap-4 text-xs">
              {([["featured", "Featured"], ["bestSeller", "Best Seller"], ["newArrival", "New Arrival"]] as const).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" checked={Boolean(draft[k])} onChange={(e) => set(k, e.target.checked)} />
                  {l}
                </label>
              ))}
            </div>
            <Field label="Short description">
              <textarea rows={2} value={draft.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} className="inp" />
            </Field>
            <Field label="Tags (comma separated)">
              <input value={draft.tags} onChange={(e) => set("tags", e.target.value)} className="inp" />
            </Field>
          </section>
        )}

        {tab === "Images" && (
          <section className="bg-white p-5">
            <ImageManager
              images={draft.images}
              onChange={(imgs) => set("images", imgs)}
              productName={draft.name}
              warning={storageWarning}
              limits={uploadLimits}
            />
            <p className="mt-3 text-[11px] text-[var(--svj-muted)]">
              Image types are used on the product page gallery (main, gallery, lifestyle, detail, ingredient, how-to, size, before/after).
            </p>
          </section>
        )}

        {tab === "Description" && (
          <section className="bg-white p-5">
            <RichTextEditor value={draft.description} onChange={(html) => set("description", html)} label="Full description (rich text)" height={380} />
            <div className="mt-6">
              <RichTextEditor value={draft.shortDescription} onChange={(html) => set("shortDescription", html)} label="Short description (rich text)" height={140} />
            </div>
          </section>
        )}

        {tab === "Pricing" && (
          <section className="grid gap-4 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Price (DZD) *">
              <input type="number" value={draft.price} onChange={(e) => set("price", Number(e.target.value))} className="inp" />
            </Field>
            <Field label="Compare-at price">
              <input type="number" value={draft.comparePrice} onChange={(e) => set("comparePrice", Number(e.target.value))} className="inp" />
            </Field>
            <Field label="Cost price">
              <input type="number" value={draft.costPrice} onChange={(e) => set("costPrice", Number(e.target.value))} className="inp" />
            </Field>
            <Field label="Currency">
              <select value={draft.currency} onChange={(e) => set("currency", e.target.value)} className="inp">
                <option value="DZD">DZD</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </Field>
            <p className="text-xs text-[var(--svj-muted)] sm:col-span-2 lg:col-span-4">
              Discount shown on storefront: <b>{off}%</b> · Margin per unit:{" "}
              <b>{money(draft.price - draft.costPrice)}</b>
            </p>
          </section>
        )}

        {tab === "Inventory" && (
          <section className="grid gap-4 bg-white p-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Stock">
              <input type="number" value={draft.stock} onChange={(e) => set("stock", Number(e.target.value))} className="inp" />
            </Field>
            <Field label="Low stock threshold">
              <input type="number" value={draft.lowStockThreshold} onChange={(e) => set("lowStockThreshold", Number(e.target.value))} className="inp" />
            </Field>
            <Field label="SKU">
              <input value={draft.sku} onChange={(e) => set("sku", e.target.value)} className="inp" />
            </Field>
            <Field label="Barcode">
              <input value={draft.barcode} onChange={(e) => set("barcode", e.target.value)} className="inp" />
            </Field>
            <Field label="Size / volume label">
              <input value={draft.size} onChange={(e) => set("size", e.target.value)} className="inp" />
            </Field>
            <Field label="Volume">
              <input value={draft.volume} onChange={(e) => set("volume", e.target.value)} className="inp" />
            </Field>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={draft.trackInventory} onChange={(e) => set("trackInventory", e.target.checked)} />
              Track inventory
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={draft.allowBackorders} onChange={(e) => set("allowBackorders", e.target.checked)} />
              Allow backorders
            </label>
          </section>
        )}

        {tab === "Variants" && (
          <section className="bg-white p-5">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-widest text-[var(--svj-muted)]">
                <tr>{["Label", "SKU", "Price", "Compare", "Stock", "Image URL", ""].map((h) => (<th key={h} className="py-2">{h}</th>))}</tr>
              </thead>
              <tbody>
                {draft.variants.map((v, i) => (
                  <tr key={i}>
                    {(["label", "sku"] as const).map((k) => (
                      <td key={k} className="pe-2">
                        <input
                          value={v[k]}
                          aria-label={`${k} of variant ${i + 1}`}
                          onChange={(e) => set("variants", draft.variants.map((x, idx) => (idx === i ? { ...x, [k]: e.target.value } : x)))}
                          className="inp !py-1"
                        />
                      </td>
                    ))}
                    {(["price", "comparePrice", "stock"] as const).map((k) => (
                      <td key={k} className="pe-2">
                        <input
                          type="number"
                          value={v[k]}
                          aria-label={`${k} of variant ${i + 1}`}
                          onChange={(e) => set("variants", draft.variants.map((x, idx) => (idx === i ? { ...x, [k]: Number(e.target.value) } : x)))}
                          className="inp !w-24 !py-1"
                        />
                      </td>
                    ))}
                    <td className="pe-2">
                      <div className="flex items-center gap-2">
                        {v.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.imageUrl} alt="" className="h-8 w-8 shrink-0 border border-[var(--svj-border)] object-cover" />
                        ) : (
                          <span className="h-8 w-8 shrink-0 border border-dashed border-[var(--svj-border)]" aria-hidden />
                        )}
                        <input
                          value={v.imageUrl}
                          aria-label={`image of variant ${i + 1}`}
                          onChange={(e) => set("variants", draft.variants.map((x, idx) => (idx === i ? { ...x, imageUrl: e.target.value } : x)))}
                          className="inp !py-1"
                        />
                        <button type="button" onClick={() => setVariantPicker(i)} className="border border-[var(--svj-border)] px-2 py-1 text-[10px]">
                          Pick
                        </button>
                      </div>
                    </td>
                    <td>
                      <button
                        onClick={() => set("variants", draft.variants.filter((_, idx) => idx !== i))}
                        className="border border-red-200 px-2 py-1 text-red-700"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              onClick={() =>
                set("variants", [...draft.variants, { label: "30ml", sku: `${draft.sku}-30`, price: draft.price, comparePrice: 0, stock: 20, imageUrl: "" }])
              }
              className="btn-outline mt-3 !py-2"
            >
              + Add variant
            </button>
            <MediaPicker
              open={variantPicker !== null}
              folder="products"
              limits={uploadLimits}
              onClose={() => setVariantPicker(null)}
              onPick={(m) => {
                const target = variantPicker;
                setVariantPicker(null);
                if (target === null) return;
                set("variants", draft.variants.map((x, idx) => (idx === target ? { ...x, imageUrl: m.url } : x)));
              }}
            />
          </section>
        )}

        {tab === "Benefits" && (
          <section className="bg-white p-5">
            <Field label="Benefits (one per line)">
              <textarea rows={8} value={draft.benefits} onChange={(e) => set("benefits", e.target.value)} className="inp" />
            </Field>
          </section>
        )}

        {tab === "Ingredients" && (
          <section className="bg-white p-5">
            <Field label="Ingredients (INCI)">
              <textarea rows={8} value={draft.ingredients} onChange={(e) => set("ingredients", e.target.value)} className="inp" />
            </Field>
          </section>
        )}

        {tab === "How To Use" && (
          <section className="space-y-4 bg-white p-5">
            <RichTextEditor value={draft.howToUse} onChange={(html) => set("howToUse", html)} label="How to use" height={200} />
            <Field label="Warnings / legal notice">
              <textarea rows={4} value={draft.warnings} onChange={(e) => set("warnings", e.target.value)} className="inp" />
            </Field>
          </section>
        )}

        {tab === "SEO" && (
          <section className="grid gap-4 bg-white p-5 lg:grid-cols-2">
            <div className="space-y-4">
              <Field label="SEO title">
                <input value={draft.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} className="inp" placeholder={`${draft.name} | SunVera Jolie`} />
              </Field>
              <Field label="SEO description">
                <textarea rows={3} value={draft.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} className="inp" />
              </Field>
              <Field label="SEO keywords">
                <input value={draft.seoKeywords} onChange={(e) => set("seoKeywords", e.target.value)} className="inp" />
              </Field>
              <Field label="Canonical URL">
                <input value={draft.canonicalUrl} onChange={(e) => set("canonicalUrl", e.target.value)} className="inp" placeholder={`/product/${slug}`} />
              </Field>
            </div>
            <div>
              <span className="label">Google search preview (live)</span>
              <div className="border border-[var(--svj-border)] bg-white p-4">
                <p className="text-xs text-green-800">sunverajolie.com › product › {slug}</p>
                <p className="mt-1 text-lg text-blue-800">{seoTitle.slice(0, 60)}</p>
                <p className="mt-1 text-xs text-[var(--svj-muted)]">{(seoDescription || "No description yet").slice(0, 160)}</p>
              </div>
            </div>
          </section>
        )}

        {tab === "Advanced" && (
          <section className="grid gap-4 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Skin type">
              <input value={draft.skinType} onChange={(e) => set("skinType", e.target.value)} className="inp" />
            </Field>
            <Field label="Hair type">
              <input value={draft.hairType} onChange={(e) => set("hairType", e.target.value)} className="inp" />
            </Field>
            <Field label="Placeholder emoji">
              <input value={draft.emoji} onChange={(e) => set("emoji", e.target.value)} className="inp" />
            </Field>
            <Field label="Placeholder tone">
              <select value={draft.tone} onChange={(e) => set("tone", e.target.value)} className="inp">
                {["beige", "ivory", "gold", "nude"].map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
            </Field>
            <p className="text-[11px] text-[var(--svj-muted)] sm:col-span-2 lg:col-span-4">
              The emoji + tone fill the gallery when no image is uploaded yet.
            </p>
          </section>
        )}
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-[120] overflow-y-auto bg-black/60 p-3 sm:p-6"
          onClick={() => setPreview(false)}
        >
          <div
            className="mx-auto max-w-7xl overflow-hidden rounded-[30px] bg-[#fdfbf7] shadow-[0_35px_100px_rgba(0,0,0,0.24)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-cocoa/10 bg-white px-5 py-4 sm:px-7">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">SunVera Jolie</p>
                <h3 className="mt-1 font-display text-xl sm:text-2xl">Storefront preview</h3>
              </div>
              <button
                type="button"
                onClick={() => setPreview(false)}
                className="rounded-full border border-cocoa/10 bg-white px-3 py-2 text-sm"
                aria-label="Close preview"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-8 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
              <div className="grid gap-4 lg:grid-cols-[84px_minmax(0,1fr)]">
                <div className="order-2 flex gap-2 overflow-x-auto lg:order-1 lg:flex-col">
                  {(draft.images.filter((image) => image.url).length
                    ? draft.images.filter((image) => image.url)
                    : [{ url: "", alt: draft.name || "Product", id: 0 } as typeof draft.images[number]]
                  ).map((image, index) => (
                    <button
                      key={image.id ?? index}
                      type="button"
                      onClick={() => setPreviewImage(index)}
                      className={\`h-20 w-20 shrink-0 overflow-hidden rounded-xl border bg-white transition lg:h-20 lg:w-20 \${
                        previewImage === index ? "border-gold ring-1 ring-gold/30" : "border-cocoa/10"
                      }\`}
                    >
                      {image.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={image.url} alt={image.alt || draft.name} className="h-full w-full object-contain p-1" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-3xl">{draft.emoji}</span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="order-1 lg:order-2">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-[28px] bg-[#f6f1e9]">
                    {draft.images.filter((image) => image.url)[previewImage]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={draft.images.filter((image) => image.url)[previewImage].url}
                        alt={draft.images.filter((image) => image.url)[previewImage].alt || draft.name}
                        className="h-full w-full object-contain p-4 sm:p-6"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-8xl">{draft.emoji}</div>
                    )}
                    <div className="absolute start-4 top-4">
                      {draft.bestSeller ? (
                        <span className="rounded-full bg-[#b58c45] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">Best Seller</span>
                      ) : draft.newArrival ? (
                        <span className="rounded-full bg-cocoa px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">New Arrival</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="self-start">
                <div className="text-[11px] uppercase tracking-[0.18em] text-cocoa-soft">
                  Home / Shop / {draft.categorySlug.replace(/-/g, " ")}
                </div>
                <div className="mt-4 font-display text-lg text-gold">{draft.brand || "SunVera Jolie"}</div>
                <h3 className="mt-2 font-display text-4xl leading-[1.06] text-cocoa">
                  {draft.name || "Product name"}
                </h3>
                {draft.shortDescription && (
                  <p className="mt-3 text-base leading-7 text-cocoa-soft">{draft.shortDescription.replace(/<[^>]+>/g, "")}</p>
                )}
                <div className="mt-4 flex items-center gap-2 text-sm">
                  <span className="text-[#b58c45]">★★★★★</span>
                  <span className="text-cocoa-soft">4.8 · Customer reviews</span>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-2xl border border-[#ead6c8] bg-[#fff6f1] p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a15a42]">Special Offer</div>
                    <div className="mt-2 flex flex-wrap items-baseline gap-3">
                      <span className="text-3xl font-semibold text-cocoa">{money(draft.price)}</span>
                      {draft.comparePrice > draft.price && <span className="text-sm text-cocoa-soft line-through">{money(draft.comparePrice)}</span>}
                      {draft.comparePrice > draft.price && <span className="rounded-full bg-[#d94855] px-2.5 py-1 text-[10px] font-semibold text-white">{off}% OFF</span>}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-cocoa/10 bg-[#fcfaf6] p-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cocoa-soft">Premium Quality</div>
                    <p className="mt-2 text-sm leading-6 text-cocoa">Authentic SunVera Jolie beauty care.</p>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-cocoa/10 bg-white p-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl bg-[#fcfaf6] p-3 text-sm">🚚 Delivery across Algeria</div>
                    <div className="rounded-xl bg-[#fcfaf6] p-3 text-sm">💳 Cash on Delivery</div>
                    <div className="rounded-xl bg-[#fcfaf6] p-3 text-sm">↩ 14-day easy returns</div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-[1.25fr_1fr_auto]">
                  <span className="btn-gold !min-h-12 rounded-xl text-center text-sm font-semibold uppercase tracking-[0.12em]">🛍 Add to Cart</span>
                  <span className="btn-primary !min-h-12 rounded-xl text-center text-sm font-semibold uppercase tracking-[0.12em]">Buy Now</span>
                  <span className="btn-outline !min-h-12 rounded-xl px-4 text-center text-lg">♡</span>
                </div>
              </div>
            </div>

            <div className="border-t border-cocoa/10 bg-white px-5 py-5 sm:px-7">
              <div className="flex flex-wrap gap-6 border-b border-cocoa/10 pb-3 text-sm font-medium">
                <span className="border-b-2 border-gold pb-3 text-cocoa">Description</span>
                <span className="text-cocoa-soft">Benefits</span>
                <span className="text-cocoa-soft">Ingredients</span>
                <span className="text-cocoa-soft">How to Use</span>
                <span className="text-cocoa-soft">Shipping & Delivery</span>
              </div>
              <div
                className="rich-content mt-5 max-w-4xl text-sm leading-7 text-cocoa-soft"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(draft.description) || "<p>No description yet.</p>" }}
              />
            </div>
          </div>
        </div>
      )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-[var(--svj-muted)]">{draft.productType}</p>
                <h3 className="mt-1 font-display text-2xl">{draft.name || "Product name"}</h3>
                <p className="mt-2 text-sm text-[var(--svj-muted)]">{draft.shortDescription}</p>
                <p className="mt-3 text-xl font-semibold">
                  {money(draft.price)} {draft.comparePrice > draft.price && <span className="text-sm line-through text-[var(--svj-muted)]">{money(draft.comparePrice)}</span>}
                </p>
                <div className="mt-4 flex gap-2">
                  <span className="btn-primary">Add to Cart</span>
                  <span className="btn-outline">Buy Now</span>
                </div>
              </div>
            </div>
            <div className="rich-content mt-6 text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(draft.description) || "<p>No description yet.</p>" }} />
          </div>
        </div>
      )}
    </div>
  );
}
