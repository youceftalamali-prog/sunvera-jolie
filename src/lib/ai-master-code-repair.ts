/**
 * Master AI code-level repair: classify, validate against live file context,
 * apply only on an isolated branch, run required checks, open a PR (never merge).
 *
 * Hard rules:
 * - Never write to production / release / main / master branches.
 * - Never apply a replacement unless oldText appears in the fetched file snapshot.
 * - Never auto-merge PRs.
 * - GitHub mutations require an injected port (token available only in operator/CI).
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
  proposedContent?: string;
  replacements?: Array<{ oldText: string; newText: string }>;
};

export type CodeRepairPlan = {
  classification: CodeRepairClassification;
  summary: string;
  evidence: string[];
  preferredOperations: string[];
  filePatches: CodeRepairFilePatch[];
  suggestedBranch: string;
  requiredTests: string[];
  canFixWithExistingOperations: boolean;
};

/** GitHub operations used by the isolated repair executor (injectable for tests). */
export type CodeRepairGitPort = {
  getDefaultBranch?(): Promise<string>;
  getFileContent(path: string, ref: string): Promise<{ content: string; sha: string } | null>;
  createBranch(branch: string, fromRef: string): Promise<{ ref: string; sha: string }>;
  updateFile(input: {
    path: string;
    content: string;
    message: string;
    branch: string;
    sha: string;
  }): Promise<{ commitSha: string }>;
  createPullRequest(input: {
    title: string;
    body: string;
    head: string;
    base: string;
    draft?: boolean;
  }): Promise<{ number: number; htmlUrl: string; merged: boolean }>;
  getPullRequest?(number: number): Promise<{ state: string; merged: boolean; htmlUrl: string }>;
  listCheckRuns?(ref: string): Promise<Array<{ name: string; status: string; conclusion: string | null }>>;
};

export type IsolatedRepairAttempt = {
  attempt: number;
  stage:
    | "guard"
    | "read_context"
    | "validate_patch"
    | "create_branch"
    | "apply_patch"
    | "verify_diff"
    | "create_pr"
    | "poll_ci"
    | "done"
    | "failed";
  ok: boolean;
  message: string;
  evidence?: string;
};

export type IsolatedRepairResult = {
  status: "pr_opened" | "blocked" | "failed" | "needs_retry";
  branch?: string;
  baseBranch: string;
  prNumber?: number;
  prUrl?: string;
  commitSha?: string;
  attempts: IsolatedRepairAttempt[];
  summary: string;
  /** Always false — executor never merges. */
  merged: false;
};

const PROTECTED_BRANCH_PATTERNS = [
  /^main$/i,
  /^master$/i,
  /^release(\/|$)/i,
  /^production$/i,
  /^prod$/i,
  /^deploy\//i,
];

const MAX_REPAIR_ATTEMPTS = 3;

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
  "src/lib/ai-master-code-repair.ts",
  "src/lib/product-write.ts",
  "src/lib/master-product-write.ts",
  "src/lib/cms.ts",
  "netlify/functions/_lib/master-ai-runner.ts",
];

