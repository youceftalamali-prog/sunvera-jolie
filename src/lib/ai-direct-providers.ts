import type { AITask, AIModelOption, AIRoute, TextMessage } from "@/lib/ai-gateway";

export type DirectProvider = "llmtech" | "xkiro";

type ProviderModel = {
  provider: DirectProvider;
  id: string;
  name: string;
  vision: boolean;
  free: boolean;
};

const MODELS: ProviderModel[] = [
  { provider: "xkiro", id: "qwen/qwen3.7-flash:free", name: "Qwen 3.7 Flash Free · xKiro", vision: false, free: true },
  { provider: "xkiro", id: "qwen/qwen3.8-max:free", name: "Qwen 3.8 Max Free · xKiro", vision: false, free: true },
  { provider: "xkiro", id: "sensenova/sensenova-6.8-flash-lite", name: "SenseNova 6.8 Flash-Lite Vision · xKiro Free", vision: true, free: true },
  { provider: "llmtech", id: "nvidia/Qwen3.8-27B-NVFP4", name: "Qwen 3.8 27B · LLM Tech", vision: true, free: true },
];

const DEFAULTS: Record<"text" | "vision", string[]> = {
  // Prefer the two requested xKiro Qwen free models; keep LLM Tech as fallback.
  text: ["xkiro:qwen/qwen3.7-flash:free", "xkiro:qwen/qwen3.8-max:free", "llmtech:nvidia/Qwen3.8-27B-NVFP4"],
  vision: ["xkiro:sensenova/sensenova-6.8-flash-lite", "llmtech:nvidia/Qwen3.8-27B-NVFP4"],
};

function envKey(provider: DirectProvider) {
  if (provider === "llmtech") return process.env.LLMTECH_API_KEY || "";
  return process.env.XKIRO_API_KEY || "";
}

function parseModel(value: string): { provider: DirectProvider; id: string } | null {
  const separator = value.indexOf(":");
  if (separator < 0) return null;
  const provider = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (provider === "llmtech" && id === "nvidia/Qwen3.8-27B-NVFP4") return { provider, id };
  if (provider === "xkiro" && id === "qwen/qwen3.7-flash:free") return { provider, id };
  if (provider === "xkiro" && id === "qwen/qwen3.8-max:free") return { provider, id };
  if (provider === "xkiro" && id === "sensenova/sensenova-6.8-flash-lite") return { provider, id };
  return null;
}

