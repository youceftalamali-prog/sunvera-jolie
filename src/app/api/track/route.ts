import { NextResponse } from "next/server";
import { db } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { reference, phone } = (await req.json()) as { reference?: string; phone?: string };
  if (!reference || !phone) {
    return NextResponse.json({ error: "Order number and phone are required" }, { status: 400 });
  }
  const [order] = await db
    .select()
    .from(orders)
    .where(
      and(eq(orders.reference, reference.trim().toUpperCase()), eq(orders.phone, phone.replace(/\s/g, ""))),
    )
    .limit(1);
  if (!order) return NextResponse.json({ error: "No order found with these details" }, { status: 404 });
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return NextResponse.json({ order, items });
}
