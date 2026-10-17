/**
 * Safe GitHub port for Master AI isolated code repair.
 *
 * Permissions expected on the token (least privilege):
 * - contents: write (create branch + commit on non-protected refs only)
 * - pull_requests: write (open PR)
 * Must NOT be used to merge PRs or push to release/main.
 *
 * Token sources (first match wins):
 * - MASTER_AI_GITHUB_TOKEN (preferred, scoped bot token)
 * - GITHUB_TOKEN (CI only)
 */

import { generateText } from "@/lib/ai-gateway";
import {
  assertSafeRepairBranch,
  isProtectedBranch,
  validatePatchAgainstSnapshot,
  type CodeRepairFilePatch,
  type CodeRepairGitPort,
} from "@/lib/ai-master-code-repair";

export type GitHubPortOptions = {
  owner: string;
  repo: string;
  token: string;
  apiBase?: string;
};

function requireToken(): string | null {
  const token =
    String(process.env.MASTER_AI_GITHUB_TOKEN ?? "").trim() ||
    String(process.env.GITHUB_TOKEN ?? "").trim();
  return token || null;
}

export function resolveMasterAiGitHubPort(): CodeRepairGitPort | null {
  const token = requireToken();
  if (!token) return null;
  const owner =
    String(process.env.MASTER_AI_GITHUB_OWNER ?? process.env.GITHUB_REPOSITORY_OWNER ?? "youceftalamali-prog").trim();
  const repoName =
    String(process.env.MASTER_AI_GITHUB_REPO ?? "").trim() ||
    String(process.env.GITHUB_REPOSITORY ?? "youceftalamali-prog/sunvera-jolie").split("/")[1] ||
    "sunvera-jolie";
  return createGitHubCodeRepairPort({ owner, repo: repoName, token });
}

export function createGitHubCodeRepairPort(options: GitHubPortOptions): CodeRepairGitPort {
  const apiBase = (options.apiBase ?? "https://api.github.com").replace(/\/$/, "");
  const { owner, repo, token } = options;

  async function gh<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`GitHub API ${response.status} ${path}: ${body.slice(0, 240)}`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    async getFileContent(path, ref) {
      type FileResponse = { content?: string; encoding?: string; sha: string; type?: string };
      try {
        const data = await gh<FileResponse>(
          `/repos/${owner}/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref)}`,
        );
        if (!data.content || data.encoding !== "base64") return null;
        const content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
        return { content, sha: data.sha };
      } catch (error) {
        if (error instanceof Error && /404/.test(error.message)) return null;
        throw error;
      }
    },

    async createBranch(branch, fromRef) {
      assertSafeRepairBranch(branch);
      if (isProtectedBranch(branch)) {
        throw new Error(`Refusing to create protected branch ${branch}`);
      }
      type RefResponse = { object: { sha: string } };
      const base = await gh<RefResponse>(
        `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(fromRef.replace(/^refs\/heads\//, ""))}`,
      );
      const sha = base.object.sha;
      await gh(`/repos/${owner}/${repo}/git/refs`, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
      });
      return { ref: `refs/heads/${branch}`, sha };
    },

    async updateFile({ path, content, message, branch, sha }) {
      assertSafeRepairBranch(branch);
      if (isProtectedBranch(branch)) {
        throw new Error(`Refusing write to protected branch ${branch}`);
      }
      type CommitResponse = { commit: { sha: string } };
      const result = await gh<CommitResponse>(`/repos/${owner}/${repo}/contents/${encodeURI(path)}`, {
        method: "PUT",
        body: JSON.stringify({
          message,
          content: Buffer.from(content, "utf8").toString("base64"),
          branch,
          sha,
        }),
      });
      return { commitSha: result.commit.sha };
    },

    async createPullRequest({ title, body, head, base, draft }) {
      assertSafeRepairBranch(head);
      if (isProtectedBranch(head)) {
        throw new Error(`PR head cannot be a protected branch: ${head}`);
      }
      // Intentionally no merge call exists in this port.
      type PrResponse = { number: number; html_url: string; merged: boolean };
      const pr = await gh<PrResponse>(`/repos/${owner}/${repo}/pulls`, {
        method: "POST",
        body: JSON.stringify({ title, body, head, base, draft: Boolean(draft) }),
      });
      return { number: pr.number, htmlUrl: pr.html_url, merged: Boolean(pr.merged) };
    },

    async getPullRequest(number) {
      type PrResponse = { state: string; merged: boolean; html_url: string };
      const pr = await gh<PrResponse>(`/repos/${owner}/${repo}/pulls/${number}`);
      return { state: pr.state, merged: Boolean(pr.merged), htmlUrl: pr.html_url };
    },

    async listCheckRuns(ref) {
      type ChecksResponse = {
        check_runs: Array<{ name: string; status: string; conclusion: string | null }>;
      };
      const data = await gh<ChecksResponse>(
        `/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}/check-runs?per_page=50`,
      );
      return (data.check_runs ?? []).map((run) => ({
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
      }));
    },
  };
}

