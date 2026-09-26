"use client";

import { useState } from "react";

type Plan = {
  summary: string;
  actions: {
    type: string;
    sectionKey?: string;
    patch?: Record<string, unknown>;
    sectionKeys?: string[];
  }[];
};

type Status = "idle" | "working" | "preview" | "applied" | "error";

export default function AIDesignAssistant() {
  const [instruction, setInstruction] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function request(apply: boolean) {
    if (!instruction.trim()) return;

    setBusy(true);
    setStatus("working");
    setMessage(apply ? "AI is applying the requested changes…" : "AI is preparing a preview…");

    try {
      const res = await fetch("/api/admin/ai/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, apply }),
      });

      const data = (await res.json()) as {
        plan?: Plan;
        applied?: boolean;
        error?: string;
      };

      if (!res.ok) throw new Error(data.error || "AI design request failed");

      if (data.plan) setPlan(data.plan);

      if (data.applied) {
        setStatus("applied");
        setMessage("✓ Changes applied successfully. Refresh the CMS to see the saved values.");
      } else {
        setStatus("preview");
        setMessage("✓ Preview ready. Review the plan below, then press Apply Changes to make it live.");
      }
    } catch (e) {
      setStatus("error");
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const statusClass =
    status === "applied"
      ? "border-green-200 bg-green-50 text-green-800"
      : status === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : status === "working"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-[var(--svj-border)] bg-[var(--svj-background)] text-[var(--svj-muted)]";

  return (
    <section className="bg-white p-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest">✨ AI Design Assistant</h2>
          {status === "working" && (
            <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-amber-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              Working
            </span>
          )}
        </div>
        <p className="mt-1 text-[10px] text-[var(--svj-muted)]">
          Describe a homepage change in Arabic or English. The assistant creates safe CMS/theme changes; it does not edit source code.
        </p>
      </div>

      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={4}
        className="inp mt-4"
        placeholder="Example: Make the New Arrivals heading 50px in Cormorant Garamond and use champagne gold buttons."
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void request(false)}
          disabled={busy || !instruction.trim()}
          className="btn-outline !py-2"
        >
          {busy ? "Working…" : "Preview Changes"}
        </button>
        <button
          type="button"
          onClick={() => void request(true)}
          disabled={busy || !instruction.trim()}
          className="btn-primary !py-2"
        >
          Apply Changes
        </button>
        {(status === "applied" || status === "preview") && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-outline !py-2"
          >
            Refresh CMS
          </button>
        )}
      </div>

      {message && (
        <div className={`mt-3 border p-3 text-[11px] leading-relaxed ${statusClass}`}>
          {status === "working" && <span className="me-2 inline-block animate-pulse">●</span>}
          {message}
        </div>
      )}

      {plan && (
        <div className="mt-4 border border-[var(--svj-border)] bg-[var(--svj-background)] p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-xs font-semibold">{plan.summary}</p>
            <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--svj-muted)]">
              {plan.actions.length} action{plan.actions.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="mt-2 space-y-1 text-[10px] text-[var(--svj-muted)]">
            {plan.actions.map((action, index) => (
              <li key={index}>
                {action.type}
                {action.sectionKey ? " · " + action.sectionKey : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
