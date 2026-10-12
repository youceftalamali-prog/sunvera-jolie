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
  const rl = await rateLimit("reviews", clientIp(req), 5, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many reviews submitted. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }
  let b: { productId?: unknown; customerName?: unknown; rating?: unknown; body?: unknown };
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }
    b = parsed as typeof b;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const productId = Number(b.productId);
  const customerName = typeof b.customerName === "string" ? b.customerName.trim() : "";
  const body = typeof b.body === "string" ? b.body.trim() : "";
  const rating = Number(b.rating);
  if (!Number.isSafeInteger(productId) || productId <= 0 || !customerName || customerName.length > 120 ||
      !body || body.length > 1000 || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Provide a valid product, name, review, and rating from 1 to 5" }, { status: 400 });
  }
  try {
    const customerId = await getCustomerId();
    const verified = customerId !== null && (await hasPurchased(customerId, productId));
    await db.insert(reviews).values({ productId, customerName, rating, body, verified });
    await recalcRating(productId);
    return NextResponse.json({ ok: true, verified }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not submit the review right now" }, { status: 503 });
  }
}