/**
 * Ask the configured Master AI text model for a minimal, context-bound patch.
 * The model must return exact oldText/newText replacements; the executor validates
 * the same replacements again against the fetched base-branch snapshot before writing.
 */
async function generateConcreteFilePatch(input: {
  path: string;
  reason: string;
  snapshot: string;
  intent?: string;
  errorMessage?: string;
  criticIssues?: Array<{ area: string; message: string; evidence: string }>;
  failedChecks?: Array<{ operation: string; evidence: string }>;
}): Promise<CodeRepairFilePatch> {
  if (input.path.startsWith("/") || input.path.split("/").includes("..")) {
    throw new Error("Unsafe repository-relative file path.");
  }
  if (input.snapshot.length > 40_000) {
    throw new Error("Target file exceeds the 40,000-character safe patch-generation limit.");
  }

  const response = await generateText(
    "master_plan",
    [
      {
        role: "system",
        content: [
          "You are a cautious source-code repair agent.",
          "Return ONLY a JSON object with keys reason and replacements.",
          "replacements must be an array of 1 to 4 objects with exact string fields oldText and newText.",
          "oldText must be copied verbatim from the supplied current file snapshot and must be a unique, small snippet.",
          "newText must be the minimally corrected replacement; do not rewrite unrelated code.",
          "Do not return a full file, markdown, explanations outside JSON, shell commands, secrets, or changes to deployment configuration.",
          "If no safe, concrete fix is supported by the evidence, return {\"reason\":\"insufficient evidence\",\"replacements\":[]}.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Generate a minimal patch for the verified source-code issue.",
          targetPath: input.path,
          targetReason: input.reason,
          intent: input.intent ?? "",
          errorMessage: input.errorMessage ?? "",
          criticIssues: input.criticIssues ?? [],
          failedChecks: input.failedChecks ?? [],
          currentFileSnapshot: input.snapshot,
        }),
      },
    ],
    { temperature: 0.1, maxTokens: 6000, autoSelectModel: true },
  );

  let decoded: unknown;
  try {
    const raw = response.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Model response did not contain a JSON object.");
    decoded = JSON.parse(raw.slice(start, end + 1));
  } catch (error) {
    throw new Error("Patch generation returned invalid JSON: " + (error instanceof Error ? error.message : String(error)));
  }

  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new Error("Patch generation response must be a JSON object.");
  }
  const root = decoded as Record<string, unknown>;
  if (!Array.isArray(root.replacements) || root.replacements.length < 1 || root.replacements.length > 4) {
    throw new Error("Patch generation returned no safe replacements.");
  }
  const replacements: Array<{ oldText: string; newText: string }> = [];
  for (const value of root.replacements) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Patch replacement must be an object.");
    }
    const pair = value as Record<string, unknown>;
    if (typeof pair.oldText !== "string" || typeof pair.newText !== "string") {
      throw new Error("Patch replacement must contain string oldText and newText.");
    }
    if (!pair.oldText.trim() || pair.oldText.length > 2_000 || !input.snapshot.includes(pair.oldText)) {
      throw new Error("Generated oldText was not found exactly in the fetched file snapshot or exceeded the safe limit.");
    }
    if (pair.newText.length > 4_000 || pair.oldText === pair.newText) {
      throw new Error("Generated newText is unchanged or exceeds the safe limit.");
    }
    replacements.push({ oldText: pair.oldText, newText: pair.newText });
  }

  const patch: CodeRepairFilePatch = {
    path: input.path,
    reason: typeof root.reason === "string" && root.reason.trim() ? root.reason.slice(0, 500) : input.reason,
    replacements,
  };
  const validation = validatePatchAgainstSnapshot(input.snapshot, patch);
  if (!validation.ok) throw new Error("Generated patch failed snapshot validation: " + validation.reason);
  return patch;
}

