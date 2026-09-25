"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/admin/ui";

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

export default function MediaPicker({
  open,
  onClose,
  onPick,
  folder = "products",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (m: PickedMedia) => void;
  folder?: string;
}) {
  const [rows, setRows] = useState<PickedMedia[]>([]);
  const [q, setQ] = useState("");
  const [fld, setFld] = useState(folder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (fld !== "all") params.set("folder", fld);
    const res = await fetch(`/api/admin/media?${params}`);
    const d = (await res.json()) as { media?: PickedMedia[] };
    setRows(d.media ?? []);
  }, [q, fld]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function upload(files: FileList | File[]) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    form.append("folder", fld === "all" ? folder : fld);
    const res = await fetch("/api/admin/media", { method: "POST", body: form });
    const d = (await res.json()) as { created?: PickedMedia[]; errors?: string[]; error?: string };
    setBusy(false);
    if (d.errors?.length) setError(d.errors.join(" · "));
    if (d.error) setError(d.error);
    if (d.created?.length) {
      await load();
      onPick({ ...d.created[0], url: d.created[0].url });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Media Library" wide>
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search filename / alt…" className="inp !py-2 text-xs" />
        <select value={fld} onChange={(e) => setFld(e.target.value)} className="inp !py-2 text-xs">
          {FOLDERS.map((f) => (<option key={f} value={f}>{f}</option>))}
        </select>
        <button type="button" onClick={() => inputRef.current?.click()} className="btn-primary !py-2" disabled={busy}>
          {busy ? "Uploading…" : "+ Upload new"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </div>
      {error && <p className="mt-2 text-[11px] text-red-700">⚠ {error}</p>}
      <div className="mt-4 grid max-h-[60vh] gap-2 overflow-y-auto sm:grid-cols-4 lg:grid-cols-6">
        {rows.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(m)}
            className="group relative border border-[var(--svj-border)] bg-white p-1 text-left hover:border-[var(--svj-primary)]"
            title={m.alt || m.filename}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.url} alt={m.alt} className="aspect-square w-full object-cover" loading="lazy" />
            <span className="mt-1 block truncate text-[10px] text-[var(--svj-muted)]">{m.filename}</span>
          </button>
        ))}
        {rows.length === 0 && <p className="col-span-full py-8 text-center text-[12px] text-[var(--svj-muted)]">No media yet — upload one.</p>}
      </div>
    </Modal>
  );
}
