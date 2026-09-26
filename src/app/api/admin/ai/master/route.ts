import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories, homepageSections, media, orders, products } from "@/db/schema";
import { asc, desc, sql } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import { generateText } from "@/lib/ai-gateway";
import { getSettingsMap } from "@/lib/settings";
import { executeMasterPlan, type MasterExecutionPlan } from "@/lib/ai-master-tools";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type MasterAction = {
  domain: string;
  operation: string;
  summary: string;
  requiresConfirmation: boolean;
  payload: string;
};

type MasterPlan = {
  summary: string;
  intent: string;
  actions: MasterAction[];
};

const DOMAINS = ["homepage", "products", "media", "orders", "categories", "shipping", "settings"] as const;

async function buildContext() {
  const [sections, productRows, categoryRows, mediaRows, ordersByStatus, recentProducts, recentOrders] = await Promise.all([
    db.select({ key: homepageSections.key, title: homepageSections.title, enabled: homepageSections.enabled, sortOrder: homepageSections.sortOrder }).from(homepageSections).orderBy(asc(homepageSections.sortOrder)),
    db.select({ id: products.id }).from(products),
    db.select({ id: categories.id, slug: categories.slug, name: categories.name }).from(categories).orderBy(asc(categories.sortOrder)),
    db.select({ id: media.id, folder: media.folder, filename: media.filename }).from(media).orderBy(desc(media.id)).limit(50),
    db.select({ status: orders.status, count: sql.raw("count(*)::int") }).from(orders).groupBy(orders.status),
    db.select({ id: products.id, name: products.name, status: products.status, stock: products.stock, categorySlug: products.categorySlug }).from(products).orderBy(desc(products.id)).limit(12),
    db.select({ id: orders.id, reference: orders.reference, fullName: orders.fullName, status: orders.status, total: orders.total }).from(orders).orderBy(desc(orders.id)).limit(12),
  ]);

  return {
    sections,
    productsCount: productRows.length,
    categoriesCount: categoryRows.length,
    mediaCount: mediaRows.length,
    categories: categoryRows.slice(0, 50),
    recentMedia: mediaRows,
    ordersByStatus,
    recentProducts,
    recentOrders,
  };
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }
  return fallback;
}

