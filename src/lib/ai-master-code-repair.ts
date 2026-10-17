/**
 * Master AI code-level repair scaffold.
 *
 * Distinguishes CMS/DB fixes (handled by existing Master AI operations) from
 * frontend/source-code fixes that require an isolated branch + PR workflow.
 *
 * This module does NOT push to production or modify live customer data.
 * It only classifies issues, proposes file-scoped patches, and produces a
 * repair plan that an operator or CI can apply on an isolated branch.
 */

export type CodeRepairClassification =
  | "cms_or_db"
  | "frontend_code"
  | "backend_code"
  | "mixed"
  | "unknown";

export type CodeRepairFilePatch = {
  path: string;
  reason: string;
  /** Unified diff or full replacement content for a small, scoped change. */
  proposedContent?: string;
  /** Line-oriented search/replace pairs when a full rewrite is unnecessary. */
  replacements?: Array<{ oldText: string; newText: string }>;
};

export type CodeRepairPlan = {
  classification: CodeRepairClassification;
  summary: string;
  evidence: string[];
  /** When classification is cms_or_db, prefer these Master AI operations. */
  preferredOperations: string[];
  /** When classification involves code, these files are candidates. */
  filePatches: CodeRepairFilePatch[];
  /** Suggested isolated branch name (never applied automatically in production). */
  suggestedBranch: string;
  /** Contract / unit tests that should pass after the repair. */
  requiredTests: string[];
  /** True only when the change is limited to CMS/DB and existing ops suffice. */
  canFixWithExistingOperations: boolean;
};

const CMS_DB_HINTS = [
  /homepage\.|section|sortOrder|cms\.|badge|banner|nav|product.*price|stock|publish|draft|attach_media|update_content|update_financial/i,
  /قاعدة البيانات|قسم|ترتيب الأقسام|سعر|مخزون|منتج|صورة مرتبطة/i,
];

const FRONTEND_HINTS = [
  /component|tsx|jsx|css|tailwind|render|layout|rtl|scroll|carousel|footer|hero|typography|className/i,
  /مكون|واجهة|عرض|تخطيط|تنسيق|ستايل|أسلوب/i,
];

const BACKEND_HINTS = [
  /api\/|route\.ts|drizzle|schema|verifier|executor|transaction|sql|auth|rate.?limit/i,
  /مسار api|مخطط|تحقق|منفذ/i,
];

const KNOWN_FRONTEND_PATHS = [
  "src/app/page.tsx",
  "src/components/TestimonialCarousel.tsx",
  "src/components/Footer.tsx",
  "src/components/LuxuryProductRail.tsx",
  "src/components/EditorialProductCard.tsx",
  "src/components/HeroCarousel.tsx",
  "src/components/StoreProvider.tsx",
];

const KNOWN_BACKEND_PATHS = [
  "src/lib/ai-master-tools.ts",
  "src/lib/ai-master-verifier.ts",
  "src/lib/ai-master-critic.ts",
  "src/lib/product-write.ts",
  "src/lib/master-product-write.ts",
  "src/lib/cms.ts",
  "netlify/functions/_lib/master-ai-runner.ts",
];

/**
 * Classify whether a reported issue can be fixed with CMS/DB operations
 * or requires source-code changes on an isolated branch.
 */
export function classifyRepairNeed(input: {
  errorMessage?: string;
  criticIssues?: Array<{ area: string; message: string; evidence: string }>;
  failedChecks?: Array<{ operation: string; evidence: string }>;
  intent?: string;
}): CodeRepairClassification {
  const corpus = [
    input.errorMessage ?? "",
    input.intent ?? "",
    ...(input.criticIssues ?? []).flatMap((i) => [i.area, i.message, i.evidence]),
    ...(input.failedChecks ?? []).flatMap((c) => [c.operation, c.evidence]),
  ]
    .join("\n")
    .toLowerCase();

  const cms = CMS_DB_HINTS.some((re) => re.test(corpus));
  const frontend = FRONTEND_HINTS.some((re) => re.test(corpus));
  const backend = BACKEND_HINTS.some((re) => re.test(corpus));

  // Deterministic verification failures on product/homepage ops are CMS/DB.
  const hasDeterministicOpFailure = (input.failedChecks ?? []).some((c) =>
    /products\.|homepage\.|cms\./.test(c.operation),
  );
  if (hasDeterministicOpFailure && !frontend && !backend) return "cms_or_db";
  if (cms && !frontend && !backend) return "cms_or_db";
  if (frontend && backend) return "mixed";
  if (frontend) return "frontend_code";
  if (backend) return "backend_code";
  if (cms) return "cms_or_db";
  return "unknown";
}

/**
 * Build a repair plan. Does not apply changes; returns a structured plan only.
 */
