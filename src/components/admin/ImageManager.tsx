"use client";

import { useMemo, useRef, useState } from "react";
import {
  acceptAttribute,
  uploadMediaFiles,
  validateFiles,
  DEFAULT_UPLOAD_LIMITS,
  type UploadIssue,
  type UploadLimits,
} from "@/components/admin/uploadMedia";

export type ManagedImage = {
  url: string;
  alt: string;
  imageType: string;
  sortOrder: number;
  isPrimary: boolean;
  mediaId?: number | null;
  title?: string;
  caption?: string;
  focalX?: number;
  focalY?: number;
  /** Display-only extras carried from the media row (not persisted on product_images). */
  filename?: string;
  width?: number;
  height?: number;
};

export const IMAGE_TYPES = [
  "main",
  "gallery",
  "lifestyle",
  "detail",
  "ingredient",
  "howto",
  "size",
  "beforeafter",
  "mobile",
] as const;

/**
 * One primary image, contiguous sortOrder starting at 0, and the primary pinned first
 * when nobody is flagged — so the storefront always renders the same main image.
 * Mirrors writeImages() on the server: the first flagged row wins, otherwise position 0.
 */
export function normalizeImages(images: ManagedImage[]): ManagedImage[] {
  const primaryIndex = Math.max(
    0,
    images.findIndex((i) => i.isPrimary),
  );
  return images.map((img, index) => ({
    ...img,
    sortOrder: index,
    isPrimary: index === primaryIndex,
  }));
}

type Status = "idle" | "dragging" | "uploading" | "uploaded" | "failed" | "replacing";

