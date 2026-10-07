"use client";

import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

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


function inlineAIFormatting(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|\x60[^\x60]+\x60)/g);
  return parts.map((part, index) => {
    if (!part) return null;
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
      return <strong key={keyPrefix + "-b-" + index} className="font-bold text-[1.02em]">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("\x60") && part.endsWith("\x60")) {
      return (
        <code key={keyPrefix + "-c-" + index} className="rounded-md bg-[#f3eee8] px-1.5 py-0.5 text-[0.9em] font-medium text-[#6b4d35]" dir="ltr">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={keyPrefix + "-t-" + index}>{part}</Fragment>;
  });
}

function FormattedAIMessage({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let bullets: Array<{ marker: string; text: string }> = [];
  let numbered: Array<{ number: string; text: string }> = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const value = paragraph.join(" ").replace(/\s+/g, " ").trim();
    if (value) {
      blocks.push(
        <p key={"p-" + blocks.length} className="m-0 leading-8">
          {inlineAIFormatting(value, "p-" + blocks.length)}
        </p>,
      );
    }
    paragraph = [];
  };

  const flushLists = () => {
    if (bullets.length) {
      const items = bullets;
      blocks.push(
        <ul key={"ul-" + blocks.length} dir={isArabic(items.map((item) => item.text).join(" ")) ? "rtl" : "ltr"} className="my-3 space-y-2 ps-1">
          {items.map((item, index) => (
            <li key={"li-" + index} className="flex items-start gap-2 leading-8">
              <span className="mt-1.5 shrink-0 text-[1.05em] leading-6 text-[#c9a45c]" aria-hidden="true">{item.marker}</span>
              <span className="min-w-0 flex-1">{inlineAIFormatting(item.text, "li-" + index)}</span>
            </li>
          ))}
        </ul>,
      );
      bullets = [];
    }

    if (numbered.length) {
      const items = numbered;
      blocks.push(
        <ol key={"ol-" + blocks.length} dir={isArabic(items.map((item) => item.text).join(" ")) ? "rtl" : "ltr"} className="my-3 space-y-2 ps-1">
          {items.map((item, index) => (
            <li key={"oli-" + index} className="flex items-start gap-2 leading-8">
              <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[#f3eee8] px-1.5 text-[11px] font-bold text-[#8c6c3f]">{item.number}</span>
              <span className="min-w-0 flex-1">{inlineAIFormatting(item.text, "oli-" + index)}</span>
            </li>
          ))}
        </ol>,
      );
      numbered = [];
    }
  };

  const flush = () => {
    flushParagraph();
    flushLists();
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      flush();
      return;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      const value = heading[2].replace(/^[:：]\s*/, "").trim();
      const Tag = level === 1 ? "h3" : level === 2 ? "h4" : "h5";
      blocks.push(
        <Tag key={"h-" + index} dir={isArabic(value) ? "rtl" : "ltr"} className={level === 1 ? "mt-5 text-[1.18em] font-bold leading-8 text-[#3a2b22] first:mt-0" : level === 2 ? "mt-4 text-[1.08em] font-bold leading-8 text-[#4a382d]" : "mt-3 text-[1em] font-bold leading-7 text-[#5b4638]"}>
          {inlineAIFormatting(value, "h-" + index)}
        </Tag>,
      );
      return;
    }

    const markerMatch = /^(?:[-*]\s+|([🔹🔸✅☑️💡🎁📌⭐✨🌸🟢🟡🔴])\s+)(.+)$/.exec(line);
    if (markerMatch) {
      flushParagraph();
      if (numbered.length) flushLists();
      bullets.push({ marker: markerMatch[1] || "🔹", text: markerMatch[2] });
      return;
    }

    const numberMatch = /^(\d+)[.)]\s+(.+)$/.exec(line);
    if (numberMatch) {
      flushParagraph();
      if (bullets.length) flushLists();
      numbered.push({ number: numberMatch[1], text: numberMatch[2] });
      return;
    }

    if (/^[-_*]{3,}$/.test(line)) {
      flush();
      blocks.push(<div key={"hr-" + index} className="my-4 border-t border-[var(--svj-border)]" />);
      return;
    }

    if (line.startsWith("> ")) {
      flush();
      const quote = line.slice(2).trim();
      blocks.push(
        <blockquote key={"q-" + index} dir={isArabic(quote) ? "rtl" : "ltr"} className="my-3 rounded-2xl border-s-4 border-[#c9a45c] bg-[#fcf8f1] px-4 py-3 text-[0.96em] leading-8 text-[#6b5749]">
          {inlineAIFormatting(quote, "q-" + index)}
        </blockquote>,
      );
      return;
    }

    if (bullets.length || numbered.length) flushLists();
    paragraph.push(line);
  });

  flush();
  return <div className="ai-message-content space-y-2">{blocks}</div>;
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
  const [planOpen, setPlanOpen] = useState<Record<string, boolean>>({});
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
      setPlanOpen({});
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

  async function runMasterInBackground(
    body: Record<string, unknown>,
    targetConversationId: number,
    previousAssistantCount: number,
  ): Promise<ChatMessage> {
    const response = await fetch("/.netlify/functions/master-ai-background", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.status !== 202) {
      const raw = await response.text();
      throw new Error(
        raw.slice(0, 500) ||
          "Master AI background job could not be started (HTTP " + response.status + ").",
      );
    }

    // eslint-disable-next-line react-hooks/purity -- polling deadline inside async event handler, not render
    const deadline = Date.now() + 14 * 60 * 1000;
    // eslint-disable-next-line react-hooks/purity -- same async polling loop
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
      setPlanOpen((current) => ({ ...current, [assistantId]: true }));
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
    <section className="fixed inset-0 z-40 mx-auto flex h-[100dvh] min-h-0 w-full max-w-full min-w-0 flex-col overflow-hidden overscroll-none rounded-none border-0 bg-white shadow-none lg:static lg:flex lg:h-auto lg:min-h-[560px] lg:flex-col lg:overflow-hidden lg:w-[calc(100%+24px)] lg:max-w-[calc(100%+24px)] lg:-mx-3 lg:rounded-[28px] lg:border lg:border-[var(--svj-border)] lg:shadow-[0_22px_70px_rgba(58,43,34,0.08)]">
      <div className="relative flex w-full min-w-0 shrink-0 items-center gap-2 border-b border-[var(--svj-border)] bg-white px-3 py-2.5 text-start sm:py-3">
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
            <p className="mt-0.5 hidden text-[9px] text-[var(--svj-muted)] sm:block">Live overview · {new Date().toLocaleString()}</p>
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

      <div
        className="min-h-0 w-full min-w-0 flex-1 basis-0 overflow-hidden lg:h-0 lg:flex-1 lg:overflow-hidden"
        style={{ fontSize: masterBodySize, backgroundColor: chatColors.chatBackground }}
      >
        <div className="h-full min-h-0 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 pb-6 md:px-6 md:py-5 lg:h-full lg:overflow-y-auto">
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
              {messages.map((message) => (
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
                    <div
                      className="mt-3 min-w-0 break-words"
                      style={{ fontFamily: chatFont(message.role === "user" ? userChatTypography.fontFamily : aiChatTypography.fontFamily), fontSize: message.role === "user" ? userChatTypography.fontSize : aiChatTypography.fontSize, fontWeight: Number(message.role === "user" ? userChatTypography.fontWeight : aiChatTypography.fontWeight), color: message.role === "user" ? userChatTypography.color : aiChatTypography.color, lineHeight: 1.75 }}
                    >
                      {message.role === "assistant" ? (
                        <FormattedAIMessage text={message.reply || message.text} />
                      ) : (
                        <p className="m-0 whitespace-pre-wrap leading-8">{message.reply || message.text}</p>
                      )}
                      {message.status === "working" && (
                        <span className="ms-1 inline-flex gap-0.5 align-middle text-amber-600">
                          <span className="animate-bounce">.</span>
                          <span className="animate-bounce [animation-delay:120ms]">.</span>
                          <span className="animate-bounce [animation-delay:240ms]">.</span>
                        </span>
                      )}
                    </div>

                    {message.plan && (
                      <div className="mt-4 space-y-3" dir={isArabic(message.plan.summary + " " + message.plan.intent) ? "rtl" : "ltr"}>
                        <div>
                          <p className="text-sm font-bold leading-7 text-[#3a2b22]">{message.plan.summary}</p>
                          <p className="mt-1 text-sm leading-7 text-[var(--svj-muted)]">{message.plan.intent}</p>
                        </div>
                        <div className="space-y-2">
                          {message.plan.actions.map((action, index) => {
                            const execution = message.execution?.find((item) => item.index === index);
                            const needsConfirmation =
                              execution?.requiresConfirmation === true && execution.executed === false;
                            const stateSymbol = execution
                              ? execution.executed
                                ? "✅"
                                : execution.ok
                                  ? "⏳"
                                  : "❌"
                              : action.requiresConfirmation
                                ? "🔐"
                                : "🔹";

                            return (
                              <div key={index} className="text-sm leading-7">
                                <span className="me-2" aria-hidden="true">{stateSymbol}</span>
                                <strong>{domainLabel(action.domain)}</strong>
                                <span className="mx-1">·</span>
                                <strong>{action.operation}</strong>
                                <span className="mx-1">—</span>
                                <span>{action.summary}</span>
                                {needsConfirmation && (
                                  <div className="mt-2">
                                    <button
                                      type="button"
                                      onClick={() => void confirmAction(message.id, index)}
                                      disabled={busy || confirming !== null}
                                      className="rounded-full bg-[#2f2823] px-4 py-2 text-[11px] font-semibold text-white transition hover:bg-[#40362f] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {confirming === message.id + ":" + index ? "Executing…" : "Confirm & execute"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-xs leading-6 text-[var(--svj-muted)]">
                          {message.autonomyMode === "autonomous"
                            ? "تم تنفيذ العمليات المسموح بها تلقائيًا. العمليات المحمية تحتاج إلى موافقتك."
                            : "العمليات الآمنة يمكن تنفيذها تلقائيًا، أما العمليات المحمية فتحتاج إلى موافقتك."}
                        </p>
                      </div>
                    )}

                    {message.execution && message.execution.length > 0 && (
                      <div className="mt-4 space-y-2 text-sm leading-7" dir={isArabic(message.execution.map((item) => item.message).join(" ")) ? "rtl" : "ltr"}>
                        <p className="font-bold text-[#3a2b22]">حالة التنفيذ</p>
                        {message.execution.map((item) => (
                          <p key={item.index} className="m-0">
                            <span className="me-2" aria-hidden="true">
                              {item.executed ? "✅" : item.ok ? "⏳" : "❌"}
                            </span>
                            <strong>{domainLabel(item.domain)}</strong>
                            <span className="mx-1">·</span>
                            <strong>{item.operation}</strong>
                            <span className="mx-1">—</span>
                            <span>{item.message}</span>
                            {item.operation === "products.create_draft" &&
                              isRecord(item.data) &&
                              "editUrl" in item.data &&
                              typeof item.data.editUrl === "string" && (
                                <span className="ms-2 inline-flex flex-wrap gap-2 align-middle">
                                  <a
                                    href={item.data.editUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-semibold text-[#8c6c3f] underline underline-offset-2"
                                  >
                                    Edit page
                                  </a>
                                  {"storefrontPreviewUrl" in item.data &&
                                    typeof item.data.storefrontPreviewUrl === "string" && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <a
                                          href={item.data.storefrontPreviewUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="font-semibold text-[#8c6c3f] underline underline-offset-2"
                                        >
                                          Preview page
                                        </a>
                                      </>
                                    )}
                                </span>
                              )}
                          </p>
                        ))}
                      </div>
                    )}

}