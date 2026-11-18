import { NextResponse } from "next/server";
import { db } from "@/db";
import { crmLeads, orders } from "@/db/schema";
import { desc, eq, inArray, or, sql } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
const STAGES = ["new", "contacted", "qualified", "converted", "lost"] as const;
const SOURCES = ["manual", "whatsapp", "messenger", "facebook", "instagram", "tiktok", "website"] as const;

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (/^00213\d{9}$/.test(digits)) return `0${digits.slice(5)}`;
  if (/^213\d{9}$/.test(digits)) return `0${digits.slice(3)}`;
  return digits;
}

const normalizedOrderPhone = sql<string>`CASE
  WHEN regexp_replace(${orders.phone}, '[^0-9]', '', 'g') ~ '^00213[0-9]{9}

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const stage = params.get("stage") ?? "all";
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const rows = await db.select().from(crmLeads).orderBy(desc(crmLeads.updatedAt)).limit(1000);

  const phoneKeys = [...new Set(rows.map((lead) => normalizePhone(lead.phone)).filter((phone) => phone.length >= 8))];
  const orderIds = [...new Set(rows.map((lead) => lead.orderId).filter((id): id is number => typeof id === "number"))];
  const customerIds = [...new Set(rows.map((lead) => lead.customerId).filter((id): id is number => typeof id === "number"))];
  const orderConditions = [];
  if (orderIds.length) orderConditions.push(inArray(orders.id, orderIds));
  if (customerIds.length) orderConditions.push(inArray(orders.customerId, customerIds));
  if (phoneKeys.length) {
    orderConditions.push(inArray(normalizedOrderPhone, phoneKeys));
  }

  const relatedOrders = orderConditions.length
    ? await db
        .select({
          id: orders.id,
          reference: orders.reference,
          customerId: orders.customerId,
          phone: orders.phone,
          status: orders.status,
          total: orders.total,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(or(...orderConditions))
        .orderBy(desc(orders.createdAt))
        .limit(5000)
    : [];

  const enriched = rows.map((lead) => {
    const phone = normalizePhone(lead.phone);
    const leadOrders = relatedOrders.filter((order) =>
      lead.orderId === order.id || (lead.customerId !== null && lead.customerId === order.customerId)
    );
    const linkedOrderIds = new Set(leadOrders.map((order) => order.id));
    const phoneMatches =
      phone.length >= 8
        ? relatedOrders.filter((order) => normalizePhone(order.phone) === phone && !linkedOrderIds.has(order.id))
        : [];

    return {
      ...lead,
      linkedOrders: leadOrders.slice(0, 10).map((order) => ({
        id: order.id,
        reference: order.reference,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
      })),
      phoneMatches: phoneMatches.slice(0, 10).map((order) => ({
        id: order.id,
        reference: order.reference,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
      })),
    };
  });

  const leads = enriched.filter((lead) => {
    if (stage !== "all" && lead.stage !== stage) return false;
    if (!q) return true;
    const orderReferences = [...lead.linkedOrders, ...lead.phoneMatches].map((order) => order.reference).join(" ");
    return [
      lead.fullName, lead.phone, lead.email, lead.productInterest, lead.source,
      lead.campaign, lead.notes, orderReferences,
    ].join(" ").toLowerCase().includes(q);
  });

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

function buildLeadPatch(body: Record<string, unknown>): { patch: Partial<typeof crmLeads.$inferInsert>; error?: never } | { patch?: never; error: string } {
  const patch: Partial<typeof crmLeads.$inferInsert> = { updatedAt: new Date() };

  if (body.stage !== undefined && (typeof body.stage !== "string" || !STAGES.includes(body.stage as typeof STAGES[number]))) {
    return { error: "Invalid lead stage" };
  }
  if (typeof body.stage === "string") patch.stage = body.stage;

  if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > 5000)) {
    return { error: "Notes are too long" };
  }
  if (typeof body.notes === "string") patch.notes = body.notes;

  if (body.fullName !== undefined && (typeof body.fullName !== "string" || !body.fullName.trim() || body.fullName.length > 160)) {
    return { error: "Invalid name" };
  }
  if (typeof body.fullName === "string") patch.fullName = body.fullName.trim();

  if (body.phone !== undefined && (typeof body.phone !== "string" || body.phone.length > 40)) {
    return { error: "Invalid phone" };
  }
  if (typeof body.phone === "string") patch.phone = body.phone.trim();

  return { patch };
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const value: unknown = await req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  const result = buildLeadPatch(body);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  const [lead] = await db.update(crmLeads).set(result.patch!).where(eq(crmLeads.id, id)).returning();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  return NextResponse.json({ lead });
}

    THEN '0' || substring(regexp_replace(${orders.phone}, '[^0-9]', '', 'g') from 6)
  WHEN regexp_replace(${orders.phone}, '[^0-9]', '', 'g') ~ '^213[0-9]{9}

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const stage = params.get("stage") ?? "all";
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const rows = await db.select().from(crmLeads).orderBy(desc(crmLeads.updatedAt)).limit(1000);

  const phoneKeys = [...new Set(rows.map((lead) => normalizePhone(lead.phone)).filter((phone) => phone.length >= 8))];
  const orderIds = [...new Set(rows.map((lead) => lead.orderId).filter((id): id is number => typeof id === "number"))];
  const customerIds = [...new Set(rows.map((lead) => lead.customerId).filter((id): id is number => typeof id === "number"))];
  const orderConditions = [];
  if (orderIds.length) orderConditions.push(inArray(orders.id, orderIds));
  if (customerIds.length) orderConditions.push(inArray(orders.customerId, customerIds));
  if (phoneKeys.length) {
    orderConditions.push(inArray(sql`regexp_replace(${orders.phone}, '[^0-9]', '', 'g')`, phoneKeys));
  }

  const relatedOrders = orderConditions.length
    ? await db
        .select({
          id: orders.id,
          reference: orders.reference,
          customerId: orders.customerId,
          phone: orders.phone,
          status: orders.status,
          total: orders.total,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(or(...orderConditions))
        .orderBy(desc(orders.createdAt))
        .limit(5000)
    : [];

  const enriched = rows.map((lead) => {
    const phone = normalizePhone(lead.phone);
    const leadOrders = relatedOrders.filter((order) =>
      lead.orderId === order.id || (lead.customerId !== null && lead.customerId === order.customerId)
    );
    const linkedOrderIds = new Set(leadOrders.map((order) => order.id));
    const phoneMatches =
      phone.length >= 8
        ? relatedOrders.filter((order) => normalizePhone(order.phone) === phone && !linkedOrderIds.has(order.id))
        : [];

    return {
      ...lead,
      linkedOrders: leadOrders.slice(0, 10).map((order) => ({
        id: order.id,
        reference: order.reference,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
      })),
      phoneMatches: phoneMatches.slice(0, 10).map((order) => ({
        id: order.id,
        reference: order.reference,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
      })),
    };
  });

  const leads = enriched.filter((lead) => {
    if (stage !== "all" && lead.stage !== stage) return false;
    if (!q) return true;
    const orderReferences = [...lead.linkedOrders, ...lead.phoneMatches].map((order) => order.reference).join(" ");
    return [
      lead.fullName, lead.phone, lead.email, lead.productInterest, lead.source,
      lead.campaign, lead.notes, orderReferences,
    ].join(" ").toLowerCase().includes(q);
  });

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

function buildLeadPatch(body: Record<string, unknown>): { patch: Partial<typeof crmLeads.$inferInsert>; error?: never } | { patch?: never; error: string } {
  const patch: Partial<typeof crmLeads.$inferInsert> = { updatedAt: new Date() };

  if (body.stage !== undefined && (typeof body.stage !== "string" || !STAGES.includes(body.stage as typeof STAGES[number]))) {
    return { error: "Invalid lead stage" };
  }
  if (typeof body.stage === "string") patch.stage = body.stage;

  if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > 5000)) {
    return { error: "Notes are too long" };
  }
  if (typeof body.notes === "string") patch.notes = body.notes;

  if (body.fullName !== undefined && (typeof body.fullName !== "string" || !body.fullName.trim() || body.fullName.length > 160)) {
    return { error: "Invalid name" };
  }
  if (typeof body.fullName === "string") patch.fullName = body.fullName.trim();

  if (body.phone !== undefined && (typeof body.phone !== "string" || body.phone.length > 40)) {
    return { error: "Invalid phone" };
  }
  if (typeof body.phone === "string") patch.phone = body.phone.trim();

  return { patch };
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const value: unknown = await req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  const result = buildLeadPatch(body);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  const [lead] = await db.update(crmLeads).set(result.patch!).where(eq(crmLeads.id, id)).returning();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  return NextResponse.json({ lead });
}

    THEN '0' || substring(regexp_replace(${orders.phone}, '[^0-9]', '', 'g') from 4)
  ELSE regexp_replace(${orders.phone}, '[^0-9]', '', 'g')
END`;

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const stage = params.get("stage") ?? "all";
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const rows = await db.select().from(crmLeads).orderBy(desc(crmLeads.updatedAt)).limit(1000);

  const phoneKeys = [...new Set(rows.map((lead) => normalizePhone(lead.phone)).filter((phone) => phone.length >= 8))];
  const orderIds = [...new Set(rows.map((lead) => lead.orderId).filter((id): id is number => typeof id === "number"))];
  const customerIds = [...new Set(rows.map((lead) => lead.customerId).filter((id): id is number => typeof id === "number"))];
  const orderConditions = [];
  if (orderIds.length) orderConditions.push(inArray(orders.id, orderIds));
  if (customerIds.length) orderConditions.push(inArray(orders.customerId, customerIds));
  if (phoneKeys.length) {
    orderConditions.push(inArray(sql`regexp_replace(${orders.phone}, '[^0-9]', '', 'g')`, phoneKeys));
  }

  const relatedOrders = orderConditions.length
    ? await db
        .select({
          id: orders.id,
          reference: orders.reference,
          customerId: orders.customerId,
          phone: orders.phone,
          status: orders.status,
          total: orders.total,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(or(...orderConditions))
        .orderBy(desc(orders.createdAt))
        .limit(5000)
    : [];

  const enriched = rows.map((lead) => {
    const phone = normalizePhone(lead.phone);
    const leadOrders = relatedOrders.filter((order) =>
      lead.orderId === order.id || (lead.customerId !== null && lead.customerId === order.customerId)
    );
    const linkedOrderIds = new Set(leadOrders.map((order) => order.id));
    const phoneMatches =
      phone.length >= 8
        ? relatedOrders.filter((order) => normalizePhone(order.phone) === phone && !linkedOrderIds.has(order.id))
        : [];

    return {
      ...lead,
      linkedOrders: leadOrders.slice(0, 10).map((order) => ({
        id: order.id,
        reference: order.reference,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
      })),
      phoneMatches: phoneMatches.slice(0, 10).map((order) => ({
        id: order.id,
        reference: order.reference,
        status: order.status,
        total: order.total,
        createdAt: order.createdAt,
      })),
    };
  });

  const leads = enriched.filter((lead) => {
    if (stage !== "all" && lead.stage !== stage) return false;
    if (!q) return true;
    const orderReferences = [...lead.linkedOrders, ...lead.phoneMatches].map((order) => order.reference).join(" ");
    return [
      lead.fullName, lead.phone, lead.email, lead.productInterest, lead.source,
      lead.campaign, lead.notes, orderReferences,
    ].join(" ").toLowerCase().includes(q);
  });

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

function buildLeadPatch(body: Record<string, unknown>): { patch: Partial<typeof crmLeads.$inferInsert>; error?: never } | { patch?: never; error: string } {
  const patch: Partial<typeof crmLeads.$inferInsert> = { updatedAt: new Date() };

  if (body.stage !== undefined && (typeof body.stage !== "string" || !STAGES.includes(body.stage as typeof STAGES[number]))) {
    return { error: "Invalid lead stage" };
  }
  if (typeof body.stage === "string") patch.stage = body.stage;

  if (body.notes !== undefined && (typeof body.notes !== "string" || body.notes.length > 5000)) {
    return { error: "Notes are too long" };
  }
  if (typeof body.notes === "string") patch.notes = body.notes;

  if (body.fullName !== undefined && (typeof body.fullName !== "string" || !body.fullName.trim() || body.fullName.length > 160)) {
    return { error: "Invalid name" };
  }
  if (typeof body.fullName === "string") patch.fullName = body.fullName.trim();

  if (body.phone !== undefined && (typeof body.phone !== "string" || body.phone.length > 40)) {
    return { error: "Invalid phone" };
  }
  if (typeof body.phone === "string") patch.phone = body.phone.trim();

  return { patch };
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    const value: unknown = await req.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    body = value as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

  const result = buildLeadPatch(body);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  const [lead] = await db.update(crmLeads).set(result.patch!).where(eq(crmLeads.id, id)).returning();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  return NextResponse.json({ lead });
}
