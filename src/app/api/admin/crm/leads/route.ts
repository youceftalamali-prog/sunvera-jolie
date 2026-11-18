import { NextResponse } from "next/server";
import { db } from "@/db";
import { crmLeads } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
const STAGES = ["new", "contacted", "qualified", "converted", "lost"] as const;
const SOURCES = ["manual", "whatsapp", "messenger", "facebook", "instagram", "tiktok", "website"] as const;

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const stage = params.get("stage") ?? "all";
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const rows = await db.select().from(crmLeads).orderBy(desc(crmLeads.updatedAt)).limit(1000);
  const leads = rows.filter((lead) =>
    (stage === "all" || lead.stage === stage) &&
    (!q || [lead.fullName, lead.phone, lead.email, lead.productInterest, lead.source, lead.campaign, lead.notes].join(" ").toLowerCase().includes(q))
  );
  return NextResponse.json({ leads });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    const value: unknown = await req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const productInterest = typeof body.productInterest === "string" ? body.productInterest.trim() : "";
  const source = typeof body.source === "string" && SOURCES.includes(body.source as typeof SOURCES[number]) ? body.source : "manual";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const campaign = typeof body.campaign === "string" ? body.campaign.trim() : "";
  if (!fullName || fullName.length > 160 || phone.length > 40 || email.length > 200 || productInterest.length > 200 || notes.length > 5000 || campaign.length > 200) {
    return NextResponse.json({ error: "Please provide a name and valid field lengths." }, { status: 400 });
  }
  const [lead] = await db.insert(crmLeads).values({ fullName, phone, email, productInterest, source, campaign, notes }).returning();
  return NextResponse.json({ lead }, { status: 201 });
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    const value: unknown = await req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = body.id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  const patch: Partial<typeof crmLeads.$inferInsert> = { updatedAt: new Date() };
  if (body.stage !== undefined) {
    if (typeof body.stage !== "string" || !STAGES.includes(body.stage as typeof STAGES[number])) return NextResponse.json({ error: "Invalid lead stage" }, { status: 400 });
    patch.stage = body.stage;
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== "string" || body.notes.length > 5000) return NextResponse.json({ error: "Notes are too long" }, { status: 400 });
    patch.notes = body.notes;
  }
  if (body.fullName !== undefined) {
    if (typeof body.fullName !== "string" || !body.fullName.trim() || body.fullName.length > 160) return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    patch.fullName = body.fullName.trim();
  }
  if (body.phone !== undefined) {
    if (typeof body.phone !== "string" || body.phone.length > 40) return NextResponse.json({ error: "Invalid phone" }, { status: 400 });
    patch.phone = body.phone.trim();
  }
  const [lead] = await db.update(crmLeads).set(patch).where(eq(crmLeads.id, id)).returning();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  return NextResponse.json({ lead });
}
