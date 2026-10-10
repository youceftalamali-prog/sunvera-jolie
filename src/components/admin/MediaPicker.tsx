"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/admin/ui";
import {
  acceptAttribute,
  fetchMediaLibrary,
  humanSize,
  uploadMediaFiles,
  validateFiles,
  DEFAULT_UPLOAD_LIMITS,
  type MediaAsset,
  type UploadLimits,
} from "@/components/admin/uploadMedia";

export type PickedMedia = {
  id: number;
  url: string;
  alt: string;
  filename: string;
  folder: string;
  width: number;
  height: number;
  size: number;
};

const FOLDERS = ["all", "products", "homepage", "banners", "categories", "brand", "ai", "marketing", "content", "other"];

function toPicked(m: MediaAsset): PickedMedia {
  return {
    id: m.id,
    url: m.url,
    alt: m.alt,
    filename: m.filename,
    folder: m.folder,
    width: m.width,
    height: m.height,
    size: m.size,
  };
}

export default function MediaPicker({
  open,
  onClose,
  onPick,
  folder = "products",
  limits = DEFAULT_UPLOAD_LIMITS,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (m: PickedMedia) => void;
  folder?: string;
  limits?: UploadLimits;
}) {
  const [rows, setRows] = useState<MediaAsset[]>([]);
  const [q, setQ] = useState("");
  const [fld, setFld] = useState(folder);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchMediaLibrary({ q, folder: fld, page });
      setRows(d.media ?? []);
      setHasMore(Boolean(d.pagination?.hasMore));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [q, fld, page]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  function pick(m: MediaAsset) {
    onPick(toPicked(m));
    setMessage(null);
    onClose();
  }

  async function upload(files: File[]) {
    if (busy || !files.length) return;
    setError(null);
    setMessage(null);
    const { ok, issues } = validateFiles(files, limits);
    if (issues.length) setError(issues.map((i) => `${i.name}: ${i.reason}`).join(" · "));
    if (!ok.length) return;

    setBusy(true);
    try {
      const res = await uploadMediaFiles({ files: ok, folder: fld === "all" ? folder : fld });
      if (res.errors?.length) setError(res.errors.join(" · "));
      const created = res.created?.[0];
      if (created) {
        setMessage(`Uploaded ${res.created?.length ?? 1} file(s) ✓`);
        await load();
        pick(created);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Media Library" wide>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="media-picker-search">Search media</label>
        <input
          id="media-picker-search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search filename / alt text…"
          className="inp !py-2 text-xs sm:max-w-xs"
        />
        <label className="sr-only" htmlFor="media-picker-folder">Folder</label>
        <select
          id="media-picker-folder"
          value={fld}
          onChange={(e) => {
            setFld(e.target.value);
            setPage(1);
          }}
          className="inp !py-2 text-xs sm:w-40"
        >
          {FOLDERS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => inputRef.current?.click()} className="btn-primary !py-2" disabled={busy}>
          {busy ? "Uploading…" : "+ Upload new"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttribute(limits)}
          multiple
          className="hidden"
          aria-label="Upload new media"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = "";
            void upload(files);
          }}
        />
      </div>

      {error && <p className="mt-2 text-[11px] text-red-700" role="alert">⚠ {error}</p>}
      {message && <p className="mt-2 text-[11px] text-green-700" role="status">✓ {message}</p>}

      <div className="mt-4 grid max-h-[60vh] gap-2 overflow-y-auto grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
        {rows.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => pick(m)}
            className="group border border-[var(--svj-border)] bg-white p-1 text-left hover:border-[var(--svj-primary)]"
            title={`${m.alt || m.filename} — ${m.width ? `${m.width}×${m.height} · ` : ""}${humanSize(m.size)}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.url} alt={m.alt} className="aspect-square w-full object-cover" loading="lazy" />
            <span className="mt-1 block truncate text-[10px] text-[var(--svj-muted)]">{m.filename}</span>
            <span className="block truncate text-[9px] uppercase tracking-widest text-[var(--svj-muted)]">{m.folder}</span>
          </button>
        ))}
        {rows.length === 0 && !loading && (
          <p className="col-span-full py-8 text-center text-[12px] text-[var(--svj-muted)]">
            No media found — upload one to get started.
          </p>
        )}
        {loading && <p className="col-span-full py-8 text-center text-[12px] text-[var(--svj-muted)]">Loading…</p>}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--svj-border)] pt-3" aria-label="Media picker pagination">
        <button
          type="button"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={loading || page === 1}
          className="btn-outline !py-2 disabled:opacity-40"
        >
          ← Previous
        </button>
        <span className="text-[11px] text-[var(--svj-muted)]">Page {page}</span>
        <button
          type="button"
          onClick={() => setPage((current) => current + 1)}
          disabled={loading || !hasMore}
          className="btn-outline !py-2 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </Modal>
  );
}
