"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { money } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/status";

type LineItem = { id: number; productId: number | null; name: string; variant: string; quantity: number; unitPrice: number };
type Order = {
  id: number; reference: string; fullName: string; email: string; phone: string; status: string;
  subtotal: number; shipping: number; discount: number; total: number; createdAt: string;
  items: LineItem[];
};
type Product = { id: number; name: string; costPrice: number; price: number };

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function AdminAccountingPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ type: "orders", status: "all", wilaya: "" });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const [ordersRes, productsRes] = await Promise.all([
        fetch(`/api/admin/data?${params.toString()}`),
        fetch("/api/admin/data?type=products"),
      ]);
      if (!ordersRes.ok || !productsRes.ok) throw new Error("Could not load accounting data.");
      const [ordersData, productsData] = await Promise.all([ordersRes.json(), productsRes.json()]);
      setOrders((ordersData.orders ?? []) as Order[]);
      setProducts((productsData.products ?? []) as Product[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load accounting data.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const report = useMemo(() => {
    const costById = new Map(products.map((p) => [p.id, Number(p.costPrice) || 0]));
    const enriched = orders.map((order) => {
      const units = order.items.reduce((sum, item) => sum + item.quantity, 0);
      const estimatedCost = order.items.reduce((sum, item) => sum + (item.productId ? (costById.get(item.productId) ?? 0) * item.quantity : 0), 0);
      const hasMissingCost = order.items.some((item) => !item.productId || !costById.has(item.productId) || !costById.get(item.productId));
      return { ...order, units, estimatedCost, hasMissingCost };
    }).filter((o) => status === "all" || o.status === status);
    const delivered = enriched.filter((o) => o.status === "delivered");
    const pending = enriched.filter((o) => !["delivered", "cancelled", "returned"].includes(o.status));
    const cancelled = enriched.filter((o) => ["cancelled", "returned"].includes(o.status));
    return {
      enriched,
      deliveredRevenue: delivered.reduce((sum, o) => sum + o.total, 0),
      deliveredCost: delivered.reduce((sum, o) => sum + o.estimatedCost, 0),
      deliveredGross: delivered.reduce((sum, o) => sum + o.total - o.estimatedCost, 0),
      pendingValue: pending.reduce((sum, o) => sum + o.total, 0),
      cancelledValue: cancelled.reduce((sum, o) => sum + o.total, 0),
      totalOrders: enriched.length,
      totalUnits: enriched.reduce((sum, o) => sum + o.units, 0),
      missingCostCount: enriched.filter((o) => o.hasMissingCost).length,
      subtotal: enriched.reduce((sum, o) => sum + o.subtotal, 0),
      shipping: enriched.reduce((sum, o) => sum + o.shipping, 0),
      discounts: enriched.reduce((sum, o) => sum + o.discount, 0),
    };
  }, [orders, products, status]);

  async function sendEmailReport() {
    setSendingEmail(true);
    setEmailStatus("");
    try {
      const res = await fetch("/api/admin/accounting/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, status }),
      });
      const data = await res.json() as { message?: string; error?: string };
      setEmailStatus(res.ok ? (data.message ?? "Report sent.") : (data.error ?? "Could not send report."));
    } catch {
      setEmailStatus("Could not send report. Check the connection and try again.");
    } finally {
      setSendingEmail(false);
    }
  }

  function exportReport() {
    const header = ["Reference", "Date", "Customer", "Email", "Phone", "Status", "Products", "Units", "Subtotal_DZD", "Shipping_DZD", "Discount_DZD", "Order_Total_DZD", "Estimated_Cost_Using_Current_Product_Cost_DZD", "Estimated_Gross_Margin_DZD", "Cost_Data_Incomplete"];
    const rows = report.enriched.map((o) => [
      o.reference, new Date(o.createdAt).toISOString(), o.fullName, o.email, o.phone, o.status,
      o.items.map((i) => `${i.quantity} x ${i.name}${i.variant ? ` (${i.variant})` : ""}`).join(" | "),
      o.units, o.subtotal, o.shipping, o.discount, o.total, o.estimatedCost,
      o.status === "delivered" ? o.total - o.estimatedCost : "",
      o.hasMissingCost ? "YES" : "NO",
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sunvera-accounting-${from || "all"}-${to || "dates"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-center gap-3">
        <div><h1 className="font-display text-2xl">Accounting & Reports</h1><p className="mt-1 text-xs text-[var(--svj-muted)]">Sales totals, order status, and estimated product costs in DZD.</p></div>
        <div className="ms-auto flex flex-wrap gap-2"><button onClick={exportReport} className="btn-outline !py-2">Export accounting CSV</button><button onClick={sendEmailReport} disabled={sendingEmail || loading} className="btn-outline !py-2 disabled:opacity-50">{sendingEmail ? "Sending report…" : "Email report"}</button></div>
      </div>

      <div className="grid gap-3 border border-[var(--svj-border)] bg-white p-4 sm:grid-cols-3">
        <label className="block"><span className="label">From date</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="inp !py-2 text-xs" /></label>
        <label className="block"><span className="label">To date</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="inp !py-2 text-xs" /></label>
        <label className="block"><span className="label">Filter orders</span><select value={status} onChange={(e) => setStatus(e.target.value)} className="inp !py-2 text-xs"><option value="all">All statuses</option>{Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div>

      {error && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>}
      {emailStatus && <p role="status" className="border border-[var(--svj-border)] bg-white p-3 text-xs">{emailStatus}{emailStatus.includes("recipient") || emailStatus.includes("RESEND_API_KEY") ? <> · <a className="underline" href="/admin/settings">Open Settings</a></> : null}</p>}
      {loading && <p className="bg-white p-3 text-xs text-[var(--svj-muted)]">Loading accounting data…</p>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="border border-[var(--svj-border)] bg-white p-4"><p className="label">Delivered sales</p><p className="mt-1 text-xl font-semibold">{money(report.deliveredRevenue)}</p><p className="mt-1 text-[10px] text-[var(--svj-muted)]">Delivered orders only</p></div>
        <div className="border border-[var(--svj-border)] bg-white p-4"><p className="label">Estimated product cost</p><p className="mt-1 text-xl font-semibold">{money(report.deliveredCost)}</p><p className="mt-1 text-[10px] text-[var(--svj-muted)]">Based on current catalog cost prices</p></div>
        <div className="border border-[var(--svj-border)] bg-white p-4"><p className="label">Estimated gross margin</p><p className="mt-1 text-xl font-semibold">{money(report.deliveredGross)}</p><p className="mt-1 text-[10px] text-[var(--svj-muted)]">Before advertising, operating expenses, and taxes</p></div>
        <div className="border border-[var(--svj-border)] bg-white p-4"><p className="label">Pending order value</p><p className="mt-1 text-xl font-semibold">{money(report.pendingValue)}</p><p className="mt-1 text-[10px] text-[var(--svj-muted)]">Not counted as delivered sales</p></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-[#f8f4ed] p-4"><p className="label">Orders in report</p><p className="mt-1 text-lg font-semibold">{report.totalOrders}</p></div>
        <div className="bg-[#f8f4ed] p-4"><p className="label">Units in report</p><p className="mt-1 text-lg font-semibold">{report.totalUnits}</p></div>
        <div className="bg-[#f8f4ed] p-4"><p className="label">Delivery fees total</p><p className="mt-1 text-lg font-semibold">{money(report.shipping)}</p></div>
        <div className="bg-[#f8f4ed] p-4"><p className="label">Discounts total</p><p className="mt-1 text-lg font-semibold">{money(report.discounts)}</p></div>
      </div>

      <div className="border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
        <strong>Accounting accuracy note:</strong> This first report estimates product cost using each product’s current cost price. Historical purchase cost is not saved on older order lines yet. Other expenses such as ads, packaging, supplier shipping, and tax are not included, so the gross margin shown is not net profit. {report.missingCostCount > 0 ? `${report.missingCostCount} order(s) have missing or zero product-cost data.` : ""}
      </div>

      <div className="overflow-x-auto border border-[var(--svj-border)] bg-white">
        <table className="w-full min-w-[1050px] border-collapse text-left text-xs">
          <thead className="bg-[#f8f4ed] text-[10px] uppercase tracking-wider text-[var(--svj-muted)]"><tr>{["Order / Date", "Customer", "Products", "Units", "Subtotal", "Delivery", "Discount", "Order total", "Est. cost", "Est. margin*"].map((x) => <th key={x} className="border-b border-[var(--svj-border)] px-3 py-3 font-medium">{x}</th>)}</tr></thead>
          <tbody>
            {report.enriched.map((o) => <tr key={o.id} className="align-top hover:bg-[#fcfaf6]">
              <td className="border-b border-[var(--svj-border)] px-3 py-3"><p className="font-semibold">{o.reference}</p><p className="mt-1 text-[10px] text-[var(--svj-muted)]">{new Date(o.createdAt).toLocaleDateString()}</p><p className="mt-1 capitalize text-[10px]">{STATUS_LABEL[o.status] ?? o.status}</p></td>
              <td className="border-b border-[var(--svj-border)] px-3 py-3">{o.fullName}<p className="mt-1 text-[10px] text-[var(--svj-muted)]">{o.email || "No email"}<br />{o.phone}</p></td>
              <td className="border-b border-[var(--svj-border)] px-3 py-3">{o.items.map((i) => <p key={i.id} className="mb-1">{i.quantity} × {i.name}</p>)}</td>
              <td className="border-b border-[var(--svj-border)] px-3 py-3">{o.units}</td><td className="border-b border-[var(--svj-border)] px-3 py-3 whitespace-nowrap">{money(o.subtotal)}</td><td className="border-b border-[var(--svj-border)] px-3 py-3 whitespace-nowrap">{money(o.shipping)}</td><td className="border-b border-[var(--svj-border)] px-3 py-3 whitespace-nowrap">{money(o.discount)}</td><td className="border-b border-[var(--svj-border)] px-3 py-3 whitespace-nowrap font-semibold">{money(o.total)}</td><td className="border-b border-[var(--svj-border)] px-3 py-3 whitespace-nowrap">{money(o.estimatedCost)}{o.hasMissingCost && <span title="Some product costs are missing" className="ms-1 text-amber-700">⚠</span>}</td><td className="border-b border-[var(--svj-border)] px-3 py-3 whitespace-nowrap">{o.status === "delivered" ? money(o.total - o.estimatedCost) : "—"}</td>
            </tr>)}
          </tbody>
          <tfoot className="bg-[#f8f4ed] font-semibold"><tr><td colSpan={3} className="px-3 py-3">REPORT TOTALS</td><td className="px-3 py-3">{report.totalUnits}</td><td className="px-3 py-3">{money(report.subtotal)}</td><td className="px-3 py-3">{money(report.shipping)}</td><td className="px-3 py-3">{money(report.discounts)}</td><td className="px-3 py-3">{money(report.enriched.reduce((sum, o) => sum + o.total, 0))}</td><td className="px-3 py-3">{money(report.enriched.reduce((sum, o) => sum + o.estimatedCost, 0))}</td><td className="px-3 py-3">{money(report.deliveredGross)}</td></tr></tfoot>
        </table>
        {!loading && report.enriched.length === 0 && <p className="p-8 text-center text-xs text-[var(--svj-muted)]">No orders found for this period.</p>}
      </div>
      <p className="text-[10px] text-[var(--svj-muted)]">*Estimated margin is shown for delivered orders only and excludes all operating expenses.</p>
    </div>
  );
}
