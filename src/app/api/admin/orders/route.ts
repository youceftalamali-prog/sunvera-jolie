import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import { STATUSES } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, status, adminNotes } = (await req.json()) as { id?: number; status?: string; adminNotes?: string };
  if (!id) return NextResponse.json({ error: "Order id is required" }, { status: 400 });
  if (status && !STATUSES.includes(status as (typeof STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if (status) patch.status = status;
  if (adminNotes !== undefined) patch.adminNotes = adminNotes;
  const [updated] = await db.update(orders).set(patch).where(eq(orders.id, id)).returning();
  return NextResponse.json({ order: updated });
}
