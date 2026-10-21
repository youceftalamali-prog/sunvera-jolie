import { NextResponse } from "next/server";
import { db } from "@/db";
import { customers, media, orderItems, orders, products } from "@/db/schema";
import { desc, ilike, isNull, or } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

function normalizePhone(phone: string) {
  return phone.replace(/\\D/g, "");
}

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
    const [registered, allOrders, allItems] = await Promise.all([
      db.select().from(customers).orderBy(desc(customers.id)).limit(1000),
      db.select().from(orders).orderBy(desc(orders.createdAt)),
      db.select().from(orderItems),
    ]);

    const itemRowsByOrder = new Map<number, typeof allItems>();
    for (const item of allItems) {
      const existing = itemRowsByOrder.get(item.orderId) ?? [];
      existing.push(item);
      itemRowsByOrder.set(item.orderId, existing);
    }

    const registeredByPhone = new Map<string, (typeof registered)[number]>();
    for (const customer of registered) {
      const phone = normalizePhone(customer.phone);
      if (phone) registeredByPhone.set(phone, customer);
    }

    const buildPurchase = (order: (typeof allOrders)[number]) => ({
      id: order.id,
      reference: order.reference,
      createdAt: order.createdAt.toISOString(),
      status: order.status,
      total: order.total,
      subtotal: order.subtotal,
      shipping: order.shipping,
      discount: order.discount,
      wilaya: order.wilaya,
      commune: order.commune,
      address: order.address,
      items: (itemRowsByOrder.get(order.id) ?? []).map((item) => ({
        name: item.name,
        variant: item.variant,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.unitPrice * item.quantity,
      })),
    });

    const matchedOrders = new Set<number>();
    const customerRows = registered.map((customer) => {
      const phone = normalizePhone(customer.phone);
      const mine = allOrders.filter((order) =>
        order.customerId === customer.id || (phone !== "" && normalizePhone(order.phone) === phone),
      );
      for (const order of mine) matchedOrders.add(order.id);
      const purchases = mine.map(buildPurchase);
      const last = mine[0];
      return {
        id: customer.id,
        fullName: customer.fullName,
        phone: customer.phone,
        email: customer.email || last?.email || "",
        createdAt: customer.createdAt.toISOString(),
        accountType: "Registered",
        orders: mine.length,
        spent: mine.reduce((sum, order) => sum + order.total, 0),
        lastOrder: last ? last.createdAt.toISOString() : null,
        lastAddress: last ? `${last.address}, ${last.commune} ${last.wilaya}` : "",
        purchases,
      };
    });

    const guestGroups = new Map<string, (typeof allOrders)>();
    for (const order of allOrders) {
      if (matchedOrders.has(order.id)) continue;
      const phone = normalizePhone(order.phone);
      const key = phone ? `phone:${phone}` : order.email ? `email:${order.email.trim().toLowerCase()}` : `order:${order.id}`;
      const group = guestGroups.get(key) ?? [];
      group.push(order);
      guestGroups.set(key, group);
    }

    for (const group of guestGroups.values()) {
      const latest = group[0];
      const purchases = group.map(buildPurchase);
      customerRows.push({
        id: -latest.id,
        fullName: latest.fullName,
        phone: latest.phone,
        email: latest.email,
        createdAt: latest.createdAt.toISOString(),
        accountType: "Guest checkout",
        orders: group.length,
        spent: group.reduce((sum, order) => sum + order.total, 0),
        lastOrder: latest.createdAt.toISOString(),
        lastAddress: `${latest.address}, ${latest.commune} ${latest.wilaya}`,
        purchases,
      });
    }

    const query = q.toLowerCase();
    const filtered = customerRows
      .filter((customer) => {
        if (!query) return true;
        const purchaseText = customer.purchases
          .flatMap((purchase) => [purchase.reference, purchase.status, ...purchase.items.map((item) => item.name)])
          .join(" ");
        return `${customer.fullName} ${customer.phone} ${customer.email} ${customer.lastAddress} ${purchaseText}`
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => (b.lastOrder ? Date.parse(b.lastOrder) : 0) - (a.lastOrder ? Date.parse(a.lastOrder) : 0))
      .slice(0, 1000);

    return NextResponse.json({ customers: filtered });
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
