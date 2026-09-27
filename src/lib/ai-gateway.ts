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

export type AIModelOption = {
  id: string;
  name: string;
  modality: "text" | "vision";
  isFree: boolean;
  promptPricePerMillion: number;
  completionPricePerMillion: number;
};

type OpenRouterModel = {
  id?: string;
  name?: string;
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  pricing?: Record<string, string>;
  context_length?: number;
  supported_parameters?: string[];
};

type MediaModel = {
  id?: string;
  name?: string;
  pricing?: Record<string, string>;
};

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
const DEFAULT_TEXT_MODEL = "deepseek/deepseek-v4.1-flash";
const DEFAULT_VISION_MODEL = "openrouter/free";
const FALLBACK_IMAGE_MODEL = "bytedance/seedream-4.5";
const FALLBACK_VIDEO_MODEL = "bytedance/seedance-2.0";

type AIRouterSettings = {
  textModel: string;
  visionModel: string;
  imageModel: string;
  videoModel: string;
  preferFreeModels: boolean;
};

let routerSettingsCache: { expires: number; settings: AIRouterSettings } | null = null;
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

function supportsStructuredOutput(model: OpenRouterModel) {
  const supported = model.supported_parameters ?? [];
  return supported.includes("structured_outputs") || supported.includes("response_format");
}

function isChatCompatibleModel(model: OpenRouterModel) {
  const id = String(model.id ?? "").trim().toLowerCase();
  if (!id) return false;

  // OpenRouter exposes some model variants in /models that are not callable through
  // the interactive /chat/completions endpoint (for example :batch variants).
  if (id.endsWith(":batch") || id.includes(":embedding") || id.includes(":moderation")) {
    return false;
  }

  const inputs = model.architecture?.input_modalities ?? [];
  const outputs = model.architecture?.output_modalities ?? [];
  return inputs.includes("text") && outputs.includes("text");
}

const NON_INTERACTIVE_AGENT_PATTERNS = [
  /(?:^|\/)inkling(?:-small)?(?::|$)/i,
  /(?:^|\/)north-(?:mini-)?code(?::|$)/i,
  /(?:^|\/)laguna(?:-|:|$)/i,
  /(?:^|\/)nex-(?:n2\.5|n2\.5-mini)(?::|$)/i,
];

function isInteractiveVisionCandidate(model: OpenRouterModel) {
  const id = String(model.id ?? "").trim();
  if (!isChatCompatibleModel(model)) return false;
  if (NON_INTERACTIVE_AGENT_PATTERNS.some((pattern) => pattern.test(id))) return false;
  const inputs = model.architecture?.input_modalities ?? [];
  return inputs.includes("image");
}

function modelScore(model: OpenRouterModel, preferFree: boolean, structuredRequired: boolean) {
  const free = isFreeModel(model);
  const structured = supportsStructuredOutput(model);
  const contextLength = Number(model.context_length ?? 0);
  return (
    (preferFree && free ? 1_000_000_000 : 0) +
    (structuredRequired && structured ? 100_000_000 : 0) +
    Math.min(contextLength, 1_000_000)
  );
}

function sortTextCandidates(
  models: OpenRouterModel[],
  preferFree: boolean,
  structuredRequired: boolean,
) {
  return [...models]
    .filter((model) => Boolean(model.id))
    .sort((a, b) => modelScore(b, preferFree, structuredRequired) - modelScore(a, preferFree, structuredRequired));
}

async function getAutoTextCandidates(
  preferFree = true,
  options: { structuredRequired?: boolean } = {},
) {
  try {
    const models = await listTextModels();
    const structuredRequired = options.structuredRequired === true;
    let candidates = models.filter((model) => {
      if (!isChatCompatibleModel(model)) return false;
      if (NON_INTERACTIVE_AGENT_PATTERNS.some((pattern) => pattern.test(String(model.id ?? "")))) return false;
      if (structuredRequired && !supportsStructuredOutput(model)) return false;
      return true;
    });

    if (!candidates.length) {
      candidates = models.filter(
        (model) =>
          isChatCompatibleModel(model) &&
          !NON_INTERACTIVE_AGENT_PATTERNS.some((pattern) => pattern.test(String(model.id ?? ""))),
      );
    }

    return sortTextCandidates(candidates, preferFree, structuredRequired);
  } catch {
    return [{ id: DEFAULT_TEXT_MODEL, name: labelForModel(DEFAULT_TEXT_MODEL) }];
  }
}