/**
 * Attempt isolated code repair when critic/verifier indicates a source-code issue.
 * No-ops (returns blocked summary) when GitHub token is absent — never invents success.
 */
export async function tryMasterAiIsolatedCodeRepair(input: {
  errorMessage?: string;
  criticIssues?: Array<{ area: string; message: string; evidence: string }>;
  failedChecks?: Array<{ operation: string; evidence: string }>;
  intent?: string;
  filePatches?: Array<{
    path: string;
    reason: string;
    replacements?: Array<{ oldText: string; newText: string }>;
    proposedContent?: string;
  }>;
  baseBranch?: string;
  skipCiPoll?: boolean;
}) {
  const {
    buildCodeRepairPlan,
    decideRepairStrategy,
    executeIsolatedCodeRepair,
  } = await import("@/lib/ai-master-code-repair");

  const plan = buildCodeRepairPlan({
    errorMessage: input.errorMessage,
    criticIssues: input.criticIssues,
    failedChecks: input.failedChecks,
    intent: input.intent,
  });

  if (input.filePatches?.length) {
    plan.filePatches = input.filePatches;
  }

  const strategy = decideRepairStrategy(plan);
  if (strategy !== "prepare_code_pr") {
    return {
      strategy,
      plan,
      result: null as null,
      message:
        strategy === "execute_master_ops"
          ? "Issue is CMS/DB-scoped; use existing Master AI operations instead of a code PR."
          : "Code repair blocked: unable to classify or unsafe to proceed.",
    };
  }

  const git = resolveMasterAiGitHubPort();
  if (!git) {
    return {
      strategy,
      plan,
      result: null as null,
      message:
        "Code repair requires MASTER_AI_GITHUB_TOKEN (or GITHUB_TOKEN in CI) with contents:write and pull_requests:write. Token absent — plan prepared only, no branch or PR created.",
    };
  }

  const baseBranch = input.baseBranch ?? "release/sunvera-jolie-unified";
  const hasConcretePatch = plan.filePatches.some(
    (patch) => patch.replacements?.length || patch.proposedContent !== undefined,
  );

  if (!hasConcretePatch) {
    const candidates = plan.filePatches.slice(0, 2);
    if (!candidates.length) {
      return {
        strategy,
        plan,
        result: null as null,
        message: "Code repair blocked: classification produced no target file. No branch or PR was created.",
      };
    }

    const generated: CodeRepairFilePatch[] = [];
    const generationFailures: string[] = [];
    for (const candidate of candidates) {
      try {
        const snapshot = await git.getFileContent(candidate.path, baseBranch);
        if (!snapshot) throw new Error("Target file was not found on the requested base branch.");
        const patch = await generateConcreteFilePatch({
          path: candidate.path,
          reason: candidate.reason,
          snapshot: snapshot.content,
          intent: input.intent,
          errorMessage: input.errorMessage,
          criticIssues: input.criticIssues,
          failedChecks: input.failedChecks,
        });
        generated.push(patch);
      } catch (error) {
        generationFailures.push(
          candidate.path + ": " + (error instanceof Error ? error.message : String(error)),
        );
      }
    }

    // Fail closed: never open a partial PR when one of the selected targets could not
    // be read, generated, or validated against the actual base-branch snapshot.
    if (generationFailures.length || generated.length !== candidates.length) {
      return {
        strategy,
        plan,
        result: null as null,
        message:
          "Code repair blocked during context-bound patch generation; no branch or PR was created. " +
          generationFailures.join(" | "),
      };
    }
    plan.filePatches = generated;
  }

  const result = await executeIsolatedCodeRepair({
    plan,
    git,
    baseBranch,
    skipCiPoll: input.skipCiPoll,
  });

  return { strategy, plan, result, message: result.summary };
}
