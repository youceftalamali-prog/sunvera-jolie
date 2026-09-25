"use client";

import { useRef, useState } from "react";
import {
  acceptAttribute,
  humanSize,
  uploadMediaFiles,
  validateFiles,
  DEFAULT_UPLOAD_LIMITS,
  type UploadLimits,
} from "@/components/admin/uploadMedia";

export type BrandAssetValue = {
  url: string;
  width?: number;
  height?: number;
};

/**
 * Upload → preview → replace → remove control for one brand asset.
 *
 * Files always go through the existing POST /api/admin/media endpoint into the `brand`
 * folder of the shared media table; only the resulting URL is written to store settings.
 */
export default function BrandAssetField({
  label,
  hint,
  value,
  onSave,
  background = "light",
  limits = DEFAULT_UPLOAD_LIMITS,
}: {
  label: string;
  hint?: string;
  value: BrandAssetValue;
  onSave: (next: BrandAssetValue) => Promise<void> | void;
  /** Checkerboard/contrast hint so a transparent logo can be judged properly. */
  background?: "light" | "dark";
  limits?: UploadLimits;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function upload(file: File) {
    setError(null);
    setMessage(null);
    const { ok, issues } = validateFiles([file], limits);
    if (issues.length) {
      setError(issues.map((i) => i.reason).join(" · "));
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const res = await uploadMediaFiles({ files: ok, folder: "brand", onProgress: setProgress });
      const created = res.created?.[0];
      if (!created) {
        setError(res.errors?.[0] ?? res.error ?? "Upload failed");
        return;
      }
      await onSave({ url: created.url, width: created.width, height: created.height });
      setMessage(`${created.filename} uploaded ✓ (${humanSize(created.size)})`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-[var(--svj-border)] p-3">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-20 w-32 shrink-0 items-center justify-center border border-[var(--svj-border)] ${
            background === "dark" ? "bg-cocoa" : "bg-[var(--svj-background)]"
          }`}
        >
          {value.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.url} alt={label} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[10px] uppercase tracking-widest text-[var(--svj-muted)]">No file</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--svj-muted)]">{label}</p>
          {hint && <p className="mt-0.5 text-[10px] text-[var(--svj-muted)]">{hint}</p>}
          {value.url && (
            <p className="mt-0.5 truncate text-[10px] text-[var(--svj-muted)]" title={value.url}>
              {value.width ? `${value.width}×${value.height} · ` : ""}
              {value.url}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="border border-[var(--svj-border)] px-2 py-1 text-[10px] uppercase tracking-widest disabled:opacity-40"
            >
              {busy ? `Uploading… ${progress}%` : value.url ? "Replace" : "Upload file"}
            </button>
            {value.url && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void onSave({ url: "", width: 0, height: 0 });
                  setMessage("Removed — the text logo is used instead");
                }}
                className="border border-red-200 px-2 py-1 text-[10px] uppercase tracking-widest text-red-700 disabled:opacity-40"
              >
                Remove
              </button>
            )}
            <input
              ref={inputRef}
              type="file"
              accept={acceptAttribute(limits)}
              className="hidden"
              aria-label={`Upload ${label}`}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
          </div>
          {busy && (
            <span className="mt-2 block h-1 w-32 bg-[var(--svj-border)]" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <span className="block h-1 bg-[var(--svj-primary)]" style={{ width: `${progress}%` }} />
            </span>
          )}
          {message && <p className="mt-1 text-[10px] text-green-700" role="status">✓ {message}</p>}
          {error && <p className="mt-1 text-[10px] text-red-700" role="alert">⚠ {error}</p>}
        </div>
      </div>
    </div>
  );
}
