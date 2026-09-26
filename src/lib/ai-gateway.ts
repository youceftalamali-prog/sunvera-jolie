export type AITask =
  | "chat"
  | "analysis"
  | "planning"
  | "master_plan"
  | "description"
  | "seo"
  | "translation"
  | "vision"
  | "image_generation"
  | "video_generation";

export type AIModality = "text" | "vision" | "image" | "video";

export type AIRoute = {
  task: AITask;
  modality: AIModality;
  model: string;
  label: string;
  source: "configured" | "auto";
};

type OpenRouterModel = {
  id?: string;
  name?: string;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
};

type MediaModel = { id?: string; name?: string };

export type VideoJob = {
  id: string;
  polling_url?: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "expired";
  error?: string;
  unsigned_urls?: string[];
  usage?: { cost?: number };
};

export type TextMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "user";
      content: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
    };

const BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_TEXT_MODEL = "deepseek/deepseek-flash-latest";
const FALLBACK_IMAGE_MODEL = "bytedance/seedream-4.5";
const FALLBACK_VIDEO_MODEL = "bytedance/seedance-2.0";

let textCatalogCache: { expires: number; models: OpenRouterModel[] } | null = null;
let imageCatalogCache: { expires: number; models: MediaModel[] } | null = null;
let videoCatalogCache: { expires: number; models: MediaModel[] } | null = null;

function apiKey() {
  return process.env.OPENROUTER_API_KEY ?? "";
}

function headers() {
  const key = apiKey();
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");
  return {
    "Content-Type": "application/json",
    Authorization: "Bearer " + key,
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://sunverajolie.com",
    "X-Title": "SunVera Jolie",
  };
}

async function openRouterJson<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(BASE_URL + path, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error("OpenRouter " + response.status + ": " + detail.slice(0, 500));
  }
  return (await response.json()) as T;
}

function configured(value: string | undefined) { return String(value ?? "").trim(); }

function labelForModel(model: string) {
  const slug = model.split("/").pop() || model;
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function listTextModels() {
  const now = Date.now();
  if (textCatalogCache && textCatalogCache.expires > now) return textCatalogCache.models;
  const response = await openRouterJson<{ data?: OpenRouterModel[] }>("/models");
  const models = Array.isArray(response.data) ? response.data : [];
  textCatalogCache = { expires: now + 5 * 60_000, models };
  return models;
}

async function listMediaModels(kind: "images" | "videos") {
  const now = Date.now();
  const cache = kind === "images" ? imageCatalogCache : videoCatalogCache;
  if (cache && cache.expires > now) return cache.models;
  const response = await openRouterJson<{ data?: MediaModel[] }>("/" + kind + "/models");
  const models = Array.isArray(response.data) ? response.data : [];
  if (kind === "images") imageCatalogCache = { expires: now + 5 * 60_000, models };
  else videoCatalogCache = { expires: now + 5 * 60_000, models };
  return models;
}

async function autoVisionModel() {
  try {
    const models = await listTextModels();
    const candidate = models.find((model) => {
      const inputs = model.architecture?.input_modalities ?? [];
      const outputs = model.architecture?.output_modalities ?? [];
      return inputs.includes("image") && outputs.includes("text");
    });
    return candidate?.id ?? DEFAULT_TEXT_MODEL;
  } catch { return DEFAULT_TEXT_MODEL; }
}

async function autoImageModel() {
  try {
    const models = await listMediaModels("images");
    return models.find((model) => model.id)?.id ?? FALLBACK_IMAGE_MODEL;
  } catch { return FALLBACK_IMAGE_MODEL; }
}

async function autoVideoModel() {
  try {
    const models = await listMediaModels("videos");
    return models.find((model) => model.id)?.id ?? FALLBACK_VIDEO_MODEL;
  } catch { return FALLBACK_VIDEO_MODEL; }
}

export async function resolveAIRoute(task: AITask): Promise<AIRoute> {
  if (task === "image_generation") {
    const model = configured(process.env.AI_IMAGE_MODEL) || (await autoImageModel());
    return { task, modality: "image", model, label: labelForModel(model), source: configured(process.env.AI_IMAGE_MODEL) ? "configured" : "auto" };
  }

  if (task === "video_generation") {
    const model = configured(process.env.AI_VIDEO_MODEL) || (await autoVideoModel());
    return { task, modality: "video", model, label: labelForModel(model), source: configured(process.env.AI_VIDEO_MODEL) ? "configured" : "auto" };
  }

  if (task === "vision") {
    const model = configured(process.env.AI_VISION_MODEL) || (await autoVisionModel());
    return { task, modality: "vision", model, label: labelForModel(model), source: configured(process.env.AI_VISION_MODEL) ? "configured" : "auto" };
  }

  const configuredTextModel = configured(process.env.AI_TEXT_MODEL);
  const model = configuredTextModel || DEFAULT_TEXT_MODEL;
  return {
    task,
    modality: "text",
    model,
    label: labelForModel(model),
    source: configuredTextModel ? "configured" : "auto",
  };
}

export async function generateText(
  task: Exclude<AITask, "vision" | "image_generation" | "video_generation">,
  messages: TextMessage[],
  options: {
    temperature?: number;
    jsonSchema?: { name: string; schema: Record<string, unknown>; strict?: boolean };
  } = {},
) {
  const route = await resolveAIRoute(task);
  const responseFormat = options.jsonSchema
    ? { response_format: { type: "json_schema", json_schema: { name: options.jsonSchema.name, strict: options.jsonSchema.strict ?? true, schema: options.jsonSchema.schema } } }
    : {};
  const response = await openRouterJson<{ choices?: Array<{ message?: { content?: string } }> }>("/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: route.model, temperature: options.temperature ?? 0.6, messages, ...responseFormat }),
  });
  return { route, text: response.choices?.[0]?.message?.content?.trim() ?? "" };
}