export function isProtectedBranch(branch: string): boolean {
  const name = String(branch ?? "").replace(/^refs\/heads\//, "").trim();
  if (!name) return true;
  return PROTECTED_BRANCH_PATTERNS.some((re) => re.test(name));
}

export function assertSafeRepairBranch(branch: string): void {
  if (isProtectedBranch(branch)) {
    throw new Error(
      `Refusing to write to protected branch "${branch}". Code repairs must use an isolated fix/* branch.`,
    );
  }
  if (!/^fix\//i.test(branch) && !/^chore\//i.test(branch) && !/^feat\//i.test(branch)) {
    throw new Error(
      `Repair branch must start with fix/, chore/, or feat/. Got: "${branch}".`,
    );
  }
}

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

export function buildCodeRepairPlan(input: {
  errorMessage?: string;
  criticIssues?: Array<{ area: string; message: string; evidence: string }>;
  failedChecks?: Array<{ operation: string; evidence: string }>;
  intent?: string;
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
      "scripts/test-p2-master-ai-code-repair.mjs",
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
 * Apply in-memory replacements. Returns null when no replacement matched.
 */
export function applyReplacementsToSnapshot(
  content: string,
  replacements: Array<{ oldText: string; newText: string }>,
): { next: string; applied: number } | null {
  let next = content;
  let applied = 0;
  for (const { oldText, newText } of replacements) {
    if (!oldText || !next.includes(oldText)) continue;
    // Replace only the first occurrence per pair to avoid accidental mass edits.
    next = next.replace(oldText, newText);
    applied += 1;
  }
  if (applied === 0) return null;
  return { next, applied };
}

/**
 * Validate that every replacement's oldText exists in the live snapshot
 * and that the resulting file is different from the original.
 */
export function validatePatchAgainstSnapshot(
  content: string,
  patch: CodeRepairFilePatch,
): { ok: true; next: string; applied: number } | { ok: false; reason: string } {
  if (patch.proposedContent !== undefined) {
    if (patch.proposedContent === content) {
      return { ok: false, reason: "proposedContent is identical to the current file." };
    }
    if (!patch.proposedContent.trim()) {
      return { ok: false, reason: "proposedContent is empty." };
    }
    return { ok: true, next: patch.proposedContent, applied: 1 };
  }
  if (!patch.replacements?.length) {
    return { ok: false, reason: "Patch has neither replacements nor proposedContent." };
  }
  for (const pair of patch.replacements) {
    if (!pair.oldText || !content.includes(pair.oldText)) {
      return {
        ok: false,
        reason: `oldText not found in live file context for ${patch.path}: ${pair.oldText.slice(0, 80)}`,
      };
    }
  }
  const applied = applyReplacementsToSnapshot(content, patch.replacements);
  if (!applied) {
    return { ok: false, reason: `No replacements applied for ${patch.path}.` };
  }
  if (applied.next === content) {
    return { ok: false, reason: `Replacements produced no net change for ${patch.path}.` };
  }
  return { ok: true, next: applied.next, applied: applied.applied };
}

export function decideRepairStrategy(
  plan: CodeRepairPlan,
): "execute_master_ops" | "prepare_code_pr" | "blocked" {
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

export function getMaxRepairAttempts(): number {
  return MAX_REPAIR_ATTEMPTS;
}

/**
 * Full isolated repair cycle:
 * 1) Guard target branch (never production)
 * 2) Read each target file from base ref
 * 3) Validate patch against live context
 * 4) Create isolated branch from base
 * 5) Apply validated patches
 * 6) Open PR against base (never merge)
 *
 * Retries up to MAX_REPAIR_ATTEMPTS when validation fails and caller supplies
 * revised patches via onRetry (optional).
 */
export async function executeIsolatedCodeRepair(input: {
  plan: CodeRepairPlan;
  git: CodeRepairGitPort;
  baseBranch?: string;
  /** Optional revised patches between attempts. */
  onRetry?: (attempt: number, previous: IsolatedRepairAttempt[]) => CodeRepairFilePatch[] | null;
  /** When true, stop after create_pr without polling CI. */
  skipCiPoll?: boolean;
  maxAttempts?: number;
}): Promise<IsolatedRepairResult> {
  const attempts: IsolatedRepairAttempt[] = [];
  const baseBranch = input.baseBranch ?? "release/sunvera-jolie-unified";
  const maxAttempts = Math.min(
    Math.max(1, input.maxAttempts ?? MAX_REPAIR_ATTEMPTS),
    MAX_REPAIR_ATTEMPTS,
  );

  let patches = input.plan.filePatches.filter(
    (p) => (p.replacements && p.replacements.length > 0) || p.proposedContent !== undefined,
  );

  if (!patches.length) {
    attempts.push({
      attempt: 0,
      stage: "failed",
      ok: false,
      message: "No actionable file patches (need replacements or proposedContent).",
    });
    return {
      status: "blocked",
      baseBranch,
      attempts,
      summary: "Code repair blocked: plan has no concrete file patches to apply.",
      merged: false,
    };
  }

  let branch = input.plan.suggestedBranch;
  try {
    assertSafeRepairBranch(branch);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    attempts.push({ attempt: 0, stage: "guard", ok: false, message });
    return {
      status: "blocked",
      baseBranch,
      attempts,
      summary: message,
      merged: false,
    };
  }

  if (isProtectedBranch(branch)) {
    attempts.push({
      attempt: 0,
      stage: "guard",
      ok: false,
      message: `Target branch "${branch}" is protected.`,
    });
    return {
      status: "blocked",
      baseBranch,
      attempts,
      summary: `Refused protected branch ${branch}`,
      merged: false,
    };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1 && input.onRetry) {
      const revised = input.onRetry(attempt, attempts);
      if (revised?.length) patches = revised;
    }

    const validated: Array<{ path: string; next: string; sha: string; reason: string }> = [];
    let validationFailed = false;

    for (const patch of patches) {
      attempts.push({
        attempt,
        stage: "read_context",
        ok: true,
        message: `Reading ${patch.path} from ${baseBranch}`,
      });
      const file = await input.git.getFileContent(patch.path, baseBranch);
      if (!file) {
        attempts.push({
          attempt,
          stage: "read_context",
          ok: false,
          message: `File not found on ${baseBranch}: ${patch.path}`,
        });
        validationFailed = true;
        break;
      }
      const check = validatePatchAgainstSnapshot(file.content, patch);
      if (!check.ok) {
        attempts.push({
          attempt,
          stage: "validate_patch",
          ok: false,
          message: check.reason,
          evidence: patch.path,
        });
        validationFailed = true;
        break;
      }
      attempts.push({
        attempt,
        stage: "validate_patch",
        ok: true,
        message: `Context matched for ${patch.path}; applied ${check.applied} change(s)`,
        evidence: patch.path,
      });
      validated.push({ path: patch.path, next: check.next, sha: file.sha, reason: patch.reason });
    }

    if (validationFailed) {
      if (attempt === maxAttempts) {
        return {
          status: "failed",
          baseBranch,
          branch,
          attempts,
          summary: `Validation failed after ${maxAttempts} attempt(s).`,
          merged: false,
        };
      }
      continue;
    }

    try {
      assertSafeRepairBranch(branch);
      const created = await input.git.createBranch(branch, baseBranch);
      attempts.push({
        attempt,
        stage: "create_branch",
        ok: true,
        message: `Created branch ${created.ref} from ${baseBranch}`,
        evidence: created.sha,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already exists|Reference already exists/i.test(message)) {
        attempts.push({
          attempt,
          stage: "create_branch",
          ok: true,
          message: `Branch ${branch} already exists; reusing.`,
        });
      } else {
        attempts.push({ attempt, stage: "create_branch", ok: false, message });
        return {
          status: "failed",
          baseBranch,
          branch,
          attempts,
          summary: message,
          merged: false,
        };
      }
    }

    let lastCommitSha: string | undefined;
    for (const item of validated) {
      const onBranch = await input.git.getFileContent(item.path, branch);
      const sha = onBranch?.sha ?? item.sha;
      const live = onBranch?.content;
      if (live !== undefined) {
        const patch = patches.find((p) => p.path === item.path);
        if (patch) {
          const recheck = validatePatchAgainstSnapshot(live, patch);
          if (!recheck.ok) {
            attempts.push({
              attempt,
              stage: "verify_diff",
              ok: false,
              message: `Branch tip context mismatch: ${recheck.reason}`,
              evidence: item.path,
            });
            return {
              status: "failed",
              baseBranch,
              branch,
              attempts,
              summary: recheck.reason,
              merged: false,
            };
          }
          item.next = recheck.next;
        }
      }

      const updated = await input.git.updateFile({
        path: item.path,
        content: item.next,
        message: `fix(master-ai): ${item.reason.slice(0, 72)}`,
        branch,
        sha,
      });
      lastCommitSha = updated.commitSha;
      attempts.push({
        attempt,
        stage: "apply_patch",
        ok: true,
        message: `Updated ${item.path}`,
        evidence: updated.commitSha,
      });
    }

    const prBody = [
      "## Master AI isolated code repair",
      "",
      input.plan.summary,
      "",
      "### Evidence",
      ...input.plan.evidence.map((e) => `- ${e}`),
      "",
      "### Files",
      ...validated.map((v) => `- \`${v.path}\`: ${v.reason}`),
      "",
      "### Safety",
      "- Applied only after live file context matched proposed `oldText`.",
      `- Branch \`${branch}\` is isolated; production/release branches were not modified.`,
      "- This PR is **not** auto-merged.",
      "",
      "### Required tests",
      ...input.plan.requiredTests.map((t) => `- \`${t}\``),
    ].join("\n");

    const pr = await input.git.createPullRequest({
      title: `fix(master-ai): isolated code repair (${input.plan.classification})`,
      body: prBody,
      head: branch,
      base: baseBranch,
      draft: false,
    });

    if (pr.merged) {
      attempts.push({
        attempt,
        stage: "create_pr",
        ok: false,
        message: "PR reported merged=true; executor forbids auto-merge.",
      });
      return {
        status: "failed",
        baseBranch,
        branch,
        prNumber: pr.number,
        prUrl: pr.htmlUrl,
        commitSha: lastCommitSha,
        attempts,
        summary: "Refused result because PR was merged automatically.",
        merged: false,
      };
    }

    attempts.push({
      attempt,
      stage: "create_pr",
      ok: true,
      message: `Opened PR #${pr.number}`,
      evidence: pr.htmlUrl,
    });

    if (!input.skipCiPoll && input.git.listCheckRuns) {
      const checks = await input.git.listCheckRuns(branch);
      const pending = checks.filter((c) => c.status !== "completed");
      const failed = checks.filter(
        (c) => c.status === "completed" && c.conclusion && !["success", "neutral", "skipped"].includes(c.conclusion),
      );
      attempts.push({
        attempt,
        stage: "poll_ci",
        ok: failed.length === 0,
        message:
          failed.length > 0
            ? `CI failed: ${failed.map((c) => c.name).join(", ")}`
            : pending.length > 0
              ? `CI still running (${pending.length}); PR left open for review.`
              : checks.length
                ? "CI checks completed successfully."
                : "No CI check runs reported yet; PR left open for review.",
      });
    }

    attempts.push({
      attempt,
      stage: "done",
      ok: true,
      message: "Isolated repair cycle completed with PR open (not merged).",
    });

    return {
      status: "pr_opened",
      baseBranch,
      branch,
      prNumber: pr.number,
      prUrl: pr.htmlUrl,
      commitSha: lastCommitSha,
      attempts,
      summary: `Opened PR #${pr.number} from ${branch} into ${baseBranch} without merging.`,
      merged: false,
    };
  }

  return {
    status: "failed",
    baseBranch,
    branch,
    attempts,
    summary: `Exhausted ${maxAttempts} repair attempt(s).`,
    merged: false,
  };
}
