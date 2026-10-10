"use client";

import { useCallback, useEffect, useState } from "react";
import BrandAssetField from "@/components/admin/BrandAssetField";
import { DEFAULT_UPLOAD_LIMITS, type UploadLimits } from "@/components/admin/uploadMedia";

type Theme = {
  primary: string; secondary: string; accent: string; background: string; surface: string;
  textColor: string; mutedColor: string; buttonBg: string; buttonText: string; borderColor: string;
  headingFont: string; bodyFont: string; buttonFont: string;
};
type Settings = Record<string, Record<string, unknown>>;

const SECTIONS: { key: string; label: string; fields: [string, string, string?][] }[] = [
  { key: "store", label: "Store Information", fields: [["name", "Store name"], ["tagline", "Tagline"], ["email", "Email"], ["phone", "Phone"], ["whatsapp", "WhatsApp"], ["address", "Address"]] },
  { key: "social", label: "Social Media", fields: [["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"], ["pinterest", "Pinterest"], ["whatsapp", "WhatsApp link"]] },
  { key: "announcement", label: "Announcement Bar", fields: [["text", "Text"], ["link", "Link"], ["background", "Background (hex)"], ["textColor", "Text color (hex)"]] },
  { key: "footer", label: "Footer", fields: [["description", "Footer description", "textarea"], ["copyright", "Copyright"], ["newsletterTitle", "Newsletter title"], ["newsletterText", "Newsletter text"]] },
  { key: "newsletter", label: "Newsletter Popup", fields: [["heading", "Heading"], ["description", "Description", "textarea"], ["discountCode", "Discount code"], ["buttonText", "Button text"], ["imageUrl", "Popup image URL"]] },
  { key: "checkout", label: "Checkout & Currency", fields: [["freeShippingThreshold", "Free shipping threshold (DZD)", "number"], ["codNote", "Cash on Delivery note"]] },
  { key: "seo", label: "SEO", fields: [["siteUrl", "Site URL"], ["defaultTitle", "Default title"], ["defaultDescription", "Default description", "textarea"], ["keywords", "Keywords"]] },
  { key: "analytics", label: "Analytics & Pixels", fields: [["metaPixelId", "Meta Pixel ID"], ["tiktokPixelId", "TikTok Pixel ID"], ["gaMeasurementId", "Google Analytics ID"]] },
  { key: "ai", label: "AI Assistant", fields: [
    ["provider", "Provider"],
    ["model", "Legacy fallback model"],
    ["textModel", "Text / Chat model (blank = Auto)"],
    ["visionModel", "Vision model (blank = Auto)"],
    ["imageModel", "Image model (blank = Auto)"],
    ["videoModel", "Video model (blank = Auto)"],
    ["autonomyMode", "Master AI execution mode (assisted/autonomous)"],
    ["prompt", "System prompt", "textarea"],
  ] },
  { key: "security", label: "Security & Uploads", fields: [["maxUploadMb", "Max upload size (MB)", "number"], ["allowedTypes", "Allowed MIME types"]] },
];