async function autoTextModel(
  preferFree = true,
  options: { structuredRequired?: boolean } = {},
) {
  const candidates = await getAutoTextCandidates(preferFree, options);
  return candidates[0]?.id ?? DEFAULT_TEXT_MODEL;
}

async function getAutoVisionCandidates(preferFree = true) {
  try {
    const models = await listTextModels();
    const candidates = models.filter((model) => {
      const outputs = model.architecture?.output_modalities ?? [];
      return isInteractiveVisionCandidate(model) && outputs.includes("text");
    });

    // OpenRouter's own free router dynamically selects a currently compatible
    // free vision model, which is more resilient than pinning Auto mode to one
    // free provider that may be temporarily rate-limited.
    const freeRouter = preferFree
      ? [{ id: "openrouter/free", name: "OpenRouter Free Vision Router" }]
      : [];

    const preferredFreeIds = [
      "google/gemma-4-26b-a4b-it:free",
      "qwen/qwen3.8-27b:free",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
      "google/gemma-4-31b-it:free",
    ];

    const preferred = preferredFreeIds
      .map((id) => candidates.find((model) => model.id === id))
      .filter((model): model is OpenRouterModel => Boolean(model));

    const remaining = candidates
      .filter((model) => !preferredFreeIds.includes(String(model.id)))
      .sort((a, b) => modelScore(b, preferFree, false) - modelScore(a, preferFree, false));

    return preferFree
      ? [...freeRouter, ...preferred, ...remaining]
      : [...remaining, ...preferred];
  } catch {
    return [{ id: DEFAULT_VISION_MODEL, name: labelForModel(DEFAULT_VISION_MODEL) }];
  }
}

async function autoVisionModel(preferFree = true) {
  const candidates = await getAutoVisionCandidates(preferFree);
  return candidates[0]?.id ?? DEFAULT_VISION_MODEL;
}

async function autoImageModel(preferFree = true) {
  try {
    const models = await listMediaModels("images");
    return chooseModel(models, preferFree, FALLBACK_IMAGE_MODEL);
  } catch {
    return FALLBACK_IMAGE_MODEL;
  }
}

async function autoVideoModel(preferFree = true) {
  try {
    const models = await listMediaModels("videos");
    return chooseModel(models, preferFree, FALLBACK_VIDEO_MODEL);
  } catch {
    return FALLBACK_VIDEO_MODEL;
  }
}

async function getAIRouterSettings(): Promise<AIRouterSettings> {
  const now = Date.now();
  if (routerSettingsCache && routerSettingsCache.expires > now) return routerSettingsCache.settings;

  try {
    const { getSettingsMap } = await import("@/lib/settings");
    const settings = await getSettingsMap();
    const ai = settings.ai;
    const next: AIRouterSettings = {
      textModel: configured(ai.textModel),
      visionModel: configured(ai.visionModel),
      imageModel: configured(ai.imageModel),
      videoModel: configured(ai.videoModel),
      preferFreeModels: ai.preferFreeModels !== false,
    };
    routerSettingsCache = { expires: now + 60_000, settings: next };
    return next;
  } catch {
    return {
      textModel: "",
      visionModel: "",
      imageModel: "",
      videoModel: "",
      preferFreeModels: true,
    };
  }
}

function isFreeModel(model: { pricing?: Record<string, string> }) {
  const pricing = Object.values(model.pricing ?? {});
  return pricing.length > 0 && pricing.every((value) => Number(value) === 0);
}

function chooseModel(models: Array<OpenRouterModel | MediaModel>, preferFree: boolean, fallback: string) {
  const usable = models.filter((model) => model.id);
  if (!usable.length) return fallback;
  if (preferFree) {
    const free = usable.find((model) => isFreeModel(model));
    if (free?.id) return free.id;
  }
  return usable[0]?.id ?? fallback;
}

