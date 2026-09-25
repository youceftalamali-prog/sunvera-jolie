import Link from "next/link";
import { db } from "@/db";
import { customers, events, orderItems, orders, products } from "@/db/schema";
import { desc, lte, asc, eq } from "drizzle-orm";
import { money } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/status";

export const dynamic = "force-dynamic";

function startOf(unit: "day" | "week" | "month") {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (unit === "week") d.setDate(d.getDate() - 7);
  if (unit === "month") d.setMonth(d.getMonth() - 30);
  return d;
}

export default async function AdminDashboard() {
  const [allOrders, items, custs, prods, lowStock, evts] = await Promise.all([
    db.select().from(orders).orderBy(desc(orders.id)).limit(1000),
    db.select().from(orderItems),
    db.select().from(customers),
    db.select().from(products),
    db.select().from(products).where(lte(products.stock, 10)).orderBy(asc(products.stock)).limit(8),
    db.select().from(events).orderBy(desc(events.id)).limit(2000),
  ]);

  const paid = allOrders.filter((o) => o.status !== "cancelled");
  const sum = (list: typeof paid) => list.reduce((s, o) => s + o.total, 0);
  const today = paid.filter((o) => o.createdAt >= startOf("day"));
  const week = paid.filter((o) => o.createdAt >= startOf("week"));
  const month = paid.filter((o) => o.createdAt >= startOf("month"));

  const units = new Map<number, number>();
  for (const i of items) {
    if (i.productId == null) continue;
    units.set(i.productId, (units.get(i.productId) ?? 0) + i.quantity);
  }
  const topProducts = [...units.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, qty]) => ({ name: prods.find((p) => p.id === id)?.name ?? `#${id}`, qty, revenue: qty * (prods.find((p) => p.id === id)?.price ?? 0) }));

  const byWilaya = paid.reduce<Record<string, { orders: number; revenue: number }>>((acc, o) => {
    const key = o.wilaya || "—";
    acc[key] = acc[key] ?? { orders: 0, revenue: 0 };
    acc[key].orders += 1;
    acc[key].revenue += o.total;
    return acc;
  }, {});
  const wilayaRows = Object.entries(byWilaya)
    .map(([wilaya, v]) => ({ wilaya, ...v, aov: Math.round(v.revenue / Math.max(1, v.orders)) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  // 14-day revenue chart
  const days: { label: string; revenue: number; orders: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const inDay = paid.filter((o) => o.createdAt >= day && o.createdAt < next);
    days.push({ label: `${day.getDate()}/${day.getMonth() + 1}`, revenue: sum(inDay), orders: inDay.length });
  }
  const maxRevenue = Math.max(...days.map((d) => d.revenue), 1);

  const views = evts.filter((e) => e.name === "product_view").length;
  const conversion = views ? ((paid.length / views) * 100).toFixed(1) : "—";
  const counts = {
    pending: allOrders.filter((o) => o.status === "pending").length,
    delivered: allOrders.filter((o) => o.status === "delivered").length,
    cancelled: allOrders.filter((o) => o.status === "cancelled").length,
  };

  const kpis: [string, string][] = [
    ["Today's sales", money(sum(today))],
    ["This week", money(sum(week))],
    ["This month (30d)", money(sum(month))],
    ["Total revenue", money(sum(paid))],
    ["Total orders", String(allOrders.length)],
    ["Pending orders", String(counts.pending)],
    ["Delivered", String(counts.delivered)],
    ["Cancelled", String(counts.cancelled)],
    ["Customers", String(custs.length)],
    ["Products live", String(prods.filter((p) => p.status === "published").length)],
    ["Average order value", money(paid.length ? Math.round(sum(paid) / paid.length) : 0)],
    ["Conversion rate", conversion === "—" ? "—" : `${conversion}%`],
  ];

  const Card = ({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) => (
    <section className="bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--svj-muted)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Dashboard</h1>
        <p className="text-[11px] text-[var(--svj-muted)]">Live overview · {new Date().toLocaleString()}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map(([label, value]) => (
          <div key={label} className="bg-white p-4">
            <p className="text-[10px] uppercase tracking-widest text-[var(--svj-muted)]">{label}</p>
            <p className="mt-1 font-display text-xl">{value}</p>
          </div>
        ))}
      </div>

      <Card title="Revenue — last 14 days">
        <div className="flex h-40 items-end gap-1">
          {days.map((d) => (
            <div key={d.label} className="group flex flex-1 flex-col items-center justify-end gap-1" title={`${d.label}: ${money(d.revenue)} · ${d.orders} orders`}>
              <span className="text-[9px] text-[var(--svj-muted)] opacity-0 group-hover:opacity-100">{d.orders}</span>
              <div className="w-full bg-[var(--svj-primary)]" style={{ height: `${Math.max(3, (d.revenue / maxRevenue) * 120)}px` }} />
              <span className="text-[8px] text-[var(--svj-muted)]">{d.label}</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Top products">
          <ul className="space-y-2 text-xs">
            {topProducts.length === 0 && <li className="text-[var(--svj-muted)]">No sales yet.</li>}
            {topProducts.map((t) => (
              <li key={t.name} className="flex justify-between">
                <span>{t.name}</span>
                <span className="text-[var(--svj-muted)]">{t.qty} units · {money(t.revenue)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Orders by wilaya" action={<Link href="/admin/orders" className="text-[10px] underline">Manage</Link>}>
          <ul className="space-y-2 text-xs">
            {wilayaRows.length === 0 && <li className="text-[var(--svj-muted)]">No orders yet.</li>}
            {wilayaRows.map((w) => (
              <li key={w.wilaya} className="flex flex-wrap justify-between gap-1">
                <span>{w.wilaya}</span>
                <span className="text-[var(--svj-muted)]">{w.orders} orders · {money(w.revenue)} · AOV {money(w.aov)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Low stock alerts" action={<Link href="/admin/products" className="text-[10px] underline">Inventory</Link>}>
          <ul className="space-y-2 text-xs">
            {lowStock.length === 0 && <li className="text-[var(--svj-muted)]">All products are healthy.</li>}
            {lowStock.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{p.name}</span>
                <span className={p.stock <= 5 ? "text-red-700" : "text-amber-700"}>{p.stock} left</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Recent orders" action={<Link href="/admin/orders" className="text-[10px] underline">All orders</Link>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-widest text-[var(--svj-muted)]">
              <tr>{["Reference", "Customer", "Wilaya", "Total", "Status", "Date"].map((h) => (<th key={h} className="py-2">{h}</th>))}</tr>
            </thead>
            <tbody>
              {allOrders.slice(0, 8).map((o) => (
                <tr key={o.id} className="border-t border-[var(--svj-border)]">
                  <td className="py-2">{o.reference}</td>
                  <td className="py-2">{o.fullName}<br /><span className="text-[var(--svj-muted)]">{o.phone}</span></td>
                  <td className="py-2">{o.wilaya}</td>
                  <td className="py-2">{money(o.total)}</td>
                  <td className="py-2">{STATUS_LABEL[o.status]}</td>
                  <td className="py-2">{o.createdAt.toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {allOrders.length === 0 && <p className="py-6 text-center text-xs text-[var(--svj-muted)]">No orders yet.</p>}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Traffic sources (tracked events)">
          <ul className="space-y-2 text-xs">
            {["tiktok", "facebook", "instagram", "google", "direct"].map((s) => {
              const n = evts.filter((e) => e.source === s).length;
              const pct = evts.length ? Math.round((n / evts.length) * 100) : 0;
              return (
                <li key={s}>
                  <div className="flex justify-between"><span className="capitalize">{s}</span><span>{n} · {pct}%</span></div>
                  <div className="mt-1 h-1.5 w-full bg-[var(--svj-background)]">
                    <div className="h-full bg-[var(--svj-primary)]" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Quick actions">
          <div className="flex flex-wrap gap-2 text-xs">
            <Link href="/admin/products/new" className="btn-primary !py-2">+ New product</Link>
            <Link href="/admin/content/homepage" className="btn-outline !py-2">Edit homepage</Link>
            <Link href="/admin/media" className="btn-outline !py-2">Media library</Link>
            <Link href="/admin/settings" className="btn-outline !py-2">Store settings</Link>
            <Link href="/admin/shipping" className="btn-outline !py-2">Shipping rates</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
