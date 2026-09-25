"use client";

import { useRef, useState } from "react";

export type ManagedImage = {
  url: string;
  alt: string;
  imageType: string;
  sortOrder: number;
  isPrimary: boolean;
  mediaId?: number | null;
};

const TYPES = ["main", "gallery", "lifestyle", "detail", "ingredient", "howto", "size", "beforeafter", "mobile"];

export default function ImageManager({
  images,
  onChange,
  folder = "products",
  productName = "",
  warning,
}: {
  images: ManagedImage[];
  onChange: (images: ManagedImage[]) => void;
  folder?: string;
  productName?: string;
  warning?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragIndex = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function upload(files: FileList | File[]) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    form.append("folder", folder);
    const res = await fetch("/api/admin/media", { method: "POST", body: form });
    const d = (await res.json()) as {
      created?: { id: number; url: string; provider: string; filename: string }[];
      errors?: string[];
      error?: string;
    };
    setBusy(false);
    if (d.errors?.length) setError(d.errors.join(" · "));
    if (!d.created?.length) {
      if (d.error) setError(d.error);
      return;
    }
    const added: ManagedImage[] = d.created.map((m, i) => ({
      url: m.provider === "local" ? `/api/media/${m.id}` : m.url,
      mediaId: m.id,
      alt: productName ? `${productName} — ${m.filename.replace(/\.[a-z]+$/i, "")}` : m.filename,
      imageType: "gallery",
      sortOrder: images.length + i,
      isPrimary: images.length === 0 && i === 0,
    }));
    const next = [...images, ...added];
    const withPrimary = next.some((x) => x.isPrimary)
      ? next
      : next.map((x, idx) => (idx === 0 ? { ...x, isPrimary: true } : x));
    onChange(withPrimary.map((x, idx) => ({ ...x, sortOrder: idx })));
  }

  function patch(index: number, p: Partial<ManagedImage>) {
    onChange(images.map((img, i) => (i === index ? { ...img, ...p } : img)));
  }

  function setPrimary(index: number) {
    onChange(
      images.map((img, i) => ({ ...img, isPrimary: i === index, imageType: i === index ? "main" : img.imageType === "main" ? "gallery" : img.imageType })),
    );
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= images.length || from === to) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next.map((x, idx) => ({ ...x, sortOrder: idx, isPrimary: idx === 0 ? x.isPrimary || !next.some((y) => y.isPrimary) : x.isPrimary })));
  }

  return (
    <div>
      {warning && (
        <p className="mb-3 border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-800">⚠ {warning}</p>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
        }}
        className={`border-2 border-dashed p-6 text-center ${dragOver ? "border-[var(--svj-primary)] bg-white" : "border-[var(--svj-border)]"}`}
      >
        <p className="text-xs text-[var(--svj-muted)]">
          Drag &amp; drop up to 10+ images here (JPG, PNG, WEBP, AVIF · max 8 MB each) or
        </p>
        <button type="button" onClick={() => inputRef.current?.click()} className="btn-primary mt-3 !py-2">
          {busy ? "Uploading…" : "Choose images"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
        <p className="mt-2 text-[10px] text-[var(--svj-muted)]">
          The first image becomes the main image unless you pin another one. Recommended: 8-10 images.
        </p>
      </div>

      {error && <p className="mt-2 text-[11px] text-red-700">⚠ {error}</p>}

      {images.length > 0 && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img, i) => (
            <li
              key={`${img.url}-${i}`}
              draggable
              onDragStart={() => (dragIndex.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex.current !== null) move(dragIndex.current, i);
                dragIndex.current = null;
              }}
              className="border border-[var(--svj-border)] bg-white p-2"
            >
              <div className="flex items-start gap-2">
                <span className="cursor-grab px-1 text-sm" title="Drag to reorder">☰</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.alt} className="h-20 w-20 shrink-0 object-cover" loading="lazy" />
                <div className="flex-1 space-y-1">
                  <span className="block text-[10px] uppercase tracking-widest text-[var(--svj-muted)]">
                    #{i + 1} {img.isPrimary ? "· MAIN" : ""}
                  </span>
                  <label className="sr-only" htmlFor={`alt-${i}`}>Alt text</label>
                  <input
                    id={`alt-${i}`}
                    value={img.alt}
                    onChange={(e) => patch(i, { alt: e.target.value })}
                    placeholder="Alt text (image SEO)"
                    className="inp !py-1 text-[11px]"
                  />
                  <label className="sr-only" htmlFor={`type-${i}`}>Image type</label>
                  <select
                    id={`type-${i}`}
                    value={img.imageType}
                    onChange={(e) => patch(i, { imageType: e.target.value })}
                    className="inp !py-1 text-[11px]"
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px]">
                <button type="button" onClick={() => setPrimary(i)} className="border border-[var(--svj-border)] px-2 py-1">Set main</button>
                <button type="button" onClick={() => move(i, i - 1)} className="border border-[var(--svj-border)] px-2 py-1">↑</button>
                <button type="button" onClick={() => move(i, i + 1)} className="border border-[var(--svj-border)] px-2 py-1">↓</button>
                <label className="cursor-pointer border border-[var(--svj-border)] px-2 py-1">
                  Replace
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setBusy(true);
                      const form = new FormData();
                      form.append("files", file);
                      form.append("folder", folder);
                      void fetch("/api/admin/media", { method: "POST", body: form })
                        .then((r) => r.json())
                        .then((d: { created?: { id: number; url: string; provider: string; filename: string }[] }) => {
                          const m = d.created?.[0];
                          if (m) patch(i, { url: m.provider === "local" ? `/api/media/${m.id}` : m.url, mediaId: m.id });
                        })
                        .finally(() => setBusy(false));
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const remaining = images.filter((_, idx) => idx !== i);
                    const next = remaining.length && !remaining.some((x) => x.isPrimary)
                      ? remaining.map((x, idx) => (idx === 0 ? { ...x, isPrimary: true } : x))
                      : remaining;
                    onChange(next.map((x, idx) => ({ ...x, sortOrder: idx })));
                  }}
                  className="border border-red-200 px-2 py-1 text-red-700"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-[var(--svj-muted)]">
        {images.length} image(s) · {images.filter((i) => i.isPrimary).length} main image
      </p>
    </div>
  );
}
