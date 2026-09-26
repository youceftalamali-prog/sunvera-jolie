import { NextResponse } from "next/server";
import { db } from "@/db";
import { homepageSections } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import { updateSection, reorderSections } from "@/lib/cms";
import { getTheme, saveTheme } from "@/lib/settings";
import { llm } from "@/lib/ai";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Action =
  | { type: "section"; sectionKey: string; patch: Record<string, unknown> }
  | { type: "typography"; sectionKey: string; patch: Record<string, unknown> }
  | { type: "settings"; sectionKey: string; patch: Record<string, unknown> }
  | { type: "theme"; patch: Record<string, unknown> }
  | { type: "reorder"; sectionKeys: string[] };

type Plan = { summary: string; actions: Action[] };

async function guard() {
  return (await isAdmin()) ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function cleanPlan(raw: string): Plan | null {
  const candidates = [
    raw.trim(),
    raw.replace(/^\\s*\\`\\`\\`(?:json)?\\s*/i, "").replace(/\\s*\\`\\`\\`\\s*$/i, "").trim(),
  ];

  const firstObject = raw.indexOf("{");
  const lastObject = raw.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    candidates.push(raw.slice(firstObject, lastObject + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Plan;
      if (!parsed || !Array.isArray(parsed.actions)) continue;
      const actions = parsed.actions
        .filter((action): action is Action => {
          if (!action || typeof action !== "object") return false;
          const type = (action as { type?: unknown }).type;
          if (!["section", "typography", "settings", "theme", "reorder"].includes(String(type))) return false;
          if (type === "reorder") return Array.isArray((action as { sectionKeys?: unknown }).sectionKeys);
          if (type === "theme") return !!(action as { patch?: unknown }).patch && typeof (action as { patch?: unknown }).patch === "object";
          return typeof (action as { sectionKey?: unknown }).sectionKey === "string"
            && !!(action as { patch?: unknown }).patch
            && typeof (action as { patch?: unknown }).patch === "object";
        })
        .slice(0, 20);

      if (!actions.length) continue;
      return {
        summary: String(parsed.summary || "Planned homepage changes"),
        actions,
      };
    } catch {
      // Try the next extraction strategy.
    }
  }

  return null;
}

export async function POST(req: Request) {
  const bad = await guard();
  if (bad) return bad;
  const rl = await rateLimit("admin-ai-design", clientIp(req), 12, 10 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Too many AI design requests. Try again later." }, { status: 429 });

  const body = (await req.json()) as { instruction?: string; apply?: boolean };
  const instruction = String(body.instruction || "").trim();
  if (!instruction) return NextResponse.json({ error: "Instruction is required" }, { status: 400 });

  const sections = await db.select().from(homepageSections).orderBy(asc(homepageSections.sortOrder));
  const theme = await getTheme();

  const generated = await llm(
    [
      "You are the SunVera Jolie Admin Design Assistant.",
      "Return ONLY valid JSON matching: {\"summary\": string, \"actions\": Action[]}.",
      "Allowed Action types:",
      "1) {type:'section', sectionKey, patch} for title, subtitle, body, buttonText, buttonUrl, button2Text, button2Url, background, textColor, textPosition, overlayOpacity, enabled, productMode, productCount, productIds.",
      "2) {type:'typography', sectionKey, patch} for headingFont, bodyFont, buttonFont, headingSize, bodySize, buttonSize, headingColor, bodyColor, buttonColor, buttonTextColor, headingWeight, letterSpacing, textShadow.",
      "3) {type:'settings', sectionKey, patch} for section-specific JSON settings such as newArrivalsMode/newArrivalsIntervalMs.",
      "4) {type:'theme', patch} for primary, secondary, accent, background, surface, textColor, mutedColor, buttonBg, buttonText, borderColor, headingFont, bodyFont, buttonFont.",
      "5) {type:'reorder', sectionKeys} to reorder existing homepage section keys.",
      "Do not invent database IDs, media URLs, product IDs, or arbitrary code changes.",
      "Use the existing section keys and existing theme options only.",
      "Prefer small, targeted changes that match the user's wording.",
      "Return valid JSON only. Do not wrap the JSON in Markdown fences or add explanations before or after it.",
    ].join("\n"),
    JSON.stringify({
      userInstruction: instruction,
      existingSections: sections.map((s) => ({ key: s.key, title: s.title, subtitle: s.subtitle, sortOrder: s.sortOrder })),
      currentTheme: theme,
    }),
    { jsonMode: true },
  );

  if (!generated) return NextResponse.json({ error: "AI provider unavailable" }, { status: 503 });
  const plan = cleanPlan(generated);
  if (!plan) return NextResponse.json({ error: "AI returned an invalid design plan" }, { status: 422 });

  if (!body.apply) return NextResponse.json({ plan, applied: false });

  for (const action of plan.actions) {
    if (action.type === "theme") {
      await saveTheme(action.patch as never);
      continue;
    }
    if (action.type === "reorder") {
      const keys = action.sectionKeys.filter(Boolean);
      const rows = await db.select({ id: homepageSections.id, key: homepageSections.key }).from(homepageSections);
      const ids = keys.map((key) => rows.find((r) => r.key === key)?.id).filter((id): id is number => Number.isInteger(id));
      if (ids.length === rows.length) await reorderSections(ids);
      continue;
    }
    const section = sections.find((s) => s.key === action.sectionKey);
    if (!section) continue;
    if (action.type === "typography") {
      await updateSection(section.id, {
        settings: {
          ...(section.settings as Record<string, unknown>),
          typography: {
            ...((section.settings as Record<string, unknown>)?.typography as Record<string, unknown> | undefined),
            ...action.patch,
          },
        },
      });
    } else if (action.type === "settings") {
      await updateSection(section.id, {
        settings: {
          ...(section.settings as Record<string, unknown>),
          ...action.patch,
        },
      });
    } else if (action.type === "section") {
      await updateSection(section.id, action.patch as never);
    }
  }

  return NextResponse.json({ plan, applied: true });
}
