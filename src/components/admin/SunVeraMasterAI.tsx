"use client";

import { useState } from "react";

type MasterAction = {
  domain: string;
  operation: string;
  summary: string;
  requiresConfirmation: boolean;
};

type MasterPlan = {
  summary: string;
  intent: string;
  actions: MasterAction[];
};

type Status = "idle" | "working" | "preview" | "error";

export default function SunVeraMasterAI() {
  const [instruction, setInstruction] = useState("");
  const [plan, setPlan] = useState<MasterPlan | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function preview() {
    if (!instruction.trim()) return;
    setBusy(true);
    setStatus("working");
    setMessage("SunVera AI is analyzing your request and routing it to the right admin areas…");

    try {
      const res = await fetch("/api/admin/ai/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      const data = (await res.json()) as { plan?: MasterPlan; error?: string };
      if (!res.ok) throw new Error(data.error || "Master AI request failed");
      setPlan(data.plan ?? null);
      setStatus("preview");
      setMessage("✓ Plan ready. No data has been changed.");
    } catch (e) {
      setStatus("error");
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const statusClass =
    status === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : status === "working"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : status === "preview"
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-[var(--svj-border)] bg-[var(--svj-background)] text-[var(--svj-muted)]";

  return (
    <section className="overflow-hidden border border-[var(--svj-border)] bg-white shadow-[0_18px_50px_rgba(58,43,34,0.06)]">
      <div className="border-b border-[var(--svj-border)] bg-[linear-gradient(135deg,rgba(201,164,92,0.12),rgba(255,255,255,0.95))] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-gold">SunVera AI Command Center</p>
            <h2 className="mt-1 font-display text-2xl">Master AI</h2>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[var(--svj-muted)]">
              One command in Arabic or English. Master AI analyzes the request and prepares a plan across Homepage, Products, Media, Orders, Categories, Shipping and Settings.
            </p>
          </div>
          {status === "working" && (
            <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-amber-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              Working
            </span>
          )}
        </div>

        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={4}
          className="inp mt-4"
          placeholder="مثال: راجع الصفحة الرئيسية والمنتجات الجديدة والطلبات المعلقة، واقترح لي ما الذي يحتاج إلى متابعة أولاً."
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void preview()}
            disabled={busy || !instruction.trim()}
            className="btn-primary !py-2"
          >
            {busy ? "Analyzing…" : "Preview Master Plan"}
          </button>
          <span className="text-[10px] text-[var(--svj-muted)]">
            Preview only — execution tools are connected domain by domain.
          </span>
        </div>

        {message && (
          <div className={\`mt-3 border p-3 text-[11px] leading-relaxed \${statusClass}\`}>
            {status === "working" && <span className="me-2 inline-block animate-pulse">●</span>}
            {message}
          </div>
        )}
      </div>

      {plan && (
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold">{plan.summary}</p>
              <p className="mt-1 text-[10px] text-[var(--svj-muted)]">{plan.intent}</p>
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--svj-muted)]">
              {plan.actions.length} actions
            </span>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {plan.actions.map((action, index) => (
              <div key={index} className="border border-[var(--svj-border)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] font-semibold uppercase tracking-widest text-gold">{action.domain}</span>
                  {action.requiresConfirmation && (
                    <span className="text-[9px] uppercase tracking-widest text-amber-700">Needs confirmation</span>
                  )}
                </div>
                <p className="mt-1 text-xs font-medium">{action.operation}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--svj-muted)]">{action.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
