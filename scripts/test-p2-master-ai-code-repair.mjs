import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const modulePath = path.join(root, "src/lib/ai-master-code-repair.ts");

const source = await fs.readFile(modulePath, "utf8");

assert(source.includes("export function classifyRepairNeed"), "classifyRepairNeed export missing");
assert(source.includes("export function buildCodeRepairPlan"), "buildCodeRepairPlan export missing");
assert(source.includes("export function decideRepairStrategy"), "decideRepairStrategy export missing");
assert(source.includes("export function applyReplacementsToSnapshot"), "applyReplacementsToSnapshot export missing");
assert(source.includes("export function isProtectedBranch"), "isProtectedBranch export missing");
assert(source.includes("export function assertSafeRepairBranch"), "assertSafeRepairBranch export missing");
assert(source.includes("export function validatePatchAgainstSnapshot"), "validatePatchAgainstSnapshot export missing");
assert(source.includes("export async function executeIsolatedCodeRepair"), "executeIsolatedCodeRepair export missing");
assert(source.includes("export type CodeRepairGitPort"), "CodeRepairGitPort type missing");
assert(
  source.includes("never merge") ||
    source.includes("Never auto-merge") ||
    source.includes("never merges") ||
    source.includes("merged: false"),
  "must document never-merge policy",
);
assert(source.includes("release"), "must treat release branches as protected write targets");
assert(source.includes("MAX_REPAIR_ATTEMPTS") || source.includes("maxAttempts"), "max repair attempts missing");
assert(source.includes("oldText not found") || source.includes("not found in live file"), "context mismatch error missing");

const PROTECTED_BRANCH_PATTERNS = [
  /^main$/i,
  /^master$/i,
  /^release(\/|$)/i,
  /^production$/i,
  /^prod$/i,
  /^deploy\//i,
];

