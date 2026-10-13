import { directGenerateText, directAnalyzeImage, directModelCatalog, directRouteCatalog } from "@/lib/ai-direct-providers";

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

function labelForModel(model: string) {
  const slug = model.split("/").pop() || model;
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export async function resolveAIRoute(
  task: AITask,
  modelOverride?: string,
  _options: { autoSelect?: boolean; structuredRequired?: boolean } = {},
): Promise<AIRoute> {
  if (task === "image_generation" || task === "video_generation") {
    const modality = task === "image_generation" ? "image" : "video";
    return {
      task,
      modality,
      model: "disabled",
      label: "Disabled · no approved media provider",
      source: "auto",
    };
  }
  if (modelOverride && modelOverride.startsWith("xkiro:")) {
    return {
      task,
      modality: task === "vision" ? "vision" : "text",
      model: modelOverride,
      label: "Configured · " + modelOverride,
      source: "configured",
    };
  }
  const routes = directRouteCatalog();
  return task === "vision" ? routes.vision : routes.text;
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
  return directGenerateText(task, messages, options);
}

export async function analyzeImage(prompt: string, imageUrl: string) {
  return directAnalyzeImage(prompt, imageUrl);
}

export async function generateImage(
  _prompt: string,
  _options: {
    aspectRatio?: string;
    resolution?: string;
    n?: number;
    inputReferences?: string[];
    autoSelectModel?: boolean;
    modelOverride?: string;
  } = {},
): Promise<{ route: AIRoute; images: Array<{ b64_json?: string; url?: string; mime_type?: string; content_type?: string }> }> {
  throw new Error("AI image generation is disabled because no approved image provider is configured. Upload an image instead.");
}

export async function createVideoJob(
  _prompt: string,
  _options: {
    duration?: number;
    resolution?: string;
    aspectRatio?: string;
    generateAudio?: boolean;
    imageUrl?: string;
    autoSelectModel?: boolean;
    modelOverride?: string;
  } = {},
) {
  throw new Error("AI video generation is disabled because no approved video provider is configured. Existing video files and the media gallery remain available.");
}

export async function getVideoJob(_jobId: string): Promise<VideoJob> {
  throw new Error("Video-job lookup is disabled because the previous provider was removed. Existing videos stored in the media library remain available.");
}

export function getVideoContentUrl(_jobId: string, _index = 0): string {
  throw new Error("Video-content URL lookup is disabled because the previous provider was removed. Use stored media URLs for existing videos.");
}

export async function getAIModelCatalog() {
  return directModelCatalog();
}

export async function getAIRouteCatalog() {
  return directRouteCatalog();
}