export async function resolveAIRoute(
  task: AITask,
  modelOverride?: string,
  options: { autoSelect?: boolean; structuredRequired?: boolean } = {},
): Promise<AIRoute> {
  const routerSettings = await getAIRouterSettings();
  const override = configured(modelOverride);

  if (task === "image_generation") {
    const configuredModel = configured(process.env.AI_IMAGE_MODEL) || routerSettings.imageModel;
    const model = override || configuredModel || (await autoImageModel(routerSettings.preferFreeModels));
    return { task, modality: "image", model, label: labelForModel(model), source: configuredModel ? "configured" : "auto" };
  }

  if (task === "video_generation") {
    const configuredModel = configured(process.env.AI_VIDEO_MODEL) || routerSettings.videoModel;
    const model = override || configuredModel || (await autoVideoModel(routerSettings.preferFreeModels));
    return { task, modality: "video", model, label: labelForModel(model), source: configuredModel ? "configured" : "auto" };
  }

  if (task === "vision") {
    const configuredModel = configured(process.env.AI_VISION_MODEL) || routerSettings.visionModel;
    const autoModel = await autoVisionModel(routerSettings.preferFreeModels);
    const model = override || (options.autoSelect ? autoModel : configuredModel || autoModel);
    return {
      task,
      modality: "vision",
      model,
      label: options.autoSelect ? "Auto · " + labelForModel(model) : labelForModel(model),
      source: options.autoSelect || !configuredModel ? "auto" : "configured",
    };
  }

  const configuredTextModel = configured(process.env.AI_TEXT_MODEL) || routerSettings.textModel;
  const autoModel = await autoTextModel(routerSettings.preferFreeModels, {
    structuredRequired: options.structuredRequired,
  });
  const model = override || (options.autoSelect ? autoModel : configuredTextModel || autoModel);
  return {
    task,
    modality: "text",
    model,
    label: labelForModel(model),
    source: options.autoSelect || !configuredTextModel ? "auto" : "configured",
  };
}

export async function generateText(
  task: Exclude<AITask, "image_generation" | "video_generation">,
  messages: TextMessage[],
  options: {
    temperature?: number;
    jsonSchema?: { name: string; schema: Record<string, unknown>; strict?: boolean };
    webSearch?: boolean;
    webFetch?: boolean;
    maxTokens?: number;
    modelOverride?: string;
    autoSelectModel?: boolean;
  } = {},
) {
  const autoSelect = options.autoSelectModel === true;
  const routerSettings = await getAIRouterSettings();
  const responseFormat = options.jsonSchema
    ? { response_format: { type: "json_schema", json_schema: { name: options.jsonSchema.name, strict: options.jsonSchema.strict ?? true, schema: options.jsonSchema.schema } } }
    : {};
  const tools = [
    ...(options.webSearch ? [{ type: "openrouter:web_search" as const }] : []),
    ...(options.webFetch ? [{ type: "openrouter:web_fetch" as const }] : []),
  ];

  const request = async (model: string) =>
    openRouterJson<{ choices?: Array<{ message?: { content?: string } }> }>("/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model,
        temperature: options.temperature ?? 0.6,
        max_tokens:
          options.maxTokens ??
          (task === "master_plan" || task === "planning" ? 4096 : 3072),
        messages,
        ...(tools.length ? { tools } : {}),
        ...responseFormat,
      }),
    });

  let candidates: string[] = [];
  if (autoSelect && task === "vision") {
    candidates = (await getAutoVisionCandidates(routerSettings.preferFreeModels))
      .map((model) => String(model.id || "").trim())
      .filter(Boolean);
  } else if (autoSelect) {
    candidates = (await getAutoTextCandidates(routerSettings.preferFreeModels, {
      structuredRequired: Boolean(options.jsonSchema),
    }))
      .map((model) => String(model.id || "").trim())
      .filter(Boolean);
  }

  // Under free-provider congestion, try several free routes and then paid routes
  // when the OpenRouter key has available credit instead of failing after only free 429s.
  const uniqueCandidates = [...new Set(candidates)];
  if (autoSelect && routerSettings.preferFreeModels) {
    const freeCandidates = uniqueCandidates.filter((model) => model.endsWith(":free") || model === "openrouter/free");
    const paidCandidates = uniqueCandidates.filter((model) => !model.endsWith(":free") && model !== "openrouter/free");
    candidates = [...freeCandidates.slice(0, 3), ...paidCandidates.slice(0, 2)];
  } else {
    candidates = uniqueCandidates.slice(0, 5);
  }
  if (!candidates.length) {
    throw new Error("No compatible AI model is available.");
  }

  let manualRoute: AIRoute | null = null;
  if (!autoSelect) {
    const route = await resolveAIRoute(task, options.modelOverride, {
      autoSelect: false,
      structuredRequired: Boolean(options.jsonSchema),
    });
    manualRoute = route;
    candidates = [route.model];
  }

  const failures: string[] = [];
  for (let indexOfCandidate = 0; indexOfCandidate < candidates.length; indexOfCandidate += 1) {
    const model = candidates[indexOfCandidate];
    try {
      const response = await request(model);
      const text = response.choices?.[0]?.message?.content?.trim() ?? "";

      // Empty responses are treated as model failure in Auto mode and trigger failover.
      if (!text) {
        failures.push(model + ": empty response");
        continue;
      }

      const route: AIRoute = manualRoute ?? {
        task,
        modality: task === "vision" ? "vision" : "text",
        model,
        label: autoSelect ? "Auto · " + labelForModel(model) : labelForModel(model),
        source: "auto",
      };

      return { route, text };
    } catch (error) {
      const reason = error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 220) : "Unknown model error";
      failures.push(model + ": " + reason);
      if (!autoSelect) throw error;
      if (autoSelect && indexOfCandidate < candidates.length - 1 && /429|timeout|timed out|aborted/i.test(reason)) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }
  }

  throw new Error(
    "All selected AI models failed. " + failures.join(" | "),
  );
}
export async function analyzeImage(prompt: string, imageUrl: string) {
  const settings = await getAIRouterSettings();
  const configuredModel = configured(process.env.AI_VISION_MODEL) || settings.visionModel;
  const candidates = configuredModel
    ? [configuredModel]
    : (await getAutoVisionCandidates(settings.preferFreeModels)).map((model) => String(model.id ?? "").trim()).filter(Boolean);
  const ordered = [...new Set(candidates)].slice(0, 7);
  const failures: string[] = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const model = ordered[index];
    try {
      const response = await openRouterJson<{ choices?: Array<{ message?: { content?: string } }> }>("/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({ model, temperature: 0.5, messages: [
          { role: "system", content: "Analyze the supplied image carefully and answer using only visible evidence." },
          { role: "user", content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ] },
        ] }),
      });
      const text = response.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) throw new Error("Vision model returned empty output.");
      return { route: { task: "vision", modality: "vision", model, label: labelForModel(model), source: configuredModel ? "configured" : "auto" } as AIRoute, text };
    } catch (error) {
      const reason = error instanceof Error ? error.message.replace(/\\s+/g, " ").slice(0, 220) : "Unknown vision model error";
      failures.push(model + ": " + reason);
      if (index < ordered.length - 1 && /429|timeout|timed out|aborted/i.test(reason)) await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  throw new Error("All vision models failed. " + failures.join(" | "));
}

