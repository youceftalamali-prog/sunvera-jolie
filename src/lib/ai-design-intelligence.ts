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
    .replace(/^\s*\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`\s*$/i, "")
    .trim();
}

export function parseDesignBlueprint(raw: string): DesignBlueprint | null {
  try {
    const parsed = JSON.parse(stripCodeFences(raw)) as DesignBlueprint;
    if (!parsed || parsed.version !== "1.0" || !Array.isArray(parsed.sections)) return null;
    return parsed;
  } catch {
    return null;
  }
}
