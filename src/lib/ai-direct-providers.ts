import type { AITask, AIModelOption, AIRoute, TextMessage } from "@/lib/ai-gateway";

export type DirectProvider = "gemini" | "qwen" | "deepseek" | "groq" | "openrouter" | "aihubmix" | "tokenharbor";

type ProviderModel = {
  provider: DirectProvider;
  id: string;
  name: string;
  vision: boolean;
  free: boolean;
};

const MODELS: ProviderModel[] = [
  { provider: "tokenharbor", id: "deepseek-v4.1-flash:free", name: "DeepSeek V4.1 Flash · Token Harbor Free", vision: false, free: true },
  { provider: "aihubmix", id: "coding-kimi-k3-free", name: "Kimi K3 · AIHubMix Free", vision: true, free: true },
  { provider: "aihubmix", id: "coding-glm-5.3-free", name: "Coding GLM 5.3 · AIHubMix Free", vision: false, free: true },
  { provider: "openrouter", id: "google/gemma-4-26b-a4b-it:free", name: "Gemma 4 26B A4B · OpenRouter Free", vision: true, free: true },
  { provider: "openrouter", id: "inclusionai/ling-3.0-flash:free", name: "Ling 3.0 Flash · OpenRouter Free", vision: true, free: true },
  { provider: "gemini", id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", vision: true, free: true },
  { provider: "qwen", id: "qwen3.8-max", name: "Qwen3.8 Max", vision: true, free: false },
  { provider: "qwen", id: "qwen3.8-flash", name: "Qwen3.8 Flash", vision: true, free: false },
  { provider: "qwen", id: "qwen3.7-max", name: "Qwen3.7 Max", vision: true, free: false },
  { provider: "qwen", id: "qwen-flash-character", name: "Qwen Flash Character", vision: false, free: true },
  { provider: "qwen", id: "qwen-plus-character", name: "Qwen Plus Character", vision: false, free: true },
  { provider: "gemini", id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash-Lite", vision: true, free: true },
  { provider: "qwen", id: "qwen3.7-flash", name: "Qwen3.7 Flash", vision: true, free: true },
  { provider: "qwen", id: "qwen3.7-plus", name: "Qwen3.7 Plus", vision: true, free: true },
  { provider: "deepseek", id: "deepseek-flash", name: "DeepSeek V4.1 Flash", vision: true, free: false },
  { provider: "openrouter", id: "deepseek/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash · OpenRouter", vision: true, free: false },
  { provider: "groq", id: "qwen/qwen3.8-27b", name: "Qwen3.8 27B · Groq", vision: true, free: true },
];

const DEFAULTS: Record<"text" | "vision", string[]> = {
  // AIHubMix is the primary free automatic text/vision route when its key is
  // configured. Its free catalog can be switched without changing the API key.
  // OpenRouter/DeepSeek and other providers remain available as fallbacks.
  text: [
    "aihubmix:coding-kimi-k3-free",
    "aihubmix:coding-glm-5.3-free",
    "openrouter:deepseek/deepseek-v4.1-flash",
    "deepseek:deepseek-flash",
    "qwen:qwen-plus-character",
    "gemini:gemini-3.8-flash",
    "qwen:qwen3.7-flash",
  ],
  vision: [
    "aihubmix:coding-kimi-k3-free",
    "openrouter:deepseek/deepseek-v4.1-flash",
    "deepseek:deepseek-flash",
    "qwen:qwen3.8-flash",
    "gemini:gemini-3.8-flash",
    "qwen:qwen3.7-flash",
  ],
};

function envKey(provider: DirectProvider) {
  if (provider === "gemini") return process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || "";
  if (provider === "qwen") return process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || "";
  if (provider === "deepseek") return process.env.DEEPSEEK_API_KEY || "";
  if (provider === "groq") return process.env.GROQ_API_KEY || "";
  if (provider === "aihubmix") return process.env.AIHUBMIX_API_KEY || "";
  if (provider === "tokenharbor") return process.env.TOKENHARBOR_API_KEY || "";
  return process.env.OPENROUTER_API_KEY || "";
}

function parseModel(value: string): { provider: DirectProvider; id: string } | null {
  const [provider, ...parts] = value.split(":");
  if (provider === "gemini" || provider === "qwen" || provider === "deepseek" || provider === "groq" || provider === "openrouter" || provider === "aihubmix" || provider === "tokenharbor") {
    const typedProvider = provider as DirectProvider;
    return { provider: typedProvider, id: parts.join(":") || MODELS.find((m) => m.provider === typedProvider)?.id || "" };
  }
  return null;
}

function routeModel(task: AITask, override?: string, auto = true) {
  const modality = task === "vision" ? "vision" : "text";
  if (override?.trim()) return override.trim();
  if (!auto) return process.env[modality === "vision" ? "AI_VISION_MODEL" : "AI_TEXT_MODEL"] || DEFAULTS[modality][0];
  if (task === "master_plan") {
    return (
      process.env.MASTER_AI_MODEL ||
      "aihubmix:coding-kimi-k3-free"
    );
  }
  if (task === "description" || task === "seo" || task === "translation" || task === "chat") {
    return DEFAULTS.text[0];
  }
  return DEFAULTS[modality][0];
}

function label(model: string) {
  const parsed = parseModel(model);
  return parsed ? MODELS.find((m) => m.provider === parsed.provider && m.id === parsed.id)?.name || parsed.id : model;
}

function available(model: string) {
  const parsed = parseModel(model);
  return Boolean(parsed && envKey(parsed.provider));
}

function providerUrl(provider: DirectProvider, model: string) {
  if (provider === "gemini") return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  if (provider === "qwen") return "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
  if (provider === "deepseek") return "https://api.deepseek.com/chat/completions";
  if (provider === "groq") return "https://api.groq.com/openai/v1/chat/completions";
  if (provider === "aihubmix") return "https://aihubmix.com/v1/chat/completions";
  if (provider === "tokenharbor") return "https://tokenharbor.ai/v1/chat/completions";
  return "https://openrouter.ai/api/v1/chat/completions";
}

async function imagePartFromUrl(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("Could not fetch image for Gemini.");
  const mime = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const bytes = Buffer.from(await response.arrayBuffer());
  return { inlineData: { mimeType: mime, data: bytes.toString("base64") } };
}

function toOpenAIMessage(message: TextMessage) {
  if (typeof message.content === "string") return message;
  return {
    role: message.role,
    content: message.content.map((part) =>
      part.type === "text"
        ? { type: "text", text: part.text }
        : { type: "image_url", image_url: { url: part.image_url.url } },
    ),
  };
}

async function callGemini(model: string, messages: TextMessage[], options: { temperature?: number; maxTokens?: number; jsonSchema?: { schema: Record<string, unknown> } }) {
  const key = envKey("gemini");
  if (!key) throw new Error("GEMINI_API_KEY is not configured.");
  const contents: Array<{ role: "user" | "model"; parts: Array<Record<string, unknown>> }> = [];
  let system = "";
  for (const message of messages) {
    if (message.role === "system") { system += (system ? "\n" : "") + String(message.content); continue; }
    const parts: Array<Record<string, unknown>> = [];
    if (typeof message.content === "string") parts.push({ text: message.content });
    else for (const part of message.content) {
      if (part.type === "text") parts.push({ text: part.text });
      else parts.push(await imagePartFromUrl(part.image_url.url));
    }
    contents.push({ role: message.role === "assistant" ? "model" : "user", parts });
  }
  const generationConfig: Record<string, unknown> = {
    temperature: options.temperature ?? 0.6,
    maxOutputTokens: options.maxTokens ?? 32768,
  };
  if (options.jsonSchema) {
    generationConfig.responseMimeType = "application/json";
    generationConfig.responseJsonSchema = options.jsonSchema.schema;
  }
  const response = await fetch(providerUrl("gemini", model) + "?key=" + encodeURIComponent(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents,
      generationConfig,
    }),
  });
  if (!response.ok) throw new Error("Gemini " + response.status + ": " + (await response.text()).slice(0, 400));
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || "";
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

async function callOpenAICompatible(provider: DirectProvider, model: string, messages: TextMessage[], options: { temperature?: number; maxTokens?: number; jsonSchema?: { name: string; schema: Record<string, unknown>; strict?: boolean } }) {
  const key = envKey(provider);
  if (!key) throw new Error(provider.toUpperCase() + "_API_KEY is not configured.");
  const jsonObjectMode =
    Boolean(options.jsonSchema) &&
    ((provider === "qwen" && model === "qwen-plus-character") ||
      provider === "tokenharbor");
  const outgoingMessages = messages.map(toOpenAIMessage);
  if (jsonObjectMode) {
    outgoingMessages.unshift({
      role: "system",
      content: "Return ONLY one valid JSON object. Do not use Markdown, code fences, explanations, or text before or after the JSON. The JSON must contain summary, intent, and actions. Each action must contain domain, operation, summary, requiresConfirmation, and payload as a JSON string.",
    });
  }
  const isMasterPlanningModel =
    (provider === "qwen" && /^(qwen3\.8|qwen3\.7)/i.test(model)) ||
    (provider === "groq" && /^qwen\/qwen3\.8-27b$/i.test(model)) ||
    (provider === "openrouter" && model === "deepseek/deepseek-v4.1-flash") ||
    (provider === "aihubmix" && /^(coding-kimi-k3-free|coding-glm-5.3-free)$/i.test(model));
  const body: Record<string, unknown> = {
    model,
    temperature: options.temperature ?? 0.6,
    messages: outgoingMessages,
  };

  // Qwen3.8/3.7 reasoning models can spend more effort on complex agent planning.
  // Keep the reasoning setting scoped to those models so older providers are unaffected.
  if (isMasterPlanningModel && options.jsonSchema) {
    body.reasoning_effort = "high";
  }

  if (options.jsonSchema) {
    body.response_format = jsonObjectMode
      ? { type: "json_object" }
      : {
          type: "json_schema",
          json_schema: {
            name: options.jsonSchema.name,
            strict: options.jsonSchema.strict ?? true,
            schema: options.jsonSchema.schema,
          },
        };
    if (provider === "groq") {
      body.reasoning_format = "hidden";
      body.max_completion_tokens = Math.min(
        Math.max(options.maxTokens ?? 16384, 8192),
        16384,
      );
    }
  } else if (provider === "groq") {
    body.max_completion_tokens = Math.min(
      Math.max(options.maxTokens ?? 16384, 8192),
      16384,
    );
  } else {
    body.max_tokens = options.maxTokens ?? 32768;
  }
  const response = await fetch(providerUrl(provider, model), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(provider.toUpperCase() + " " + response.status + ": " + (await response.text()).slice(0, 400));
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim() || "";
  if (!text) throw new Error(provider.toUpperCase() + " returned an empty response.");
  return text;
}

export async function directGenerateText(
  task: AITask,
  messages: TextMessage[],
  options: { temperature?: number; jsonSchema?: { name: string; schema: Record<string, unknown>; strict?: boolean }; maxTokens?: number; modelOverride?: string; autoSelectModel?: boolean } = {},
) {
  const auto = options.autoSelectModel !== false;
  const modality = task === "vision" ? "vision" : "text";
  const preferred = routeModel(task, options.modelOverride, auto);
  const masterPlanCandidates = [
    // AIHubMix free models are the preferred planner route when configured.
    // Keep multiple free AIHubMix models so automatic mode can move to another
    // free model when the selected model is temporarily rate-limited.
    preferred,
    "aihubmix:coding-kimi-k3-free",
    "aihubmix:coding-glm-5.3-free",
    "openrouter:deepseek/deepseek-v4.1-flash",
    "deepseek:deepseek-flash",
    "qwen:qwen3.8-max",
    "qwen:qwen3.8-flash",
    "qwen:qwen3.7-max",
    "qwen:qwen3.7-plus",
    "gemini:gemini-3.8-flash",
    "qwen:qwen-plus-character",
  ];
  const candidates = auto
    ? (task === "master_plan"
        ? masterPlanCandidates
        : [preferred, ...DEFAULTS[modality], ...DEFAULTS.text]
      ).filter((v, i, a) => a.indexOf(v) === i)
    : [preferred];
  const failures: string[] = [];
  for (const encoded of candidates) {
    const parsed = parseModel(encoded);
    if (!parsed || !available(encoded)) continue;
    try {
      const text = parsed.provider === "gemini"
        ? await callGemini(parsed.id, messages, options)
        : await callOpenAICompatible(parsed.provider, parsed.id, messages, options);
      return { route: { task, modality, model: encoded, label: "Direct · " + label(encoded), source: options.modelOverride || !auto ? "configured" : "auto" } as AIRoute, text };
    } catch (error) {
      failures.push(encoded + ": " + (error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 220) : "failed"));
    }
  }
  throw new Error("All direct AI providers failed. " + failures.join(" | "));
}

export async function directAnalyzeImage(prompt: string, imageUrl: string, modelOverride?: string) {
  return directGenerateText("vision", [
    { role: "system", content: "Analyze supplied images using only visible evidence. Do not invent product facts." },
    { role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageUrl } }] },
  ], { modelOverride, autoSelectModel: true, temperature: 0.4 });
}

export function directModelCatalog(): { text: AIModelOption[]; vision: AIModelOption[] } {
  const toOption = (m: ProviderModel, modality: "text" | "vision"): AIModelOption => ({
    id: m.provider + ":" + m.id,
    name: m.name + " · " + m.provider,
    modality,
    isFree: m.free,
    promptPricePerMillion: 0,
    completionPricePerMillion: 0,
  });
  return {
    text: MODELS.map((m) => toOption(m, "text")),
    vision: MODELS.filter((m) => m.vision).map((m) => toOption(m, "vision")),
  };
}

export function directRouteCatalog() {
  const text = DEFAULTS.text.find(available) || DEFAULTS.text[0];
  const vision = DEFAULTS.vision.find(available) || DEFAULTS.vision[0];
  return {
    text: { task: "chat", modality: "text", model: text, label: "Auto · " + label(text), source: "auto" } as AIRoute,
    vision: { task: "vision", modality: "vision", model: vision, label: "Auto · " + label(vision), source: "auto" } as AIRoute,
  };
}
