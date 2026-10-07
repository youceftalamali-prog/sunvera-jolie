"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type AIRoute = { modality: string; model: string; label: string; source: string; task: string };
type AIModelOption = {
  id: string;
  name: string;
  modality: "text" | "vision";
  isFree: boolean;
  promptPricePerMillion: number;
  completionPricePerMillion: number;
};

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
  modelSelection?: ModelSelection;
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
type ChatTypography = {
  fontFamily: "system" | "arabic" | "cairo" | "tajawal" | "serif" | "playfair" | "amiri";
  fontSize: number;
  fontWeight: "400" | "500" | "600" | "700";
  color: string;
};
const DEFAULT_USER_CHAT_TYPOGRAPHY: ChatTypography = { fontFamily: "system", fontSize: 17, fontWeight: "400", color: "#ffffff" };
const DEFAULT_AI_CHAT_TYPOGRAPHY: ChatTypography = { fontFamily: "system", fontSize: 17, fontWeight: "400", color: "#3a2b22" };
type ChatColors = {
  chatBackground: string;
  userBubble: string;
  aiBubble: string;
};
const DEFAULT_CHAT_COLORS: ChatColors = {
  chatBackground: "#fcfbf9",
  userBubble: "#2f2823",
  aiBubble: "#ffffff",
};
function chatFont(font: ChatTypography["fontFamily"]) {
  switch (font) {
    case "arabic": return "'Noto Sans Arabic', Tahoma, Arial, sans-serif";
    case "cairo": return "Cairo, 'Noto Sans Arabic', Tahoma, sans-serif";
    case "tajawal": return "Tajawal, 'Noto Sans Arabic', Tahoma, sans-serif";
    case "serif": return "Georgia, 'Times New Roman', serif";
    case "playfair": return "'Playfair Display', Georgia, serif";
    case "amiri": return "Amiri, Georgia, serif";
    default: return "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif";
  }
}

type ModelSelection = {
  mode: "auto" | "manual";
  text?: AIRoute | null;
  vision?: AIRoute | null;
};

type ScreenScan = {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  visibleText: string;
  elements: Array<{
    tag: string;
    role?: string;
    label?: string;
    text?: string;
    type?: string;
    rect: { x: number; y: number; width: number; height: number };
  }>;
  sections: Array<{ key: string; text?: string; rect: { x: number; y: number; width: number; height: number } }>;
};

