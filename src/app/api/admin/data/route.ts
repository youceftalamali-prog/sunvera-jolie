import { NextResponse } from "next/server";
import { db } from "@/db";
import { customers, media, orderItems, orders, products } from "@/db/schema";
import { desc, ilike, isNull, or } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const type = p.get("type") ?? "orders";
  const q = p.get("q")?.trim() ?? "";
  const status = p.get("status")?.trim() ?? "";
  const wilaya = p.get("wilaya")?.trim() ?? "";
  const from = p.get("from");
  const to = p.get("to");

  if (type === "orders") {
    const rows = await db.select().from(orders).orderBy(desc(orders.id)).limit(500);
    const items = await db.select().from(orderItems);
    const filtered = rows.filter((o) => {
      if (status && status !== "all" && o.status !== status) return false;
      if (wilaya && o.wilaya !== wilaya) return false;
      if (from && o.createdAt < new Date(from)) return false;
      if (to && o.createdAt > new Date(`${to}T23:59:59`)) return false;
      if (q) {
        const hay = `${o.reference} ${o.fullName} ${o.phone} ${o.email} ${o.wilaya} ${o.commune} ${o.address} ${o.adminNotes} ${o.source}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
    return NextResponse.json({
      orders: filtered.map((o) => ({
        ...o,
        createdAt: o.createdAt.toISOString(),
        items: items.filter((i) => i.orderId === o.id),
      })),
    });
  }

  if (type === "customers") {
    const rows = await db
      .select()
      .from(customers)
      .where(q ? or(ilike(customers.fullName, `%${q}%`), ilike(customers.phone, `%${q}%`), ilike(customers.email, `%${q}%`)) : undefined)
      .orderBy(desc(customers.id))
      .limit(300);
    const allOrders = await db.select().from(orders);
    return NextResponse.json({
      customers: rows.map((c) => {
        const mine = allOrders.filter((o) => o.customerId === c.id);
        return {
          id: c.id,
          fullName: c.fullName,
          phone: c.phone,
          email: c.email,
          createdAt: c.createdAt.toISOString(),
          orders: mine.length,
          spent: mine.reduce((s, o) => s + o.total, 0),
          lastOrder: mine[0] ? mine[0].createdAt.toISOString() : null,
          lastAddress: mine[0] ? `${mine[0].address}, ${mine[0].commune} ${mine[0].wilaya}` : "",
        };
      }),
    });
  }

  if (type === "products") {
    const rows = await db.select().from(products).orderBy(desc(products.id)).limit(500);
    return NextResponse.json({ products: rows });
  }

  if (type === "media") {
    const rows = await db.select().from(media).orderBy(desc(media.id)).limit(300);
    return NextResponse.json({ media: rows });
  }

  if (type === "guests") {
    const rows = await db.select().from(orders).where(isNull(orders.customerId)).orderBy(desc(orders.id));
    return NextResponse.json({ rows });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
