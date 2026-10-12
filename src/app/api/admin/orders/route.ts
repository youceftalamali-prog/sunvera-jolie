import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import { isAllowedStatusTransition, STATUSES } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { id?: number; status?: string; adminNotes?: string };
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { id, status, adminNotes } = body;
  if (!Number.isSafeInteger(id) || Number(id) <= 0) return NextResponse.json({ error: "A positive integer order id is required" }, { status: 400 });
  if (adminNotes !== undefined && (typeof adminNotes !== "string" || adminNotes.length > 5000)) {
    return NextResponse.json({ error: "Admin notes must be text up to 5000 characters" }, { status: 400 });
  }
  if (!status && adminNotes === undefined) return NextResponse.json({ error: "At least one field to update is required" }, { status: 400 });
  if (status && !STATUSES.includes(status as (typeof STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const [current] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, id)).limit(1);
  if (!current) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (status && !isAllowedStatusTransition(current.status, status as (typeof STATUSES)[number])) {
    return NextResponse.json(
      { error: "Invalid order status transition", from: current.status, to: status },
      { status: 409 },
    );
  }

  const patch: Record<string, unknown> = {};
  if (status) patch.status = status;
  if (adminNotes !== undefined) patch.adminNotes = adminNotes;
  const [updated] = await db.update(orders).set(patch).where(eq(orders.id, id)).returning();
  return NextResponse.json({ order: updated });
}
