"use client";

import { useState } from "react";

type Plan = { summary: string; actions: { type: string; sectionKey?: string; patch?: Record<string, unknown>; sectionKeys?: string[] }[] };

export default function AIDesignAssistant() {
  const [instruction, setInstruction] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function request(apply: boolean) {
    if (!instruction.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/ai/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, apply }),
      });
      const data = (await res.json()) as { plan?: Plan; applied?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error || "AI design request failed");
      if (data.plan) setPlan(data.plan);
      setMessage(data.applied ? "Changes applied ✓ Refresh the CMS to see the saved values." : "Plan ready. Review it before applying.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white p-5">
      <div>
        <h2 className="text-[12px] font-semibold uppercase tracking-widest">✨ AI Design Assistant</h2>
        <p className="mt-1 text-[10px] text-[var(--svj-muted)]">
          Describe a homepage change in Arabic or English. The assistant creates safe CMS/theme changes; it does not edit source code.
        </p>
      </div>
      <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={4} className="inp mt-4" placeholder="Example: Make the New Arrivals heading 50px in Cormorant Garamond and use champagne gold buttons." />
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void request(false)} disabled={busy} className="btn-outline !py-2">{busy ? "Thinking…" : "Preview Changes"}</button>
        <button type="button" onClick={() => void request(true)} disabled={busy} className="btn-primary !py-2">Apply Changes</button>
      </div>
      {message && <p className="mt-3 text-[11px] text-[var(--svj-muted)]">{message}</p>}
      {plan && (
        <div className="mt-4 border border-[var(--svj-border)] bg-[var(--svj-background)] p-3">
          <p className="text-xs font-semibold">{plan.summary}</p>
          <ul className="mt-2 space-y-1 text-[10px] text-[var(--svj-muted)]">
            {plan.actions.map((action, index) => <li key={index}>{action.type}{action.sectionKey ? " · " + action.sectionKey : ""}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
