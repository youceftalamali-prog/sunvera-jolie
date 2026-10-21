"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { STATUSES, STATUS_LABEL } from "@/lib/status";
import { money } from "@/lib/format";

type Order = {
  id: number;
  reference: string;
  fullName: string;
  phone: string;
  email: string;
  wilaya: string;
  commune: string;
  address: string;
  notes: string;
  adminNotes: string;
  total: number;
  subtotal: number;
  shipping: number;
  discount: number;
  status: string;
  source: string;
  couponCode: string;
  createdAt: string;
  items: { id: number; productId: number | null; name: string; variant: string; quantity: number; unitPrice: number }[];
};

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [wilaya, setWilaya] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: "orders", q, status, wilaya });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/admin/data?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load orders");
      const d = (await res.json()) as { orders: Order[] };
      setOrders(d.orders ?? []);
    } catch {
      setMsg("Could not load orders. Refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, [q, status, wilaya, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: number, body: Record<string, unknown>) {
    const res = await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setMsg(res.ok ? "Order updated ✓" : data.error ?? "Could not update order");
    if (res.ok) void load();
  }

  const wilayas = useMemo(() => Array.from(new Set(orders.map((o) => o.wilaya))).sort(), [orders]);
  const totals = useMemo(() => ({
    orders: orders.length,
    amount: orders.reduce((sum, o) => sum + o.total, 0),
    units: orders.reduce((sum, o) => sum + o.items.reduce((n, item) => n + item.quantity, 0), 0),
  }), [orders]);

  const exportCsv = () => {
    const header = ["Reference", "Date", "Customer", "Email", "Phone", "Wilaya", "Commune", "Products", "Units", "Subtotal_DZD", "Shipping_DZD", "Discount_DZD", "Total_DZD", "Status", "Source", "Address", "Customer_Note", "Admin_Note"];
    const rows = orders.map((o) => [
      o.reference,
      new Date(o.createdAt).toISOString(),
      o.fullName,
      o.email,
      o.phone,
      o.wilaya,
      o.commune,
      o.items.map((i) => `${i.quantity} x ${i.name}${i.variant ? ` (${i.variant})` : ""}`).join(" | "),
      o.items.reduce((n, i) => n + i.quantity, 0),
      o.subtotal,
      o.shipping,
      o.discount,
      o.total,
      o.status,
      o.source,
      o.address,
      o.notes,
      o.adminNotes,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sunvera-orders-${from || "all"}-${to || "dates"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="font-display text-2xl">Orders & Sales</h1>
          <p className="mt-1 text-xs text-[var(--svj-muted)]">Spreadsheet-style order register with customer and line-item details.</p>
        </div>
        <button onClick={exportCsv} className="btn-outline ms-auto !py-2">Export Excel-compatible CSV</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="border border-[var(--svj-border)] bg-white p-4"><p className="label">Filtered orders</p><p className="mt-1 text-2xl font-semibold">{totals.orders}</p></div>
        <div className="border border-[var(--svj-border)] bg-white p-4"><p className="label">Order value</p><p className="mt-1 text-2xl font-semibold">{money(totals.amount)}</p></div>
        <div className="border border-[var(--svj-border)] bg-white p-4"><p className="label">Units ordered</p><p className="mt-1 text-2xl font-semibold">{totals.units}</p></div>
      </div>

      <div className="grid gap-3 border border-[var(--svj-border)] bg-white p-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className="block"><span className="label">Search customer / order / product</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, phone, reference…" className="inp !py-2 text-xs" /></label>
        <label className="block"><span className="label">Status</span><select value={status} onChange={(e) => setStatus(e.target.value)} className="inp !py-2 text-xs"><option value="all">All statuses</option>{[...STATUSES, "returned"].map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}</select></label>
        <label className="block"><span className="label">Wilaya</span><select value={wilaya} onChange={(e) => setWilaya(e.target.value)} className="inp !py-2 text-xs"><option value="">All wilayas</option>{wilayas.map((w) => <option key={w} value={w}>{w}</option>)}</select></label>
        <label className="block"><span className="label">From date</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="inp !py-2 text-xs" /></label>
        <label className="block"><span className="label">To date</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="inp !py-2 text-xs" /></label>
      </div>

      {msg && <p role="status" className="border border-[var(--svj-border)] bg-white p-3 text-xs">{msg}</p>}

      <div className="overflow-x-auto border border-[var(--svj-border)] bg-white">
        <table className="w-full min-w-[1450px] border-collapse text-left text-xs">
          <thead className="bg-[#f8f4ed] text-[10px] uppercase tracking-wider text-[var(--svj-muted)]">
            <tr>{["Order / Date", "Customer", "Email", "Phone", "Location", "Products / Qty", "Subtotal", "Delivery", "Discount", "Final total", "Status", "Details"].map((label) => <th key={label} className="border-b border-[var(--svj-border)] px-3 py-3 font-medium">{label}</th>)}</tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <Fragment key={o.id}>
                <tr key={o.id} className="align-top hover:bg-[#fcfaf6]">
                  <td className="border-b border-[var(--svj-border)] px-3 py-3"><button onClick={() => setOpen(open === o.id ? null : o.id)} className="font-semibold underline">{o.reference}</button><p className="mt-1 whitespace-nowrap text-[10px] text-[var(--svj-muted)]">{new Date(o.createdAt).toLocaleString()}</p></td>
                  <td className="border-b border-[var(--svj-border)] px-3 py-3 font-medium">{o.fullName}</td>
                  <td className="border-b border-[var(--svj-border)] px-3 py-3">{o.email || "—"}</td>
                  <td className="border-b border-[var(--svj-border)] px-3 py-3 whitespace-nowrap">{o.phone}</td>
                  <td className="border-b border-[var(--svj-border)] px-3 py-3">{o.wilaya}{o.commune ? `, ${o.commune}` : ""}</td>
                  <td className="max-w-[260px] border-b border-[var(--svj-border)] px-3 py-3">{o.items.map((i) => <p key={i.id} className="mb-1">{i.quantity} × {i.name}{i.variant ? ` · ${i.variant}` : ""}<span className="block text-[10px] text-[var(--svj-muted)]">{money(i.unitPrice)} each · {money(i.unitPrice * i.quantity)}</span></p>)}</td>
                  <td className="border-b border-[var(--svj-border)] px-3 py-3 whitespace-nowrap">{money(o.subtotal)}</td>
                  <td className="border-b border-[var(--svj-border)] px-3 py-3 whitespace-nowrap">{money(o.shipping)}</td>
                  <td className="border-b border-[var(--svj-border)] px-3 py-3 whitespace-nowrap">{money(o.discount)}</td>
                  <td className="border-b border-[var(--svj-border)] px-3 py-3 whitespace-nowrap font-semibold">{money(o.total)}</td>
                  <td className="border-b border-[var(--svj-border)] px-3 py-3"><select value={o.status} onChange={(e) => patch(o.id, { status: e.target.value })} aria-label={`Status of ${o.reference}`} className="inp !w-auto !min-w-[130px] !py-1 text-[11px]">{[...STATUSES, "returned"].map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}</select></td>
                  <td className="border-b border-[var(--svj-border)] px-3 py-3"><button onClick={() => setOpen(open === o.id ? null : o.id)} className="underline">{open === o.id ? "Hide" : "View"}</button></td>
                </tr>
                {open === o.id && <tr key={`${o.id}-details`}><td colSpan={12} className="border-b border-[var(--svj-border)] bg-[#fcfaf6] p-4"><div className="grid gap-4 md:grid-cols-3"><div><p className="label">Delivery address</p><p className="mt-1">{o.address}, {o.commune}, {o.wilaya}</p><p className="mt-2 text-[var(--svj-muted)]">Source: {o.source || "direct"}</p><p className="text-[var(--svj-muted)]">Coupon: {o.couponCode || "—"}</p></div><div><p className="label">Customer note</p><p className="mt-1">{o.notes || "—"}</p></div><div><label className="label" htmlFor={`notes-${o.id}`}>Internal accounting / admin note</label><textarea id={`notes-${o.id}`} rows={3} defaultValue={o.adminNotes} onBlur={(e) => patch(o.id, { adminNotes: e.target.value })} className="inp text-[11px]" /></div></div><div className="mt-3 flex flex-wrap gap-2">{["confirmed", "processing", "shipped", "out_for_delivery", "delivered", "cancelled", "returned"].map((s) => <button key={s} onClick={() => patch(o.id, { status: s })} className="border border-[var(--svj-border)] px-2 py-1 text-[10px]">{STATUS_LABEL[s] ?? s}</button>)}</div></td></tr>}
              </Fragment>
            ))}
          </tbody>
          {orders.length > 0 && <tfoot className="bg-[#f8f4ed] font-semibold"><tr><td colSpan={6} className="px-3 py-3">TOTALS FOR FILTERED ORDERS</td><td className="px-3 py-3">{money(orders.reduce((s, o) => s + o.subtotal, 0))}</td><td className="px-3 py-3">{money(orders.reduce((s, o) => s + o.shipping, 0))}</td><td className="px-3 py-3">{money(orders.reduce((s, o) => s + o.discount, 0))}</td><td className="px-3 py-3">{money(totals.amount)}</td><td colSpan={2} /></tr></tfoot>}
        </table>
        {loading && <p className="p-6 text-center text-xs text-[var(--svj-muted)]">Loading orders…</p>}
        {!loading && orders.length === 0 && <p className="p-8 text-center text-xs text-[var(--svj-muted)]">No orders match these filters.</p>}
      </div>
    </div>
  );
}
