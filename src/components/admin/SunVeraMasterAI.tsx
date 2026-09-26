"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AIRoute = { modality: string; model: string; label: string; source: string; task: string };

type MasterAction = {
  domain: string;
  operation: string;
  summary: string;
  requiresConfirmation: boolean;
  payload?: string;
};

type MasterPlan = {
  summary: string;
  intent: string;
  actions: MasterAction[];
};

type MasterArtifact = {
  type: "image" | "video";
  url: string;
  mediaId?: number;
  title?: string;
  alt?: string;
};

type ExecutionResult = {
  index: number;
  domain: string;
  operation: string;
  ok: boolean;
  executed: boolean;
  requiresConfirmation?: boolean;
  message: string;
  data?: unknown;
  artifacts?: MasterArtifact[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  reply?: string;
  plan?: MasterPlan;
  route?: AIRoute;
  webMode?: "auto" | "on" | "off";
  autonomyMode?: "assisted" | "autonomous";
  attachments?: AIImageAttachment[];
  execution?: ExecutionResult[];
  status?: "working" | "done" | "error";
};

type QuickAction = {
  label: string;
  prompt: string;
};

type AIImageAttachment = {
  mediaId: number;
  url: string;
  filename: string;
  alt?: string;
};

type FontScale = "normal" | "large" | "xlarge";

function isArabic(text: string) {
  return /[\u0600-\u06FF]/.test(text);
}

function domainLabel(domain: string) {
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

export default function SunVeraMasterAI() {
  const [instruction, setInstruction] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [modelMode, setModelMode] = useState("auto");
  const [webMode, setWebMode] = useState<"auto" | "on" | "off">("auto");
  const [aiRoutes, setAiRoutes] = useState<Record<string, AIRoute>>({});
  const [planOpen, setPlanOpen] = useState<Record<string, boolean>>({});
  const [showTools, setShowTools] = useState(false);
  const [attachmentNotice, setAttachmentNotice] = useState(false);
  const [attachments, setAttachments] = useState<AIImageAttachment[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fontScale, setFontScale] = useState<FontScale>("large");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const hasMessages = messages.length > 0;

  const masterBodySize = fontScale === "xlarge" ? 18 : fontScale === "large" ? 17 : 16;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("sunvera-master-ai-font-scale");
      if (saved === "normal" || saved === "large" || saved === "xlarge") {
        setFontScale(saved);
      }
    } catch {
      // Ignore local-storage access errors.
    }
  }, []);

  function changeFontScale(next: FontScale) {
    setFontScale(next);
    try {
      window.localStorage.setItem("sunvera-master-ai-font-scale", next);
    } catch {
      // Ignore local-storage access errors.
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/ai/models")
      .then((response) => response.json())
      .then((data) => {
        if (active && data?.routes) setAiRoutes(data.routes as Record<string, AIRoute>);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const welcome = useMemo(
    () => ({
      text:
        "مرحباً، أنا SunVera Master AI. أخبرني بما تريد فعله في المتجر وسأحلل طلبك وأحوّله إلى خطوات واضحة عبر Homepage وProducts وMedia وOrders وCategories وShipping وSettings.",
    }),
    [],
  );

  const quickActions: QuickAction[] = useMemo(
    () => [
      { label: "حلل أداء المتجر", prompt: "حلل المتجر وأعطني أهم الملاحظات والفرص." },
      { label: "راجع المنتجات", prompt: "راجع المنتجات الأخيرة وحالة المخزون والمنتجات المهمة." },
      { label: "حسّن الصفحة الرئيسية", prompt: "اقترح تحسينات للصفحة الرئيسية بما يناسب SunVera Jolie." },
      { label: "راجع الطلبات", prompt: "راجع الطلبات الأخيرة وحالاتها وأخبرني بما يحتاج متابعة." },
    ],
    [],
  );

  async function uploadImageFiles(files: FileList | File[]) {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;

    setUploadingAttachments(true);
    setAttachmentNotice(false);
    try {
      const form = new FormData();
      for (const file of imageFiles) form.append("files", file);
      form.append("folder", "ai");

      const response = await fetch("/api/admin/media", {
        method: "POST",
        body: form,
      });
      const raw = await response.text();
      let data: { created?: Array<AIImageAttachment & { id?: number }>; errors?: string[]; error?: string };
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {};
      } catch {
        throw new Error("Image upload returned an invalid server response.");
      }
      if (!response.ok) {
        throw new Error(data.error || data.errors?.join(", ") || "Could not upload images.");
      }

      const created = Array.isArray(data.created)
        ? data.created.filter((item) => item && Number(item.mediaId ?? item.id) > 0).map((item) => ({
            mediaId: Number(item.mediaId ?? item.id),
            url: String(item.url ?? ""),
            filename: String(item.filename ?? "Image"),
            alt: String(item.alt ?? ""),
          }))
        : [];

      if (!created.length) throw new Error("No images were uploaded.");
      setAttachments((current) => [...current, ...created].slice(0, 8));
      setInstruction((current) =>
        current.trim()
          ? current
          : "أنشئ لي مسودة صفحة منتج فاخرة من هذه الصور. حلل المنتج والمعلومات الظاهرة في الصور، واختر الفئة المناسبة، واكتب الاسم والوصف والفوائد والمكونات وطريقة الاستخدام وSEO دون اختراع معلومات غير ظاهرة.",
      );
    } catch (error) {
      setAttachmentNotice(error instanceof Error ? error.message : "Could not upload images.");
    } finally {
      setUploadingAttachments(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function removeAttachment(mediaId: number) {
    setAttachments((current) => current.filter((item) => item.mediaId !== mediaId));
  }

  function createProductFromImages() {
    if (!attachments.length || busy || uploadingAttachments) return;
    void sendMessage(
      "أنشئ لي مسودة صفحة منتج فاخرة من هذه الصور. حلل المنتج والمعلومات الظاهرة في الصور، اختر الفئة المناسبة من الفئات الموجودة، أنشئ الاسم والوصف القصير والوصف الكامل والفوائد والمكونات وطريقة الاستخدام والتحذيرات وSEO، وأرفق جميع الصور بالمنتج. لا تخترع سعر البيع؛ اترك السعر 0 إذا لم يظهر في الصور. لا تنشر المنتج، أنشئه كمسودة فقط.",
    );
  }

  async function sendMessage(forcedText?: string) {
    const text = (forcedText ?? instruction).trim();
    if (!text || busy) return;

    const userId = "user-" + Date.now();
    const assistantId = "assistant-" + Date.now();

    setMessages((current) => [
      ...current,
      { id: userId, role: "user", text, attachments: attachments.length ? attachments : undefined },
      {
        id: assistantId,
        role: "assistant",
        text: "SunVera Master AI is thinking",
        status: "working",
      },
    ]);
    setInstruction("");
    setShowTools(false);
    setAttachmentNotice(false);
    setAttachments([]);
    setBusy(true);

    try {
      const res = await fetch("/api/admin/ai/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: text,
          modelMode: attachments.length ? "vision" : modelMode,
          webMode,
          attachments,
        }),
      });

      const raw = await res.text();
      let data: {
        plan?: MasterPlan;
        route?: AIRoute;
        reply?: string;
        webMode?: "auto" | "on" | "off";
        autonomyMode?: "assisted" | "autonomous";
        execution?: ExecutionResult[];
        error?: string;
        detail?: string;
      };
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {};
      } catch {
        throw new Error(
          "Master AI server returned an invalid response (" +
            res.status +
            "). " +
            (raw.slice(0, 240) || "Empty response"),
        );
      }
      if (!res.ok) {
        throw new Error(data.detail ? data.error + ": " + data.detail : data.error || "Master AI request failed");
      }

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                id: assistantId,
                role: "assistant",
                text: data.reply || "✓ Master AI completed the request.",
                reply: data.reply,
                status: "done",
                plan: data.plan,
                route: data.route,
                autonomyMode: data.autonomyMode,
                execution: data.execution,
                        webMode: data.webMode,
                attachments: undefined,
              }
            : message,
        ),
      );

      setPlanOpen((current) => ({ ...current, [assistantId]: true }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Master AI request failed";
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? {
                id: assistantId,
                role: "assistant",
                text: message,
                status: "error",
              }
            : item,
        ),
      );
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
    setPlanOpen({});
    setInstruction("");
  }

  async function confirmAction(messageId: string, index: number) {
    const message = messages.find((item) => item.id === messageId);
    if (!message?.plan || busy || confirming) return;

    setConfirming(messageId + ":" + index);
    try {
      const res = await fetch("/api/admin/ai/master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: "نفّذ الإجراء الذي أكدته الآن.",
          webMode: "off",
          confirmedPlan: message.plan,
          confirmIndexes: [index],
        }),
      });

      const raw = await res.text();
      let data: {
        plan?: MasterPlan;
        route?: AIRoute;
        reply?: string;
        autonomyMode?: "assisted" | "autonomous";
        execution?: ExecutionResult[];
        webMode?: "auto" | "on" | "off";
        error?: string;
        detail?: string;
      };
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {};
      } catch {
        throw new Error(
          "Master AI server returned an invalid response (" +
            res.status +
            "). " +
            (raw.slice(0, 240) || "Empty response"),
        );
      }
      if (!res.ok) {
        throw new Error(data.detail ? data.error + ": " + data.detail : data.error || "Confirmed action failed");
      }

      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                text: data.reply || item.text,
                reply: data.reply || item.reply,
                plan: data.plan || item.plan,
                route: data.route || item.route,
                autonomyMode: data.autonomyMode || item.autonomyMode,
                execution: [
                  ...(item.execution ?? []).filter((execution) => execution.index !== index),
                  ...(data.execution ?? []),
                ],
                webMode: data.webMode || item.webMode,
                status: "done",
              }
            : item,
        ),
      );
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Confirmed action failed";
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                text: messageText,
                reply: messageText,
                status: "error",
              }
            : item,
        ),
      );
    } finally {
      setConfirming(null);
    }
  }

  function useQuickAction(prompt: string) {
    setInstruction(prompt);
    setShowTools(false);
    setAttachmentNotice(false);
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-[var(--svj-border)] bg-white shadow-[0_22px_70px_rgba(58,43,34,0.08)]">
      <div
        className="border-b border-[var(--svj-border)] bg-[linear-gradient(135deg,rgba(201,164,92,0.14),rgba(255,255,255,0.96))] px-5 py-4 md:px-6"
        style={{ fontSize: masterBodySize }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-gold">
              SunVera AI Command Center
            </p>
            <h2 className="mt-1 font-display text-2xl">Master AI</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--svj-muted)]">
              Chat naturally with one central AI. Master AI understands your request and routes it to the appropriate SunVera admin domains.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-full border border-[var(--svj-border)] bg-white/80 p-1 shadow-sm"
              role="group"
              aria-label="AI text size"
              title="تكبير أو تصغير خط Master AI"
            >
              <span className="px-1 text-xs font-semibold text-[var(--svj-muted)]" aria-hidden="true">Aa</span>
              {([["normal", "A−"], ["large", "A"], ["xlarge", "A+"] ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => changeFontScale(value)}
                  className={
                    fontScale === value
                      ? "rounded-full bg-[#2f2823] px-2.5 py-1.5 text-[10px] font-semibold text-white"
                      : "rounded-full px-2.5 py-1.5 text-[10px] font-semibold text-[var(--svj-muted)] transition hover:bg-white hover:text-[var(--svj-foreground)]"
                  }
                  aria-label={value === "normal" ? "Normal font size" : value === "large" ? "Large font size" : "Extra large font size"}
                  aria-pressed={fontScale === value}
                >
                  {label}
                </button>
              ))}
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
      </div>

      <div
        className="flex h-[680px] flex-col overflow-hidden bg-[#fcfbf9]"
        style={{ fontSize: masterBodySize }}
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 md:px-6">
          {!hasMessages ? (
            <div className="mx-auto flex max-w-3xl flex-col items-center justify-center py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--svj-border)] bg-white text-gold shadow-sm">
                ✦
              </div>
              <p className="mt-4 text-base font-medium">SunVera Master AI</p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--svj-muted)]">
                {welcome.text}
              </p>
              <div className="mt-5 grid w-full max-w-3xl gap-2 sm:grid-cols-2">
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    onClick={() => useQuickAction(action.prompt)}
                    className="rounded-2xl border border-[var(--svj-border)] bg-white px-4 py-4 text-start text-sm leading-6 text-[var(--svj-muted)] transition hover:border-gold hover:text-[var(--svj-foreground)]"
                  >
                    <span className="font-semibold text-[var(--svj-foreground)]">{action.label}</span>
                    <span className="mt-1 block text-xs leading-5">{action.prompt}</span>
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
                        ? "max-w-[88%] rounded-[24px] rounded-br-md bg-[#2f2823] px-5 py-4 text-[15px] leading-7 text-white shadow-sm"
                        : "max-w-[94%] rounded-[24px] rounded-bl-md border border-[var(--svj-border)] bg-white px-5 py-5 text-[16px] leading-7 text-[var(--svj-foreground)] shadow-sm"
                    }
                    dir={isArabic(message.text) ? "rtl" : "ltr"}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          message.role === "user"
                            ? "text-[11px] font-semibold uppercase tracking-wider text-white/70"
                            : "text-[11px] font-semibold uppercase tracking-wider text-gold"
                        }
                      >
                        {message.role === "user" ? "You" : "SunVera Master AI"}
                      </span>
                      {message.status === "working" && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-700">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                          <span className="animate-pulse">Thinking…</span>
                        </span>
                      )}
                      {message.route && (
                        <span
                          className="rounded-full border border-[var(--svj-border)] bg-[var(--svj-background)] px-2 py-0.5 text-[10px] text-[var(--svj-muted)]"
                          title={message.route.model}
                        >
                          Auto · {message.route.label} · {message.route.modality}
                        </span>
                      )}
                    </div>

                    {message.role === "user" && message.attachments?.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {message.attachments.map((attachment) => (
                          <img
                            key={attachment.mediaId}
                            src={attachment.url}
                            alt={attachment.alt || attachment.filename}
                            className="h-20 w-20 rounded-xl border border-white/20 object-cover"
                          />
                        ))}
                      </div>
                    )}
                    <p
                      className="mt-3 whitespace-pre-wrap"
                      style={{ fontSize: message.role === "assistant" ? masterBodySize : Math.max(15, masterBodySize - 1), lineHeight: 1.75 }}
                    >
                      {message.reply || message.text}
                      {message.status === "working" && (
                        <span className="ms-1 inline-flex gap-0.5 align-middle text-amber-600">
                          <span className="animate-bounce">.</span>
                          <span className="animate-bounce [animation-delay:120ms]">.</span>
                          <span className="animate-bounce [animation-delay:240ms]">.</span>
                        </span>
                      )}
                    </p>

                    {message.plan && (
                      <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--svj-border)] bg-[#fcfbf9]">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--svj-border)] px-4 py-3">
                          <div className="min-w-0" dir={isArabic(message.plan.summary) ? "rtl" : "ltr"}>
                            <p className="text-xs font-semibold">{message.plan.summary}</p>
                            <p className="mt-1 text-xs leading-5 text-[var(--svj-muted)]">
                              {message.plan.intent}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded-full border border-[var(--svj-border)] bg-white px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--svj-muted)]">
                              {message.plan.actions.length} actions
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setPlanOpen((current) => ({
                                  ...current,
                                  [message.id]: !(current[message.id] ?? true),
                                }))
                              }
                              className="rounded-full border border-[var(--svj-border)] bg-white px-3 py-2 text-[11px] font-semibold text-[var(--svj-foreground)] transition hover:border-gold"
                            >
                              {planOpen[message.id] === false ? "Review plan" : "Hide plan"}
                            </button>
                          </div>
                        </div>

                        {planOpen[message.id] !== false && (
                          <>
                            <div className="grid gap-2 p-3 lg:grid-cols-2">
                              {message.plan.actions.map((action, index) => (
                                <div
                                  key={index}
                                  className="rounded-xl border border-[var(--svj-border)] bg-white p-3"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gold">
                                      {domainLabel(action.domain)}
                                    </span>
                                    {action.requiresConfirmation && (
                                      <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] uppercase tracking-wider text-amber-700">
                                        Needs confirmation
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 text-sm font-medium">{action.operation}</p>
                                  <p className="mt-1 text-[10px] leading-relaxed text-[var(--svj-muted)]">
                                    {action.summary}
                                  </p>
                                  {(() => {
                                    const execution = message.execution?.find((item) => item.index === index);
                                    const needsConfirmation =
                                      execution?.requiresConfirmation === true && execution.executed === false;
                                    return needsConfirmation ? (
                                      <button
                                        type="button"
                                        onClick={() => void confirmAction(message.id, index)}
                                        disabled={busy || confirming !== null}
                                        className="mt-3 rounded-full bg-[#2f2823] px-4 py-2 text-[11px] font-semibold text-white transition hover:bg-[#40362f] disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {confirming === message.id + ":" + index ? "Executing…" : "Confirm & execute"}
                                      </button>
                                    ) : null;
                                  })()}
                                </div>
                              ))}
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--svj-border)] px-4 py-4">
                              <span className="text-xs leading-5 text-[var(--svj-muted)]">
                                Execution tools are connected. Safe content operations can run automatically; protected actions require your confirmation.
                              </span>
                              {message.autonomyMode === "autonomous" ? (
                                <span className="rounded-full bg-green-50 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-green-800">
                                  Auto execution enabled
                                </span>
                              ) : (
                                <span className="rounded-full bg-amber-50 px-3 py-2 text-[9px] font-semibold uppercase tracking-widest text-amber-800">
                                  Confirmation required
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {message.execution?.some((item) => item.artifacts?.length) && (
                      <div className="mt-4 space-y-3">
                        {message.execution.flatMap((item) => item.artifacts ?? []).map((artifact, index) => (
                          <div
                            key={(artifact.mediaId ?? 0) + "-" + index}
                            className="overflow-hidden rounded-2xl border border-[var(--svj-border)] bg-white shadow-sm"
                          >
                            {artifact.type === "image" ? (
                              <img
                                src={artifact.url}
                                alt={artifact.alt ?? artifact.title ?? "SunVera AI generated image"}
                                className="block max-h-[520px] w-full object-contain bg-[#f7f3ee]"
                              />
                            ) : (
                              <video
                                src={artifact.url}
                                controls
                                className="block max-h-[520px] w-full bg-black"
                              />
                            )}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--svj-border)] px-3 py-3">
                              <div className="min-w-0">
                                <p className="truncate text-[10px] font-semibold">
                                  {artifact.title ?? (artifact.type === "image" ? "Generated image" : "Generated video")}
                                </p>
                                <p className="mt-0.5 text-[11px] text-[var(--svj-muted)]">
                                  Created by SunVera Master AI
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <a
                                  href={artifact.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-full border border-[var(--svj-border)] px-4 py-2 text-[11px] font-semibold transition hover:border-gold"
                                >
                                  Open
                                </a>
                                {artifact.mediaId ? (
                                  <a
                                    href={"/api/admin/ai/media/" + artifact.mediaId + "/download"}
                                    className="rounded-full bg-[#2f2823] px-3 py-1.5 text-[9px] font-semibold text-white transition hover:bg-[#40362f]"
                                  >
                                    Download
                                  </a>
                                ) : (
                                  <a
                                    href={artifact.url}
                                    download
                                    className="rounded-full bg-[#2f2823] px-3 py-1.5 text-[9px] font-semibold text-white transition hover:bg-[#40362f]"
                                  >
                                    Download
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {message.execution && message.execution.length > 0 && (
                      <div className="mt-3 rounded-xl border border-[var(--svj-border)] bg-[var(--svj-background)] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[9px] font-semibold uppercase tracking-widest text-gold">
                            {message.autonomyMode === "autonomous" ? "Autonomous execution" : "Execution preview"}
                          </span>
                          <span className="text-[8px] text-[var(--svj-muted)]">
                            {message.execution.filter((item) => item.executed).length} applied · {message.execution.filter((item) => !item.executed).length} held
                          </span>
                        </div>
                        <div className="mt-2 space-y-1.5">
                          {message.execution.map((item) => (
                            <div key={item.index} className="flex items-start gap-2 text-[9px] leading-relaxed">
                              <span className={item.executed ? "text-green-700" : item.ok ? "text-amber-700" : "text-red-700"}>
                                {item.executed ? "✓" : item.ok ? "•" : "!"}
                              </span>
                              <span className="min-w-0 flex-1">
                                <strong>{item.domain}</strong> · {item.operation} — {item.message}
                                {item.operation === "products.create_draft" &&
                                  item.data &&
                                  typeof item.data === "object" &&
                                  "editUrl" in item.data &&
                                  typeof item.data.editUrl === "string" && (
                                    <span className="ms-2 inline-flex gap-2">
                                      <a
                                        href={item.data.editUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-full border border-[var(--svj-border)] bg-white px-2.5 py-1 text-[10px] font-semibold text-cocoa transition hover:border-gold"
                                      >
                                        Open draft
                                      </a>
                                      {"storefrontPreviewUrl" in item.data && typeof item.data.storefrontPreviewUrl === "string" && (
                                        <a
                                          href={item.data.storefrontPreviewUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="rounded-full border border-[var(--svj-border)] bg-white px-2.5 py-1 text-[10px] font-semibold text-cocoa transition hover:border-gold"
                                        >
                                          Preview
                                        </a>
                                      )}
                                    </span>
                                  )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {message.status === "done" && (
                      <div className="mt-3 text-[9px] text-[var(--svj-muted)]">
                        {message.autonomyMode === "autonomous"
                          ? "Autonomous content mode is active. Destructive, financial, inventory and order actions remain protected."
                          : "Ready for the next step. Protected actions still require confirmation."}
                      </div>
                    )}

                    {message.status === "error" && (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-800">
                        Something went wrong. Check the AI provider and try again.
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} className="h-px w-full" aria-hidden="true" />
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-[var(--svj-border)] bg-white px-4 py-4 md:px-6">
          <div className="relative mx-auto max-w-4xl rounded-[24px] border border-[var(--svj-border)] bg-white p-2 shadow-[0_12px_35px_rgba(58,43,34,0.07)] focus-within:border-[rgba(201,164,92,0.65)]">
            {showTools && (
              <div className="absolute bottom-full left-2 right-2 mb-2 rounded-2xl border border-[var(--svj-border)] bg-white p-2 shadow-[0_14px_35px_rgba(58,43,34,0.1)]">
                <div className="grid gap-2 sm:grid-cols-2">
                  {quickActions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => useQuickAction(action.prompt)}
                      className="rounded-xl border border-[var(--svj-border)] px-3 py-2 text-start text-[10px] transition hover:border-gold"
                    >
                      <span className="font-semibold">{action.label}</span>
                      <span className="mt-1 block text-[9px] text-[var(--svj-muted)]">
                        {action.prompt}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {attachmentNotice && (
              <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                {attachmentNotice}
              </div>
            )}

            {attachments.length > 0 && (
              <div className="mb-3 rounded-2xl border border-[var(--svj-border)] bg-[#fcfbf9] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold">Attached product images · {attachments.length}/8</div>
                  <button
                    type="button"
                    onClick={createProductFromImages}
                    disabled={busy || uploadingAttachments}
                    className="rounded-full bg-[#2f2823] px-4 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
                  >
                    Create product draft from images
                  </button>
                </div>
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {attachments.map((attachment) => (
                    <div key={attachment.mediaId} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[var(--svj-border)] bg-white">
                      <img src={attachment.url} alt={attachment.alt || attachment.filename} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.mediaId)}
                        aria-label={"Remove " + attachment.filename}
                        className="absolute end-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              dir={isArabic(instruction) ? "rtl" : "ltr"}
              className="w-full resize-none border-0 bg-transparent px-3 py-3 text-[16px] leading-7 outline-none placeholder:text-[var(--svj-muted)]"
              placeholder="اكتب ما تريد من SunVera Master AI…"
              disabled={busy}
            />

            <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-1 pt-1">
              <div className="flex items-center gap-2 text-[11px] text-[var(--svj-muted)]">
                <button
                  type="button"
                  onClick={() => setShowTools((value) => !value)}
                  disabled={busy}
                  aria-label="Quick actions"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--svj-border)] text-base transition hover:border-gold disabled:opacity-50"
                >
                  +
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files) void uploadImageFiles(event.target.files);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy || uploadingAttachments}
                  aria-label="Attach product images"
                  title="Upload product images for Master AI"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--svj-border)] transition hover:border-gold disabled:opacity-50"
                >
                  <span aria-hidden="true">{uploadingAttachments ? "…" : "📎"}</span>
                </button>

                <label className="hidden items-center gap-1 rounded-full border border-[var(--svj-border)] px-3 py-2 sm:flex">
                  <span className="text-[8px] uppercase tracking-widest text-[var(--svj-muted)]">Model</span>
                  <select
                    value={modelMode}
                    onChange={(event) => setModelMode(event.target.value)}
                    disabled={busy}
                    className="bg-transparent text-[11px] font-semibold outline-none"
                  >
                    <option value="auto">Auto · Recommended</option>
                    <option value="text">Text / Analysis</option>
                    <option value="vision">Vision · Image input</option>
                    <option value="image" disabled>Image generation (Gateway ready)</option>
                    <option value="video" disabled>Video generation (Gateway ready)</option>
                  </select>
                </label>
                <label className="hidden items-center gap-1 rounded-full border border-[var(--svj-border)] px-2.5 py-1.5 sm:flex">
                  <span className="text-[8px] uppercase tracking-widest text-[var(--svj-muted)]">Web</span>
                  <select
                    value={webMode}
                    onChange={(event) => setWebMode(event.target.value as "auto" | "on" | "off")}
                    disabled={busy}
                    className="bg-transparent text-[9px] font-semibold outline-none"
                  >
                    <option value="auto">Auto</option>
                    <option value="on">On</option>
                    <option value="off">Off</option>
                  </select>
                </label>

                <span className="hidden sm:inline">Enter لإرسال · Shift + Enter لسطر جديد</span>
                {aiRoutes.text && (
                  <span
                    className="hidden max-w-[240px] truncate text-[10px] text-[var(--svj-muted)] md:inline"
                    title={aiRoutes.text.model}
                  >
                    {modelMode === "auto" ? "Auto · " : ""}{aiRoutes.text.label}
                  </span>
                )}
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

          <p className="mx-auto mt-3 max-w-4xl text-xs leading-5 text-[var(--svj-muted)]">
            Autonomous mode handles safe content work automatically. Web search is {webMode === "on" ? "enabled" : webMode === "off" ? "disabled" : "automatic when useful"}. High-impact financial, inventory, security and order actions remain protected.
          </p>
        </div>
      </div>
    </section>
  );
}
