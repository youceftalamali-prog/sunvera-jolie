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
  const [sort, setSort] = useState("recent");

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/data?type=customers&q=${encodeURIComponent(q)}`);
    const d = (await res.json()) as { customers: C[] };
    setRows(d.customers ?? []);
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedRows = [...rows].sort((a, b) => {
    if (sort === "spent") return b.spent - a.spent;
    if (sort === "orders") return b.orders - a.orders;
    if (sort === "name") return a.fullName.localeCompare(b.fullName);
    return new Date(b.lastOrder ?? b.createdAt).getTime() - new Date(a.lastOrder ?? a.createdAt).getTime();
  });
  const totalSpent = rows.reduce((sum, c) => sum + c.spent, 0);
  const repeatCustomers = rows.filter((c) => c.orders > 1).length;
  const exportCsv = () => {
    const quote = (value: unknown) => '"' + String(value ?? "").replace(/"/g, '""') + '"';
    const header = ["name", "phone", "email", "orders", "total_spent_DZD", "last_order", "last_address", "joined"].map(quote).join(",");
    const body = sortedRows.map((c) => [c.fullName, c.phone, c.email, c.orders, c.spent, c.lastOrder ?? "", c.lastAddress, c.createdAt].map(quote).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "sunvera-customers.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl">Customers</h1>
        <button onClick={exportCsv} className="btn-outline ms-auto !py-2">Export CSV</button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Registered customers", value: String(rows.length) },
          { label: "Repeat customers", value: String(repeatCustomers) },
          { label: "Total customer spend", value: money(totalSpent) },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-[var(--svj-border)] bg-white p-4 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest text-[var(--svj-muted)]">{k.label}</p>
            <p className="mt-2 font-display text-xl">{k.value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--svj-border)] bg-white p-4">
        <label className="block">
          <span className="label">Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or email…" className="inp !py-2 text-xs" />
        </label>
        <label className="block">
          <span className="label">Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="inp !py-2 text-xs">
            <option value="recent">Recent activity</option>
            <option value="spent">Highest spend</option>
            <option value="orders">Most orders</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
        <p className="text-[11px] text-[var(--svj-muted)]">{rows.length} registered customers</p>
      </div>

      <div className="overflow-x-auto bg-white p-3">
        <table className="w-full min-w-[780px] text-left text-[11px]">
          <thead className="text-[10px] uppercase tracking-widest text-[var(--svj-muted)]">
            <tr>{["Customer", "Phone", "Email", "Orders", "Total spent", "Last order", "Last address", "Joined"].map((h) => (<th key={h} className="py-2">{h}</th>))}</tr>
          </thead>
          <tbody>
            {sortedRows.map((c) => (
              <tr key={c.id} className="border-t border-[var(--svj-border)]">
                <td className="py-2">{c.fullName}</td>
                <td className="py-2"><a href={"tel:" + c.phone} className="underline underline-offset-2">{c.phone}</a></td>
                <td className="py-2">{c.email ? <a href={"mailto:" + c.email} className="underline underline-offset-2">{c.email}</a> : "—"}</td>
                <td className="py-2">{c.orders}</td>
                <td className="py-2">{money(c.spent)}</td>
                <td className="py-2">{c.lastOrder ? new Date(c.lastOrder).toLocaleDateString() : "—"}</td>
                <td className="py-2">
                  {c.lastAddress || "—"}
                  {c.phone && <a className="mt-1 block text-emerald-700 underline underline-offset-2" href={"https://wa.me/" + c.phone.replace(/\\D/g, "").replace(/^0/, "213")} target="_blank" rel="noreferrer">Contact on WhatsApp</a>}
                </td>
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
