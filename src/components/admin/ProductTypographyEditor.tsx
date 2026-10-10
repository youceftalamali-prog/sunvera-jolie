"use client";

import { useState } from "react";
import type { ProductTypography } from "@/lib/product-draft";

const FONT_OPTIONS = [
  ["system", "System / Sans"],
  ["arabic", "Arabic (Noto / System)"],
  ["cairo", "Cairo"],
  ["tajawal", "Tajawal"],
  ["serif", "Elegant Serif"],
  ["playfair", "Playfair Display"],
  ["amiri", "Amiri"],
  ["mono", "Monospace"],
] as const;

const WEIGHTS = [["400", "Normal"], ["500", "Medium"], ["600", "Semi Bold"], ["700", "Bold"]] as const;
const SIZES = ["12", "14", "16", "18", "20", "24", "28", "32", "36", "40", "48", "56"];

function stack(font: ProductTypography["title"]["fontFamily"]) {
  switch (font) {
    case "arabic": return "'Noto Sans Arabic', Tahoma, Arial, sans-serif";
    case "cairo": return "Cairo, 'Noto Sans Arabic', Tahoma, sans-serif";
    case "tajawal": return "Tajawal, 'Noto Sans Arabic', Tahoma, sans-serif";
    case "serif": return "Georgia, 'Times New Roman', serif";
    case "playfair": return "'Playfair Display', Georgia, serif";
    case "amiri": return "Amiri, Georgia, serif";
    case "mono": return "ui-monospace, SFMono-Regular, monospace";
    default: return "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif";
  }
}

export function typographyStyle(value: ProductTypography["title"]) {
  return {
    fontFamily: stack(value.fontFamily),
    fontSize: value.fontSize + "px",
    fontWeight: Number(value.fontWeight),
    color: value.color,
  } as const;
}

export default function ProductTypographyEditor({
  value,
  onChange,
  label,
}: {
  value: ProductTypography["title"];
  onChange: (value: ProductTypography["title"]) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const update = <K extends keyof ProductTypography["title"]>(key: K, next: ProductTypography["title"][K]) =>
    onChange({ ...value, [key]: next });

  return (
    <div className="mt-3 border border-[var(--svj-border)] bg-[var(--svj-background)]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em]">
        <span>Typography · {label}</span><span>{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="grid gap-3 border-t border-[var(--svj-border)] p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block"><span className="label">Font</span>
            <select value={value.fontFamily} onChange={(e) => update("fontFamily", e.target.value as ProductTypography["title"]["fontFamily"])} className="inp">
              {FONT_OPTIONS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Size</span>
            <select value={String(value.fontSize)} onChange={(e) => update("fontSize", Number(e.target.value))} className="inp">
              {SIZES.map((size) => <option key={size} value={size}>{size}px</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Weight</span>
            <select value={String(value.fontWeight)} onChange={(e) => update("fontWeight", e.target.value as ProductTypography["title"]["fontWeight"])} className="inp">
              {WEIGHTS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Color</span>
            <div className="flex gap-2">
              <input type="color" value={value.color} onChange={(e) => update("color", e.target.value)} className="h-10 w-12 border border-[var(--svj-border)]" />
              <input value={value.color} onChange={(e) => update("color", e.target.value)} className="inp !py-2 text-xs" />
            </div>
          </label>
          <div className="sm:col-span-2 lg:col-span-4 border border-[var(--svj-border)] bg-white p-3">
            <p className="text-[10px] uppercase tracking-widest text-[var(--svj-muted)]">Preview</p>
            <p className="mt-2" style={typographyStyle(value)}>SunVera Jolie — {label}</p>
          </div>
        </div>
      )}
    </div>
  );
}
