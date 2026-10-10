import type { TextMessage } from "@/lib/ai-gateway";

export type DesignBlueprint = {
  version: "1.0";
  pageType: string;
  designDirection: string;
  brandExpression: string[];
  colorPalette: Array<{
    hex: string;
    name: string;
    role: string;
  }>;
  typography: {
    headingStyle: string;
    bodyStyle: string;
    alignment: string;
    hierarchy: string;
  };
  layout: {
    container: string;
    grid: string;
    spacing: string;
    radius: string;
    shadows: string;
    visualHierarchy: string;
  };
  header: {
    structure: string;
    navigation: string;
    utilities: string;
    announcementBar: string;
  };
  hero: {
    structure: string;
    imageRole: string;
    contentAlignment: string;
    ctas: string[];
    overlay: string;
  };
  sections: Array<{
    order: number;
    sectionType: string;
    purpose: string;
    contentPattern: string;
    mediaRole: string;
    emphasis: string;
  }>;
  components: string[];
  responsive: {
    mobile: string;
    tablet: string;
    desktop: string;
  };
  ecommercePatterns: string[];
  implementationNotes: string[];
  confidence: string;
};

export const designBlueprintSchema = {
  name: "sunvera_design_blueprint",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      version: { type: "string", enum: ["1.0"] },
      pageType: { type: "string" },
      designDirection: { type: "string" },
      brandExpression: {
        type: "array",
        maxItems: 12,
        items: { type: "string" },
      },
      colorPalette: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            hex: { type: "string" },
            name: { type: "string" },
            role: { type: "string" },
          },
          required: ["hex", "name", "role"],
        },
      },
      typography: {
        type: "object",
        additionalProperties: false,
        properties: {
          headingStyle: { type: "string" },
          bodyStyle: { type: "string" },
          alignment: { type: "string" },
          hierarchy: { type: "string" },
        },
        required: ["headingStyle", "bodyStyle", "alignment", "hierarchy"],
      },
      layout: {
        type: "object",
        additionalProperties: false,
        properties: {
          container: { type: "string" },
          grid: { type: "string" },
          spacing: { type: "string" },
          radius: { type: "string" },
          shadows: { type: "string" },
          visualHierarchy: { type: "string" },
        },
        required: ["container", "grid", "spacing", "radius", "shadows", "visualHierarchy"],
      },
      header: {
        type: "object",
        additionalProperties: false,
        properties: {
          structure: { type: "string" },
          navigation: { type: "string" },
          utilities: { type: "string" },
          announcementBar: { type: "string" },
        },
        required: ["structure", "navigation", "utilities", "announcementBar"],
      },
      hero: {
        type: "object",
        additionalProperties: false,
        properties: {
          structure: { type: "string" },
          imageRole: { type: "string" },
          contentAlignment: { type: "string" },
          ctas: {
            type: "array",
            maxItems: 6,
            items: { type: "string" },
          },
          overlay: { type: "string" },
        },
        required: ["structure", "imageRole", "contentAlignment", "ctas", "overlay"],
      },
      sections: {
        type: "array",
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            order: { type: "integer" },
            sectionType: { type: "string" },
            purpose: { type: "string" },
            contentPattern: { type: "string" },
            mediaRole: { type: "string" },
            emphasis: { type: "string" },
          },
          required: ["order", "sectionType", "purpose", "contentPattern", "mediaRole", "emphasis"],
        },
      },
      components: {
        type: "array",
        maxItems: 24,
        items: { type: "string" },
      },
      responsive: {
        type: "object",
        additionalProperties: false,
        properties: {
          mobile: { type: "string" },
          tablet: { type: "string" },
          desktop: { type: "string" },
        },
        required: ["mobile", "tablet", "desktop"],
      },
      ecommercePatterns: {
        type: "array",
        maxItems: 16,
        items: { type: "string" },
      },
      implementationNotes: {
        type: "array",
        maxItems: 20,
        items: { type: "string" },
      },
      confidence: { type: "string" },
    },
    required: [
      "version",
      "pageType",
      "designDirection",
      "brandExpression",
      "colorPalette",
      "typography",
      "layout",
      "header",
      "hero",
      "sections",
      "components",
      "responsive",
      "ecommercePatterns",
      "implementationNotes",
      "confidence",
    ],
  },
} as const;

export function isHomepageDesignReference(instruction: string, hasImages: boolean) {
  if (!hasImages) return false;
  const text = String(instruction ?? "").toLowerCase();
  const homepageTerms =
    /(?:homepage|home page|landing page|صفحة رئيسية|الصفحة الرئيسية|واجهة الموقع|الرئيسية)/i.test(text);
  const designTerms =
    /(?:design|design it|redesign|style|layout|reference|مثل الصورة|مثل هذا|التصميم|تصميم|ستايل|واجهة|شكل|ألوان|خطوط)/i.test(
      text,
    );
  return homepageTerms || designTerms;
}

export function buildDesignVisionSystemPrompt() {
  return [
    "You are the SunVera Jolie Design Intelligence Agent.",
    "Analyze the supplied reference image as a visual design system, not as a product photo.",
    "Identify only visible evidence and make conservative inferences when an exact value cannot be known.",
    "Return one valid JSON object matching the supplied Design Blueprint schema.",
    "Describe layout, hierarchy, color roles, typography, spacing, components, section order, ecommerce patterns, and responsive intent.",
    "When exact font family, pixel dimensions, or hex values are not provable, describe the visual characteristic instead of inventing a specific value.",
    "For section order, use the visible top-to-bottom composition of the reference.",
    "Treat the result as implementation guidance for an existing SunVera Jolie CMS.",
    "Do not invent CMS section IDs, product IDs, media IDs, URLs, prices, or database values.",
  ].join("\n");
}

