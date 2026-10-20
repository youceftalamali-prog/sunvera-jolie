"use client";

import { useCallback, useEffect, useState } from "react";
import { money } from "@/lib/format";

type Line = { name: string; variant: string; quantity: number; unitPrice: number; lineTotal: number };
type ReportOrder = {
  id: number; reference: string; date: string; customer: string; phone: string; email: string;
  wilaya: string; commune: string; address: string; status: string; subtotal: number;
  shipping: number; discount: number; total: number; paymentMethod: string; source: string; items: Line[];
};
type Report = {
  summary: { orders: number; pending: number; delivered: number; cancelled: number; salesTotal: number;
    deliveredTotal: number; shippingTotal: number; discountsTotal: number; units: number };
  orders: ReportOrder[];
  error?: string;
};

const headers = ["Order reference", "Date", "Customer", "Phone", "Email", "Wilaya", "Commune", "Address",
  "Product", "Variant", "Quantity", "Unit price DZD", "Line total DZD", "Subtotal DZD",
  "Shipping DZD", "Discount DZD", "Order total DZD", "Status", "Payment", "Source"];

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export default function AdminSalesReportsPage() {
  const [period, setPeriod] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ period });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch("/api/admin/reports?" + params.toString(), { cache: "no-store" });
      const data = await res.json() as Report;
      if (!res.ok) throw new Error(data.error || "Could not load sales report");
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load sales report");
    } finally { setLoading(false); }
  }, [period, from, to]);

  useEffect(() => { void load(); }, [load]);

  function exportExcelCsv() {
    if (!report) return;
    const rows: unknown[][] = [headers];
    for (const order of report.orders) {
      const lines = order.items.length ? order.items : [{ name: "", variant: "", quantity: 0, unitPrice: 0, lineTotal: 0 }];
      for (const item of lines) rows.push([
        order.reference, new Date(order.date).toLocaleString("fr-DZ"), order.customer, order.phone, order.email,
        order.wilaya, order.commune, order.address, item.name, item.variant, item.quantity, item.unitPrice,
        item.lineTotal, order.subtotal, order.shipping, order.discount, order.total, order.status,
        order.paymentMethod, order.source
      ]);
    }
    const csv = "\uFEFF" + rows.map(row => row.map(csvCell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "sunvera-jolie-ventes-" + (from || period) + (to ? "-au-" + to : "") + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const s = report?.summary;
  const cards = [
    ["Total des commandes", String(s?.orders ?? 0), "Toutes les commandes de la période"],
    ["Montant total", money(s?.salesTotal ?? 0), "Valeur des commandes enregistrées"],
    ["Commandes livrées", String(s?.delivered ?? 0), "Commandes marquées livrées"],
    ["Ventes livrées", money(s?.deliveredTotal ?? 0), "Montant des commandes livrées"],
    ["En attente", String(s?.pending ?? 0), "À confirmer ou traiter"],
    ["Unités vendues", String(s?.units ?? 0), "Quantité totale des lignes de commande"],
    ["Livraison", money(s?.shippingTotal ?? 0), "Frais de livraison enregistrés"],
    ["Réductions", money(s?.discountsTotal ?? 0), "Réductions appliquées"]
  ];

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3">
      <div><h1 className="font-display text-2xl">Sales & Reports</h1><p className="mt-1 text-xs text-[var(--svj-muted)]">Rapports calculés depuis les commandes réelles du magasin.</p></div>
      <button onClick={() => void load()} className="btn-outline ms-auto !py-2" disabled={loading}>{loading ? "Chargement…" : "Actualiser"}</button>
      <button onClick={exportExcelCsv} disabled={!report || loading} className="btn-primary !py-2">Exporter pour Excel</button>
    </div>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--svj-border)] bg-white p-4">
      <label className="block"><span className="label">Période</span><select className="inp !py-2 text-xs" value={period} onChange={e => { setPeriod(e.target.value); setFrom(""); setTo(""); }}>
        <option value="day">Aujourd’hui</option><option value="week">Cette semaine</option><option value="month">Ce mois</option><option value="30days">30 derniers jours</option>
      </select></label>
      <label className="block"><span className="label">Du</span><input className="inp !py-2 text-xs" type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label className="block"><span className="label">Au</span><input className="inp !py-2 text-xs" type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
      <button className="btn-outline !py-2" onClick={() => { setFrom(""); setTo(""); setPeriod("month"); }}>Réinitialiser</button>
    </div>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value, hint]) => <div key={label} className="rounded-xl border border-[var(--svj-border)] bg-white p-4 shadow-sm">
        <p className="text-[10px] uppercase tracking-widest text-[var(--svj-muted)]">{label}</p>
        <p className="mt-2 break-words font-display text-xl">{value}</p>
        <p className="mt-1 text-[10px] text-[var(--svj-muted)]">{hint}</p>
      </div>)}
    </div>
    <div className="overflow-hidden rounded-xl border border-[var(--svj-border)] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--svj-border)] p-4"><h2 className="font-display text-lg">Détail des commandes</h2><span className="text-xs text-[var(--svj-muted)]">{report?.orders.length ?? 0} commande(s)</span></div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] text-left text-xs">
          <thead className="bg-[var(--svj-surface)] text-[var(--svj-muted)]"><tr>{["Référence", "Date", "Client", "Articles", "Statut", "Livraison", "Total"].map(h => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>{report?.orders.map(o => <tr key={o.id} className="border-t border-[var(--svj-border)]">
            <td className="px-4 py-3 font-semibold">{o.reference}</td><td className="px-4 py-3">{new Date(o.date).toLocaleDateString("fr-DZ")}</td><td className="px-4 py-3">{o.customer}<div className="text-[var(--svj-muted)]">{o.phone}</div></td>
            <td className="px-4 py-3">{o.items.map(i => i.name + " × " + i.quantity).join(", ")}</td><td className="px-4 py-3">{o.status}</td><td className="px-4 py-3">{money(o.shipping)}</td><td className="px-4 py-3 font-semibold">{money(o.total)}</td>
          </tr>)}</tbody>
        </table>
        {!loading && report?.orders.length === 0 && <p className="p-8 text-center text-sm text-[var(--svj-muted)]">Aucune commande sur cette période.</p>}
      </div>
    </div>
    <p className="text-xs text-[var(--svj-muted)]">Important : le montant total des commandes inclut les commandes non encore livrées. Le chiffre « ventes livrées » ne compte que le statut « delivered ». Ce rapport ne représente pas le bénéfice net : il faut déduire le coût des produits et les autres dépenses.</p>
  </div>;
}