function parsePlan(raw: string): MasterPlan | null {
  const candidates = [
    raw.trim(),
    raw.replace(/^\s*\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}\s*$/i, "").trim(),
  ];
  const firstObject = raw.indexOf("{");
  const lastObject = raw.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    candidates.push(raw.slice(firstObject, lastObject + 1));
  }
  for (const candidate of candidates) {
    try {
      const decoded = JSON.parse(candidate) as unknown;
      const parsed =
        decoded && typeof decoded === "object" && "plan" in decoded
          ? (decoded as { plan?: unknown }).plan
          : decoded;
      if (!parsed || typeof parsed !== "object") continue;
      const root = parsed as Record<string, unknown>;
      const rawActions = Array.isArray(root.actions)
        ? root.actions
        : Array.isArray(root.steps)
          ? root.steps
          : root.action && typeof root.action === "object"
            ? [root.action]
            : [];
      const actions: MasterAction[] = rawActions
        .filter((action): action is Record<string, unknown> => Boolean(action) && typeof action === "object")
        .map((action) => {
          const domainValue = String(action.domain ?? "").trim().toLowerCase();
          const operation = String(action.operation ?? action.name ?? "analyze").trim();
          const summary = String(action.summary ?? action.description ?? operation).trim();
          const mutationHint = /(?:create|add|update|edit|delete|remove|change|publish|assign|set|reorder|move|replace|تحرير|تعديل|حذف|إضافة|إنشاء|نشر|تغيير)/i.test(operation);
          return {
            domain: domainValue,
            operation,
            summary,
            requiresConfirmation: normalizeBoolean(action.requiresConfirmation, mutationHint),
            payload: typeof action.payload === "string" ? action.payload : "{}",
          };
        })
        .filter((action): action is MasterAction =>
          DOMAINS.includes(action.domain as (typeof DOMAINS)[number]) &&
          Boolean(action.operation) &&
          Boolean(action.summary),
        )
        .slice(0, 20);
      if (!actions.length) continue;
      return {
        summary: String(root.summary || "SunVera Master AI plan"),
        intent: String(root.intent || "Multi-domain admin request"),
        actions,
      };
    } catch {
      // Try the next extraction strategy.
    }
  }
  return null;
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit("admin-ai-master", clientIp(req), 12, 10 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Too many Master AI requests. Try again later." }, { status: 429 });

  const body = (await req.json()) as { instruction?: string };
  const instruction = String(body.instruction || "").trim();
  if (!instruction) return NextResponse.json({ error: "Instruction is required" }, { status: 400 });

  const context = await buildContext();
  const system = [
    "You are SunVera Jolie Master AI, the central administrator assistant for a premium Algerian beauty store.",
    "Understand one admin request and route it into a small, safe multi-domain plan.",
    "Return ONLY valid JSON: {summary:string,intent:string,actions:[{domain,operation,summary,requiresConfirmation}]}",
    "Valid domains: homepage, products, media, orders, categories, shipping, settings.",
    "Use only the provided context. Do not invent IDs, product names, order references, media IDs, or capabilities.",
    "Read-only analysis can be marked requiresConfirmation=false.",
    "The store is using controlled autonomous mode for content operations. Safe content/media/homepage/product-presentation actions can be executed automatically.",
    "Never autonomously change order status, shipping fees, prices, stock, payment settings, security settings, credentials, customers, or hard-delete/archive records. Mark those requiresConfirmation=true.",
    "For every action, put a compact JSON object as the payload string. Use ids and values from the provided context only. For actions without parameters use \"{}\".",
    "Supported autonomous operations include: products.update_content, products.attach_media, media.generate, media.edit, homepage.update_section, homepage.reorder, categories.create, categories.update.",
    "For media.generate, payload can contain prompt, folder, attachToProductId, imageType, alt, title, caption, isPrimary, aspectRatio, resolution.",
    "For media.edit, payload can contain id, prompt, title, caption, alt, aspectRatio, resolution.",
    "For products.update_content, payload can contain id and a patch of copy, SEO, presentation, status/active fields. Do not include price or stock.",
    "For homepage.update_section, payload can contain id and patch for text, media URLs, buttons, products, items, settings, or enabled state.",
    "If the request cannot be executed safely with the connected tools yet, describe the intended action and use an empty payload instead of inventing a capability.",
    "Prefer a small number of high-value actions.",
  ].join("\n");

  const generated = await generateText(
    "master_plan",
    [
      { role: "system", content: system },
      {
        role: "user",
        content: JSON.stringify({ userInstruction: instruction, currentAdminContext: context }),
      },
    ],
    {
      jsonSchema: {
        name: "sunvera_master_plan",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: { type: "string" },
            intent: { type: "string" },
            actions: {
              type: "array",
              minItems: 1,
              maxItems: 20,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  domain: { type: "string", enum: ["homepage", "products", "media", "orders", "categories", "shipping", "settings"] },
                  operation: { type: "string" },
                  summary: { type: "string" },
                  requiresConfirmation: { type: "boolean" },
                  payload: { type: "string" },
                },
                required: ["domain", "operation", "summary", "requiresConfirmation", "payload"],
              },
            },
          },
          required: ["summary", "intent", "actions"],
        },
      },
    },
  );
  if (!generated.text) return NextResponse.json({ error: "AI provider unavailable" }, { status: 503 });

  const plan = parsePlan(generated.text);
  if (!plan) return NextResponse.json({ error: "AI returned an invalid Master plan" }, { status: 422 });

  const settings = await getSettingsMap();
  const autonomyMode = settings.ai.autonomyMode === "assisted" ? "assisted" : "autonomous";
  const execution = await executeMasterPlan(plan as MasterExecutionPlan, autonomyMode);

  return NextResponse.json({
    plan,
    route: generated.route,
    autonomyMode,
    execution,
  });
}