function routeModel(task: AITask, override?: string, auto = true) {
  const modality = task === "vision" ? "vision" : "text";
  const requested = override?.trim();
  if (requested && parseModel(requested)) return requested;
  if (!auto) {
    const envOverride = process.env[modality === "vision" ? "AI_VISION_MODEL" : "AI_TEXT_MODEL"] || "";
    return parseModel(envOverride) ? envOverride : DEFAULTS[modality][0];
  }
  if (task === "master_plan") {
    const masterOverride = process.env.MASTER_AI_MODEL || "";
    return parseModel(masterOverride) ? masterOverride : DEFAULTS.text[0];
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

function providerUrl(provider: DirectProvider, _model: string) {
  if (provider === "llmtech") return "https://api.llmtech.eu/v1/chat/completions";
  if (provider === "xkiro") return "https://api.xkiro.com/v1/chat/completions";
  throw new Error("Unsupported provider: " + provider);
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

async function callOpenAICompatible(provider: DirectProvider, model: string, messages: TextMessage[], options: { temperature?: number; maxTokens?: number; jsonSchema?: { name: string; schema: Record<string, unknown>; strict?: boolean }; timeoutMs?: number }) {
  const key = envKey(provider);
  if (!key) throw new Error(provider.toUpperCase() + "_API_KEY is not configured.");
  const jsonObjectMode = Boolean(options.jsonSchema) && (provider === "llmtech" || provider === "xkiro");
  const outgoingMessages = messages.map(toOpenAIMessage);
  if (jsonObjectMode) {
    outgoingMessages.unshift({
      role: "system",
      content: "Return ONLY one valid JSON object. Do not use Markdown, code fences, explanations, or text before or after the JSON. The JSON must contain summary, intent, and actions. Each action must contain domain, operation, summary, requiresConfirmation, and payload as a JSON string.",
    });
  }
  const isMasterPlanningModel =
    provider === "llmtech" && model === "nvidia/Qwen3.8-27B-NVFP4";

  const body: Record<string, unknown> = {
    model,
    temperature: options.temperature ?? 0.6,
    messages: outgoingMessages,
  };

  // Keep extra reasoning scoped to the approved LLM Tech model.
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
  } else {
    body.max_tokens = options.maxTokens ?? 32768;
  }
  // xKiro streaming avoids the provider's blocking-request cutoff.
  const useStreaming: boolean = provider === "xkiro";
  if (useStreaming) {
    body.stream = true;
  }
  const response = await fetch(providerUrl(provider, model), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + key, ...(useStreaming ? { Accept: "text/event-stream" } : {}) },
    signal: AbortSignal.timeout(Math.max(1_000, options.timeoutMs ?? 12_000)),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(provider.toUpperCase() + " " + response.status + ": " + (await response.text()).slice(0, 800));

  if (useStreaming) {
    if (!response.body) throw new Error(provider.toUpperCase() + " returned no streaming body.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const chunk = JSON.parse(payload) as {
              choices?: Array<{
                delta?: { content?: string };
                message?: { content?: string };
              }>;
            };
            const piece = chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content ?? "";
            if (piece) text += piece;
          } catch {
            // Ignore non-JSON keepalive/event lines; content chunks remain parseable.
          }
        }
      }
      buffer += decoder.decode();
      const trailing = buffer.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("data:"));
      for (const line of trailing) {
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const chunk = JSON.parse(payload) as {
            choices?: Array<{
              delta?: { content?: string };
              message?: { content?: string };
            }>;
          };
          const piece = chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content ?? "";
          if (piece) text += piece;
        } catch {
          // Ignore incomplete/keepalive frames.
        }
      }
    } finally {
      reader.releaseLock();
    }
    if (!text.trim()) throw new Error(provider.toUpperCase() + " returned an empty streaming response.");
    return text.trim();
  }

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

  const candidates = auto
    ? [preferred, ...DEFAULTS[modality], ...(modality === "text" ? DEFAULTS.text : [])].filter((v, i, a) => a.indexOf(v) === i)
    : [preferred];
  const failures: string[] = [];
  // Try the two xKiro free Qwen text models, then LLM Tech as fallback.
  const perProviderTimeoutMs = 300_000;
  const maxProviderCalls = 4;
  let providerCalls = 0;
  for (const encoded of candidates) {
    const parsed = parseModel(encoded);
    if (!parsed) {
      failures.push(encoded + ": invalid model route");
      continue;
    }
    if (!available(encoded)) {
      failures.push(encoded + ": API key missing in runtime");
      continue;
    }
    if (providerCalls >= maxProviderCalls) break;
    providerCalls += 1;
    try {
      const providerOptions = {
        ...options,
        timeoutMs: perProviderTimeoutMs,
        ...(task === "master_plan"
          ? { maxTokens: Math.min(options.maxTokens ?? 16_384, 16_384) }
          : {}),
      };
      const text = await callOpenAICompatible(parsed.provider, parsed.id, messages, providerOptions);
      return { route: { task, modality, model: encoded, label: "Direct · " + label(encoded), source: options.modelOverride || !auto ? "configured" : "auto" } as AIRoute, text };
    } catch (error) {
      failures.push(encoded + ": " + (error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 220) : "failed"));
    }
  }
  throw new Error("All direct AI providers failed. Details: " + (failures.join(" | ") || "no provider attempted"));
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

  // Expose selectable models only when their corresponding API key is configured.
  const visible = MODELS.filter((m) => available(m.provider + ":" + m.id));

  return {
    text: visible.map((m) => toOption(m, "text")),
    vision: visible.filter((m) => m.vision).map((m) => toOption(m, "vision")),
  };
}

export function directRouteCatalog() {
  const text = DEFAULTS.text[0];
  const vision = DEFAULTS.vision[0];
  return {
    text: { task: "chat", modality: "text", model: text, label: "Auto · " + label(text), source: "auto" } as AIRoute,
    vision: { task: "vision", modality: "vision", model: vision, label: "Auto · " + label(vision), source: "auto" } as AIRoute,
  };
}
