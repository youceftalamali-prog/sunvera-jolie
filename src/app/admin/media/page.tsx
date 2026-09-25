"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog, Modal } from "@/components/admin/ui";
import {
  acceptAttribute,
  copyText,
  deleteMedia,
  extensionLabel,
  fetchMediaLibrary,
  humanSize,
  patchMedia,
  uploadMediaFiles,
  validateFiles,
  DEFAULT_UPLOAD_LIMITS,
  type MediaAsset,
  type UploadLimits,
} from "@/components/admin/uploadMedia";

const FALLBACK_FOLDERS = ["all", "products", "homepage", "banners", "categories", "brand", "ai", "marketing", "content", "other"];

type Status = "idle" | "dragging" | "uploading" | "uploaded" | "failed";

export default function MediaLibraryPage() {
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("all");
  const [folders, setFolders] = useState<string[]>(FALLBACK_FOLDERS);
  const [limits, setLimits] = useState<UploadLimits>(DEFAULT_UPLOAD_LIMITS);
  const [storage, setStorage] = useState<{ warning: string | null; mode: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<MediaAsset | null>(null);
  const [editing, setEditing] = useState<MediaAsset | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ asset: MediaAsset; products: { id: number; name: string; slug: string }[] } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const replaceRef = useRef<HTMLInputElement | null>(null);
  const replaceTarget = useRef<MediaAsset | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchMediaLibrary({ q, folder });
      setItems(d.media ?? []);
      if (d.folders?.length) setFolders(["all", ...d.folders]);
      if (d.limits) setLimits(d.limits);
      if (d.storage) setStorage(d.storage);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [q, folder]);

  useEffect(() => {
    void load();
  }, [load]);

  const busy = status === "uploading";

  async function upload(files: File[]) {
    if (busy || !files.length) return;
    setError(null);
    setMsg(null);

    const { ok, issues } = validateFiles(files, limits);
    if (issues.length) setError(issues.map((i) => `${i.name}: ${i.reason}`).join(" · "));
    if (!ok.length) {
      setStatus("failed");
      return;
    }

    setStatus("uploading");
    setProgress(0);
    try {
      const res = await uploadMediaFiles({
        files: ok,
        folder: folder === "all" ? "other" : folder,
        onProgress: setProgress,
      });
      if (res.errors?.length) setError(res.errors.join(" · "));
      const count = res.created?.length ?? 0;
      if (count) {
        setMsg(`Uploaded ${count} file${count > 1 ? "s" : ""} ✓`);
        setStatus("uploaded");
      } else {
        setStatus("failed");
        if (!res.errors?.length) setError(res.error ?? "Upload failed");
      }
      await load();
    } catch (e) {
      setStatus("failed");
      setError((e as Error).message);
    }
  }

  // Replaces the file behind an EXISTING media row (same id), so every product
  // or page referencing it immediately serves the new image.
  async function replaceFile(target: MediaAsset, file: File) {
    setError(null);
    setMsg(null);
    const { ok, issues } = validateFiles([file], limits);
    if (issues.length) {
      setError(issues.map((i) => `${i.name}: ${i.reason}`).join(" · "));
      return;
    }
    setStatus("uploading");
    setProgress(0);
    try {
      const res = await uploadMediaFiles({
        files: ok,
        folder: target.folder,
        replaceId: target.id,
        onProgress: setProgress,
      });
      if (!res.replaced) {
        setStatus("failed");
        setError(`Replace failed: ${res.error ?? "unknown error"}`);
        return;
      }
      setStatus("uploaded");
      setMsg(
        `Replaced ${target.filename} ✓ · ${res.updatedReferences ?? 0} product image reference(s) updated${
          res.cleanup?.deleted ? " · old file removed" : ""
        }`,
      );
      await load();
    } catch (e) {
      setStatus("failed");
      setError((e as Error).message);
    }
  }

  async function confirmDelete(force: boolean) {
    const target = pendingDelete?.asset;
    setPendingDelete(null);
    if (!target) return;
    const res = await deleteMedia(target.id, force);
    if (res.error) {
      if (res.products?.length) {
        setPendingDelete({ asset: target, products: res.products });
        return;
      }
      setError(res.error);
      return;
    }
    setMsg(
      `Deleted ${target.filename}${res.detachedReferences ? ` — ${res.detachedReferences} product image(s) now point at a missing asset, please update them` : ""}`,
    );
    await load();
  }

  const inUse = items.filter((m) => m.usage > 0).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl">Media Library</h1>
        <p className="text-[11px] text-[var(--svj-muted)]">
          {items.length} file{items.length === 1 ? "" : "s"}
          {inUse ? ` · ${inUse} in use by products` : ""}
        </p>
        {storage?.mode && (
          <span className="border border-[var(--svj-border)] px-2 py-1 text-[10px] uppercase tracking-widest text-[var(--svj-muted)]">
            provider: {storage.mode}
          </span>
        )}
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn-primary ms-auto !py-2">
          {busy ? `Uploading… ${progress}%` : "Upload images"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttribute(limits)}
          multiple
          className="hidden"
          aria-label="Upload images to the media library"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            void upload(files);
          }}
        />
      </div>

      {storage?.warning && (
        <p className="border border-amber-300 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
          ⚠ <strong>Storage:</strong> {storage.warning}
        </p>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setStatus("dragging");
        }}
        onDragLeave={() => status === "dragging" && setStatus("idle")}
        onDrop={(e) => {
          e.preventDefault();
          if (busy) return;
          setStatus("idle");
          void upload(Array.from(e.dataTransfer.files));
        }}
        className={`border-2 border-dashed p-4 text-center text-[11px] transition-colors ${
          status === "dragging" ? "border-[var(--svj-primary)] bg-white" : "border-[var(--svj-border)] bg-white"
        }`}
      >
        Drop files here to add them to <strong>{folder === "all" ? "other" : folder}</strong> · JPG, PNG, WEBP, AVIF · max{" "}
        {limits.maxUploadMb} MB each
        {busy && (
          <span className="mx-auto mt-2 block h-1 w-48 bg-[var(--svj-border)]" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <span className="block h-1 bg-[var(--svj-primary)]" style={{ width: `${progress}%` }} />
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-white p-4">
        <label className="block min-w-56 flex-1">
          <span className="label">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filename, alt text, title or caption…" className="inp !py-2 text-xs" />
        </label>
        <label className="block">
          <span className="label">Folder</span>
          <select value={folder} onChange={(e) => setFolder(e.target.value)} className="inp !py-2 text-xs">
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>

      {msg && <p className="border border-green-200 bg-green-50 p-3 text-[12px] text-green-800" role="status">{msg}</p>}
      {error && <p className="border border-red-200 bg-red-50 p-3 text-[12px] text-red-800" role="alert">⚠ {error}</p>}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((m) => (
          <li key={m.id} className="flex flex-col bg-white p-2">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.alt} loading="lazy" className="aspect-square w-full bg-[var(--svj-background)] object-cover" />
              {m.usage > 0 && (
                <span className="absolute start-1 top-1 bg-[var(--svj-primary)] px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-white">
                  In use · {m.usage}
                </span>
              )}
            </div>
            <p className="mt-2 truncate text-[11px]" title={m.filename}>{m.filename}</p>
            <p className="text-[10px] text-[var(--svj-muted)]">
              {m.folder} · {extensionLabel(m.filename)} · {humanSize(m.size)}
            </p>
            <p className="text-[10px] text-[var(--svj-muted)]">
              {m.provider}
              {m.width ? ` · ${m.width}×${m.height}` : " · no dimensions"}
            </p>
            <p className="truncate text-[10px] text-[var(--svj-muted)]" title={m.alt}>alt: {m.alt || "—"}</p>
            {(m.title || m.caption) && (
              <p className="truncate text-[10px] text-[var(--svj-muted)]" title={`${m.title} ${m.caption}`}>
                {m.title || m.caption}
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
              <button type="button" onClick={() => setPreview(m)} className="border border-[var(--svj-border)] px-1.5 py-0.5">Preview</button>
              <button
                type="button"
                onClick={async () => setMsg((await copyText(m.url)) ? `URL copied ✓ ${m.url}` : "Copy failed — copy it manually from the preview")}
                className="border border-[var(--svj-border)] px-1.5 py-0.5"
              >
                Copy URL
              </button>
              <button type="button" onClick={() => setEditing(m)} className="border border-[var(--svj-border)] px-1.5 py-0.5">Edit</button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  replaceTarget.current = m;
                  replaceRef.current?.click();
                }}
                className="border border-[var(--svj-border)] px-1.5 py-0.5 disabled:opacity-40"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete({ asset: m, products: [] })}
                className="border border-red-200 px-1.5 py-0.5 text-red-700"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <p className="bg-white p-8 text-center text-[12px] text-[var(--svj-muted)]">
          {loading ? "Loading media…" : "No media found for this search."}
        </p>
      )}

      <input
        ref={replaceRef}
        type="file"
        accept={acceptAttribute(limits)}
        className="hidden"
        aria-label="Replace media file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const target = replaceTarget.current;
          replaceTarget.current = null;
          if (file && target) void replaceFile(target, file);
        }}
      />

      {preview && (
        <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/60 p-6" onClick={() => setPreview(null)}>
          <div className="mx-auto max-w-3xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt={preview.alt} className="max-h-[65vh] w-full object-contain" />
            <dl className="mt-3 grid gap-1 text-[11px] sm:grid-cols-2">
              <div><dt className="inline text-[var(--svj-muted)]">File: </dt><dd className="inline">{preview.filename}</dd></div>
              <div><dt className="inline text-[var(--svj-muted)]">Type: </dt><dd className="inline">{preview.mimeType}</dd></div>
              <div><dt className="inline text-[var(--svj-muted)]">Size: </dt><dd className="inline">{humanSize(preview.size)}</dd></div>
              <div><dt className="inline text-[var(--svj-muted)]">Dimensions: </dt><dd className="inline">{preview.width ? `${preview.width}×${preview.height}` : "unknown"}</dd></div>
              <div><dt className="inline text-[var(--svj-muted)]">Folder: </dt><dd className="inline">{preview.folder}</dd></div>
              <div><dt className="inline text-[var(--svj-muted)]">Provider: </dt><dd className="inline">{preview.provider}</dd></div>
              <div className="sm:col-span-2"><dt className="inline text-[var(--svj-muted)]">Alt: </dt><dd className="inline">{preview.alt || "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="inline text-[var(--svj-muted)]">Title: </dt><dd className="inline">{preview.title || "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="inline text-[var(--svj-muted)]">Caption: </dt><dd className="inline">{preview.caption || "—"}</dd></div>
              <div className="sm:col-span-2"><dt className="inline text-[var(--svj-muted)]">Focal point: </dt><dd className="inline">{preview.focalX}% / {preview.focalY}%</dd></div>
              <div className="sm:col-span-2 break-all"><dt className="inline text-[var(--svj-muted)]">URL: </dt><dd className="inline">{preview.url}</dd></div>
            </dl>
            <p className="mt-2 text-[11px] text-[var(--svj-muted)]">
              {preview.usage > 0 ? `Used by ${preview.usage} product image(s).` : "Not referenced by any product image."}
            </p>
            <button type="button" onClick={() => setPreview(null)} className="btn-outline mt-3 !py-2">Close</button>
          </div>
        </div>
      )}

      {editing && <MetadataEditor asset={editing} onClose={() => setEditing(null)} onSaved={load} />}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete ${pendingDelete?.asset.filename ?? ""}?`}
        danger
        confirmLabel={pendingDelete?.products.length ? "Delete anyway" : "Delete"}
        message={
          pendingDelete?.products.length
            ? `This asset is used by ${pendingDelete.products.length} product image(s): ${pendingDelete.products
                .map((p) => p.name)
                .join(", ")}. Deleting it will break those images on the storefront. Replace the file instead, or delete anyway to detach them.`
            : "The media row and the stored file will be removed. This cannot be undone."
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete(Boolean(pendingDelete?.products.length))}
      />
    </div>
  );
}

function MetadataEditor({ asset, onClose, onSaved }: { asset: MediaAsset; onClose: () => void; onSaved: () => Promise<void> }) {
  const [alt, setAlt] = useState(asset.alt);
  const [title, setTitle] = useState(asset.title);
  const [caption, setCaption] = useState(asset.caption);
  const [folder, setFolder] = useState(asset.folder);
  const [focalX, setFocalX] = useState(asset.focalX);
  const [focalY, setFocalY] = useState(asset.focalY);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setState("saving");
    setError(null);
    try {
      await patchMedia(asset.id, { alt, title, caption, folder, focalX, focalY });
      await onSaved();
      onClose();
    } catch (e) {
      setState("error");
      setError((e as Error).message);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit metadata — ${asset.filename}`}>
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.url} alt={asset.alt} className="aspect-square w-full bg-[var(--svj-background)] object-cover" />
        <div className="space-y-3">
          <label className="block">
            <span className="label">Alt text</span>
            <input value={alt} onChange={(e) => setAlt(e.target.value)} className="inp !py-2 text-xs" />
          </label>
          <label className="block">
            <span className="label">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="inp !py-2 text-xs" />
          </label>
          <label className="block">
            <span className="label">Caption</span>
            <textarea rows={2} value={caption} onChange={(e) => setCaption(e.target.value)} className="inp !py-2 text-xs" />
          </label>
          <label className="block">
            <span className="label">Folder</span>
            <select value={folder} onChange={(e) => setFolder(e.target.value)} className="inp !py-2 text-xs">
              {["products", "homepage", "banners", "categories", "brand", "ai", "marketing", "content", "other"].map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Focal X ({focalX}%)</span>
              <input type="range" min={0} max={100} value={focalX} onChange={(e) => setFocalX(Number(e.target.value))} className="w-full" />
            </label>
            <label className="block">
              <span className="label">Focal Y ({focalY}%)</span>
              <input type="range" min={0} max={100} value={focalY} onChange={(e) => setFocalY(Number(e.target.value))} className="w-full" />
            </label>
          </div>
        </div>
      </div>
      {error && <p className="mt-3 text-[11px] text-red-700" role="alert">⚠ {error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn-outline !py-2">Cancel</button>
        <button type="button" onClick={() => void save()} disabled={state === "saving"} className="btn-primary !py-2">
          {state === "saving" ? "Saving…" : "Save metadata"}
        </button>
      </div>
    </Modal>
  );
}