export async function analyzeImage(prompt: string, imageUrl: string) {
  const route = await resolveAIRoute("vision");
  const response = await openRouterJson<{ choices?: Array<{ message?: { content?: string } }> }>(
    "/chat/completions",
    {
      method: "POST",
      body: JSON.stringify({
        model: route.model,
        temperature: 0.5,
        messages: [
          {
            role: "system",
            content: "Analyze the supplied image carefully and answer using only visible evidence.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    },
  );

  return {
    route,
    text: response.choices?.[0]?.message?.content?.trim() ?? "",
  };
}

export async function generateImage(prompt: string, options: { aspectRatio?: string; resolution?: string; n?: number; inputReferences?: string[] } = {}) {
  const route = await resolveAIRoute("image_generation");
  const payload: Record<string, unknown> = { model: route.model, prompt };
  if (options.aspectRatio) payload.aspect_ratio = options.aspectRatio;
  if (options.resolution) payload.resolution = options.resolution;
  if (options.n) payload.n = options.n;
  if (options.inputReferences?.length) payload.input_references = options.inputReferences;
  const response = await openRouterJson<{ data?: Array<{ b64_json?: string; url?: string }> }>("/images", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return { route, images: response.data ?? [] };
}

export async function createVideoJob(prompt: string, options: { duration?: number; resolution?: string; aspectRatio?: string; generateAudio?: boolean; imageUrl?: string } = {}) {
  const route = await resolveAIRoute("video_generation");
  const payload: Record<string, unknown> = { model: route.model, prompt };
  if (options.duration !== undefined) payload.duration = options.duration;
  if (options.resolution) payload.resolution = options.resolution;
  if (options.aspectRatio) payload.aspect_ratio = options.aspectRatio;
  if (options.generateAudio !== undefined) payload.generate_audio = options.generateAudio;
  if (options.imageUrl) payload.image_url = options.imageUrl;
  const job = await openRouterJson<VideoJob>("/videos", { method: "POST", body: JSON.stringify(payload) });
  return { route, job };
}

export async function getVideoJob(jobId: string) {
  return openRouterJson<VideoJob>("/videos/" + encodeURIComponent(jobId));
}

export function getVideoContentUrl(jobId: string, index = 0) {
  return BASE_URL + "/videos/" + encodeURIComponent(jobId) + "/content?index=" + index;
}

export async function getAIRouteCatalog() {
  const routes = await Promise.all([resolveAIRoute("chat"), resolveAIRoute("vision"), resolveAIRoute("image_generation"), resolveAIRoute("video_generation")]);
  return routes.reduce<Record<string, AIRoute>>((acc, route) => { acc[route.modality] = route; return acc; }, {});
}
