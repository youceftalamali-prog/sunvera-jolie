"use client";

import { useMemo, useState } from "react";

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

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  plan?: MasterPlan;
  status?: "working" | "preview" | "error";
};

function isArabic(text: string) {
  return /[\u0600-\u06FF]/.test(text);
}

export default function SunVeraMasterAI() {
  const [instruction, setInstruction] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);

  const hasMessages = messages.length > 0;

  const welcome = useMemo(
    () => ({
      text:
        "مرحباً، أنا SunVera Master AI. أخبرني بما تريد فعله في المتجر وسأحلل طلبك وأحوّله إلى خطوات واضحة عبر Homepage وProducts وMedia وOrders وCategories وShipping وSettings.",
    }),
    [],
  );

  async function sendMessage() {
    const text = instruction.trim();
    if (!text || busy) return;

    const userMessage: ChatMessage = {
      id: "user-" + Date.now(),
      role: "user",
      text,
    };

    setMessages((current) => [
      ...current,
      userMessage,
      {
        id: "assistant-" + Date.now(),
        role: "assistant",
        text: "SunVera AI is analyzing your request and routing it to the right admin areas…",
        status: "working",
      },
    ]);
    setInstruction("");
    setBusy(true);

    try {
      const res = await fetch("/api/admin/ai/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text }),
      });

      const data = (await res.json()) as { plan?: MasterPlan; error?: string };
      if (!res.ok) throw new Error(data.error || "Master AI request failed");

      setMessages((current) => {
        const next = [...current];
        const index = next.length - 1;
        next[index] = {
          id: next[index]?.id ?? "assistant-" + Date.now(),
          role: "assistant",
          text: "✓ Plan ready. No data has been changed.",
          status: "preview",
          plan: data.plan,
        };
        return next;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Master AI request failed";
      setMessages((current) => {
        const next = [...current];
        const index = next.length - 1;
        next[index] = {
          id: next[index]?.id ?? "assistant-" + Date.now(),
          role: "assistant",
          text: message,
          status: "error",
        };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function clearChat() {
    if (busy) return;
    setMessages([]);
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-[var(--svj-border)] bg-white shadow-[0_22px_70px_rgba(58,43,34,0.08)]">
      <div className="border-b border-[var(--svj-border)] bg-[linear-gradient(135deg,rgba(201,164,92,0.14),rgba(255,255,255,0.96))] px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-gold">
              SunVera AI Command Center
            </p>
            <h2 className="mt-1 font-display text-2xl">Master AI</h2>
            <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-[var(--svj-muted)]">
              Chat naturally with one central AI. Master AI understands your request and routes it to the appropriate SunVera admin domains.
            </p>
          </div>

          {hasMessages && (
            <button
              type="button"
              onClick={clearChat}
              disabled={busy}
              className="border border-[var(--svj-border)] px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--svj-muted)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              New chat
            </button>
          )}
        </div>
      </div>

      <div className="flex min-h-[540px] flex-col bg-[#fcfbf9]">
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 md:px-6">
          {!hasMessages ? (
            <div className="mx-auto flex max-w-3xl flex-col items-center justify-center py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--svj-border)] bg-white text-gold shadow-sm">
                ✦
              </div>
              <p className="mt-4 text-sm font-medium">SunVera Master AI</p>
              <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-[var(--svj-muted)]">
                {welcome.text}
              </p>
              <div className="mt-5 grid w-full max-w-2xl gap-2 sm:grid-cols-3">
                {[
                  "حلل المتجر وأعطني أهم الملاحظات",
                  "راجع المنتجات الأخيرة",
                  "اقترح تحسينات للصفحة الرئيسية",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInstruction(prompt)}
                    className="rounded-2xl border border-[var(--svj-border)] bg-white px-3 py-3 text-[10px] leading-relaxed text-[var(--svj-muted)] transition hover:border-gold hover:text-[var(--svj-foreground)]"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={
                      message.role === "user"
                        ? "max-w-[88%] rounded-[24px] rounded-br-md bg-[#2f2823] px-4 py-3 text-sm leading-relaxed text-white shadow-sm"
                        : "max-w-[94%] rounded-[24px] rounded-bl-md border border-[var(--svj-border)] bg-white px-4 py-4 text-sm leading-relaxed text-[var(--svj-foreground)] shadow-sm"
                    }
                    dir={isArabic(message.text) ? "rtl" : "ltr"}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          message.role === "user"
                            ? "text-[9px] font-semibold uppercase tracking-widest text-white/60"
                            : "text-[9px] font-semibold uppercase tracking-widest text-gold"
                        }
                      >
                        {message.role === "user" ? "You" : "SunVera Master AI"}
                      </span>
                      {message.status === "working" && (
                        <span className="inline-flex items-center gap-1 text-[9px] text-amber-700">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                          Working
                        </span>
                      )}
                    </div>

                    <p className="mt-2 whitespace-pre-wrap">{message.text}</p>

                    {message.plan && (
                      <div className="mt-4 rounded-2xl border border-[var(--svj-border)] bg-[#fcfbf9] p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div dir={isArabic(message.plan.summary) ? "rtl" : "ltr"}>
                            <p className="text-xs font-semibold">{message.plan.summary}</p>
                            <p className="mt-1 text-[10px] leading-relaxed text-[var(--svj-muted)]">
                              {message.plan.intent}
                            </p>
                          </div>
                          <span className="text-[9px] font-semibold uppercase tracking-widest text-[var(--svj-muted)]">
                            {message.plan.actions.length} actions
                          </span>
                        </div>

                        <div className="mt-3 grid gap-2 lg:grid-cols-2">
                          {message.plan.actions.map((action, index) => (
                            <div
                              key={index}
                              className="rounded-xl border border-[var(--svj-border)] bg-white p-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[9px] font-semibold uppercase tracking-widest text-gold">
                                  {action.domain}
                                </span>
                                {action.requiresConfirmation && (
                                  <span className="text-[8px] uppercase tracking-widest text-amber-700">
                                    Needs confirmation
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs font-medium">{action.operation}</p>
                              <p className="mt-1 text-[10px] leading-relaxed text-[var(--svj-muted)]">
                                {action.summary}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="border-t border-[var(--svj-border)] bg-white px-4 py-4 md:px-6">
          <div className="mx-auto max-w-4xl rounded-[24px] border border-[var(--svj-border)] bg-white p-2 shadow-[0_12px_35px_rgba(58,43,34,0.07)] focus-within:border-[rgba(201,164,92,0.65)]">
            <textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              dir={isArabic(instruction) ? "rtl" : "ltr"}
              className="w-full resize-none border-0 bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-[var(--svj-muted)]"
              placeholder="اكتب ما تريد من SunVera Master AI…"
              disabled={busy}
            />

            <div className="flex items-center justify-between gap-2 px-2 pb-1 pt-1">
              <div className="flex items-center gap-2 text-[9px] text-[var(--svj-muted)]">
                <span>Enter لإرسال الرسالة</span>
                <span>Shift + Enter لسطر جديد</span>
              </div>

              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={busy || !instruction.trim()}
                className="flex h-10 min-w-10 items-center justify-center rounded-full bg-[#2f2823] px-4 text-white shadow-sm transition hover:translate-y-[-1px] hover:bg-[#40362f] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                {busy ? "…" : "↑"}
              </button>
            </div>
          </div>

          <p className="mx-auto mt-2 max-w-4xl text-[9px] text-[var(--svj-muted)]">
            Preview mode only — no store data is changed yet.
          </p>
        </div>
      </div>
    </section>
  );
}
