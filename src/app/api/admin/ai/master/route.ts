import { NextResponse } from "next/server";
import { db } from "@/db";
import { categories, homepageSections, media, orders, products } from "@/db/schema";
import { asc, desc, sql } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import { llm } from "@/lib/ai";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type MasterAction = {
  domain: string;
  operation: string;
  summary: string;
  requiresConfirmation: boolean;
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

function parsePlan(raw: string): MasterPlan | null {
  const candidates = [
    raw.trim(),
    raw.replace(/^\s*`{3}(?:json)?\s*/i, "").replace(/\s*`{3}\s*$/i, "").trim(),
  ];
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(raw.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as Partial<MasterPlan>;
      if (!parsed || !Array.isArray(parsed.actions)) continue;
      const actions = parsed.actions.filter((action): action is MasterAction => {
        if (!action || typeof action !== "object") return false;
        const a = action as Record<string, unknown>;
        return DOMAINS.includes(String(a.domain) as (typeof DOMAINS)[number])
          && typeof a.operation === "string"
          && typeof a.summary === "string"
          && typeof a.requiresConfirmation === "boolean";
      }).slice(0, 20);
      if (!actions.length) continue;
      return {
        summary: String(parsed.summary || "SunVera Master AI plan"),
        intent: String(parsed.intent || "Multi-domain admin request"),
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
    "Any action that changes data, deletes data, changes order status, changes prices/stock, or publishes content must be requiresConfirmation=true.",
    "If the request cannot be executed safely with the connected domains yet, describe the intended action clearly but do not invent an implementation.",
    "Prefer a small number of high-value actions.",
  ].join("\n");

  const generated = await llm(system, JSON.stringify({ userInstruction: instruction, currentAdminContext: context }), { jsonMode: true });
  if (!generated) return NextResponse.json({ error: "AI provider unavailable" }, { status: 503 });

  const plan = parsePlan(generated);
  if (!plan) return NextResponse.json({ error: "AI returned an invalid Master plan" }, { status: 422 });

  return NextResponse.json({ plan });
}
