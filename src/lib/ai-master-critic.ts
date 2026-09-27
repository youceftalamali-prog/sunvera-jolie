export type MasterCriticIssue = {
  severity: "low" | "medium" | "high";
  area: "intent" | "homepage" | "cms" | "data" | "execution" | "design";
  message: string;
  evidence: string;
};

export type MasterCriticResult = {
  status: "pass" | "needs_repair" | "blocked";
  confidence: number;
  summary: string;
  issues: MasterCriticIssue[];
  repairInstructions: string;
};

export const masterCriticSchema = {
  name: "sunvera_master_critic",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["pass", "needs_repair", "blocked"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      summary: { type: "string" },
      issues: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            severity: { type: "string", enum: ["low", "medium", "high"] },
            area: { type: "string", enum: ["intent", "homepage", "cms", "data", "execution", "design"] },
            message: { type: "string" },
            evidence: { type: "string" },
          },
          required: ["severity", "area", "message", "evidence"],
        },
      },
      repairInstructions: { type: "string" },
    },
    required: ["status", "confidence", "summary", "issues", "repairInstructions"],
  },
} as const;

function stripCodeFences(raw: string) {
  return String(raw ?? "")
    .replace(/^\s*\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`\s*$/i, "")
    .trim();
}

export function parseMasterCritic(raw: string): MasterCriticResult | null {
  try {
    const value = JSON.parse(stripCodeFences(raw)) as MasterCriticResult;
    if (!value || !["pass", "needs_repair", "blocked"].includes(value.status)) return null;
    if (!Array.isArray(value.issues) || typeof value.summary !== "string") return null;
    return {
      status: value.status,
      confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
      summary: value.summary,
      issues: value.issues.slice(0, 12),
      repairInstructions: value.repairInstructions || "",
    };
  } catch {
    return null;
  }
}

export function buildMasterCriticSystemPrompt() {
  return [
    "You are the SunVera Jolie Master AI Critic and Quality Assurance Agent.",
    "Review the result of a Master AI administrative task after execution.",
    "Compare the owner's intent, the original plan, execution results, current post-execution CMS state, the deterministic Live Result Verification report, and any Design Blueprint.",
    "Judge whether the requested task was actually completed safely and consistently.",
    "For homepage design tasks, evaluate the CMS state and Live Result Verification against the Design Blueprint: section order, enabled state, supported content fields, layout/styling intent, and use of existing records.",
    "Treat deterministic Live Result Verification failures as concrete evidence. Do not mark a task passed when the live verification reports missing sections, wrong order, or saved content that is absent from the served HTML.",
    "Do not claim pixel-perfect or browser-rendered visual fidelity because you are not given a live screenshot of the rendered page.",
    "Do not invent missing database values, IDs, media, URLs, or facts.",
    "Use 'needs_repair' only when a concrete safe repair can improve alignment with the owner's request.",
    "Use 'blocked' when completion requires protected actions, unavailable capabilities, missing data, or a browser-rendered visual verification that cannot be performed.",
    "Return ONLY one JSON object matching the Master Critic schema.",
  ].join("\n");
}

export function buildMasterCriticUserMessage(input: {
  ownerRequest: string;
  designBlueprint: unknown;
  liveVerification: unknown;
  plan: unknown;
  execution: unknown;
  currentAdminContext: unknown;
}) {
  return JSON.stringify(input);
}

export function buildMasterRepairSystemPrompt() {
  return [
    "You are the SunVera Jolie Master AI repair planner.",
    "Create a minimal repair plan that addresses only the concrete issues identified by the Critic.",
    "Preserve the owner's original intent.",
    "Use only supported Master AI operations and identifiers present in currentAdminContext.",
    "For homepage design repairs, use existing homepage.update_section and homepage.reorder operations.",
    "Do not invent section IDs, product IDs, media IDs, URLs, prices, or database values.",
    "Do not perform destructive, shipping, order, customer, security, checkout, or AI-configuration actions as a repair.",
    "Return ONLY one JSON object matching the Master AI plan schema.",
  ].join("\n");
}
