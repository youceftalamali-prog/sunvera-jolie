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

import {
  assertSafeRepairBranch,
  isProtectedBranch,
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

  if (!plan.filePatches.some((p) => p.replacements?.length || p.proposedContent !== undefined)) {
    return {
      strategy,
      plan,
      result: null as null,
      message:
        "Code repair classified as prepare_code_pr but no concrete replacements were supplied. Operator must provide oldText/newText pairs before execution.",
    };
  }

  const result = await executeIsolatedCodeRepair({
    plan,
    git,
    baseBranch: input.baseBranch ?? "release/sunvera-jolie-unified",
    skipCiPoll: input.skipCiPoll,
  });

  return { strategy, plan, result, message: result.summary };
}
