import { NextResponse } from "next/server";
import { db } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { reference?: unknown; phone?: unknown };
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const reference = typeof body.reference === "string" ? body.reference.trim().toUpperCase() : "";
  const phone = typeof body.phone === "string" ? body.phone.replace(/[\s()-]/g, "") : "";
  if (!reference || reference.length > 80 || !phone || phone.length > 32) {
    return NextResponse.json({ error: "A valid order number and phone are required" }, { status: 400 });
  }
  try {
    const [order] = await db.select().from(orders)
      .where(and(eq(orders.reference, reference), eq(orders.phone, phone))).limit(1);
    if (!order) return NextResponse.json({ error: "No order found with these details" }, { status: 404 });
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    // Do not expose internal notes or customer identifiers on the public tracking endpoint.
    const { adminNotes: _adminNotes, customerId: _customerId, ...publicOrder } = order;
    return NextResponse.json({ order: publicOrder, items: items.map(({ orderId: _orderId, ...item }) => item) });
  } catch {
    return NextResponse.json({ error: "Could not look up the order right now" }, { status: 503 });
  }
}
