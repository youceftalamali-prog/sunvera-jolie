"use client";

import { useCallback, useEffect, useState } from "react";
import { STATUSES, STATUS_LABEL } from "@/lib/status";
import { money } from "@/lib/format";

type Order = {
  id: number;
  reference: string;
  fullName: string;
  phone: string;
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
  items: { id: number; name: string; variant: string; quantity: number; unitPrice: number }[];
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [wilaya, setWilaya] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ type: "orders", q, status, wilaya });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`/api/admin/data?${params.toString()}`);
    const d = (await res.json()) as { orders: Order[] };
    setOrders(d.orders ?? []);
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
    setMsg(res.ok ? "Order updated ✓" : "Could not update order");
    void load();
  }

  const exportCsv = () => {
    const header = "reference,date,customer,phone,wilaya,commune,total,status,source\n";
    const rows = orders
      .map((o) => [o.reference, new Date(o.createdAt).toISOString(), o.fullName, o.phone, o.wilaya, o.commune, o.total, o.status, o.source].join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([header + rows], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "sunvera-orders.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const wilayas = Array.from(new Set(orders.map((o) => o.wilaya))).sort();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl">Orders</h1>
        <p className="text-[11px] text-[var(--svj-muted)]">{orders.length} orders</p>
        <button onClick={exportCsv} className="btn-outline ms-auto !py-2">Export CSV</button>
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-white p-4">
        <label className="block">
          <span className="label">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, name, phone, address…" className="inp !py-2 text-xs" />
        </label>
        <label className="block">
          <span className="label">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="inp !py-2 text-xs">
            <option value="all">All</option>
            {[...STATUSES, "returned"].map((s) => (<option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>))}
          </select>
        </label>
        <label className="block">
          <span className="label">Wilaya</span>
          <select value={wilaya} onChange={(e) => setWilaya(e.target.value)} className="inp !py-2 text-xs">
            <option value="">All</option>
            {wilayas.map((w) => (<option key={w} value={w}>{w}</option>))}
          </select>
        </label>
        <label className="block">
          <span className="label">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="inp !py-2 text-xs" />
        </label>
        <label className="block">
          <span className="label">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="inp !py-2 text-xs" />
        </label>
      </div>

      {msg && <p className="border border-green-200 bg-green-50 p-3 text-[12px] text-green-800">{msg}</p>}

      <ul className="space-y-3">
        {orders.map((o) => (
          <li key={o.id} className="bg-white p-4">
            <div className="flex flex-wrap items-center gap-3 text-[12px]">
              <button onClick={() => setOpen(open === o.id ? null : o.id)} className="font-medium underline">{o.reference}</button>
              <span>{o.fullName}</span>
              <span className="text-[var(--svj-muted)]">{o.phone}</span>
              <span className="text-[var(--svj-muted)]">{o.wilaya}{o.commune ? `, ${o.commune}` : ""}</span>
              <span className="capitalize text-[var(--svj-muted)]">{o.source}</span>
              <span className="ms-auto font-semibold">{money(o.total)}</span>
              <select
                value={o.status}
                onChange={(e) => patch(o.id, { status: e.target.value })}
                aria-label={`Status of ${o.reference}`}
                className="inp !w-auto !py-1 text-[11px]"
              >
                {[...STATUSES, "returned"].map((s) => (<option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>))}
              </select>
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
              {["confirmed", "processing", "shipped", "out_for_delivery", "delivered", "cancelled", "returned"].map((s) => (
                <button key={s} onClick={() => patch(o.id, { status: s })} className="border border-[var(--svj-border)] px-2 py-1">
                  {STATUS_LABEL[s] ?? s}
                </button>
              ))}
            </div>

            {open === o.id && (
              <div className="mt-3 grid gap-4 border-t border-[var(--svj-border)] pt-3 text-[11px] sm:grid-cols-2">
                <div>
                  <p className="font-semibold uppercase tracking-widest text-[var(--svj-muted)]">Items</p>
                  <ul className="mt-1 space-y-1">
                    {o.items.map((i) => (
                      <li key={i.id}>{i.quantity} × {i.name} ({i.variant}) — {money(i.unitPrice * i.quantity)}</li>
                    ))}
                  </ul>
                  <p className="mt-2">Subtotal {money(o.subtotal)} · Delivery {money(o.shipping)} · Discount {money(o.discount)}
                    {o.couponCode ? ` (${o.couponCode})` : ""}</p>
                  <p className="mt-2">Address: {o.address}</p>
                  {o.notes && <p className="mt-1">Customer note: {o.notes}</p>}
                  <p className="mt-1 text-[var(--svj-muted)]">Placed {new Date(o.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <label className="label" htmlFor={`notes-${o.id}`}>Internal admin notes</label>
                  <textarea
                    id={`notes-${o.id}`}
                    rows={4}
                    defaultValue={o.adminNotes}
                    onBlur={(e) => patch(o.id, { adminNotes: e.target.value })}
                    className="inp text-[11px]"
                  />
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {orders.length === 0 && <p className="bg-white p-8 text-center text-[12px] text-[var(--svj-muted)]">No orders match these filters.</p>}
    </div>
  );
}
