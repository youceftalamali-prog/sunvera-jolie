import { NextResponse } from "next/server";
import { db } from "@/db";
import { crmActivities, crmLeadOrders, crmLeads, orders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

function normalizePhone(value: string): string {
  const digits = value.replace(/\\D/g, "");
  if (/^00213\\d{9}$/.test(digits)) return `0${digits.slice(5)}`;
  if (/^213\\d{9}$/.test(digits)) return `0${digits.slice(3)}`;
  return digits;
}

export async function POST(req: Request, context: Context) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const leadId = Number((await context.params).id);
  if (!Number.isSafeInteger(leadId) || leadId < 1) {
    return NextResponse.json({ error: "Invalid lead id" }, { status: 400 });
  }

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

  const orderId = body.orderId;
  if (typeof orderId !== "number" || !Number.isSafeInteger(orderId) || orderId < 1) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, leadId)).limit(1);
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const [order] = await db.select({
    id: orders.id,
    reference: orders.reference,
    phone: orders.phone,
    total: orders.total,
  }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const leadPhone = normalizePhone(lead.phone);
  const orderPhone = normalizePhone(order.phone);
  if (!leadPhone || leadPhone.length < 8 || leadPhone !== orderPhone) {
    return NextResponse.json(
      { error: "This order does not match the lead phone number. Update or verify the phone before linking." },
      { status: 409 },
    );
  }

  const result = await db.transaction(async (tx) => {
    const [existingManualLink] = await tx.select({
      leadId: crmLeadOrders.leadId,
    }).from(crmLeadOrders).where(eq(crmLeadOrders.orderId, orderId)).limit(1);

    if (existingManualLink) {
      return existingManualLink.leadId === leadId ? "already-linked" : "linked-to-another-lead";
    }

    const [existingLegacyLink] = await tx.select({
      id: crmLeads.id,
    }).from(crmLeads).where(eq(crmLeads.orderId, orderId)).limit(1);

    if (existingLegacyLink && existingLegacyLink.id !== leadId) return "linked-to-another-lead";

    const [link] = await tx.insert(crmLeadOrders)
      .values({ leadId, orderId })
      .onConflictDoNothing()
      .returning({ id: crmLeadOrders.id });

    if (!link) {
      const [concurrentLink] = await tx.select({
        leadId: crmLeadOrders.leadId,
      }).from(crmLeadOrders).where(eq(crmLeadOrders.orderId, orderId)).limit(1);
      return concurrentLink?.leadId === leadId ? "already-linked" : "linked-to-another-lead";
    }

    await tx.update(crmLeads)
      .set({ orderId: lead.orderId ?? orderId, updatedAt: new Date() })
      .where(eq(crmLeads.id, leadId));

    await tx.insert(crmActivities).values({
      leadId,
      channel: "system",
      direction: "internal",
      body: `Order ${order.reference} (${order.total} DZD) was manually confirmed and linked to this lead.`,
      metadata: { orderId, orderReference: order.reference, action: "manual_order_link" },
    });

    return "linked";
  });

  if (result === "linked-to-another-lead") {
    return NextResponse.json({ error: "This order is already linked to another CRM lead." }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    alreadyLinked: result === "already-linked",
    message: result === "already-linked" ? "Order is already linked to this lead." : "Order linked successfully.",
  });
}
