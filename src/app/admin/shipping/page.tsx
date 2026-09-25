"use client";

import { useCallback, useEffect, useState } from "react";

type Wilaya = {
  id: number;
  code: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
  active: boolean;
  fee: number;
  stopDeskFee: number;
  etaDays: string;
  communes: number;
};
type Commune = { id: number; wilayaCode: string; nameAr: string; nameFr: string; nameEn: string; active: boolean };

export default function AdminShippingPage() {
  const [wilayas, setWilayas] = useState<Wilaya[]>([]);
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [selected, setSelected] = useState<Wilaya | null>(null);
  const [q, setQ] = useState("");
  const [cq, setCq] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [bulk, setBulk] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/locations?q=${encodeURIComponent(q)}${selected ? `&wilaya=${selected.code}&all=1` : ""}`);
    const d = (await res.json()) as { wilayas: Wilaya[]; communes: Commune[] };
    setWilayas(d.wilayas ?? []);
    setCommunes(d.communes ?? []);
  }, [q, selected]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = (await res.json()) as { error?: string };
    setMsg(res.ok ? "Saved ✓" : (d.error ?? "Could not save"));
    void load();
  }

  const shownCommunes = communes.filter((c) =>
    `${c.nameFr} ${c.nameAr} ${c.nameEn}`.toLowerCase().includes(cq.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl">Shipping & Wilayas</h1>
        <p className="text-[11px] text-[var(--svj-muted)]">
          {wilayas.length} wilayas loaded · full Algerian administrative structure (58 wilayas + communes). Search, activate,
          deactivate and set delivery pricing without a developer.
        </p>
      </div>
      {msg && <p className="border border-green-200 bg-green-50 p-3 text-[12px] text-green-800">{msg}</p>}

      <div className="flex flex-wrap items-end gap-3 bg-white p-4">
        <label className="block">
          <span className="label">Search wilaya</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="16, Alger, أدرار…" className="inp !py-2 text-xs" />
        </label>
        <label className="block">
          <span className="label">Bulk delivery fee (all active wilayas)</span>
          <div className="flex gap-2">
            <input value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="700" className="inp !w-24 !py-2 text-xs" />
            <button
              onClick={async () => {
                await fetch("/api/admin/locations", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ kind: "bulk-wilaya-shipping", fee: Number(bulk || 700), ids: [1] }),
                });
                setMsg("Bulk fee applied ✓");
                void load();
              }}
              className="btn-outline !py-2"
            >
              Apply
            </button>
          </div>
        </label>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="overflow-x-auto bg-white p-3">
          <table className="w-full min-w-[720px] text-left text-[11px]">
            <thead className="text-[10px] uppercase tracking-widest text-[var(--svj-muted)]">
              <tr>
                {["Code", "Wilaya (FR)", "Wilaya (AR)", "Communes", "Fee DZD", "Stop desk", "ETA days", "Active", ""].map((h) => (
                  <th key={h} className="py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wilayas.map((w) => (
                <tr key={w.code} className={`border-t border-[var(--svj-border)] ${w.active ? "" : "opacity-50"}`}>
                  <td className="py-1.5">{w.code}</td>
                  <td className="py-1.5">
                    <input defaultValue={w.nameFr} className="inp !py-0.5 text-[11px]" onBlur={(e) => post({ kind: "wilaya-save", code: w.code, nameFr: e.target.value, nameAr: w.nameAr, nameEn: w.nameEn, active: w.active, sortOrder: w.id })} />
                  </td>
                  <td className="py-1.5">
                    <input defaultValue={w.nameAr} className="inp !py-0.5 text-[11px]" onBlur={(e) => post({ kind: "wilaya-save", code: w.code, nameFr: w.nameFr, nameAr: e.target.value, nameEn: w.nameEn, active: w.active, sortOrder: w.id })} />
                  </td>
                  <td className="py-1.5">{w.communes}</td>
                  <td className="py-1.5">
                    <input type="number" defaultValue={w.fee} className="inp !w-20 !py-0.5 text-[11px]" onBlur={(e) => post({ kind: "rate-save", code: w.code, fee: Number(e.target.value), etaDays: w.etaDays, stopDeskFee: w.stopDeskFee })} />
                  </td>
                  <td className="py-1.5">
                    <input type="number" defaultValue={w.stopDeskFee} className="inp !w-20 !py-0.5 text-[11px]" onBlur={(e) => post({ kind: "rate-save", code: w.code, fee: w.fee, etaDays: w.etaDays, stopDeskFee: Number(e.target.value) })} />
                  </td>
                  <td className="py-1.5">
                    <input defaultValue={w.etaDays} className="inp !w-16 !py-0.5 text-[11px]" onBlur={(e) => post({ kind: "rate-save", code: w.code, fee: w.fee, etaDays: e.target.value, stopDeskFee: w.stopDeskFee })} />
                  </td>
                  <td className="py-1.5">
                    <input type="checkbox" checked={w.active} onChange={(e) => post({ kind: "wilaya-toggle", code: w.code, active: e.target.checked })} aria-label={`Toggle ${w.nameFr}`} />
                  </td>
                  <td className="py-1.5">
                    <button onClick={() => { setSelected(w); setCq(""); }} className="underline">Communes</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white p-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest">
            {selected ? `Communes · ${selected.nameFr}` : "Select a wilaya"}
          </h2>
          {selected && (
            <>
              <input value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Search commune…" className="inp mt-2 !py-2 text-xs" />
              <div className="mt-3 max-h-[420px] overflow-y-auto">
                <ul className="space-y-1 text-[11px]">
                  {shownCommunes.map((c) => (
                    <li key={c.id} className={`flex items-center gap-2 ${c.active ? "" : "opacity-50"}`}>
                      <input type="checkbox" checked={c.active} onChange={(e) => post({ kind: "commune-toggle", id: c.id, active: e.target.checked })} aria-label={`Toggle ${c.nameFr}`} />
                      <input defaultValue={c.nameFr} className="inp !py-0.5 text-[11px]" onBlur={(e) => post({ kind: "commune-save", id: c.id, wilayaCode: c.wilayaCode, nameFr: e.target.value, nameAr: c.nameAr, nameEn: c.nameEn, active: c.active })} />
                      <input defaultValue={c.nameAr} className="inp !w-24 !py-0.5 text-[11px]" onBlur={(e) => post({ kind: "commune-save", id: c.id, wilayaCode: c.wilayaCode, nameFr: c.nameFr, nameAr: e.target.value, nameEn: c.nameEn, active: c.active })} />
                      <button onClick={() => post({ kind: "commune-delete", id: c.id })} className="text-red-700 underline">×</button>
                    </li>
                  ))}
                </ul>
              </div>
              <textarea
                rows={3}
                placeholder={"Add communes (one per line)\ne.g. Bab Ezzouar\nBordj El Kiffan"}
                className="inp mt-3 text-[11px]"
                onBlur={(e) => {
                  if (!e.target.value.trim()) return;
                  void post({ kind: "commune-add-many", wilayaCode: selected.code, names: e.target.value });
                  e.target.value = "";
                }}
              />
              <p className="mt-1 text-[10px] text-[var(--svj-muted)]">
                Checkout reads directly from these tables, so the wilaya → commune dropdown is always up to date.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
