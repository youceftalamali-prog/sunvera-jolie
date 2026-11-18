"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Lead = {
  id: number; fullName: string; phone: string; email: string; productInterest: string;
  source: string; campaign: string; stage: string; notes: string; createdAt: string;
  updatedAt: string; lastContactAt: string | null;
};
type Activity = { id: number; channel: string; direction: string; body: string; createdAt: string };

const STAGES = [
  { value: "new", label: "New lead" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Interested" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
];

export default function CRMPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stage, setStage] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityText, setActivityText] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", productInterest: "", source: "manual", campaign: "", notes: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ stage, q: query });
      const response = await fetch("/api/admin/crm/leads?" + params.toString(), { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load CRM leads");
      const data = await response.json() as { leads: Lead[] };
      setLeads(data.leads ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "CRM loading failed"); }
  }, [stage, query]);

  const loadActivities = useCallback(async (id: number) => {
    const response = await fetch("/api/admin/crm/leads/" + id + "/activities", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load activity history");
    const data = await response.json() as { activities: Activity[] };
    setActivities(data.activities ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (selected) void loadActivities(selected).catch((e: unknown) => setError(e instanceof Error ? e.message : "Activity history failed")); }, [selected, loadActivities]);

  const counts = useMemo(() => Object.fromEntries(STAGES.map((s) => [s.value, leads.filter((l) => l.stage === s.value).length])), [leads]);

  async function createLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/crm/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not create lead");
      setForm({ fullName: "", phone: "", email: "", productInterest: "", source: "manual", campaign: "", notes: "" });
      setFormOpen(false); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create lead"); }
    finally { setBusy(false); }
  }

  async function changeStage(id: number, nextStage: string) {
    const response = await fetch("/api/admin/crm/leads", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, stage: nextStage }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setError(data.error || "Could not update stage"); return; }
    await load();
  }

  async function addActivity(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !activityText.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/crm/leads/" + selected + "/activities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: activityText, channel: "note", direction: "internal" }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save note");
      setActivityText(""); await loadActivities(selected); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save note"); }
    finally { setBusy(false); }
  }

  const inputClass = "w-full rounded-lg border border-[var(--svj-border)] bg-white px-3 py-2 text-sm";
  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[10px] uppercase tracking-[.24em] text-[var(--svj-muted)]">Customer relationship management</p><h1 className="font-display text-2xl">CRM & Leads</h1><p className="mt-1 text-xs text-[var(--svj-muted)]">Track prospects, product interest, sales stages and follow-up notes.</p></div>
        <button type="button" onClick={() => setFormOpen(!formOpen)} className="btn-primary !py-2">{formOpen ? "Close form" : "+ Add lead"}</button>
      </div>
      {error && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {STAGES.map((s) => <button type="button" key={s.value} onClick={() => setStage(stage === s.value ? "all" : s.value)} className={"border p-3 text-left " + (stage === s.value ? "border-[#b28a45] bg-[#fbf7f0]" : "border-[var(--svj-border)] bg-white")}><p className="text-[10px] text-[var(--svj-muted)]">{s.label}</p><p className="mt-1 text-xl font-semibold">{counts[s.value] ?? 0}</p></button>)}
      </div>
      {formOpen && <form onSubmit={createLead} className="grid gap-3 border border-[var(--svj-border)] bg-white p-4 sm:grid-cols-2">
        <label className="text-xs">Full name *<input required maxLength={160} className={inputClass} value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} /></label>
        <label className="text-xs">Phone<input maxLength={40} className={inputClass} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
        <label className="text-xs">Email<input type="email" maxLength={200} className={inputClass} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
        <label className="text-xs">Product interest<input maxLength={200} className={inputClass} value={form.productInterest} onChange={e => setForm({ ...form, productInterest: e.target.value })} placeholder="e.g. Keratin hair mask" /></label>
        <label className="text-xs">Source<select className={inputClass} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>{["manual","whatsapp","messenger","facebook","instagram","tiktok","website"].map(x => <option key={x} value={x}>{x}</option>)}</select></label>
        <label className="text-xs">Campaign<input maxLength={200} className={inputClass} value={form.campaign} onChange={e => setForm({ ...form, campaign: e.target.value })} /></label>
        <label className="text-xs sm:col-span-2">Notes<textarea maxLength={5000} rows={2} className={inputClass} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
        <div className="sm:col-span-2"><button type="submit" disabled={busy} className="btn-primary !py-2">{busy ? "Saving…" : "Save lead"}</button></div>
      </form>}
      <div className="flex flex-wrap gap-2">
        <input aria-label="Search leads" placeholder="Search name, phone, product or campaign…" value={query} onChange={e => setQuery(e.target.value)} className={"max-w-lg " + inputClass} />
        <select aria-label="Filter by stage" className="rounded-lg border border-[var(--svj-border)] bg-white px-3 py-2 text-sm" value={stage} onChange={e => setStage(e.target.value)}><option value="all">All stages</option>{STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-x-auto border border-[var(--svj-border)] bg-white">
          <table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-[#f8f4ed] text-[10px] uppercase tracking-wider"><tr>{["Lead","Product interest","Source / campaign","Stage","Added"].map(x => <th key={x} className="px-3 py-3">{x}</th>)}</tr></thead>
            <tbody>{leads.map(lead => <tr key={lead.id} className={"border-t border-[var(--svj-border)] " + (selected === lead.id ? "bg-[#fbf7f0]" : "")}><td className="px-3 py-3"><button type="button" onClick={() => setSelected(lead.id)} className="text-left font-semibold underline">{lead.fullName}</button><p className="mt-1 text-[var(--svj-muted)]">{lead.phone || lead.email || "No contact details"}</p></td><td className="px-3 py-3">{lead.productInterest || "—"}</td><td className="px-3 py-3"><span className="capitalize">{lead.source}</span><p className="text-[var(--svj-muted)]">{lead.campaign || "—"}</p></td><td className="px-3 py-3"><select aria-label={"Stage for " + lead.fullName} value={lead.stage} onChange={e => void changeStage(lead.id,e.target.value)} className="rounded-md border border-[var(--svj-border)] bg-white px-2 py-1">{STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></td><td className="px-3 py-3 whitespace-nowrap">{new Date(lead.createdAt).toLocaleDateString()}</td></tr>)}</tbody>
          </table>
          {leads.length === 0 && <p className="p-8 text-center text-xs text-[var(--svj-muted)]">No leads yet. Add one manually or connect a messaging channel in a later integration step.</p>}
        </div>
        <aside className="border border-[var(--svj-border)] bg-white p-4">
          <h2 className="font-display text-lg">Lead timeline</h2>
          {!selected ? <p className="mt-3 text-xs text-[var(--svj-muted)]">Select a lead to view and add follow-up notes.</p> : <>
            <p className="mt-2 text-xs text-[var(--svj-muted)]">{leads.find(l => l.id === selected)?.fullName}</p>
            <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto">{activities.map(a => <div key={a.id} className="border-s-2 border-[#c9a45c] ps-3"><p className="text-[10px] uppercase text-[var(--svj-muted)]">{a.channel} · {new Date(a.createdAt).toLocaleString()}</p><p className="mt-1 whitespace-pre-wrap text-xs">{a.body}</p></div>)}{activities.length === 0 && <p className="text-xs text-[var(--svj-muted)]">No activity recorded yet.</p>}</div>
            <form onSubmit={addActivity} className="mt-4 space-y-2"><textarea required rows={3} maxLength={5000} value={activityText} onChange={e => setActivityText(e.target.value)} className={inputClass} placeholder="Record a call, follow-up or internal note…" /><button type="submit" disabled={busy} className="btn-primary w-full !py-2">Add timeline note</button></form>
          </>}
        </aside>
      </div>
    </div>
  );
}