export function buildCodeRepairPlan(input: {
  errorMessage?: string;
  criticIssues?: Array<{ area: string; message: string; evidence: string }>;
  failedChecks?: Array<{ operation: string; evidence: string }>;
  intent?: string;
  /** Optional file contents already loaded by the caller for context. */
  fileSnapshots?: Record<string, string>;
}): CodeRepairPlan {
  const classification = classifyRepairNeed(input);
  const evidence: string[] = [];
  if (input.errorMessage) evidence.push(`error: ${input.errorMessage.slice(0, 240)}`);
  for (const issue of input.criticIssues ?? []) {
    evidence.push(`${issue.area}: ${issue.message}`);
  }
  for (const check of input.failedChecks ?? []) {
    evidence.push(`${check.operation}: ${check.evidence}`);
  }

  const preferredOperations: string[] = [];
  const filePatches: CodeRepairFilePatch[] = [];

  if (classification === "cms_or_db") {
    const ops = new Set<string>();
    for (const check of input.failedChecks ?? []) {
      if (check.operation.startsWith("products.")) ops.add(check.operation.replace(/\.verify$/, ""));
      if (check.operation.startsWith("homepage.")) ops.add(check.operation.replace(/\.verify$/, ""));
    }
    preferredOperations.push(...ops);
    if (!preferredOperations.length) {
      preferredOperations.push("homepage.update_section", "products.update_content");
    }
  }

  if (classification === "frontend_code" || classification === "mixed") {
    for (const path of KNOWN_FRONTEND_PATHS) {
      if (corpusMentionsPath(input, path) || (input.fileSnapshots && path in input.fileSnapshots)) {
        filePatches.push({
          path,
          reason: "Frontend rendering or trust-signal issue identified by critic/verifier.",
        });
      }
    }
    if (!filePatches.length) {
      filePatches.push({
        path: "src/app/page.tsx",
        reason: "Default homepage storefront surface when classification is frontend_code.",
      });
    }
  }

  if (classification === "backend_code" || classification === "mixed") {
    for (const path of KNOWN_BACKEND_PATHS) {
      if (corpusMentionsPath(input, path) || (input.fileSnapshots && path in input.fileSnapshots)) {
        filePatches.push({
          path,
          reason: "Backend/executor/verifier issue identified by critic or failed check.",
        });
      }
    }
    if (!filePatches.some((p) => p.path.includes("ai-master"))) {
      filePatches.push({
        path: "src/lib/ai-master-verifier.ts",
        reason: "Default verification surface when classification is backend_code.",
      });
    }
  }

  const slug = classification.replace(/_/g, "-");
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  return {
    classification,
    summary:
      classification === "cms_or_db"
        ? "Issue can be addressed with existing Master AI CMS/DB operations; no source-code change required."
        : classification === "unknown"
          ? "Unable to classify; require human review before any code change."
          : `Issue requires isolated branch code repair (${classification}). Do not apply on production branch.`,
    evidence,
    preferredOperations,
    filePatches,
    suggestedBranch: `fix/master-ai-code-repair-${slug}-${stamp}`,
    requiredTests: [
      "scripts/test-p2-master-ai-contract.mjs",
      "scripts/test-p2-master-ai-normalization.mjs",
    ],
    canFixWithExistingOperations: classification === "cms_or_db",
  };
}

function corpusMentionsPath(
  input: {
    errorMessage?: string;
    criticIssues?: Array<{ area: string; message: string; evidence: string }>;
    failedChecks?: Array<{ operation: string; evidence: string }>;
    intent?: string;
  },
  path: string,
): boolean {
  const base = path.split("/").pop() ?? path;
  const corpus = [
    input.errorMessage ?? "",
    input.intent ?? "",
    ...(input.criticIssues ?? []).flatMap((i) => [i.message, i.evidence]),
    ...(input.failedChecks ?? []).map((c) => c.evidence),
  ]
    .join("\n")
    .toLowerCase();
  return corpus.includes(path.toLowerCase()) || corpus.includes(base.toLowerCase());
}

/**
 * Apply in-memory replacements to a file snapshot (pure function for tests).
 * Returns null when no replacement matched — callers must treat that as failure.
 */
export function applyReplacementsToSnapshot(
  content: string,
  replacements: Array<{ oldText: string; newText: string }>,
): { next: string; applied: number } | null {
  let next = content;
  let applied = 0;
  for (const { oldText, newText } of replacements) {
    if (!oldText || !next.includes(oldText)) continue;
    next = next.split(oldText).join(newText);
    applied += 1;
  }
  if (applied === 0) return null;
  return { next, applied };
}

/**
 * Decide whether the Master AI should attempt a CMS/DB repair loop or escalate
 * to a code-repair plan for human/CI application on an isolated branch.
 */
export function decideRepairStrategy(plan: CodeRepairPlan): "execute_master_ops" | "prepare_code_pr" | "blocked" {
  if (plan.classification === "cms_or_db" && plan.canFixWithExistingOperations) {
    return "execute_master_ops";
  }
  if (
    plan.classification === "frontend_code" ||
    plan.classification === "backend_code" ||
    plan.classification === "mixed"
  ) {
    return "prepare_code_pr";
  }
  return "blocked";
}