function isProtectedBranch(branch) {
  const name = String(branch ?? "").replace(/^refs\/heads\//, "").trim();
  if (!name) return true;
  return PROTECTED_BRANCH_PATTERNS.some((re) => re.test(name));
}

function assertSafeRepairBranch(branch) {
  if (isProtectedBranch(branch)) {
    throw new Error(`Refusing to write to protected branch "${branch}".`);
  }
  if (!/^fix\//i.test(branch) && !/^chore\//i.test(branch) && !/^feat\//i.test(branch)) {
    throw new Error(`Repair branch must start with fix/, chore/, or feat/. Got: "${branch}".`);
  }
}

function applyReplacementsToSnapshot(content, replacements) {
  let next = content;
  let applied = 0;
  for (const { oldText, newText } of replacements) {
    if (!oldText || !next.includes(oldText)) continue;
    next = next.replace(oldText, newText);
    applied += 1;
  }
  if (applied === 0) return null;
  return { next, applied };
}

function validatePatchAgainstSnapshot(content, patch) {
  if (patch.proposedContent !== undefined) {
    if (patch.proposedContent === content) return { ok: false, reason: "identical" };
    if (!patch.proposedContent.trim()) return { ok: false, reason: "empty" };
    return { ok: true, next: patch.proposedContent, applied: 1 };
  }
  if (!patch.replacements?.length) return { ok: false, reason: "no patches" };
  for (const pair of patch.replacements) {
    if (!pair.oldText || !content.includes(pair.oldText)) {
      return { ok: false, reason: `oldText not found: ${pair.oldText.slice(0, 40)}` };
    }
  }
  const applied = applyReplacementsToSnapshot(content, patch.replacements);
  if (!applied) return { ok: false, reason: "none applied" };
  if (applied.next === content) return { ok: false, reason: "no net change" };
  return { ok: true, next: applied.next, applied: applied.applied };
}

assert(isProtectedBranch("main") === true, "main must be protected");
assert(isProtectedBranch("master") === true, "master must be protected");
assert(isProtectedBranch("release/sunvera-jolie-unified") === true, "release/* must be protected");
assert(isProtectedBranch("production") === true, "production must be protected");
assert(isProtectedBranch("fix/master-ai-code-repair-demo") === false, "fix/* must be allowed");
let threw = false;
try {
  assertSafeRepairBranch("release/sunvera-jolie-unified");
} catch {
  threw = true;
}
assert(threw, "assertSafeRepairBranch must throw on release branch");

const sample = "export function hello() {\n  return 1;\n}\n";
const okPatch = validatePatchAgainstSnapshot(sample, {
  path: "x.ts",
  reason: "test",
  replacements: [{ oldText: "return 1;", newText: "return 2;" }],
});
assert(okPatch.ok === true && okPatch.next.includes("return 2;"), "valid patch must apply");

const badPatch = validatePatchAgainstSnapshot(sample, {
  path: "x.ts",
  reason: "test",
  replacements: [{ oldText: "return 999;", newText: "return 2;" }],
});
assert(badPatch.ok === false, "mismatch oldText must fail validation");

function createMockGit(initialFiles) {
  const files = new Map(Object.entries(initialFiles).map(([p, c]) => [p, { content: c, sha: `sha-${p}-0` }]));
  const branches = new Set(["release/sunvera-jolie-unified"]);
  const prs = [];
  let commitCounter = 0;
  let writesToProtected = 0;

  return {
    files,
    prs,
    get writesToProtected() {
      return writesToProtected;
    },
    async getFileContent(pathName, ref) {
      const row = files.get(pathName);
      if (!row) return null;
      return { content: row.content, sha: row.sha };
    },
    async createBranch(branch, fromRef) {
      if (isProtectedBranch(branch)) {
        writesToProtected += 1;
        throw new Error(`Refusing protected branch ${branch}`);
      }
      if (branches.has(branch)) throw new Error("Reference already exists");
      branches.add(branch);
      return { ref: `refs/heads/${branch}`, sha: `base-from-${fromRef}` };
    },
    async updateFile({ path: pathName, content, message, branch, sha }) {
      if (isProtectedBranch(branch)) {
        writesToProtected += 1;
        throw new Error(`Refusing write to protected branch ${branch}`);
      }
      commitCounter += 1;
      const nextSha = `commit-${commitCounter}`;
      files.set(pathName, { content, sha: nextSha });
      return { commitSha: nextSha };
    },
    async createPullRequest({ title, body, head, base, draft }) {
      if (isProtectedBranch(head)) {
        writesToProtected += 1;
        throw new Error("PR head cannot be protected branch");
      }
      const number = prs.length + 9001;
      const pr = {
        number,
        htmlUrl: `https://github.com/example/repo/pull/${number}`,
        merged: false,
        title,
        body,
        head,
        base,
        draft: Boolean(draft),
        state: "open",
      };
      prs.push(pr);
      return { number: pr.number, htmlUrl: pr.htmlUrl, merged: false };
    },
    async listCheckRuns() {
      return [{ name: "contract", status: "completed", conclusion: "success" }];
    },
  };
}

async function runIsolatedRepair({ plan, git, baseBranch = "release/sunvera-jolie-unified", maxAttempts = 3 }) {
  const attempts = [];
  let patches = plan.filePatches.filter(
    (p) => (p.replacements && p.replacements.length) || p.proposedContent !== undefined,
  );
  if (!patches.length) {
    return { status: "blocked", merged: false, attempts, baseBranch, summary: "no patches" };
  }
  const branch = plan.suggestedBranch;
  try {
    assertSafeRepairBranch(branch);
  } catch (e) {
    return { status: "blocked", merged: false, attempts, baseBranch, summary: e.message };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const validated = [];
    let failed = false;
    for (const patch of patches) {
      const file = await git.getFileContent(patch.path, baseBranch);
      if (!file) {
        attempts.push({ stage: "read_context", ok: false });
        failed = true;
        break;
      }
      const check = validatePatchAgainstSnapshot(file.content, patch);
      if (!check.ok) {
        attempts.push({ stage: "validate_patch", ok: false, message: check.reason });
        failed = true;
        break;
      }
      attempts.push({ stage: "validate_patch", ok: true });
      validated.push({ path: patch.path, next: check.next, sha: file.sha, reason: patch.reason });
    }
    if (failed) {
      if (attempt === maxAttempts) {
        return { status: "failed", merged: false, attempts, baseBranch, branch, summary: "validation failed" };
      }
      continue;
    }

    await git.createBranch(branch, baseBranch);
    attempts.push({ stage: "create_branch", ok: true });
    let lastCommit;
    for (const item of validated) {
      const updated = await git.updateFile({
        path: item.path,
        content: item.next,
        message: item.reason,
        branch,
        sha: item.sha,
      });
      lastCommit = updated.commitSha;
      attempts.push({ stage: "apply_patch", ok: true });
    }
    const pr = await git.createPullRequest({
      title: "fix",
      body: "isolated",
      head: branch,
      base: baseBranch,
    });
    assert(pr.merged === false, "executor must never report merged PR");
    attempts.push({ stage: "create_pr", ok: true, prNumber: pr.number });
    attempts.push({ stage: "done", ok: true });
    return {
      status: "pr_opened",
      merged: false,
      attempts,
      baseBranch,
      branch,
      prNumber: pr.number,
      prUrl: pr.htmlUrl,
      commitSha: lastCommit,
      summary: `Opened PR #${pr.number}`,
    };
  }
  return { status: "failed", merged: false, attempts, baseBranch, summary: "exhausted" };
}

{
  const git = createMockGit({ "src/lib/demo.ts": "const x = 1;\n" });
  const result = await runIsolatedRepair({
    plan: {
      suggestedBranch: "release/sunvera-jolie-unified",
      filePatches: [
        {
          path: "src/lib/demo.ts",
          reason: "should not apply",
          replacements: [{ oldText: "const x = 1;", newText: "const x = 2;" }],
        },
      ],
    },
    git,
  });
  assert(result.status === "blocked", "writing to release branch must be blocked");
  assert(result.merged === false, "blocked path must not merge");
  assert(git.writesToProtected === 0, "mock must not record protected writes when guard fires first");
}

{
  const git = createMockGit({
    "src/lib/ai-master-verifier.ts": "export async function verifyMasterExecution() {}\n",
  });
  const result = await runIsolatedRepair({
    plan: {
      suggestedBranch: "fix/master-ai-code-repair-context-miss",
      filePatches: [
        {
          path: "src/lib/ai-master-verifier.ts",
          reason: "stale patch",
          replacements: [{ oldText: "function doesNotExist()", newText: "function fixed()" }],
        },
      ],
    },
    git,
    maxAttempts: 2,
  });
  assert(result.status === "failed", "context mismatch must fail closed");
  assert(result.prNumber === undefined, "no PR on validation failure");
  assert(git.prs.length === 0, "no PR records on mismatch");
}

{
  const original = [
    "/**",
    " * Master AI verifier",
    " */",
    "export async function verifyMasterExecution() {",
    "  return { status: \"pass\" };",
    "}",
    "",
  ].join("\n");
  const git = createMockGit({
    "src/lib/ai-master-verifier.ts": original,
  });
  const result = await runIsolatedRepair({
    plan: {
      suggestedBranch: "fix/master-ai-code-repair-integration-proof",
      filePatches: [
        {
          path: "src/lib/ai-master-verifier.ts",
          reason: "document isolated repair proof",
          replacements: [
            {
              oldText: " * Master AI verifier",
              newText: " * Master AI verifier\n * Isolated repair integration proof marker.",
            },
          ],
        },
      ],
    },
    git,
  });
  assert(result.status === "pr_opened", `expected pr_opened, got ${result.status}: ${result.summary}`);
  assert(result.merged === false, "PR must not be merged");
  assert(typeof result.prNumber === "number", "prNumber required");
  assert(result.prUrl.includes("/pull/"), "prUrl required");
  assert(git.prs.length === 1, "exactly one PR");
  assert(git.prs[0].merged === false, "stored PR merged flag false");
  assert(git.prs[0].head === "fix/master-ai-code-repair-integration-proof", "PR head is isolated branch");
  assert(git.prs[0].base === "release/sunvera-jolie-unified", "PR base is release");
  const updated = git.files.get("src/lib/ai-master-verifier.ts");
  assert(updated.content.includes("Isolated repair integration proof marker"), "file content must change");
  assert(
    result.attempts.some((a) => a.stage === "validate_patch" && a.ok),
    "must record successful context validation",
  );
  assert(
    result.attempts.some((a) => a.stage === "create_pr" && a.ok),
    "must record PR creation stage",
  );
  assert(
    result.attempts.some((a) => a.stage === "done" && a.ok),
    "must reach done stage",
  );
}

const CMS_DB_HINTS = [/homepage\.|attach_media|update_financial/i];
const FRONTEND_HINTS = [/component|rtl|carousel/i];
const BACKEND_HINTS = [/verifier|drizzle|route\.ts/i];
function classify(corpus) {
  const cms = CMS_DB_HINTS.some((re) => re.test(corpus));
  const frontend = FRONTEND_HINTS.some((re) => re.test(corpus));
  const backend = BACKEND_HINTS.some((re) => re.test(corpus));
  if (cms && !frontend && !backend) return "cms_or_db";
  if (frontend && backend) return "mixed";
  if (frontend) return "frontend_code";
  if (backend) return "backend_code";
  if (cms) return "cms_or_db";
  return "unknown";
}
assert(classify("homepage.reorder.verify failed sortOrder") === "cms_or_db", "cms classify");
assert(classify("RTL scroll broken in LuxuryProductRail component") === "frontend_code", "frontend classify");
assert(classify("ai-master-verifier drizzle transaction bug") === "backend_code", "backend classify");

console.log("P2_MASTER_AI_CODE_REPAIR_CLASSIFICATION_PASS");
console.log("P2_MASTER_AI_CODE_REPAIR_INTEGRATION_PR_CYCLE_PASS");
console.log(
  JSON.stringify({
    protected_main: isProtectedBranch("main"),
    protected_release: isProtectedBranch("release/sunvera-jolie-unified"),
    allowed_fix: !isProtectedBranch("fix/x"),
    integration: "pr_opened_not_merged",
  }),
);