export function buildDesignVisionUserMessage(instruction: string, attachments: Array<{ url: string; filename: string; alt: string }>) {
  const content: TextMessage["content"] = [
    {
      type: "text",
      text:
        [
          "Owner request:",
          instruction || "Recreate the visual design language of this reference for the SunVera Jolie homepage.",
          "",
          "Produce a Design Blueprint that captures the reference image's visible structure and visual rules.",
        ].join("\n"),
    },
    ...attachments.map((attachment) => ({
      type: "image_url" as const,
      image_url: { url: attachment.url },
    })),
  ];

  return content;
}

function stripCodeFences(raw: string) {
  return String(raw ?? "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function jsonCandidates(raw: string) {
  const cleaned = stripCodeFences(raw);
  const candidates = [cleaned];
  const firstObject = cleaned.indexOf("{");
  const lastObject = cleaned.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    candidates.push(cleaned.slice(firstObject, lastObject + 1));
  }
  return [...new Set(candidates)];
}

export function parseDesignBlueprint(raw: string): DesignBlueprint | null {
  for (const candidate of jsonCandidates(raw)) {
    try {
      const parsed = JSON.parse(candidate) as DesignBlueprint;
      if (
        parsed &&
        parsed.version === "1.0" &&
        typeof parsed.pageType === "string" &&
        Array.isArray(parsed.sections)
      ) {
        return parsed;
      }
    } catch {
      // Try the next extraction strategy.
    }
  }
  return null;
}

export type DesignSectionHint = {
  key?: string;
  title?: string | null;
  sortOrder?: number | null;
};

export function buildFallbackDesignBlueprint(
  instruction: string,
  sectionHints: DesignSectionHint[] = [],
): DesignBlueprint {
  const sections = sectionHints
    .slice()
    .sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0))
    .map((section, index) => ({
      order: index + 1,
      sectionType: String(section.key || "section"),
      purpose: String(section.title || "Existing homepage section"),
      contentPattern: "Preserve existing CMS content and improve visual hierarchy to match the owner request.",
      mediaRole: "Use existing section media when available; do not invent media identifiers.",
      emphasis: index === 0 ? "primary" : "supporting",
    }));

  if (!sections.length) {
    sections.push({
      order: 1,
      sectionType: "homepage",
      purpose: "Premium beauty ecommerce homepage",
      contentPattern: "Clear luxury hierarchy with focused messaging and product discovery.",
      mediaRole: "Use existing CMS media where available.",
      emphasis: "primary",
    });
  }

  return {
    version: "1.0",
    pageType: "homepage",
    designDirection: "Premium luxury beauty ecommerce with elegant, refined, spacious visual hierarchy.",
    brandExpression: ["luxury", "elegant", "feminine", "premium beauty", "clean", "timeless"],
    colorPalette: [
      { hex: "#B88945", name: "Champagne Gold", role: "accent" },
      { hex: "#FFFDF9", name: "Ivory", role: "background" },
      { hex: "#F8EFE7", name: "Warm Beige", role: "surface" },
      { hex: "#1F2B34", name: "Deep Charcoal", role: "text" },
    ],
    typography: {
      headingStyle: "Elegant refined luxury heading style.",
      bodyStyle: "Clean, readable modern sans-serif.",
      alignment: "Respect the existing RTL/locale alignment.",
      hierarchy: "Strong hero hierarchy followed by concise section headings and clear product information.",
    },
    layout: {
      container: "Wide centered ecommerce container with generous outer margins.",
      grid: "Responsive product/category grid using existing CMS components.",
      spacing: "Generous vertical rhythm and white space between major sections.",
      radius: "Soft rounded corners on cards, controls, and media containers.",
      shadows: "Subtle, low-contrast shadows only where useful for elevation.",
      visualHierarchy: "Hero first, trust, discovery, products, supporting content, conversion, footer.",
    },
    header: {
      structure: "Premium storefront header using the existing header architecture.",
      navigation: "Keep existing navigation items and hierarchy.",
      utilities: "Search, account, wishlist, and cart remain visible through existing components.",
      announcementBar: "Keep existing announcement bar when present; use a refined luxury treatment.",
    },
    hero: {
      structure: "Full-width premium hero with strong headline, supporting copy, and clear CTA.",
      imageRole: "Hero imagery should carry the visual identity without obscuring text.",
      contentAlignment: "Use the appropriate side of the composition while respecting RTL and focal points.",
      ctas: ["Shop Collection", "Discover More"],
      overlay: "Light, restrained overlay only when needed for readability.",
    },
    sections,
    components: ["premium header", "hero", "trust badges", "category cards", "product rails", "promotional banner", "testimonials", "newsletter", "footer"],
    responsive: {
      mobile: "Use stacked content, touch-friendly controls, and no horizontal overflow.",
      tablet: "Reduce spacing and grid density while preserving hierarchy.",
      desktop: "Use generous spacing, wide composition, and clear visual hierarchy.",
    },
    ecommercePatterns: ["clear primary CTA", "product discovery rails", "wishlist", "cart", "trust signals", "responsive product cards"],
    implementationNotes: [
      "This blueprint is a safe fallback when structured Design Vision output is unavailable.",
      "Use the raw visual analysis and owner request as additional guidance.",
      "Prefer existing CMS sections, media, and components over creating new records.",
      "Do not invent IDs, URLs, prices, or database values.",
      "Owner request: " + String(instruction || "Use the supplied reference image as visual guidance.").slice(0, 1200),
    ],
    confidence: "fallback-safe",
  };
}
