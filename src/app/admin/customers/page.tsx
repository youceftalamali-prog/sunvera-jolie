"use client";

import { useCallback, useEffect, useState } from "react";
import { money } from "@/lib/format";

type C = {
  id: number;
  fullName: string;
  phone: string;
  email: string;
  createdAt: string;
  orders: number;
  spent: number;
  lastOrder: string | null;
  lastAddress: string;
};

export default function AdminCustomersPage() {
  const [rows, setRows] = useState<C[]>([]);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/data?type=customers&q=${encodeURIComponent(q)}`);
    const d = (await res.json()) as { customers: C[] };
    setRows(d.customers ?? []);
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl">Customers</h1>
      <div className="flex flex-wrap items-end gap-3 bg-white p-4">
        <label className="block">
          <span className="label">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or email…" className="inp !py-2 text-xs" />
        </label>
        <p className="text-[11px] text-[var(--svj-muted)]">{rows.length} registered customers</p>
      </div>

      <div className="overflow-x-auto bg-white p-3">
        <table className="w-full min-w-[780px] text-left text-[11px]">
          <thead className="text-[10px] uppercase tracking-widest text-[var(--svj-muted)]">
            <tr>{["Customer", "Phone", "Email", "Orders", "Total spent", "Last order", "Last address", "Joined"].map((h) => (<th key={h} className="py-2">{h}</th>))}</tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-[var(--svj-border)]">
                <td className="py-2">{c.fullName}</td>
                <td className="py-2">{c.phone}</td>
                <td className="py-2">{c.email || "—"}</td>
                <td className="py-2">{c.orders}</td>
                <td className="py-2">{money(c.spent)}</td>
                <td className="py-2">{c.lastOrder ? new Date(c.lastOrder).toLocaleDateString() : "—"}</td>
                <td className="py-2">{c.lastAddress || "—"}</td>
                <td className="py-2">{new Date(c.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-8 text-center text-[12px] text-[var(--svj-muted)]">No customers yet.</p>}
      </div>
      <p className="text-[11px] text-[var(--svj-muted)]">
        Passwords are stored as salted scrypt hashes and are never displayed. Guest checkout orders appear under Orders and are linked
        automatically when the customer registers with the same phone number.
      </p>
    </div>
  );
}
