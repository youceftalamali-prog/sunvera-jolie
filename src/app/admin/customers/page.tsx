"use client";

import { useCallback, useEffect, useState } from "react";
import { money } from "@/lib/format";

type Purchase = {
  id: number;
  reference: string;
  createdAt: string;
  status: string;
  total: number;
  subtotal: number;
  shipping: number;
  discount: number;
  wilaya: string;
  commune: string;
  address: string;
  items: { name: string; variant: string; quantity: number; unitPrice: number; total: number }[];
};

type C = {
  id: number;
  fullName: string;
  phone: string;
  email: string;
  createdAt: string;
  accountType: "Registered" | "Guest checkout";
  orders: number;
  spent: number;
  lastOrder: string | null;
  lastAddress: string;
  purchases: Purchase[];
};

export default function AdminCustomersPage() {
  const [rows, setRows] = useState<C[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/data?type=customers&q=${encodeURIComponent(q)}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load customer records. Please refresh and try again.");
      const d = (await res.json()) as { customers?: C[] };
      setRows(d.customers ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load customer records.");
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl">Customers & Purchase History</h1>
      <div className="flex flex-wrap items-end gap-3 bg-white p-4">
        <label className="block">
          <span className="label">Search customers, phone, email, order or product</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone, email, order or product…" className="inp !py-2 text-xs" />
        </label>
        <p className="text-[11px] text-[var(--svj-muted)]">{rows.length} customers, including guest checkouts</p>
      </div>

      {error && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="overflow-x-auto bg-white p-3">
        <table className="w-full min-w-[1150px] text-left text-[11px]">
          <thead className="text-[10px] uppercase tracking-widest text-[var(--svj-muted)]">
            <tr>{["Customer", "Type", "Phone", "Email", "Orders", "Total order value", "Last order", "Last address", "Purchase history", "Joined / first order"].map((h) => (<th key={h} className="py-2 pr-3">{h}</th>))}</tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-[var(--svj-border)] align-top">
                <td className="py-3 pr-3 font-medium">{c.fullName}</td>
                <td className="py-3 pr-3">{c.accountType}</td>
                <td className="py-3 pr-3">{c.phone || "—"}</td>
                <td className="py-3 pr-3">{c.email || "—"}</td>
                <td className="py-3 pr-3">{c.orders}</td>
                <td className="py-3 pr-3">{money(c.spent)}</td>
                <td className="py-3 pr-3">{c.lastOrder ? new Date(c.lastOrder).toLocaleDateString() : "—"}</td>
                <td className="py-3 pr-3">{c.lastAddress || "—"}</td>
                <td className="py-3 pr-3">
                  {c.purchases.length === 0 ? "No orders yet" : (
                    <details className="min-w-[260px]">
                      <summary className="cursor-pointer text-[var(--svj-accent,#9b7438)] underline">
                        View {c.purchases.length} order(s) and products
                      </summary>
                      <div className="mt-2 space-y-3">
                        {c.purchases.map((purchase) => (
                          <section key={purchase.id} className="border border-[var(--svj-border)] p-3">
                            <div className="flex flex-wrap justify-between gap-2">
                              <strong>{purchase.reference}</strong>
                              <strong>{money(purchase.total)}</strong>
                            </div>
                            <p className="mt-1 text-[var(--svj-muted)]">
                              {new Date(purchase.createdAt).toLocaleString()} · {purchase.status.replaceAll("_", " ")}
                            </p>
                            <p className="mt-1 text-[var(--svj-muted)]">
                              {purchase.address}, {purchase.commune}, {purchase.wilaya}
                            </p>
                            <ul className="mt-2 list-disc pl-4">
                              {purchase.items.map((item, index) => (
                                <li key={`${purchase.id}-${index}`}>
                                  {item.quantity} × {item.name}{item.variant ? ` · ${item.variant}` : ""} — {money(item.unitPrice)} each; {money(item.total)}
                                </li>
                              ))}
                            </ul>
                            <p className="mt-2 text-[var(--svj-muted)]">
                              Subtotal {money(purchase.subtotal)} · Delivery {money(purchase.shipping)} · Discount {money(purchase.discount)}
                            </p>
                          </section>
                        ))}
                      </div>
                    </details>
                  )}
                </td>
                <td className="py-3 pr-3">{new Date(c.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!error && rows.length === 0 && <p className="py-8 text-center text-[12px] text-[var(--svj-muted)]">No customers or orders found.</p>}
      </div>
      <p className="text-[11px] text-[var(--svj-muted)]">
        Guest checkout customers are included automatically from order records. Orders are matched to registered accounts by customer ID or normalized phone number. Purchase history shows order status, products, quantities, prices, delivery, discounts and delivery address.
      </p>
    </div>
  );
}
