import { NextResponse } from "next/server";
import { db } from "@/db";
import { orderItems, orders, reviews } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { recalcRating } from "@/lib/queries";
import { getCustomerId } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// A review is "verified" only when the logged-in customer actually bought this product
// in a non-cancelled order. Being logged in is not enough.
async function hasPurchased(customerId: number, productId: number): Promise<boolean> {
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.customerId, customerId),
        ne(orders.status, "cancelled"),
        eq(orderItems.productId, productId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function POST(req: Request) {
  const rl = rateLimit("reviews", clientIp(req), 5, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many reviews submitted. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }
  const b = (await req.json()) as {
    productId?: number;
    customerName?: string;
    rating?: number;
    body?: string;
  };
  if (!b.productId || !b.customerName || !b.body || !b.rating) {
    return NextResponse.json({ error: "All review fields are required" }, { status: 400 });
  }
  const customerId = await getCustomerId();
  const verified = customerId !== null && (await hasPurchased(customerId, b.productId));
  await db.insert(reviews).values({
    productId: b.productId,
    customerName: b.customerName,
    rating: Math.max(1, Math.min(5, Math.round(b.rating))),
    body: b.body.slice(0, 1000),
    verified,
  });
  await recalcRating(b.productId);
  return NextResponse.json({ ok: true, verified }, { status: 201 });
}