export async function generateImage(
  prompt: string,
  options: {
    aspectRatio?: string;
    resolution?: string;
    n?: number;
    inputReferences?: string[];
    autoSelectModel?: boolean;
    modelOverride?: string;
  } = {},
) {
  const routerSettings = await getAIRouterSettings();
  const autoSelect = options.autoSelectModel === true;
  let candidates: string[] = [];
  let manualRoute: AIRoute | null = null;

  if (autoSelect) {
    try {
      const models = await listMediaModels("images");
      const usable = models.filter((model) => Boolean(model.id));
      const ordered = routerSettings.preferFreeModels
        ? [...usable.filter((model) => isFreeModel(model)), ...usable.filter((model) => !isFreeModel(model))]
        : usable;
      candidates = ordered.map((model) => String(model.id)).filter(Boolean);
    } catch {
      candidates = [FALLBACK_IMAGE_MODEL];
    }
  } else {
    manualRoute = await resolveAIRoute("image_generation", options.modelOverride);
    candidates = [manualRoute.model];
  }

  candidates = [...new Set(candidates)].slice(0, 5);
  if (!candidates.length) throw new Error("No compatible image generation model is available.");

  const failures: string[] = [];
  for (const model of candidates) {
    try {
      const payload: Record<string, unknown> = { model, prompt };
      if (options.aspectRatio) payload.aspect_ratio = options.aspectRatio;
      if (options.resolution) payload.resolution = options.resolution;
      if (options.n) payload.n = options.n;
      if (options.inputReferences?.length) payload.input_references = options.inputReferences;

      const response = await openRouterJson<{ data?: Array<{ b64_json?: string; url?: string }> }>("/images", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const images = response.data ?? [];
      if (!images.length) {
        failures.push(model + ": empty image response");
        continue;
      }

      const route: AIRoute = manualRoute ?? {
        task: "image_generation",
        modality: "image",
        model,
        label: "Auto · " + labelForModel(model),
        source: "auto",
      };
      return { route, images };
    } catch (error) {
      const reason = error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 220) : "Unknown image model error";
      failures.push(model + ": " + reason);
      if (!autoSelect) throw error;
    }
  }

  throw new Error("All selected image models failed. " + failures.join(" | "));
}