const FONTS = ["serif", "sans", "display", "mono"];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
  const [theme, setTheme] = useState<Theme | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState("store");
  const [storage, setStorage] = useState<{ warning: string | null; mode: string } | null>(null);
  const [limits, setLimits] = useState<UploadLimits>(DEFAULT_UPLOAD_LIMITS);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/settings");
    const d = (await res.json()) as {
      settings: Settings;
      theme: Theme;
      storage?: { warning: string | null; mode: string };
    };
    setSettings(d.settings ?? {});
    setTheme(d.theme);
    setStorage(d.storage ?? null);
    const security = d.settings?.security;
    if (security?.maxUploadMb) {
      setLimits({
        maxUploadMb: Number(security.maxUploadMb) || DEFAULT_UPLOAD_LIMITS.maxUploadMb,
        allowedTypes: String(security.allowedTypes ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSection(key: string, patch: Record<string, unknown>) {
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: key, patch }),
    });
    const d = (await res.json()) as { value?: Record<string, unknown>; error?: string };
    // Reflect the persisted section immediately so previews (brand assets, checkboxes) update.
    if (res.ok && d.value) setSettings((s) => ({ ...s, [key]: d.value as Record<string, unknown> }));
    setMsg(res.ok ? `${key} settings saved ✓` : d.error ?? "Could not save settings");
  }

  async function saveTheme(patch: Partial<Theme>) {
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: patch }),
    });
    const d = (await res.json()) as { theme: Theme };
    setTheme(d.theme);
    setMsg(res.ok ? "Theme saved ✓" : "Could not save theme");
  }

  const current = SECTIONS.find((s) => s.key === tab) ?? SECTIONS[0];

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl">Settings</h1>
      {storage?.warning && (
        <p className="border border-amber-300 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
          ⚠ <strong>Storage provider: {storage.mode}.</strong> {storage.warning}
        </p>
      )}
      {msg && <p className="border border-green-200 bg-green-50 p-3 text-[12px] text-green-800">{msg}</p>}

      <div className="flex flex-wrap gap-1 bg-white p-2">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setTab(s.key)}
            className={`px-3 py-1.5 text-[11px] uppercase tracking-widest ${tab === s.key ? "bg-[var(--svj-background)]" : "text-[var(--svj-muted)]"}`}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => setTab("brand")}
          className={`px-3 py-1.5 text-[11px] uppercase tracking-widest ${tab === "brand" ? "bg-[var(--svj-background)]" : "text-[var(--svj-muted)]"}`}
        >
          Brand Assets
        </button>
        <button
          onClick={() => setTab("theme")}
          className={`px-3 py-1.5 text-[11px] uppercase tracking-widest ${tab === "theme" ? "bg-[var(--svj-background)]" : "text-[var(--svj-muted)]"}`}
        >
          Theme & Typography
        </button>
      </div>

      {tab !== "theme" && tab !== "brand" && (
        <section className="grid gap-4 bg-white p-5 sm:grid-cols-2">
          {current.fields.map(([key, label, type]) => {
            const value = settings[current.key]?.[key];
            return (
              <label key={key} className="block">
                <span className="label">{label}</span>
                {type === "textarea" ? (
                  <textarea
                    rows={3}
                    defaultValue={String(value ?? "")}
                    onBlur={(e) => saveSection(current.key, { [key]: e.target.value })}
                    className="inp"
                  />
                ) : (
                  <input
                    type={type === "number" ? "number" : "text"}
                    defaultValue={String(value ?? "")}
                    onBlur={(e) => saveSection(current.key, { [key]: type === "number" ? Number(e.target.value) : e.target.value })}
                    className="inp"
                  />
                )}
              </label>
            );
          })}
          {current.key === "announcement" && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                defaultChecked={Boolean(settings.announcement?.active)}
                onChange={(e) => saveSection("announcement", { active: e.target.checked })}
              />
              Announcement bar active
            </label>
          )}
          {current.key === "newsletter" && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                defaultChecked={Boolean(settings.newsletter?.enabled)}
                onChange={(e) => saveSection("newsletter", { enabled: e.target.checked })}
              />
              Newsletter popup enabled
            </label>
          )}
          {current.key === "checkout" && (
            <>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  defaultChecked={Boolean(settings.checkout?.codEnabled)}
                  onChange={(e) => saveSection("checkout", { codEnabled: e.target.checked })}
                />
                Cash on Delivery enabled
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  defaultChecked={Boolean(settings.checkout?.cardEnabled)}
                  onChange={(e) => saveSection("checkout", { cardEnabled: e.target.checked })}
                />
                Card payments (architecture ready — requires Stripe/PayPal keys)
              </label>
            </>
          )}
          {current.key === "ai" && (
            <div className="flex flex-col gap-3 sm:col-span-2">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  defaultChecked={Boolean(settings.ai?.enabled)}
                  onChange={(e) => saveSection("ai", { enabled: e.target.checked })}
                />
                AI beauty assistant visible on storefront
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  defaultChecked={Boolean(settings.ai?.preferFreeModels ?? true)}
                  onChange={(e) => saveSection("ai", { preferFreeModels: e.target.checked })}
                />
                Prefer free models when Auto routing
              </label>
              <p className="text-[10px] leading-relaxed text-[var(--svj-muted)]">
                Leave a modality model blank to let SunVera AI Router choose automatically. Explicit models override Auto routing.
                Autonomous mode can edit content, media and product presentation automatically; destructive, financial, inventory and order actions remain protected.
              </p>
            </div>
          )}
        </section>
      )}

      {tab === "brand" && <BrandAssets settings={settings} limits={limits} storage={storage} onSaved={saveSection} />}

      {tab === "theme" && theme && (
        <section className="space-y-6 bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {(["primary", "secondary", "accent", "background", "surface", "textColor", "mutedColor", "buttonBg", "buttonText", "borderColor"] as (keyof Theme)[]).map((key) => (
              <label key={String(key)} className="block">
                <span className="label">{String(key)}</span>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={String(theme[key])}
                    onChange={(e) => setTheme({ ...theme, [key]: e.target.value })}
                    className="h-10 w-14 border border-[var(--svj-border)]"
                  />
                  <input
                    value={String(theme[key])}
                    onChange={(e) => setTheme({ ...theme, [key]: e.target.value })}
                    className="inp !py-2 text-xs"
                  />
                </div>
              </label>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {(["headingFont", "bodyFont", "buttonFont"] as (keyof Theme)[]).map((key) => (
              <label key={String(key)} className="block">
                <span className="label">{String(key)}</span>
                <select value={String(theme[key])} onChange={(e) => setTheme({ ...theme, [key]: e.target.value })} className="inp">
                  {FONTS.map((f) => (<option key={f} value={f}>{f}</option>))}
                </select>
              </label>
            ))}
          </div>

          <div
            className="border border-[var(--svj-border)] p-4"
            style={{
              background: theme.background,
              color: theme.textColor,
              fontFamily: theme.bodyFont === "serif" ? "Georgia, serif" : "system-ui, sans-serif",
            }}
          >
            <p style={{ fontFamily: theme.headingFont === "serif" ? "Georgia, serif" : "system-ui, sans-serif" }} className="text-xl">
              Live theme preview — {String(settings.store?.name ?? "SunVera Jolie")}
            </p>
            <p className="mt-1 text-xs" style={{ color: theme.mutedColor }}>Accent, buttons, borders and typography update instantly.</p>
            <div className="mt-3 flex gap-2">
              <span className="px-4 py-2 text-[11px] uppercase tracking-widest" style={{ background: theme.buttonBg, color: theme.buttonText }}>Primary button</span>
              <span className="px-4 py-2 text-[11px] uppercase tracking-widest" style={{ background: theme.primary, color: "#fff" }}>Accent button</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => saveTheme(theme)} className="btn-primary !py-2">Save theme</button>
            <button
              onClick={() =>
                saveTheme({
                  primary: "#c9a45c", secondary: "#e3cdbb", accent: "#c9a45c", background: "#fdfbf7", surface: "#ffffff",
                  textColor: "#3a2b22", mutedColor: "#6b5749", buttonBg: "#3a2b22", buttonText: "#fdfbf7", borderColor: "#e8ddcd",
                  headingFont: "serif", bodyFont: "sans", buttonFont: "sans",
                })
              }
              className="btn-outline !py-2"
            >
              Reset to SunVera Jolie defaults
            </button>
          </div>
          <p className="text-[11px] text-[var(--svj-muted)]">
            Colours are emitted as CSS variables (--svj-*) and consumed by every component, so nothing is hard-coded.
          </p>
        </section>
      )}
    </div>
  );
}

