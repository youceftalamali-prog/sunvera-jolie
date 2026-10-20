import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, orderItems } from "@/db/schema";
import { and, desc, gte, inArray, lte } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

function dayStart(value: string) { return new Date(value + "T00:00:00.000Z"); }
function dayEnd(value: string) { return new Date(value + "T23:59:59.999Z"); }

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const now = new Date();
  const period = p.get("period") || "month";
  const defaultStart = new Date(now);
  if (period === "day") defaultStart.setUTCHours(0, 0, 0, 0);
  else if (period === "week") {
    defaultStart.setUTCHours(0, 0, 0, 0);
    defaultStart.setUTCDate(defaultStart.getUTCDate() - ((defaultStart.getUTCDay() + 6) % 7));
  } else if (period === "month") {
    defaultStart.setUTCHours(0, 0, 0, 0);
    defaultStart.setUTCDate(1);
  } else defaultStart.setUTCDate(defaultStart.getUTCDate() - 29);

  const from = p.get("from");
  const to = p.get("to");
  const start = from ? dayStart(from) : defaultStart;
  const end = to ? dayEnd(to) : now;
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
    return NextResponse.json({ error: "Invalid report date range" }, { status: 400 });
  }

  const conditions = [gte(orders.createdAt, start), lte(orders.createdAt, end)];
  const selected = await db.select().from(orders).where(and(...conditions)).orderBy(desc(orders.createdAt));
  const ids = selected.map(o => o.id);
  const itemRows = ids.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, ids)) : [];
  const rows = selected.map(o => ({
    id: o.id, reference: o.reference, date: o.createdAt.toISOString(),
    customer: o.fullName, phone: o.phone, email: o.email,
    wilaya: o.wilaya, commune: o.commune, address: o.address,
    status: o.status, subtotal: o.subtotal, shipping: o.shipping, discount: o.discount,
    total: o.total, paymentMethod: o.paymentMethod, source: o.source,
    items: itemRows.filter(i => i.orderId === o.id).map(i => ({
      name: i.name, variant: i.variant, quantity: i.quantity,
      unitPrice: i.unitPrice, lineTotal: i.quantity * i.unitPrice
    }))
  }));
  const delivered = selected.filter(o => o.status === "delivered");
  const sum = (list: typeof selected, key: "total" | "shipping" | "discount") => list.reduce((n, o) => n + o[key], 0);
  return NextResponse.json({
    period: { from: start.toISOString(), to: end.toISOString() },
    summary: {
      orders: selected.length,
      pending: selected.filter(o => o.status === "pending").length,
      delivered: delivered.length,
      cancelled: selected.filter(o => o.status === "cancelled").length,
      salesTotal: sum(selected, "total"),
      deliveredTotal: sum(delivered, "total"),
      shippingTotal: sum(selected, "shipping"),
      discountsTotal: sum(selected, "discount"),
      units: rows.reduce((n, o) => n + o.items.reduce((m, i) => m + i.quantity, 0), 0)
    },
    orders: rows
  });
}