export async function createVideoJob(
  prompt: string,
  options: {
    duration?: number;
    resolution?: string;
    aspectRatio?: string;
    generateAudio?: boolean;
    imageUrl?: string;
    autoSelectModel?: boolean;
    modelOverride?: string;
  } = {},
) {
  const routerSettings = await getAIRouterSettings();
  const autoSelect = options.autoSelectModel === true;
  let candidates: string[] = [];
  let manualRoute: AIRoute | null = null;

  if (autoSelect) {
    try {
      const models = await listMediaModels("videos");
      const usable = models.filter((model) => Boolean(model.id));
      const ordered = routerSettings.preferFreeModels
        ? [...usable.filter((model) => isFreeModel(model)), ...usable.filter((model) => !isFreeModel(model))]
        : usable;
      candidates = ordered.map((model) => String(model.id)).filter(Boolean);
    } catch {
      candidates = [FALLBACK_VIDEO_MODEL];
    }
  } else {
    manualRoute = await resolveAIRoute("video_generation", options.modelOverride);
    candidates = [manualRoute.model];
  }

  candidates = [...new Set(candidates)].slice(0, 5);
  if (!candidates.length) throw new Error("No compatible video generation model is available.");

  const failures: string[] = [];
  for (const model of candidates) {
    try {
      const payload: Record<string, unknown> = { model, prompt };
      if (options.duration !== undefined) payload.duration = options.duration;
      if (options.resolution) payload.resolution = options.resolution;
      if (options.aspectRatio) payload.aspect_ratio = options.aspectRatio;
      if (options.generateAudio !== undefined) payload.generate_audio = options.generateAudio;
      if (options.imageUrl) payload.image_url = options.imageUrl;
      const job = await openRouterJson<VideoJob>("/videos", { method: "POST", body: JSON.stringify(payload) });
      const route: AIRoute = manualRoute ?? {
        task: "video_generation",
        modality: "video",
        model,
        label: "Auto · " + labelForModel(model),
        source: "auto",
      };
      return { route, job };
    } catch (error) {
      const reason = error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 220) : "Unknown video model error";
      failures.push(model + ": " + reason);
      if (!autoSelect) throw error;
    }
  }

  throw new Error("All selected video models failed. " + failures.join(" | "));
}

export async function getVideoJob(jobId: string) {
  return openRouterJson<VideoJob>("/videos/" + encodeURIComponent(jobId));
}

export function getVideoContentUrl(jobId: string, index = 0) {
  return BASE_URL + "/videos/" + encodeURIComponent(jobId) + "/content?index=" + index;
}

export async function getAIModelCatalog(): Promise<{ text: AIModelOption[]; vision: AIModelOption[] }> {
  const models = await listTextModels();

  const toOption = (model: OpenRouterModel, modality: "text" | "vision"): AIModelOption | null => {
    if (!model.id) return null;
    const prompt = Number(model.pricing?.prompt ?? 0);
    const completion = Number(model.pricing?.completion ?? 0);
    return {
      id: model.id,
      name: model.name || labelForModel(model.id),
      modality,
      isFree: prompt === 0 && completion === 0,
      promptPricePerMillion: Number((prompt * 1_000_000).toFixed(4)),
      completionPricePerMillion: Number((completion * 1_000_000).toFixed(4)),
    };
  };

  const textModels: AIModelOption[] = [];
  const visionModels: AIModelOption[] = [];

  for (const model of models) {
    const inputs = model.architecture?.input_modalities ?? [];
    const outputs = model.architecture?.output_modalities ?? [];
    if (!model.id || !isChatCompatibleModel(model) || !outputs.includes("text")) continue;

    const textOption = toOption(model, "text");
    if (textOption) textModels.push(textOption);

    if (inputs.includes("image")) {
      const visionOption = toOption(model, "vision");
      if (visionOption) visionModels.push(visionOption);
    }
  }

  const sortModels = (list: AIModelOption[]) =>
    list
      .sort((a, b) => Number(b.isFree) - Number(a.isFree) || a.name.localeCompare(b.name))
      .slice(0, 100);

  return { text: sortModels(textModels), vision: sortModels(visionModels) };
}

export async function getAIRouteCatalog() {
  const routes = await Promise.all([resolveAIRoute("chat"), resolveAIRoute("vision"), resolveAIRoute("image_generation"), resolveAIRoute("video_generation")]);
  return routes.reduce<Record<string, AIRoute>>((acc, route) => { acc[route.modality] = route; return acc; }, {});
}