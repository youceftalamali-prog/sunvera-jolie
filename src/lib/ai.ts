import { getSettingsMap } from "@/lib/settings";

export async function llm(
  system: string,
  user: string,
  options: {
    jsonMode?: boolean;
    jsonSchema?: {
      name: string;
      schema: Record<string, unknown>;
      strict?: boolean;
    };
  } = {},
): Promise<string | null> {
  const settings = await getSettingsMap();
  const provider = String(process.env.AI_PROVIDER ?? settings.ai.provider ?? "openrouter").toLowerCase();
  const configuredModel = String(process.env.AI_MODEL ?? settings.ai.model ?? "");
  const model =
    provider === "openrouter"
      ? (configuredModel.includes("/") ? configuredModel : "openrouter/free")
      : configuredModel || "gpt-4o-mini";

  const isOpenRouter = provider === "openrouter";
  const key = isOpenRouter ? process.env.OPENROUTER_API_KEY : process.env.OPENAI_API_KEY;
  if (!key) return null;

  const endpoint = isOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    };
    if (isOpenRouter) {
      headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sunverajolie.com";
      headers["X-Title"] = "SunVera Jolie";
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        temperature: 0.6,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(options.jsonSchema
          ? {
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: options.jsonSchema.name,
                  strict: options.jsonSchema.strict ?? true,
                  schema: options.jsonSchema.schema,
                },
              },
            }
          : options.jsonMode
            ? { response_format: { type: "json_object" } }
            : {}),
      }),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return d.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

type Rankable = {
  id: number;
  name: string;
  categorySlug: string;
  productType: string;
  tags: string;
  skinType: string;
  hairType: string;
  shortDescription: string;
  price: number;
  rating: number;
  bestSeller: boolean;
};

const CONCEPTS: Record<string, string[]> = {
  dry: ["hyaluronic", "ceramide", "moistur", "butter", "hydra"],
  oily: ["niacinamide", "gel", "clay", "oil free", "pores"],
  sensitive: ["ceramide", "gentle", "soothing", "fragrance"],
  dull: ["vitamin c", "bright", "glow", "mask"],
  acne: ["niacinamide", "clay", "cleanser", "oil free"],
  aging: ["peptide", "vitamin c", "spf", "eye"],
  frizz: ["argan", "oil", "mask", "leave-in"],
  damaged: ["keratin", "mask", "repair", "oil"],
  routine: ["cleanser", "toner", "serum", "moistur", "spf"],
};

export function rankProducts(query: string, items: Rankable[]) {
  const q = query.toLowerCase();
  const terms = q.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const concepts = Object.entries(CONCEPTS)
    .filter(([k]) => q.includes(k))
    .flatMap(([, v]) => v);
  const budget = q.match(/(?:under|less than|moins de|أقل من)\s*(\d+)/);

  return items
    .map((p) => {
      const hay = `${p.name} ${p.tags} ${p.productType} ${p.skinType} ${p.hairType} ${p.shortDescription} ${p.categorySlug}`.toLowerCase();
      let score = p.rating / 2 + (p.bestSeller ? 1 : 0);
      for (const t of terms) if (hay.includes(t)) score += p.name.toLowerCase().includes(t) ? 4 : 1.5;
      for (const c of concepts) if (hay.includes(c)) score += 3;
      if (budget && p.price <= Number(budget[1])) score += 2;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}