const BRAND_FIELDS: {
  key: "logoUrl" | "logoDarkUrl" | "logoMobileUrl" | "faviconUrl" | "ogImageUrl";
  label: string;
  hint: string;
  background: "light" | "dark";
}[] = [
  { key: "logoUrl", label: "Main logo (required)", hint: "Shown in the header and the footer. PNG or SVG-quality PNG with a transparent background, 2× the display size (≈ 400×120).", background: "light" },
  { key: "logoDarkUrl", label: "Logo for dark backgrounds", hint: "Light/monochrome variant used where the background is dark. Optional.", background: "dark" },
  { key: "logoMobileUrl", label: "Mobile logo", hint: "Compact or icon-only mark for small screens. Falls back to the main logo.", background: "light" },
  { key: "faviconUrl", label: "Favicon (required)", hint: "Square 64×64 or larger; the browser tab icon.", background: "light" },
  { key: "ogImageUrl", label: "Social sharing image", hint: "Open Graph card used by WhatsApp, Facebook and X. 1200×630 recommended.", background: "light" },
];

function BrandAssets({
  settings,
  limits,
  storage,
  onSaved,
}: {
  settings: Settings;
  limits: UploadLimits;
  storage: { warning: string | null; mode: string } | null;
  onSaved: (key: string, patch: Record<string, unknown>) => Promise<void>;
}) {
  const store = settings.store ?? {};
  const hasLogo = Boolean(store.logoUrl);

  return (
    <section className="space-y-4 bg-white p-5">
      <div>
        <h2 className="font-display text-lg">Brand assets</h2>
        <p className="mt-1 text-[11px] text-[var(--svj-muted)]">
          Pick a file from your computer — it is stored in the shared media library under the{" "}
          <strong>brand</strong> folder and its URL is saved to the store settings. No URL pasting required.
        </p>
      </div>

      {storage?.warning && (
        <p className="border border-amber-300 bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-900">
          ⚠ <strong>Storage provider: {storage.mode}.</strong> {storage.warning}
        </p>
      )}

      {!hasLogo && (
        <p className="border border-[var(--svj-border)] bg-[var(--svj-background)] p-3 text-[11px] text-[var(--svj-muted)]">
          No main logo yet — the header and footer fall back to the &ldquo;{String(store.name ?? "SUNVERA JOLIE")}&rdquo;
          text mark with the tagline. That fallback stays available even after you upload a logo and remove it again.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {BRAND_FIELDS.map((field) => (
          <BrandAssetField
            key={field.key}
            label={field.label}
            hint={field.hint}
            background={field.background}
            limits={limits}
            value={{
              url: String(store[field.key] ?? ""),
              width: field.key === "logoUrl" ? Number(store.logoWidth ?? 0) : 0,
              height: field.key === "logoUrl" ? Number(store.logoHeight ?? 0) : 0,
            }}
            onSave={async (next) => {
              const patch: Record<string, unknown> = { [field.key]: next.url };
              if (field.key === "logoUrl") {
                patch.logoWidth = next.width ?? 0;
                patch.logoHeight = next.height ?? 0;
              }
              await onSaved("store", patch);
            }}
          />
        ))}
      </div>

      <p className="text-[11px] text-[var(--svj-muted)]">
        The uploaded favicon is wired into the site metadata, and the social sharing image is used for the Open Graph
        and Twitter cards. Changes are live on the next page load.
      </p>
    </section>
  );
}
