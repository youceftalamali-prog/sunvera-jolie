import { generateText } from "@/lib/ai-gateway";
eexport async function llm(
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
  try {
    const effectiveSystem =
      options.jsonMode && !/json/i.test(system)
        ? system + "\nReturn the response as valid JSON."
        : system;

    const generated = await generateText(
      "chat",
      [
        { role: "system", content: effectiveSystem },
        { role: "user", content: user },
      ],
      {
        temperature: 0.6,
        jsonSchema: options.jsonSchema,
        autoSelectModel: true,
      },
    );
    return generated.text?.trim() || null;
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
