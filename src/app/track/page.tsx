"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { money } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/status";

const FLOW = ["confirmed", "processing", "shipped", "out_for_delivery", "delivered"];

type TrackedOrder = {
  reference: string;
  status: string;
  total: number;
  wilaya: string;
  commune: string;
  createdAt: string;
};
type Item = { id: number; name: string; variant: string; quantity: number; unitPrice: number };

function TrackInner() {
  const sp = useSearchParams();
  const [ref, setRef] = useState(sp.get("ref") ?? "");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const r = sp.get("ref");
    if (r) setRef(r);
  }, [sp]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res = await fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference: ref, phone }),
    });
    const d = (await res.json()) as { order?: TrackedOrder; items?: Item[]; error?: string };
    if (!res.ok || !d.order) {
      setOrder(null);
      setErr(d.error ?? "Order not found");
      return;
    }
    setOrder(d.order);
    setItems(d.items ?? []);
  }

  const stage = order ? Math.max(0, FLOW.indexOf(order.status === "pending" ? "confirmed" : order.status)) : -1;

  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-3xl">Track My Order</h1>
      <p className="mt-2 text-sm text-cocoa-soft">Enter your order number and the phone number you used.</p>

      <form onSubmit={submit} className="mt-6 grid gap-4 border border-cocoa/10 bg-white p-6 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="tr-ref">Order Number</label>
          <input id="tr-ref" required value={ref} onChange={(e) => setRef(e.target.value)} placeholder="SVJ-XXXXXXXX" className="inp" />
        </div>
        <div>
          <label className="label" htmlFor="tr-ph">Phone Number</label>
          <input id="tr-ph" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0551234567" className="inp" />
        </div>
        <button className="btn-primary sm:col-span-2">Track order</button>
      </form>

      {err && <p className="mt-4 text-sm text-red-700">{err}</p>}

      {order && (
        <div className="mt-8 border border-cocoa/10 bg-white p-6">
          <div className="flex flex-wrap justify-between gap-2">
            <h2 className="font-display text-xl">{order.reference}</h2>
            <span className="text-sm font-semibold">{money(order.total)}</span>
          </div>
          <p className="text-xs text-cocoa-soft">
            {order.wilaya}{order.commune ? `, ${order.commune}` : ""} · {new Date(order.createdAt).toLocaleDateString()}
          </p>

          {order.status === "cancelled" ? (
            <p className="mt-6 text-sm text-red-700">This order was cancelled.</p>
          ) : (
            <ol className="mt-6 space-y-3">
              {FLOW.map((s, i) => (
                <li key={s} className="flex items-center gap-3 text-sm">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${i <= stage ? "bg-gold text-white" : "bg-beige text-cocoa-soft"}`}>
                    {i <= stage ? "✓" : i + 1}
                  </span>
                  <span className={i <= stage ? "text-cocoa" : "text-cocoa-soft"}>{STATUS_LABEL[s]}</span>
                </li>
              ))}
            </ol>
          )}

          <ul className="mt-6 space-y-1 border-t border-cocoa/10 pt-4 text-xs text-cocoa-soft">
            {items.map((it) => (
              <li key={it.id}>{it.quantity} × {it.name} ({it.variant}) — {money(it.unitPrice * it.quantity)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<div className="p-16 text-center text-sm text-cocoa-soft">Loading…</div>}>
      <TrackInner />
    </Suspense>
  );
}
