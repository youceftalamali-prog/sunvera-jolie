import { NextResponse } from "next/server";
import { db } from "@/db";
import { crmActivities, crmLeads } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Context) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  const [lead] = await db.select({ id: crmLeads.id }).from(crmLeads).where(eq(crmLeads.id, id)).limit(1);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const activities = await db.select().from(crmActivities).where(eq(crmActivities.leadId, id)).orderBy(asc(crmActivities.createdAt)).limit(500);
  return NextResponse.json({ activities });
}

export async function POST(req: Request, context: Context) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    const value: unknown = await req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const message = typeof body.body === "string" ? body.body.trim() : "";
  const channels = ["note", "whatsapp", "messenger", "phone", "email", "system"];
  const directions = ["inbound", "outbound", "internal"];
  const channel = typeof body.channel === "string" && channels.includes(body.channel) ? body.channel : "note";
  const direction = typeof body.direction === "string" && directions.includes(body.direction) ? body.direction : "internal";
  if (!message || message.length > 5000) return NextResponse.json({ error: "Activity must contain 1–5000 characters" }, { status: 400 });
  const [lead] = await db.select({ id: crmLeads.id }).from(crmLeads).where(eq(crmLeads.id, id)).limit(1);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  const [activity] = await db.insert(crmActivities).values({ leadId: id, channel, direction, body: message }).returning();
  await db.update(crmLeads).set({ updatedAt: new Date(), lastContactAt: new Date() }).where(eq(crmLeads.id, id));
  return NextResponse.json({ activity }, { status: 201 });
}