export default function ImageManager({
  images,
  onChange,
  folder = "products",
  productName = "",
  warning,
  limits = DEFAULT_UPLOAD_LIMITS,
}: {
  images: ManagedImage[];
  onChange: (images: ManagedImage[]) => void;
  folder?: string;
  productName?: string;
  warning?: string | null;
  limits?: UploadLimits;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [issues, setIssues] = useState<UploadIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);
  const dragIndex = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const replaceRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const accept = useMemo(() => acceptAttribute(limits), [limits]);
  const busy = status === "uploading" || status === "replacing";
  const extensions = limits.allowedTypes
    .flatMap((t) => ({ "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WEBP", "image/avif": "AVIF", "image/gif": "GIF" })[t] ?? "")
    .filter(Boolean);

  function emit(next: ManagedImage[]) {
    onChange(normalizeImages(next));
  }

  async function upload(files: File[]) {
    setError(null);
    setIssues([]);
    if (!files.length) return;

    const { ok, issues: rejected } = validateFiles(files, limits);
    setIssues(rejected);
    if (!ok.length) {
      setStatus("failed");
      return;
    }

    setStatus("uploading");
    setProgress(0);
    try {
      const res = await uploadMediaFiles({
        files: ok,
        folder,
        onProgress: setProgress,
      });
      if (res.errors?.length) setIssues(res.errors.map((message) => ({ name: "Upload", reason: message })));
      const created = res.created ?? [];
      if (!created.length) {
        setStatus("failed");
        setError(res.error ?? "Upload failed — no image was stored");
        return;
      }

      const start = images.length;
      const added: ManagedImage[] = created.map((m, i) => ({
        url: m.url,
        mediaId: m.id,
        alt: productName ? `${productName} — ${m.filename.replace(/\.[a-z0-9]+$/i, "")}` : m.alt || m.filename,
        title: m.title,
        imageType: "gallery",
        sortOrder: start + i,
        isPrimary: false,
        filename: m.filename,
        width: m.width,
        height: m.height,
      }));
      emit([...images, ...added]);
      setStatus("uploaded");
      setFlash(`${created.length} image${created.length > 1 ? "s" : ""} uploaded — remember to save the product`);
    } catch (e) {
      setStatus("failed");
      setError((e as Error).message);
    }
  }

  function patch(index: number, p: Partial<ManagedImage>) {
    onChange(images.map((img, i) => (i === index ? { ...img, ...p } : img)));
  }

  function setPrimary(index: number) {
    emit(
      images.map((img, i) => ({
        ...img,
        isPrimary: i === index,
        imageType: i === index ? "main" : img.imageType === "main" ? "gallery" : img.imageType,
      })),
    );
    setFlash(`Image #${index + 1} is now the main image`);
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= images.length || from === to) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    emit(next);
  }

  function remove(index: number) {
    const next = images.filter((_, i) => i !== index);
    const hasPrimary = next.some((x) => x.isPrimary);
    emit(hasPrimary ? next : next.map((x, i) => (i === 0 ? { ...x, isPrimary: true, imageType: "main" } : x)));
    setFlash("Image removed from this product — remember to save");
  }

  async function replace(index: number, file: File) {
    const target = images[index];
    setError(null);
    setIssues([]);

    const { ok, issues: rejected } = validateFiles([file], limits);
    setIssues(rejected);
    if (!ok.length) {
      setStatus("failed");
      return;
    }

    // An image that already lives in the media library is replaced IN PLACE: the same
    // media row (and therefore the same /api/media/[id] reference used by this and any
    // other product) keeps working and starts serving the new file.
    if (target.mediaId) {
      setReplacingIndex(index);
      setStatus("replacing");
      setProgress(0);
      try {
        const res = await uploadMediaFiles({ files: ok, folder, replaceId: target.mediaId, onProgress: setProgress });
        const replaced = res.replaced;
        if (!replaced) {
          setStatus("failed");
          setError(res.error ?? "Replace failed");
          return;
        }
        patch(index, { url: replaced.url, filename: replaced.filename, width: replaced.width, height: replaced.height });
        setStatus("uploaded");
        setFlash(`Image #${index + 1} replaced — every reference stayed valid`);
      } catch (e) {
        setStatus("failed");
        setError((e as Error).message);
      } finally {
        setReplacingIndex(null);
      }
      return;
    }

    // Nothing to preserve yet — store a brand new asset and point this slot at it.
    await uploadThenAssign(index, ok[0]);
  }

  async function uploadThenAssign(index: number, file: File) {
    setStatus("uploading");
    setProgress(0);
    try {
      const res = await uploadMediaFiles({ files: [file], folder, onProgress: setProgress });
      const m = res.created?.[0];
      if (!m) {
        setStatus("failed");
        setError(res.errors?.[0] ?? res.error ?? "Upload failed");
        return;
      }
      patch(index, { url: m.url, mediaId: m.id, filename: m.filename, width: m.width, height: m.height });
      setStatus("uploaded");
      setFlash(`Image #${index + 1} uploaded`);
    } catch (e) {
      setStatus("failed");
      setError((e as Error).message);
    }
  }

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (!busy) setStatus("dragging");
    },
    onDragLeave: () => {
      if (status === "dragging") setStatus("idle");
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (busy) return;
      setStatus("idle");
      if (e.dataTransfer.files.length) void upload(Array.from(e.dataTransfer.files));
    },
  };

  return (
    <div>
      {warning && (
        <p className="mb-3 border border-amber-300 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
          ⚠ {warning}
        </p>
      )}

      <div
        {...dropHandlers}
        className={`border-2 border-dashed p-6 text-center transition-colors ${
          status === "dragging"
            ? "border-[var(--svj-primary)] bg-[var(--svj-background)]"
            : "border-[var(--svj-border)] bg-[var(--svj-background)]"
        }`}
      >
        <p className="text-xs text-[var(--svj-muted)]">
          Drag &amp; drop images here ({extensions.join(", ")} · max {limits.maxUploadMb} MB each) or
        </p>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn-primary mt-3 !py-2">
          {status === "uploading" ? `Uploading… ${progress}%` : "Choose images from your computer"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          aria-label="Product images"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            if (files.length) void upload(files);
          }}
        />
        {status === "uploading" && (
          <div className="mx-auto mt-3 h-1 w-48 bg-[var(--svj-border)]" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-1 bg-[var(--svj-primary)] transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        <p className="mt-2 text-[10px] text-[var(--svj-muted)]">
          The first image becomes the main image unless you pin another one. Recommended: 8-10 images.
        </p>
      </div>

      {issues.length > 0 && (
        <ul className="mt-2 border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900">
          {issues.map((issue, i) => (
            <li key={`${issue.name}-${i}`}>
              ⚠ <strong>{issue.name}</strong> — {issue.reason}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-[11px] text-red-700" role="alert">⚠ {error}</p>}
      {flash && !error && (
        <p className="mt-2 text-[11px] text-green-700" role="status">
          ✓ {flash}
        </p>
      )}

      {images.length === 0 ? (
        <div className="mt-4 border border-dashed border-[var(--svj-border)] bg-white p-8 text-center">
          <p className="font-display text-base">No product image</p>
          <p className="mt-1 text-[11px] text-[var(--svj-muted)]">
            Upload at least one image so the product card, gallery and search results show real photography
            instead of the placeholder emoji.
          </p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {images.map((img, i) => {
            const isReplacing = replacingIndex === i;
            return (
              <li key={`${img.mediaId ?? "new"}-${img.url}-${i}`} className="border border-[var(--svj-border)] bg-white">
                <div className="relative">
                  <div
                    draggable
                    onDragStart={() => (dragIndex.current = i)}
                    onDragEnd={() => (dragIndex.current = null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIndex.current !== null) move(dragIndex.current, i);
                      dragIndex.current = null;
                    }}
                    className="cursor-grab active:cursor-grabbing"
                    title="Drag to reorder"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.alt || `Product image ${i + 1}`}
                      className="aspect-square w-full bg-[var(--svj-background)] object-cover"
                      loading="lazy"
                    />
                  </div>

                  <span className="absolute start-1 top-1 bg-cocoa/80 px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-white">
                    #{i + 1}
                  </span>
                  {img.isPrimary && (
                    <span className="absolute end-1 top-1 bg-[var(--svj-primary)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-white">
                      Main
                    </span>
                  )}
                  {isReplacing && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-[11px] text-white">
                      <span>Replacing… {progress}%</span>
                      <div className="mt-2 h-1 w-24 bg-white/30">
                        <div className="h-1 bg-white" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2 p-2">
                  <p className="truncate text-[11px]" title={img.filename || img.url}>
                    {img.filename || (img.url ? img.url.split("/").pop()?.split("?")[0] : "Untitled")}
                  </p>
                  <p className="text-[10px] text-[var(--svj-muted)]">
                    {img.imageType}
                    {img.width && img.height ? ` · ${img.width}×${img.height}` : ""}
                    {img.mediaId ? ` · media #${img.mediaId}` : " · not in library"}
                  </p>

                  <label className="sr-only" htmlFor={`alt-${i}`}>Alt text for image {i + 1}</label>
                  <input
                    id={`alt-${i}`}
                    value={img.alt}
                    onChange={(e) => patch(i, { alt: e.target.value })}
                    placeholder="Alt text (image SEO)"
                    className="inp !py-1 text-[11px]"
                  />

                  <label className="sr-only" htmlFor={`type-${i}`}>Image type for image {i + 1}</label>
                  <select
                    id={`type-${i}`}
                    value={img.imageType}
                    onChange={(e) => patch(i, { imageType: e.target.value })}
                    className="inp !py-1 text-[11px]"
                  >
                    {IMAGE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>

                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setPrimary(i)}
                      disabled={img.isPrimary}
                      className="border border-[var(--svj-border)] px-2 py-1 disabled:opacity-40"
                    >
                      {img.isPrimary ? "Main image" : "Set main"}
                    </button>
                    <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move image ${i + 1} left`} className="border border-[var(--svj-border)] px-2 py-1 disabled:opacity-40">
                      ←
                    </button>
                    <button type="button" onClick={() => move(i, i + 1)} disabled={i === images.length - 1} aria-label={`Move image ${i + 1} right`} className="border border-[var(--svj-border)] px-2 py-1 disabled:opacity-40">
                      →
                    </button>
                    <button
                      type="button"
                      onClick={() => replaceRefs.current[i]?.click()}
                      disabled={busy}
                      className="border border-[var(--svj-border)] px-2 py-1 disabled:opacity-40"
                    >
                      Replace
                    </button>
                    <input
                      ref={(el) => {
                        replaceRefs.current[i] = el;
                      }}
                      type="file"
                      accept={accept}
                      className="hidden"
                      aria-label={`Replace image ${i + 1}`}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void replace(i, file);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      aria-label={`Delete image ${i + 1}`}
                      className="border border-red-200 px-2 py-1 text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-2 text-[11px] text-[var(--svj-muted)]">
        {images.length} image{images.length === 1 ? "" : "s"} · {images.filter((i) => i.isPrimary).length} main image ·
        drag a thumbnail or use ← → to reorder
      </p>
    </div>
  );
}
