import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getSettingsMap, getTheme, saveSection, saveTheme, type SettingsMap } from "@/lib/settings";
import { STORAGE_MODE, storageWarning } from "@/lib/storage";

export const dynamic = "force-dynamic";

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
