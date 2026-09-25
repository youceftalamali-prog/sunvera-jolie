"use client";

import { useCallback, useEffect, useState } from "react";

type M = {
  id: number;
  url: string;
  filename: string;
  alt: string;
  folder: string;
  mimeType: string;
  size: number;
  provider: string;
  createdAt: string;
};

const FOLDERS = ["all", "products", "homepage", "banners", "categories", "content", "other"];

export default function MediaLibraryPage() {
  const [items, setItems] = useState<M[]>([]);
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("all");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<M | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/media?q=${encodeURIComponent(q)}&folder=${folder}`);
    const d = (await res.json()) as { media: M[]; storage?: { warning: string | null } };
    setItems(d.media ?? []);
  }, [q, folder]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(files: FileList, target = "products") {
    setBusy(true);
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    form.append("folder", target);
    const res = await fetch("/api/admin/media", { method: "POST", body: form });
    const d = (await res.json()) as { created?: M[]; errors?: string[] };
    setBusy(false);
    setMsg(d.errors?.length ? d.errors.join(" · ") : `Uploaded ${d.created?.length ?? 0} file(s) ✓`);
    void load();
  }

  // Replaces the file behind an EXISTING media row (same id), so every product
  // or page referencing it immediately serves the new image.
  async function replaceFile(target: M, files: FileList) {
    const file = files[0];
    if (!file) return;
    setBusy(true);
    const form = new FormData();
    form.append("files", file);
    form.append("folder", target.folder);
    form.append("replaceId", String(target.id));
    const res = await fetch("/api/admin/media", { method: "POST", body: form });
    const d = (await res.json()) as { replaced?: M; error?: string };
    setBusy(false);
    if (!res.ok || d.error) {
      setMsg(`Replace failed: ${d.error ?? `HTTP ${res.status}`}`);
      return;
    }
    setMsg(`Replaced ${target.filename} ✓`);
    void load();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl">Media Library</h1>
        <p className="text-[11px] text-[var(--svj-muted)]">{items.length} files</p>
        <label className="btn-primary ms-auto !py-2 cursor-pointer">
          {busy ? "Uploading…" : "Upload images"}
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => e.target.files && upload(e.target.files, folder === "all" ? "other" : folder)} />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-white p-4">
        <label className="block">
          <span className="label">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filename or alt text…" className="inp !py-2 text-xs" />
        </label>
        <label className="block">
          <span className="label">Folder</span>
          <select value={folder} onChange={(e) => setFolder(e.target.value)} className="inp !py-2 text-xs">
            {FOLDERS.map((f) => (<option key={f} value={f}>{f}</option>))}
          </select>
        </label>
      </div>

      {msg && <p className="border border-green-200 bg-green-50 p-3 text-[12px] text-green-800">{msg}</p>}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((m) => (
          <li key={m.id} className="bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.url} alt={m.alt} loading="lazy" className="aspect-square w-full object-cover" />
            <p className="mt-2 truncate text-[11px]">{m.filename}</p>
            <p className="text-[10px] text-[var(--svj-muted)]">{m.folder} · {(m.size / 1024).toFixed(0)} KB · {m.provider}</p>
            <label className="sr-only" htmlFor={`alt-${m.id}`}>Alt text</label>
            <input
              id={`alt-${m.id}`}
              defaultValue={m.alt}
              onBlur={async (e) => {
                await fetch("/api/admin/media", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: m.id, alt: e.target.value, folder: m.folder }),
                });
                setMsg("Alt text saved ✓");
              }}
              className="inp mt-1 !py-1 text-[10px]"
            />
            <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
              <button onClick={() => setPreview(m)} className="border border-[var(--svj-border)] px-1.5 py-0.5">Preview</button>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(m.url);
                  setMsg("URL copied ✓");
                }}
                className="border border-[var(--svj-border)] px-1.5 py-0.5"
              >
                Copy URL
              </button>
              <label className="cursor-pointer border border-[var(--svj-border)] px-1.5 py-0.5">
                Replace
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) void replaceFile(m, e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                onClick={async () => {
                  if (!confirm(`Delete ${m.filename}?`)) return;
                  await fetch(`/api/admin/media?id=${m.id}`, { method: "DELETE" });
                  setMsg("Deleted");
                  void load();
                }}
                className="border border-red-200 px-1.5 py-0.5 text-red-700"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 && <p className="bg-white p-8 text-center text-[12px] text-[var(--svj-muted)]">No media found.</p>}

      {preview && (
        <div className="fixed inset-0 z-[120] bg-black/60 p-6" onClick={() => setPreview(null)}>
          <div className="mx-auto max-w-3xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.url} alt={preview.alt} className="max-h-[70vh] w-full object-contain" />
            <p className="mt-2 text-xs">{preview.filename} · {preview.url}</p>
          </div>
        </div>
      )}
    </div>
  );
}
