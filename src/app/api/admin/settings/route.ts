import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getSettingsMap, getTheme, saveSection, saveTheme, type SettingsMap } from "@/lib/settings";
import { STORAGE_MODE, storageWarning } from "@/lib/storage";

export const dynamic = "force-dynamic";

const SECTION_FIELDS: Record<(typeof SECTION_KEYS)[number], readonly string[]> = {
  store: ["name", "tagline", "logoUrl", "logoDarkUrl", "logoMobileUrl", "faviconUrl", "ogImageUrl", "logoWidth", "logoHeight", "email", "phone", "whatsapp", "address"],
  social: ["instagram", "facebook", "tiktok", "pinterest", "whatsapp"],
  announcement: ["text", "background", "textColor", "link", "active"],
  footer: ["description", "copyright", "newsletterTitle", "newsletterText"],
  newsletter: ["enabled", "imageUrl", "heading", "description", "discountCode", "buttonText"],
  checkout: ["freeShippingThreshold", "codEnabled", "codNote", "cardEnabled"],
  seo: ["siteUrl", "defaultTitle", "defaultDescription", "keywords"],
  analytics: ["metaPixelId", "tiktokPixelId", "gaMeasurementId"],
  ai: ["enabled", "model", "prompt"],
  security: ["maxUploadMb", "allowedTypes"],
};

const THEME_FIELDS = [
  "primary", "secondary", "accent", "background", "surface", "textColor", "mutedColor",
  "buttonBg", "buttonText", "borderColor", "headingFont", "bodyFont", "buttonFont",
] as const;

const NUMERIC_SECTION_FIELDS = new Set(["logoWidth", "logoHeight", "freeShippingThreshold", "maxUploadMb"]);
const BOOLEAN_SECTION_FIELDS = new Set(["active", "enabled", "codEnabled", "cardEnabled"]);

function validatePatch(section: keyof SettingsMap, patch: Record<string, unknown>) {
  const allowed = new Set(SECTION_FIELDS[section]);
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key)) return { error: "Unknown field \"" + key + "\" for " + section } as const;

    if (NUMERIC_SECTION_FIELDS.has(key)) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) return { error: "Invalid numeric value for \"" + key + "\"" } as const;
      normalized[key] = numeric;
      continue;
    }

    if (BOOLEAN_SECTION_FIELDS.has(key)) {
      if (typeof value !== "boolean") return { error: "Invalid boolean value for \"" + key + "\"" } as const;
      normalized[key] = value;
      continue;
    }

    if (typeof value !== "string") return { error: "Invalid value for \"" + key + "\"" } as const;
    normalized[key] = value;
  }

  return { patch: normalized } as const;
}

function validateThemePatch(theme: Record<string, unknown>) {
  const allowed = new Set(THEME_FIELDS);
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(theme)) {
    if (!allowed.has(key as (typeof THEME_FIELDS)[number])) return { error: "Unknown theme field \"" + key + "\"" } as const;
    if (typeof value !== "string") return { error: "Invalid theme value for \"" + key + "\"" } as const;
    normalized[key] = value;
  }

  return { patch: normalized } as const;
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [settings, theme] = await Promise.all([getSettingsMap(), getTheme()]);
  // Surfaced in Settings → Brand Assets so an admin never ships local-disk uploads by accident.
  return NextResponse.json({ settings, theme, storage: { warning: storageWarning(), mode: STORAGE_MODE() } });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json()) as { section?: keyof SettingsMap; patch?: Record<string, unknown>; theme?: Record<string, unknown> };

  if (body.theme) {
    const validation = validateThemePatch(body.theme);
    if ("error" in validation) return NextResponse.json({ error: validation.error }, { status: 400 });
    const saved = await saveTheme(validation.patch as never);
    return NextResponse.json({ ok: true, theme: saved });
  }
  if (!body.section || !body.patch) return NextResponse.json({ error: "section and patch are required" }, { status: 400 });

  const allowed = ["store", "social", "announcement", "footer", "newsletter", "checkout", "seo", "analytics", "ai", "security"] as const;
  if (!allowed.includes(body.section as (typeof allowed)[number])) {
    return NextResponse.json({ error: "Unknown section" }, { status: 400 });
  }
  const validation = validatePatch(body.section as keyof SettingsMap, body.patch);
  if ("error" in validation) return NextResponse.json({ error: validation.error }, { status: 400 });

  const saved = await saveSection(body.section, validation.patch as never);
  return NextResponse.json({ ok: true, section: body.section, value: saved });
}