type ConversationSummary = {
  id: number;
  title: string;
  activeProductId?: number | null;
  activeMediaIds?: number[];
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

function isArabic(text: string) {
  return /[\u0600-\u06FF]/.test(text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function domainLabel(domain: string) {
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

export default function SunVeraMasterAI() {
  const [instruction, setInstruction] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showCommandHeader, setShowCommandHeader] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [modelMode, setModelMode] = useState("text");
  const [autoModel, setAutoModel] = useState(true);
  const [webMode, setWebMode] = useState<"auto" | "on" | "off">("auto");
  const [aiRoutes, setAiRoutes] = useState<Record<string, AIRoute>>({});
  const [aiModels, setAiModels] = useState<{ text: AIModelOption[]; vision: AIModelOption[] }>({ text: [], vision: [] });
  const [textModel, setTextModel] = useState("");
  const [visionModel, setVisionModel] = useState("");
  const [showTools, setShowTools] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [attachmentNotice, setAttachmentNotice] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AIImageAttachment[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [fontScale, setFontScale] = useState<FontScale>("large");
  const [userChatTypography, setUserChatTypography] = useState<ChatTypography>(DEFAULT_USER_CHAT_TYPOGRAPHY);
  const [aiChatTypography, setAiChatTypography] = useState<ChatTypography>(DEFAULT_AI_CHAT_TYPOGRAPHY);
  const [userTypographyOpen, setUserTypographyOpen] = useState(false);
  const [aiTypographyOpen, setAiTypographyOpen] = useState(false);
  const [chatColors, setChatColors] = useState<ChatColors>(DEFAULT_CHAT_COLORS);
  const [chatColorsOpen, setChatColorsOpen] = useState(false);
  const [liveClock, setLiveClock] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const hasMessages = messages.length > 0;
  const activeConversation = conversations.find((conversation) => conversation.id === conversationId) ?? null;

  const masterBodySize = fontScale === "xlarge" ? 18 : fontScale === "large" ? 17 : 16;

  const loadConversation = useCallback(async (id: number) => {
    if (!Number.isInteger(id) || id <= 0) return;
    setLoadingConversation(true);
    try {
      const response = await fetch("/api/admin/ai/master?conversationId=" + encodeURIComponent(String(id)), {
        cache: "no-store",
      });
      if (!response.ok) {
        if (response.status === 404) {
          window.localStorage.removeItem("sunvera-master-ai-conversation-id");
        }
        return;
      }
      const data = await response.json();
      setConversationId(id);
      setMessages(Array.isArray(data?.messages) ? (data.messages as ChatMessage[]) : []);
      setAttachments([]);
      setAttachmentNotice(null);
      try {
        window.localStorage.setItem("sunvera-master-ai-conversation-id", String(id));
        const savedDraft = window.localStorage.getItem("sunvera-master-ai-draft-" + id);
        setInstruction(savedDraft || "");
      } catch {
        // Ignore local-storage access errors.
      }
      setShowHistory(false);
    } finally {
      setLoadingConversation(false);
    }
  }, []);

  const refreshConversations = useCallback(async (selectLatest = false) => {
    setLoadingHistory(true);
    try {
      const response = await fetch("/api/admin/ai/conversations", { cache: "no-store" });
      if (!response.ok) return [];
      const data = (await response.json()) as { conversations?: ConversationSummary[] };
      const next = Array.isArray(data.conversations) ? data.conversations : [];
      setConversations(next);

      const savedRaw = window.localStorage.getItem("sunvera-master-ai-conversation-id");
      const savedId = savedRaw ? Number(savedRaw) : NaN;
      const savedConversation = next.find((conversation) => conversation.id === savedId);
      const candidateId = selectLatest
        ? next[0]?.id
        : savedConversation?.id ?? next[0]?.id ?? null;

      if (candidateId) {
        await loadConversation(candidateId);
      } else {
        setConversationId(null);
        setMessages([]);
      }

      return next;
    } catch {
      return [];
    } finally {
      setLoadingHistory(false);
    }
  }, [loadConversation]);

  async function startNewChat() {
    if (busy || loadingConversation) return;
    setLoadingConversation(true);
    try {
      const response = await fetch("/api/admin/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New chat" }),
      });
      if (!response.ok) throw new Error("Could not start a new chat.");
      const data = (await response.json()) as { conversation?: ConversationSummary };
      const conversation = data.conversation;
      if (!conversation) throw new Error("Could not start a new chat.");
      setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
      await loadConversation(conversation.id);
      setInstruction("");
      try {
        window.localStorage.removeItem("sunvera-master-ai-draft-" + conversation.id);
      } catch {
        // Ignore local-storage access errors.
      }
    } catch (error) {
      setAttachmentNotice(error instanceof Error ? error.message : "Could not start a new chat.");
    } finally {
      setLoadingConversation(false);
    }
  }

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("sunvera-master-ai-auto-model");
      if (saved === "on") setAutoModel(true);
      if (saved === "off") setAutoModel(false);
    } catch {
      // Ignore local-storage access errors.
    }
  }, []);

  useEffect(() => {
    try {
      const key = "sunvera-master-ai-draft-" + (conversationId ?? "new");
      if (instruction.trim()) {
        window.localStorage.setItem(key, instruction);
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Ignore local-storage access errors.
    }
  }, [conversationId, instruction]);

  function toggleAutoModel(next: boolean) {
    setAutoModel(next);
    try {
      window.localStorage.setItem("sunvera-master-ai-auto-model", next ? "on" : "off");
    } catch {
      // Ignore local-storage access errors.
    }
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("sunvera-master-ai-font-scale");
      if (saved === "normal" || saved === "large" || saved === "xlarge") {
        setFontScale(saved);
      }
      const savedUserTypography = window.localStorage.getItem("sunvera-master-ai-user-typography");
      const savedAiTypography = window.localStorage.getItem("sunvera-master-ai-ai-typography");
      const savedChatColors = window.localStorage.getItem("sunvera-master-ai-chat-colors");
      if (savedChatColors) {
        try { setChatColors({ ...DEFAULT_CHAT_COLORS, ...JSON.parse(savedChatColors) }); } catch { /* ignore */ }
      }
      const legacyTypography = window.localStorage.getItem("sunvera-master-ai-chat-typography");
      if (savedUserTypography) {
        try { setUserChatTypography({ ...DEFAULT_USER_CHAT_TYPOGRAPHY, ...JSON.parse(savedUserTypography) }); } catch { /* ignore */ }
      } else if (legacyTypography) {
        try { setUserChatTypography({ ...DEFAULT_USER_CHAT_TYPOGRAPHY, ...JSON.parse(legacyTypography) }); } catch { /* ignore */ }
      }
      if (savedAiTypography) {
        try { setAiChatTypography({ ...DEFAULT_AI_CHAT_TYPOGRAPHY, ...JSON.parse(savedAiTypography) }); } catch { /* ignore */ }
      } else if (legacyTypography) {
        try { setAiChatTypography({ ...DEFAULT_AI_CHAT_TYPOGRAPHY, ...JSON.parse(legacyTypography) }); } catch { /* ignore */ }
      }
    } catch {
      // Ignore local-storage access errors.
    }
  }, []);

  function updateUserChatTypography(patch: Partial<ChatTypography>) {
    setUserChatTypography((current) => {
      const next = { ...current, ...patch };
      try { window.localStorage.setItem("sunvera-master-ai-user-typography", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function updateAiChatTypography(patch: Partial<ChatTypography>) {
    setAiChatTypography((current) => {
      const next = { ...current, ...patch };
      try { window.localStorage.setItem("sunvera-master-ai-ai-typography", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function updateChatColors(patch: Partial<ChatColors>) {
    setChatColors((current) => {
      const next = { ...current, ...patch };
      try { window.localStorage.setItem("sunvera-master-ai-chat-colors", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const update = () => {
      try {
        setLiveClock(new Date().toLocaleString());
      } catch {
        setLiveClock("");
      }
    };
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/ai/models")
      .then((response) => response.json())
.then((data) => {
        if (!active) return;
        if (data?.routes) {
          const routes = data.routes as Record<string, AIRoute>;
          setAiRoutes(routes);
          setTextModel((current) => current || routes.text?.model || "");
          setVisionModel((current) => current || routes.vision?.model || "");
        }
        if (data?.models) {
          setAiModels(data.models as { text: AIModelOption[]; vision: AIModelOption[] });
        }
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
    setAttachmentNotice(null);
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

  function collectScreenScan(): ScreenScan {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const isVisible = (element: Element) => {
      const node = element as HTMLElement;
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0;
    };
    const labelFor = (element: Element) => {
      const node = element as HTMLElement;
      const aria = node.getAttribute("aria-label");
      if (aria) return aria.trim();
      const labelledBy = node.getAttribute("aria-labelledby");
      if (labelledBy) {
        return labelledBy.split(/\\s+/).map((id) => document.getElementById(id)?.textContent?.trim() || "").filter(Boolean).join(" ");
      }
      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement || node instanceof HTMLSelectElement) {
        const associated = node.id ? document.querySelector('label[for="' + CSS.escape(node.id) + '"]') : null;
        return associated?.textContent?.trim() || node.getAttribute("placeholder") || "";
      }
      return "";
    };
    const elements = Array.from(document.querySelectorAll("button,a,input,textarea,select,[role='button'],[role='tab'],[data-master-control='true']"))
      .filter(isVisible)
      .slice(0, 220)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const node = element as HTMLElement;
        return {
          tag: node.tagName.toLowerCase(),
          role: node.getAttribute("role") || undefined,
          label: labelFor(element) || undefined,
          text: (node.innerText || node.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 240) || undefined,
          type: node instanceof HTMLInputElement ? node.type : undefined,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        };
      });
    const sections = Array.from(document.querySelectorAll("[data-master-control='true'][data-section-key]"))
      .filter(isVisible)
      .slice(0, 80)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const node = element as HTMLElement;
        return {
          key: node.getAttribute("data-section-key") || "",
          text: (node.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 500) || undefined,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        };
      });
    return {
      url: window.location.href,
      title: document.title,
      viewport,
      visibleText: (document.body.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 12000),
      elements,
      sections,
    };
  }


  function createProductFromImages() {
    if (!attachments.length || busy || uploadingAttachments) return;
    void sendMessage(
      "أنشئ لي صفحة منتج فاخرة من هذه الصور. حلل المنتج والمعلومات الظاهرة في الصور، اختر الفئة المناسبة من الفئات الموجودة، أنشئ الاسم والوصف القصير والوصف الكامل والفوائد والمكونات وطريقة الاستخدام والتحذيرات وSEO، وأرفق جميع الصور بالمنتج. لا تخترع سعر البيع؛ اترك السعر 0 إذا لم يظهر في الصور. أنشئ الصفحة الآن واجعلها جاهزة للمعاينة، ولا تنشرها للزبائن قبل أن أضغط أنا على زر النشر.",
    );
  }

  async function ensureMasterConversation() {
    if (conversationId && Number.isInteger(conversationId) && conversationId > 0) return conversationId;
    const response = await fetch("/api/admin/ai/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New chat" }),
    });
    if (!response.ok) throw new Error("Could not start a Master AI conversation.");
    const data = (await response.json()) as { conversation?: ConversationSummary };
    const conversation = data.conversation;
    if (!conversation) throw new Error("Could not start a Master AI conversation.");
    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
    setConversationId(conversation.id);
    try {
      window.localStorage.setItem("sunvera-master-ai-conversation-id", String(conversation.id));
    } catch {
      // Ignore local-storage access errors.
    }
    return conversation.id;
  }

  async function pollForAssistantResult(
    targetConversationId: number,
    previousAssistantCount: number,
  ): Promise<ChatMessage> {
    const deadline = Date.now() + 14 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const poll = await fetch(
        "/api/admin/ai/master?conversationId=" + encodeURIComponent(String(targetConversationId)),
        { cache: "no-store" },
      );
      if (!poll.ok) continue;

      const data = (await poll.json()) as { messages?: ChatMessage[] };
      const nextMessages = Array.isArray(data.messages) ? data.messages : [];
      const assistantMessages = nextMessages.filter((message) => message.role === "assistant");
      const latestAssistant = assistantMessages[assistantMessages.length - 1];

      if (latestAssistant && assistantMessages.length > previousAssistantCount) {
        setMessages(nextMessages);
        setConversationId(targetConversationId);
        return latestAssistant;
      }
    }

    throw new Error(
      "Master AI is still running in the background. Refresh this conversation shortly to see the result.",
    );
  }

  async function runMasterInBackground(
    body: Record<string, unknown>,
    targetConversationId: number,
    previousAssistantCount: number,
  ): Promise<ChatMessage> {
    const endpoints = [
      "/api/admin/ai/master",
      "/.netlify/functions/master-ai-background",
    ];
    let lastError = "Master AI could not be started.";

    for (const endpoint of endpoints) {
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Network error starting Master AI.";
        continue;
      }

      if (response.status === 202) {
        return pollForAssistantResult(targetConversationId, previousAssistantCount);
      }

      if (response.ok) {
        const data = (await response.json()) as {
          reply?: string;
          plan?: MasterPlan;
          route?: AIRoute;
          execution?: ExecutionResult[];
          webMode?: "auto" | "on" | "off";
          modelSelection?: ModelSelection;
          error?: string;
        };

        if (data.error) throw new Error(data.error);

        try {
          return await pollForAssistantResult(targetConversationId, previousAssistantCount);
        } catch {
          return {
            id: "assistant-sync-" + Date.now(),
            role: "assistant",
            text: data.reply || "Master AI completed.",
            reply: data.reply,
            plan: data.plan,
            route: data.route,
            execution: data.execution,
            webMode: data.webMode,
            modelSelection: data.modelSelection,
            status: "done",
          };
        }
      }

      if (response.status === 404 || response.status === 405) {
        lastError = "Master AI endpoint not available on this platform (HTTP " + response.status + ").";
        continue;
      }

      const raw = await response.text();
      lastError = raw.slice(0, 500) || "Master AI request failed (HTTP " + response.status + ").";

      if (endpoint === "/api/admin/ai/master") {
        throw new Error(lastError);
      }
    }

    throw new Error(lastError);
  }

  async function sendMessage(forcedText?: string) {
    const text = (forcedText ?? instruction).trim();
    if (!text || busy) return;

    // eslint-disable-next-line react-hooks/purity -- unique client id in event handler
    const assistantId = "assistant-" + Date.now();
    let targetConversationId: number;
    try {
      targetConversationId = await ensureMasterConversation();
    } catch (error) {
      setAttachmentNotice(error instanceof Error ? error.message : "Could not start Master AI.");
      return;
    }

    const previousAssistantCount = messages.filter((message) => message.role === "assistant").length;
    const requestBody = {
      instruction: text,
      screenScan: collectScreenScan(),
      conversationId: targetConversationId,
      modelMode: attachments.length ? "vision" : modelMode,
      autoModel,
      textModel,
      visionModel,
      webMode,
      attachments,
    };

    setMessages((current) => [
      ...current,
      { id: "user-" + Date.now(), role: "user", text, attachments: attachments.length ? attachments : undefined },
      {
        id: assistantId,
        role: "assistant",
        text: "SunVera Master AI is working in the background…",
        status: "working",
      },
    ]);
    setInstruction("");
    setComposerExpanded(false);
    try {
      window.localStorage.removeItem("sunvera-master-ai-draft-" + targetConversationId);
    } catch {
      // Ignore local-storage access errors.
    }
    setShowTools(false);
    setAttachmentNotice(null);
    setAttachments([]);
    setBusy(true);

    try {
      const latestAssistant = await runMasterInBackground(
        requestBody,
        targetConversationId,
        previousAssistantCount,
      );

      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...latestAssistant,
                id: assistantId,
                role: "assistant",
                status: "done",
              }
            : message,
        ),
      );
      void refreshConversations();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Master AI request failed";
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                text: message,
                status: "error",
              }
            : item,
        ),
      );
      void refreshConversations();
    } finally {
      setBusy(false);
    }
  }

  function resizeComposerInput() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = Math.min(180, Math.max(96, Math.round(window.innerHeight * 0.28)));
    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + "px";
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
    if (textarea.scrollHeight > maxHeight) {
      textarea.scrollTop = textarea.scrollHeight;
    }
  }

  function handleComposerFocus() {
    setComposerExpanded(true);
  }

  function handleComposerBlur() {
    window.setTimeout(() => {
      const active = document.activeElement;
      if (!composerRef.current?.contains(active)) {
        setComposerExpanded(false);
        setShowTools(false);
      }
    }, 0);
  }

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = Math.min(180, Math.max(96, Math.round(window.innerHeight * 0.28)));
    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + "px";
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
    if (textarea.scrollHeight > maxHeight) {
      textarea.scrollTop = textarea.scrollHeight;
    }
  }, [instruction]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function clearChat() {
    if (busy) return;
    void startNewChat();
  }

  async function confirmAction(messageId: string, index: number) {
    const message = messages.find((item) => item.id === messageId);
    if (!message?.plan || busy || confirming) return;
    if (!conversationId) return;

    setConfirming(messageId + ":" + index);
    const previousAssistantCount = messages.filter((item) => item.role === "assistant").length;

    try {
      const latestAssistant = await runMasterInBackground(
        {
          instruction: "نفّذ الإجراء الذي أكدته الآن.",
          conversationId,
          autoModel,
          webMode: "off",
          confirmedPlan: message.plan,
          confirmIndexes: [index],
        },
        conversationId,
        previousAssistantCount,
      );

      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                text: latestAssistant.text || item.text,
                reply: latestAssistant.reply || item.reply,
                plan: latestAssistant.plan || item.plan,
                route: latestAssistant.route || item.route,
                execution: [
                  ...(item.execution ?? []).filter((execution) => execution.index !== index),
                  ...(latestAssistant.execution ?? []),
                ],
                webMode: latestAssistant.webMode || item.webMode,
                status: "done",
              }
            : item,
        ),
      );
      void refreshConversations();
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
      void refreshConversations();
    }
  }

  function handleQuickAction(prompt: string) {
    setInstruction(prompt);
    setShowTools(false);
    setAttachmentNotice(null);
  }

  return (
    <section className="fixed inset-0 z-40 mx-auto flex h-[100dvh] min-h-0 w-full max-w-full min-w-0 flex-col overflow-hidden overscroll-none rounded-none border-0 bg-white shadow-none lg:relative lg:static lg:flex lg:h-auto lg:min-h-[560px] lg:flex-col lg:overflow-hidden lg:w-[calc(100%+24px)] lg:max-w-[calc(100%+24px)] lg:-mx-3 lg:rounded-[28px] lg:border lg:border-[var(--svj-border)] lg:shadow-[0_22px_70px_rgba(58,43,34,0.08)]">
      <div className="hidden lg:flex relative w-full min-w-0 shrink-0 items-center justify-between gap-3 border-b border-[var(--svj-border)] bg-white px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0">
            <h1 className="font-display text-lg leading-none sm:text-xl">Master AI</h1>
            <p className="mt-0.5 hidden text-[9px] text-[var(--svj-muted)] sm:block">
              SunVera Jolie AI assistant{liveClock ? ` · ${liveClock}` : ""}
            </p>
          </div>
          {activeConversation && (
            <span className="hidden max-w-[320px] truncate rounded-full border border-[var(--svj-border)] bg-[var(--svj-background)] px-2.5 py-1 text-[9px] text-[var(--svj-muted)] md:inline-block">
              {activeConversation.title}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHistory((value) => !value)}
            className={
              showHistory
                ? "rounded-full bg-[#2f2823] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest text-white"
                : "rounded-full border border-[var(--svj-border)] bg-white px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest text-[var(--svj-muted)] transition hover:border-gold"
            }
            aria-expanded={showHistory}
            aria-controls="sunvera-master-ai-history"
          >
            Chats{conversations.length ? " · " + conversations.length : ""}
          </button>
          <button
            type="button"
            onClick={clearChat}
            disabled={busy || loadingConversation}
            className="rounded-full border border-[var(--svj-border)] bg-white px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest text-[var(--svj-muted)] transition hover:border-gold disabled:cursor-not-allowed disabled:opacity-50"
          >
            New chat
          </button>
        </div>
      </div><div className="lg:hidden">      <div className="relative flex w-full min-w-0 shrink-0 items-center gap-2 border-b border-[var(--svj-border)] bg-white px-3 py-2.5 text-start sm:py-3">
        <button
          type="button"
          onClick={() => setShowCommandHeader((value) => !value)}
          className="absolute left-[3.6rem] top-2.5 z-10 flex h-9 w-8 shrink-0 items-center justify-center rounded-xl text-lg leading-none text-[var(--svj-foreground)] transition hover:bg-[var(--svj-background)]"
          aria-label="Master AI menu"
          aria-expanded={showCommandHeader}
          aria-controls="sunvera-master-ai-command-header"
          title="Master AI menu"
        >
          ⋮
        </button>

        <div className="flex min-w-0 items-center gap-2 pl-[5.5rem]">
          <div className="min-w-0 shrink-0">
            <h1 className="font-display text-xl leading-none sm:text-[26px]">Dashboard</h1>
            <p className="mt-0.5 hidden text-[9px] text-[var(--svj-muted)] sm:block">Live overview{liveClock ? ` · ${liveClock}` : ""}</p>
          </div>

          <button
            type="button"
            onClick={() => setShowCommandHeader((value) => !value)}
            className="flex min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-[var(--svj-border)] bg-white px-2.5 py-1.5 text-start shadow-sm transition hover:border-gold hover:bg-[#fcfbf9] sm:px-3 sm:py-2"
            aria-expanded={showCommandHeader}
            aria-controls="sunvera-master-ai-command-header"
          >
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-gold sm:text-[10px]">Master AI</span>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--svj-border)] text-[10px] text-[var(--svj-muted)]" aria-hidden="true">
              {showCommandHeader ? "⌃" : "⌄"}
            </span>
          </button>
        </div>
      </div>

      {showCommandHeader && (
        <div
          id="sunvera-master-ai-command-header"
          className="border-b border-[var(--svj-border)] bg-[linear-gradient(135deg,rgba(201,164,92,0.14),rgba(255,255,255,0.96))] px-3 py-3 md:px-6 md:py-4"
          style={{ fontSize: masterBodySize }}
        >
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-gold">
                SunVera AI Command Center
              </p>
              <h2 className="mt-1 font-display text-2xl">Master AI</h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--svj-muted)]">
                Chat naturally with one central AI. Master AI keeps each conversation, uploaded images, analysis, plans, and execution history saved so you can return to it later.
              </p>
              {activeConversation && (
                <p className="mt-2 max-w-3xl truncate text-[11px] font-medium text-[var(--svj-muted)]">
                  Conversation: <span className="text-[var(--svj-foreground)]">{activeConversation.title}</span>
                </p>
              )}
            </div>

            <div className="flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">
              <button
                type="button"
                onClick={() => setShowHistory((value) => !value)}
                className={
                  showHistory
                    ? "rounded-full bg-[#2f2823] px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-white"
                    : "rounded-full border border-[var(--svj-border)] bg-white px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--svj-muted)] transition hover:border-gold"
                }
                aria-expanded={showHistory}
                aria-controls="sunvera-master-ai-history"
              >
                Chats {conversations.length ? "· " + conversations.length : ""}
              </button>

              <div className="relative">
                <button type="button" onClick={() => setChatColorsOpen((v) => !v)} className="rounded-full border border-[var(--svj-border)] bg-white px-3 py-1.5 text-[10px] font-semibold text-[var(--svj-muted)]" aria-expanded={chatColorsOpen}>🎨 Colors</button>
                {chatColorsOpen && (
                  <div className="absolute end-0 top-9 z-30 grid w-[280px] gap-3 rounded-2xl border border-[var(--svj-border)] bg-white p-3 shadow-xl">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--svj-muted)]">Chat colors</p>
                    <label className="text-[10px]"><span className="mb-1 block text-[var(--svj-muted)]">Chat background</span><div className="flex gap-2"><input type="color" value={chatColors.chatBackground} onChange={(e) => updateChatColors({ chatBackground: e.target.value })} className="h-9 w-10" /><input value={chatColors.chatBackground} onChange={(e) => updateChatColors({ chatBackground: e.target.value })} className="inp !py-2 text-xs" /></div></label>
                    <label className="text-[10px]"><span className="mb-1 block text-[var(--svj-muted)]">Your message bubble</span><div className="flex gap-2"><input type="color" value={chatColors.userBubble} onChange={(e) => updateChatColors({ userBubble: e.target.value })} className="h-9 w-10" /><input value={chatColors.userBubble} onChange={(e) => updateChatColors({ userBubble: e.target.value })} className="inp !py-2 text-xs" /></div></label>
                    <label className="text-[10px]"><span className="mb-1 block text-[var(--svj-muted)]">AI message bubble</span><div className="flex gap-2"><input type="color" value={chatColors.aiBubble} onChange={(e) => updateChatColors({ aiBubble: e.target.value })} className="h-9 w-10" /><input value={chatColors.aiBubble} onChange={(e) => updateChatColors({ aiBubble: e.target.value })} className="inp !py-2 text-xs" /></div></label>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Independent chat typography">
                <div className="relative">
                  <button type="button" onClick={() => setUserTypographyOpen((v) => !v)} className="rounded-full border border-[var(--svj-border)] bg-white px-3 py-1.5 text-[10px] font-semibold text-[var(--svj-muted)]" aria-expanded={userTypographyOpen}>You · Aa</button>
                  {userTypographyOpen && (
                    <div className="absolute end-0 top-9 z-30 grid w-[280px] gap-2 rounded-2xl border border-[var(--svj-border)] bg-white p-3 shadow-xl">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--svj-muted)]">Your messages</p>
                      <label className="text-[10px]"><span className="mb-1 block text-[var(--svj-muted)]">Font</span><select value={userChatTypography.fontFamily} onChange={(e) => updateUserChatTypography({ fontFamily: e.target.value as ChatTypography["fontFamily"] })} className="inp !py-2 text-xs">{["system","arabic","cairo","tajawal","serif","playfair","amiri"].map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[10px]"><span className="mb-1 block text-[var(--svj-muted)]">Size</span><input type="number" min={12} max={28} value={userChatTypography.fontSize} onChange={(e) => updateUserChatTypography({ fontSize: Math.min(28, Math.max(12, Number(e.target.value) || 17)) })} className="inp !py-2 text-xs" /></label>
                        <label className="text-[10px]"><span className="mb-1 block text-[var(--svj-muted)]">Weight</span><select value={userChatTypography.fontWeight} onChange={(e) => updateUserChatTypography({ fontWeight: e.target.value as ChatTypography["fontWeight"] })} className="inp !py-2 text-xs"><option value="400">Normal</option><option value="500">Medium</option><option value="600">Semi Bold</option><option value="700">Bold</option></select></label>
                      </div>
                      <label className="text-[10px]"><span className="mb-1 block text-[var(--svj-muted)]">Color</span><div className="flex gap-2"><input type="color" value={userChatTypography.color} onChange={(e) => updateUserChatTypography({ color: e.target.value })} className="h-9 w-10" /><input value={userChatTypography.color} onChange={(e) => updateUserChatTypography({ color: e.target.value })} className="inp !py-2 text-xs" /></div></label>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <button type="button" onClick={() => setAiTypographyOpen((v) => !v)} className="rounded-full border border-[var(--svj-border)] bg-white px-3 py-1.5 text-[10px] font-semibold text-[var(--svj-muted)]" aria-expanded={aiTypographyOpen}>AI · Aa</button>
                  {aiTypographyOpen && (
                    <div className="absolute end-0 top-9 z-30 grid w-[280px] gap-2 rounded-2xl border border-[var(--svj-border)] bg-white p-3 shadow-xl">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--svj-muted)]">AI messages</p>
                      <label className="text-[10px]"><span className="mb-1 block text-[var(--svj-muted)]">Font</span><select value={aiChatTypography.fontFamily} onChange={(e) => updateAiChatTypography({ fontFamily: e.target.value as ChatTypography["fontFamily"] })} className="inp !py-2 text-xs">{["system","arabic","cairo","tajawal","serif","playfair","amiri"].map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[10px]"><span className="mb-1 block text-[var(--svj-muted)]">Size</span><input type="number" min={12} max={28} value={aiChatTypography.fontSize} onChange={(e) => updateAiChatTypography({ fontSize: Math.min(28, Math.max(12, Number(e.target.value) || 17)) })} className="inp !py-2 text-xs" /></label>
                        <label className="text-[10px]"><span className="mb-1 block text-[var(--svj-muted)]">Weight</span><select value={aiChatTypography.fontWeight} onChange={(e) => updateAiChatTypography({ fontWeight: e.target.value as ChatTypography["fontWeight"] })} className="inp !py-2 text-xs"><option value="400">Normal</option><option value="500">Medium</option><option value="600">Semi Bold</option><option value="700">Bold</option></select></label>
                      </div>
                      <label className="text-[10px]"><span className="mb-1 block text-[var(--svj-muted)]">Color</span><div className="flex gap-2"><input type="color" value={aiChatTypography.color} onChange={(e) => updateAiChatTypography({ color: e.target.value })} className="h-9 w-10" /><input value={aiChatTypography.color} onChange={(e) => updateAiChatTypography({ color: e.target.value })} className="inp !py-2 text-xs" /></div></label>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={clearChat}
                disabled={busy || loadingConversation}
                className="rounded-full border border-[var(--svj-border)] px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--svj-muted)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                New chat
              </button>
            </div>
          </div>
        </div>
      )}

        {showHistory && (
          <div
            id="sunvera-master-ai-history"
            className="border-b border-[var(--svj-border)] bg-[#fcfbf9] px-4 py-3 md:px-6"
          >
            <div className="mx-auto w-full max-w-6xl">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">Saved conversations</p>
                  <p className="mt-1 text-xs text-[var(--svj-muted)]">
                    كل محادثة محفوظة بشكل مستقل ويمكنك الرجوع إليها حتى بعد إغلاق الصفحة أو بدء محادثة جديدة.
                  </p>
                </div>
                {loadingHistory && <span className="text-[10px] text-[var(--svj-muted)]">Loading…</span>}
              </div>

              {conversations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--svj-border)] bg-white px-4 py-5 text-center text-xs text-[var(--svj-muted)]">
                  لا توجد محادثات محفوظة بعد. ابدأ أول محادثة وسيتم حفظها تلقائيًا.
                </div>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto pe-1">
                  {conversations.map((conversation) => {
                    const active = conversation.id === conversationId;
                    const updated = String(conversation.updatedAt ?? "").slice(0, 16).replace("T", " ");
                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => void loadConversation(conversation.id)}
                        disabled={loadingConversation}
                        className={
                          "flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-start transition " +
                          (active
                            ? "border-[rgba(201,164,92,0.5)] bg-white shadow-sm"
                            : "border-transparent bg-white/70 hover:border-[var(--svj-border)]")
                        }
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-semibold text-[var(--svj-foreground)]">
                            {conversation.title || "New chat"}
                          </span>
                          <span className="mt-0.5 block text-[9px] text-[var(--svj-muted)]">
                            {conversation.messageCount} messages · {updated || "Saved"}
                          </span>
                        </span>
                        <span className={active ? "rounded-full bg-[#2f2823] px-2 py-1 text-[8px] font-semibold uppercase tracking-wider text-white" : "rounded-full border border-[var(--svj-border)] px-2 py-1 text-[8px] uppercase tracking-wider text-[var(--svj-muted)]"}>
                          {active ? "Open" : "Open"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

</div>        {showHistory && (\n          <div className="hidden lg:block contents">
          <>
            <button
              type="button"
              className="absolute inset-0 z-40 bg-black/10"
              onClick={() => setShowHistory(false)}
              aria-label="Close conversations panel"
            />
            <aside
              id="sunvera-master-ai-history"
              className="absolute inset-y-0 end-0 z-50 flex w-[min(86vw,360px)] flex-col border-s border-[var(--svj-border)] bg-[#fcfbf9] px-4 py-4 shadow-2xl"
              aria-label="Saved conversations"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">Saved conversations</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--svj-muted)]">
                    كل محادثة محفوظة بشكل مستقل ويمكنك الرجوع إليها لاحقًا.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHistory(false)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--svj-border)] bg-white text-sm text-[var(--svj-muted)] transition hover:border-gold"
                  aria-label="Close conversations"
                  title="Close"
                >
                  ×
                </button>
              </div>

              {loadingHistory && (
                <div className="mb-2 text-[10px] text-[var(--svj-muted)]">Loading…</div>
                </div>\n        )}

              {conversations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--svj-border)] bg-white px-4 py-5 text-center text-xs text-[var(--svj-muted)]">
                  لا توجد محادثات محفوظة بعد.
                </div>
              ) : (
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pe-1">
                  {conversations.map((conversation) => {
                    const active = conversation.id === conversationId;
                    const updated = String(conversation.updatedAt ?? "").slice(0, 16).replace("T", " ");
                    return (
                      <button
                        key={conversation.id}
                        type="button"
                        onClick={() => {
                          setShowHistory(false);
                          void loadConversation(conversation.id);
                        }}
                        disabled={loadingConversation}
                        className={
                          "flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-start transition " +
                          (active
                            ? "border-[rgba(201,164,92,0.5)] bg-white shadow-sm"
                            : "border-transparent bg-white/70 hover:border-[var(--svj-border)]")
                        }
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11px] font-semibold text-[var(--svj-foreground)]">
                            {conversation.title || "New chat"}
                          </span>
                          <span className="mt-0.5 block text-[9px] text-[var(--svj-muted)]">
                            {conversation.messageCount} messages · {updated || "Saved"}
                          </span>
                        </span>
                        <span className={active ? "rounded-full bg-[#2f2823] px-2 py-1 text-[8px] font-semibold uppercase tracking-wider text-white" : "rounded-full border border-[var(--svj-border)] px-2 py-1 text-[8px] font-semibold uppercase tracking-wider text-[var(--svj-muted)]"}>
                          Open
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </aside>
          </>
        )}

      <div
        className="min-h-0 w-full min-w-0 flex-1 basis-0 overflow-hidden lg:h-0 lg:flex-1 lg:overflow-hidden"
        style={{ fontSize: masterBodySize, backgroundColor: chatColors.chatBackground }}
      >
        <div className="h-full min-h-0 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 pb-6 md:px-6 md:py-5 lg:h-full lg:space-y-3 lg:overflow-y-auto">
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
                    onClick={() => handleQuickAction(action.prompt)}
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
<div className="lg:hidden">                {messages.map((message) => (
                <div
                  key={message.id}
                  className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={
                      message.role === "user"
                        ? "max-w-[88%] rounded-[24px] rounded-br-md px-5 py-4 text-[15px] leading-7 text-white shadow-sm"
                        : "max-w-[94%] rounded-[24px] rounded-bl-md border border-[var(--svj-border)] px-5 py-5 text-[16px] leading-7 text-[var(--svj-foreground)] shadow-sm"
                    }
                    style={{ backgroundColor: message.role === "user" ? chatColors.userBubble : chatColors.aiBubble }}
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
                          {message.route.source === "auto" ? "Auto" : "Manual"} · {message.route.label} · {message.route.modality}
                        </span>
                      )}
                      {message.modelSelection?.vision && (
                        <span
                          className="rounded-full border border-[var(--svj-border)] bg-[var(--svj-background)] px-2 py-0.5 text-[10px] text-[var(--svj-muted)]"
                          title={message.modelSelection.vision.model}
                        >
                          {message.modelSelection.vision.source === "auto" ? "Auto" : "Manual"} · {message.modelSelection.vision.label} · vision
                        </span>
                      )}
                    </div>

                    {message.role === "user" && message.attachments && message.attachments.length > 0 && (
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
                      style={{ fontFamily: chatFont(message.role === "user" ? userChatTypography.fontFamily : aiChatTypography.fontFamily), fontSize: message.role === "user" ? userChatTypography.fontSize : aiChatTypography.fontSize, fontWeight: Number(message.role === "user" ? userChatTypography.fontWeight : aiChatTypography.fontWeight), color: message.role === "user" ? userChatTypography.color : aiChatTypography.color, lineHeight: 1.75 }}
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
                                  isRecord(item.data) &&
                                  "editUrl" in item.data &&
                                  typeof item.data.editUrl === "string" && (
                                    <span className="ms-2 mt-2 inline-flex flex-wrap gap-2">
                                      <a
                                        href={item.data.editUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="rounded-full border border-[var(--svj-border)] bg-white px-2.5 py-1 text-[10px] font-semibold text-cocoa transition hover:border-gold"
                                      >
                                        Edit page
                                      </a>
                                      {"storefrontPreviewUrl" in item.data && typeof item.data.storefrontPreviewUrl === "string" && (
                                        <a
                                          href={item.data.storefrontPreviewUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="rounded-full border border-[var(--svj-border)] bg-white px-2.5 py-1 text-[10px] font-semibold text-cocoa transition hover:border-gold"
                                        >
                                          Preview page
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
</div><div className="hidden lg:block">              {messages.map((message) => {
                const pendingConfirmations = (message.execution ?? []).filter(
                  (item) => item.requiresConfirmation === true && item.executed === false,
                ).length;
                const appliedCount = (message.execution ?? []).filter((item) => item.executed).length;
                const heldCount = (message.execution ?? []).filter((item) => !item.executed).length;
                const messageDirection = isArabic(message.reply || message.text) ? "rtl" : "ltr";

                return (
                  <div
                    key={message.id}
                    className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
                  >
                    <article
                      className={
                        message.role === "user"
                          ? "w-fit max-w-[88%] rounded-[22px] rounded-br-md px-5 py-4 shadow-sm"
                          : "w-fit max-w-[92%] rounded-[22px] rounded-bl-md border border-[var(--svj-border)] px-5 py-4 shadow-sm"
                      }
                      style={{
                        backgroundColor: message.role === "user" ? chatColors.userBubble : chatColors.aiBubble,
                        color: message.role === "user" ? userChatTypography.color : aiChatTypography.color,
                      }}
                      dir={messageDirection}
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={message.role === "user" ? "text-[10px] font-semibold uppercase tracking-wider text-white/70" : "text-[10px] font-semibold uppercase tracking-wider text-gold"}>
                          {message.role === "user" ? "You" : "SunVera Master AI"}
                        </span>
                        {message.status === "working" && (
                          <span className="inline-flex items-center gap-1.5 text-[10px] text-amber-700">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                            Thinking…
                          </span>
                        )}
                        {message.route && message.role === "assistant" && (
                          <span className="rounded-full border border-[var(--svj-border)] bg-[var(--svj-background)] px-2 py-0.5 text-[9px] text-[var(--svj-muted)]" title={message.route.model}>
                            {message.route.source === "auto" ? "Auto" : "Manual"} · {message.route.label}
                          </span>
                        )}
                        {message.modelSelection?.vision && message.role === "assistant" && (
                          <span className="rounded-full border border-[var(--svj-border)] bg-[var(--svj-background)] px-2 py-0.5 text-[9px] text-[var(--svj-muted)]" title={message.modelSelection.vision.model}>
                            Vision · {message.modelSelection.vision.label}
                          </span>
                        )}
                      </div>

                      {message.role === "user" && message.attachments && message.attachments.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {message.attachments.map((attachment) => (
                            <img key={attachment.mediaId} src={attachment.url} alt={attachment.alt || attachment.filename} className="h-16 w-16 rounded-xl border border-white/20 object-cover sm:h-20 sm:w-20" />
                          ))}
                        </div>
                      )}

                      <p
                        className="mt-2 whitespace-pre-wrap break-words"
                        style={{
                          fontFamily: chatFont(message.role === "user" ? userChatTypography.fontFamily : aiChatTypography.fontFamily),
                          fontSize: masterBodySize,
                          fontWeight: Number(message.role === "user" ? userChatTypography.fontWeight : aiChatTypography.fontWeight),
                          color: message.role === "user" ? userChatTypography.color : aiChatTypography.color,
                          lineHeight: 1.65,
                        }}
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
                        <details className="mt-3 overflow-hidden rounded-xl border border-[var(--svj-border)] bg-[#fcfbf9]">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                            <span className="min-w-0">
                              <span className="block truncate text-[11px] font-semibold text-[var(--svj-foreground)]">
                                Plan · {message.plan.actions.length} {message.plan.actions.length === 1 ? "action" : "actions"}
                              </span>
                              <span className="mt-0.5 block truncate text-[10px] text-[var(--svj-muted)]">{message.plan.summary}</span>
                            </span>
                            <span className="shrink-0 rounded-full border border-[var(--svj-border)] bg-white px-2 py-1 text-[9px] font-semibold text-[var(--svj-muted)]">Details</span>
                          </summary>
                          <div className="border-t border-[var(--svj-border)] px-3 py-3">
                            <p className="text-[10px] leading-5 text-[var(--svj-muted)]" dir={isArabic(message.plan.intent) ? "rtl" : "ltr"}>{message.plan.intent}</p>
                            <div className="mt-3 space-y-2">
                              {message.plan.actions.map((action, index) => {
                                const execution = message.execution?.find((item) => item.index === index);
                                const needsConfirmation = execution?.requiresConfirmation === true && execution.executed === false;
                                return (
                                  <div key={index} className="rounded-xl border border-[var(--svj-border)] bg-white p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <span className="text-[9px] font-semibold uppercase tracking-widest text-gold">{domainLabel(action.domain)}</span>
                                        <p className="mt-1 text-[10px] font-semibold text-[var(--svj-foreground)]">{action.operation}</p>
                                      </div>
                                      {needsConfirmation && <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-semibold text-amber-700">Needs confirmation</span>}
                                    </div>
                                    <p className="mt-1 text-[10px] leading-relaxed text-[var(--svj-muted)]">{action.summary}</p>
                                    {needsConfirmation && (
                                      <button
                                        type="button"
                                        onClick={() => void confirmAction(message.id, index)}
                                        disabled={busy || confirming !== null}
                                        className="mt-2 rounded-full bg-[#2f2823] px-3 py-2 text-[10px] font-semibold text-white transition hover:bg-[#40362f] disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        {confirming === message.id + ":" + index ? "Executing…" : "Confirm & execute"}
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </details>
                      )}

                      {message.execution?.some((item) => item.artifacts?.length) && (
                        <div className="mt-3 space-y-2">
                          {message.execution.flatMap((item) => item.artifacts ?? []).map((artifact, index) => (
                            <div key={(artifact.mediaId ?? 0) + "-" + index} className="overflow-hidden rounded-xl border border-[var(--svj-border)] bg-white">
                              {artifact.type === "image" ? (
                                <img src={artifact.url} alt={artifact.alt ?? artifact.title ?? "SunVera AI generated image"} className="block max-h-[420px] w-full object-contain bg-[#f7f3ee]" />
                              ) : (
                                <video src={artifact.url} controls className="block max-h-[420px] w-full bg-black" />
                              )}
                              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--svj-border)] px-3 py-2.5">
                                <div className="min-w-0"><p className="truncate text-[10px] font-semibold">{artifact.title ?? (artifact.type === "image" ? "Generated image" : "Generated video")}</p></div>
                                <div className="flex items-center gap-2">
                                  <a href={artifact.url} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--svj-border)] px-3 py-1.5 text-[10px] font-semibold transition hover:border-gold">Open</a>
                                  {artifact.mediaId ? (
                                    <a href={"/api/admin/ai/media/" + artifact.mediaId + "/download"} className="rounded-full bg-[#2f2823] px-3 py-1.5 text-[10px] font-semibold text-white transition hover:bg-[#40362f]">Download</a>
                                  ) : (
                                    <a href={artifact.url} download className="rounded-full bg-[#2f2823] px-3 py-1.5 text-[10px] font-semibold text-white transition hover:bg-[#40362f]">Download</a>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {message.execution && message.execution.length > 0 && (
                        <details className="mt-2 overflow-hidden rounded-xl border border-[var(--svj-border)] bg-[var(--svj-background)]">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-[10px] [&::-webkit-details-marker]:hidden">
                            <span className="font-semibold uppercase tracking-wider text-gold">Execution</span>
                            <span className="text-[9px] text-[var(--svj-muted)]">{appliedCount} applied · {heldCount} held</span>
                          </summary>
                          <div className="space-y-2 border-t border-[var(--svj-border)] px-3 py-3">
                            {message.execution.map((item) => (
                              <div key={item.index} className="flex items-start gap-2 text-[10px] leading-relaxed">
                                <span className={item.executed ? "text-green-700" : item.ok ? "text-amber-700" : "text-red-700"}>{item.executed ? "✓" : item.ok ? "•" : "!"}</span>
                                <span className="min-w-0 flex-1">
                                  <strong>{item.domain}</strong> · {item.operation} — {item.message}
                                  {item.operation === "products.create_draft" && isRecord(item.data) && "editUrl" in item.data && typeof item.data.editUrl === "string" && (
                                    <span className="ms-2 mt-2 inline-flex flex-wrap gap-2">
                                      <a href={item.data.editUrl} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--svj-border)] bg-white px-2.5 py-1 text-[10px] font-semibold text-cocoa transition hover:border-gold">Edit page</a>
                                      {"storefrontPreviewUrl" in item.data && typeof item.data.storefrontPreviewUrl === "string" && (
                                        <a href={item.data.storefrontPreviewUrl} target="_blank" rel="noreferrer" className="rounded-full border border-[var(--svj-border)] bg-white px-2.5 py-1 text-[10px] font-semibold text-cocoa transition hover:border-gold">Preview page</a>
                                      )}
                                    </span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {message.role === "assistant" && pendingConfirmations > 0 && (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-5 text-amber-800">
                          {pendingConfirmations} protected {pendingConfirmations === 1 ? "action requires" : "actions require"} your confirmation.
                        </div>
                      )}

                      {message.status === "error" && (
                        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[10px] leading-5 text-red-800">
                          {message.text || "Something went wrong. Check the AI provider and try again."}
                        </div>
                      )}
                    </article>
                  </div>
                );
              })}
</div>              <div ref={messagesEndRef} className="h-px w-full" aria-hidden="true" />
            </>
          )}
        </div>
      </div>

      <div
        ref={composerRef}
        className={
          "relative z-50 min-w-0 w-full flex-none shrink-0 border-t border-[var(--svj-border)] bg-white px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 sm:px-4 sm:pb-4 sm:pt-3 md:px-6 lg:shrink " +
          (composerExpanded ? "shadow-[0_-12px_35px_rgba(58,43,34,0.08)]" : "")
        }
      >
          <div
            className={
              "relative mx-auto w-full max-w-full min-w-0 rounded-[24px] border border-[var(--svj-border)] bg-white p-2 shadow-[0_12px_35px_rgba(58,43,34,0.07)] focus-within:border-[rgba(201,164,92,0.65)] transition-[max-height] duration-200 " +
              (composerExpanded ? "md:max-w-6xl" : "md:max-w-6xl")
            }
            onFocusCapture={handleComposerFocus}
            onBlurCapture={handleComposerBlur}
          >
            {showTools && (
              <div className="absolute bottom-full left-2 right-2 mb-2 rounded-2xl border border-[var(--svj-border)] bg-white p-2 shadow-[0_14px_35px_rgba(58,43,34,0.1)]">
                <div className="grid gap-2 sm:grid-cols-2">
                  {quickActions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => handleQuickAction(action.prompt)}
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

            <div className="flex min-w-0 items-end gap-2">
              <div className="flex min-w-0 flex-1 items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={instruction}
                  onChange={(event) => {
                    setInstruction(event.target.value);
                  }}
                  onFocus={handleComposerFocus}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  dir={isArabic(instruction) ? "rtl" : "ltr"}
                  className="min-h-10 max-h-[28vh] w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent px-3 py-2.5 text-[16px] leading-7 outline-none placeholder:text-[var(--svj-muted)]"
                  placeholder="اكتب ما تريد من SunVera Master AI…"
                  disabled={busy}
                />
              </div>

              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={busy || !instruction.trim()}
                className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-full bg-[#2f2823] px-4 text-white shadow-sm transition hover:translate-y-[-1px] hover:bg-[#40362f] disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                {busy ? "…" : "↑"}
              </button>
            </div>

            {composerExpanded && (
              <div className="flex min-w-0 flex-col gap-2 px-2 pb-1 pt-2 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[11px] text-[var(--svj-muted)]">
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

                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 rounded-2xl border border-[var(--svj-border)] bg-white px-2 py-1.5">
                  <span className="text-[8px] uppercase tracking-widest text-[var(--svj-muted)]">Models</span>
                  <button
                    type="button"
                    onClick={() => toggleAutoModel(!autoModel)}
                    disabled={busy}
                    aria-pressed={autoModel}
                    title="Let Master AI automatically choose the most capable model for the current task, including vision when an image is needed."
                    className={
                      autoModel
                        ? "rounded-full bg-[#2f2823] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest text-white"
                        : "rounded-full border border-[var(--svj-border)] bg-white px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest text-[var(--svj-muted)] transition hover:border-gold"
                    }
                  >
                    Auto {autoModel ? "On" : "Off"}
                  </button>
                  <label className="flex items-center gap-1.5">
                    <span className="text-[8px] uppercase tracking-widest text-[var(--svj-muted)]">Text</span>
                    <select
                      value={textModel}
                      onChange={(event) => setTextModel(event.target.value)}
                      disabled={busy || autoModel || !aiModels.text.length}
                      className="min-w-0 max-w-[180px] bg-transparent text-[10px] font-semibold outline-none"
                      title="Choose the text/analysis model"
                    >
                      {!textModel && <option value="">Loading models…</option>}
                      {aiModels.text.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} · {model.isFree ? "Free" : "$" + model.promptPricePerMillion.toFixed(model.promptPricePerMillion < 1 ? 3 : 2) + "/M in"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 border-s border-[var(--svj-border)] ps-2">
                    <span className="text-[8px] uppercase tracking-widest text-[var(--svj-muted)]">Vision</span>
                    <select
                      value={visionModel}
                      onChange={(event) => setVisionModel(event.target.value)}
                      disabled={busy || autoModel || !aiModels.vision.length}
                      className="min-w-0 max-w-[180px] bg-transparent text-[10px] font-semibold outline-none"
                      title="Choose the image/vision model"
                    >
                      {!visionModel && <option value="">Loading models…</option>}
                      {aiModels.vision.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name} · {model.isFree ? "Free" : "$" + model.promptPricePerMillion.toFixed(model.promptPricePerMillion < 1 ? 3 : 2) + "/M in"}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="flex items-center gap-1 rounded-full border border-[var(--svj-border)] px-2.5 py-1.5">
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

                <span className="hidden xl:inline">Enter لإرسال · Shift + Enter لسطر جديد</span>
                <span className="hidden max-w-[220px] truncate text-[10px] text-[var(--svj-muted)] 2xl:inline" title={attachments.length ? visionModel : textModel}>
                  {autoModel
                    ? "Auto · " + (attachments.length ? "Vision" : "Text") + " · Master AI selects the model"
                    : attachments.length
                      ? "Vision · " + (aiModels.vision.find((model) => model.id === visionModel)?.name || visionModel || aiRoutes.vision?.label || "Loading…")
                      : "Text · " + (aiModels.text.find((model) => model.id === textModel)?.name || textModel || aiRoutes.text?.label || "Loading…")}
                </span>
              </div>

              </div>
            )}
          </div>

        </div>
    </section>
  );
}