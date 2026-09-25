"use client";

import Link from "next/link";
import { useState } from "react";
import { money } from "@/lib/format";
import type { ShopProduct } from "@/lib/types";

const SUGGESTIONS = [
  "What should I use for dry skin?",
  "Which serum should I choose?",
  "Build me a simple morning routine",
  "Something for frizzy damaged hair",
];

export default function BeautyAI() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [picks, setPicks] = useState<ShopProduct[]>([]);

  async function ask(question: string) {
    if (!question.trim()) return;
    setBusy(true);
    setReply(null);
    setQ(question);
    const res = await fetch("/api/ai/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: question }),
    });
    const d = (await res.json()) as { reply: string; products: ShopProduct[] };
    setReply(d.reply);
    setPicks(d.products ?? []);
    setBusy(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Ask SunVera Jolie AI beauty assistant"
        className="fixed bottom-20 end-4 z-[65] flex items-center gap-2 rounded-full bg-cocoa px-4 py-3 text-[11px] uppercase tracking-widest text-ivory shadow-lg transition hover:bg-gold sm:bottom-6"
      >
        <span aria-hidden>✨</span> Ask AI
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[95] flex items-end justify-center bg-cocoa/40 p-0 sm:items-center sm:p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Beauty assistant"
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col bg-ivory"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-cocoa/10 px-5 py-4">
              <div>
                <h2 className="font-display text-lg">Ask SunVera Jolie AI</h2>
                <p className="text-[11px] text-cocoa-soft">Personal beauty guidance — not medical advice.</p>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close assistant">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {!reply && !busy && (
                <div className="space-y-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="block w-full border border-cocoa/15 bg-white px-4 py-2.5 text-start text-xs hover:border-gold"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {busy && <p className="text-sm text-cocoa-soft">Composing your recommendation…</p>}
              {reply && (
                <>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-cocoa">{reply}</p>
                  <div className="mt-4 space-y-2">
                    {picks.map((p) => (
                      <Link
                        key={p.id}
                        href={`/product/${p.slug}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 border border-cocoa/10 bg-white p-3 hover:border-gold"
                      >
                        <span className="text-2xl" aria-hidden>{p.emoji}</span>
                        <span className="flex-1 text-sm">{p.name}</span>
                        <span className="text-xs text-cocoa-soft">{money(p.price)}</span>
                      </Link>
                    ))}
                  </div>
                  <p className="mt-4 text-[10px] text-cocoa-soft">
                    SunVera Jolie AI offers cosmetic guidance only and does not diagnose or treat any
                    medical condition.
                  </p>
                </>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask(q);
              }}
              className="flex gap-2 border-t border-cocoa/10 p-4"
            >
              <label className="sr-only" htmlFor="ai-q">Your question</label>
              <input
                id="ai-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Describe your skin or hair concern…"
                className="inp !py-2.5"
              />
              <button disabled={busy} className="btn-primary !px-4 !py-2.5">Ask</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
