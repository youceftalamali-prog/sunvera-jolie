/**
 * Integration tests for Master AI isolated code repair.
 * Imports the real TypeScript module via Node --experimental-strip-types and
 * injects a Mock Git port — does not reimplement executor logic in the test.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const moduleUrl = pathToFileURL(path.join(root, "src/lib/ai-master-code-repair.ts")).href;

const mod = await import(moduleUrl);

const {
  isProtectedBranch,
  assertSafeRepairBranch,
  validatePatchAgainstSnapshot,
  classifyRepairNeed,
  buildCodeRepairPlan,
  decideRepairStrategy,
  executeIsolatedCodeRepair,
  getMaxRepairAttempts,
} = mod;

assert.equal(typeof executeIsolatedCodeRepair, "function", "must import real executeIsolatedCodeRepair");
assert.equal(typeof isProtectedBranch, "function");
assert.equal(typeof validatePatchAgainstSnapshot, "function");
assert.equal(getMaxRepairAttempts(), 3);

assert.equal(isProtectedBranch("main"), true);
assert.equal(isProtectedBranch("release/sunvera-jolie-unified"), true);
assert.equal(isProtectedBranch("fix/master-ai-code-repair-x"), false);
assert.throws(() => assertSafeRepairBranch("release/sunvera-jolie-unified"));

function createMockGit(initialFiles, options = {}) {
  const files = new Map(
    Object.entries(initialFiles).map(([p, c]) => [p, { content: c, sha: `sha-${p}-0` }]),
  );
  const branches = new Set(["release/sunvera-jolie-unified"]);
  const prs = [];
  let commitCounter = 0;
  const checkRuns =
    options.checkRuns ??
    [{ name: "contract", status: "completed", conclusion: "success" }];

  return {
    files,
    prs,
    async getFileContent(pathName) {
      const row = files.get(pathName);
      if (!row) return null;
      return { content: row.content, sha: row.sha };
    },
    async createBranch(branch, fromRef) {
      if (isProtectedBranch(branch)) throw new Error(`Refusing protected branch ${branch}`);
      if (branches.has(branch)) throw new Error("Reference already exists");
      branches.add(branch);
      return { ref: `refs/heads/${branch}`, sha: `base-from-${fromRef}` };
    },
    async updateFile({ path: pathName, content, branch }) {
      if (isProtectedBranch(branch)) throw new Error(`Refusing write to protected branch ${branch}`);
      commitCounter += 1;
      const nextSha = `commit-${commitCounter}`;
      files.set(pathName, { content, sha: nextSha });
      return { commitSha: nextSha };
    },
    async createPullRequest({ head, base }) {
      if (isProtectedBranch(head)) throw new Error("PR head cannot be protected");
      const number = prs.length + 9100;
      const pr = {
        number,
        htmlUrl: `https://github.com/example/repo/pull/${number}`,
        merged: false,
        head,
        base,
      };
      prs.push(pr);
      return { number: pr.number, htmlUrl: pr.htmlUrl, merged: false };
    },
    async listCheckRuns() {
      return checkRuns;
    },
  };
}

// 1) Protected branch blocked via REAL executor
{
  const git = createMockGit({ "src/lib/demo.ts": "const x = 1;\n" });
  const plan = {
    classification: "backend_code",
    summary: "test",
    evidence: [],
    preferredOperations: [],
    filePatches: [
      {
        path: "src/lib/demo.ts",
        reason: "should not apply",
        replacements: [{ oldText: "const x = 1;", newText: "const x = 2;" }],
      },
    ],
    suggestedBranch: "release/sunvera-jolie-unified",
    requiredTests: [],
    canFixWithExistingOperations: false,
  };
  const result = await executeIsolatedCodeRepair({ plan, git, skipCiPoll: true });
  assert.equal(result.status, "blocked");
  assert.equal(result.merged, false);
  assert.equal(git.prs.length, 0);
}

// 2) Context mismatch → failed, no PR
{
  const git = createMockGit({
    "src/lib/ai-master-verifier.ts": "export async function verifyMasterExecution() {}\n",
  });
  const plan = buildCodeRepairPlan({
    errorMessage: "verifier gap in ai-master-verifier.ts",
  });
  plan.suggestedBranch = "fix/master-ai-code-repair-context-miss";
  plan.filePatches = [
    {
      path: "src/lib/ai-master-verifier.ts",
      reason: "stale",
      replacements: [{ oldText: "function doesNotExist()", newText: "function fixed()" }],
    },
  ];
  const result = await executeIsolatedCodeRepair({ plan, git, maxAttempts: 2, skipCiPoll: true });
  assert.equal(result.status, "failed");
  assert.equal(result.prNumber, undefined);
  assert.equal(git.prs.length, 0);
}

// 3) Full cycle → PR opened, not merged (REAL executor)
{
  const original = "/**\n * Master AI verifier\n */\nexport async function verifyMasterExecution() {}\n";
  const git = createMockGit({ "src/lib/ai-master-verifier.ts": original });
  const plan = buildCodeRepairPlan({
    errorMessage: "backend verifier needs isolated fix",
  });
  plan.suggestedBranch = "fix/master-ai-code-repair-integration-proof";
  plan.filePatches = [
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
  ];
  const result = await executeIsolatedCodeRepair({ plan, git, skipCiPoll: false });
  assert.equal(result.status, "pr_opened", result.summary);
  assert.equal(result.merged, false);
  assert.equal(typeof result.prNumber, "number");
  assert.ok(result.prUrl.includes("/pull/"));
  assert.equal(git.prs.length, 1);
  assert.equal(git.prs[0].merged, false);
  assert.equal(git.prs[0].head, "fix/master-ai-code-repair-integration-proof");
  assert.equal(git.prs[0].base, "release/sunvera-jolie-unified");
  assert.ok(
    git.files.get("src/lib/ai-master-verifier.ts").content.includes("Isolated repair integration proof marker"),
  );
  assert.ok(result.attempts.some((a) => a.stage === "validate_patch" && a.ok));
  assert.ok(result.attempts.some((a) => a.stage === "create_pr" && a.ok));
  assert.ok(result.attempts.some((a) => a.stage === "done" && a.ok));
}

// 4) CI failure → NOT a successful repair
{
  const original = "export function target() { return 1; }\n";
  const git = createMockGit(
    { "src/lib/target.ts": original },
    {
      checkRuns: [
        { name: "contract", status: "completed", conclusion: "failure" },
        { name: "typecheck", status: "completed", conclusion: "success" },
      ],
    },
  );
  const plan = {
    classification: "backend_code",
    summary: "ci fail case",
    evidence: ["ci"],
    preferredOperations: [],
    filePatches: [
      {
        path: "src/lib/target.ts",
        reason: "bump return",
        replacements: [{ oldText: "return 1;", newText: "return 2;" }],
      },
    ],
    suggestedBranch: "fix/master-ai-code-repair-ci-fail",
    requiredTests: ["scripts/test-p2-master-ai-code-repair.mjs"],
    canFixWithExistingOperations: false,
  };
  const result = await executeIsolatedCodeRepair({ plan, git, skipCiPoll: false });
  assert.equal(result.status, "needs_retry", `expected needs_retry, got ${result.status}: ${result.summary}`);
  assert.equal(result.merged, false);
  assert.equal(typeof result.prNumber, "number", "PR may exist but must not count as success");
  assert.ok(/CI failed/i.test(result.summary), "summary must mention CI failure");
  assert.ok(!/\bis a successful repair\b/i.test(result.summary), "must not claim is a successful repair");
  assert.ok(/not a successful repair/i.test(result.summary), "must explicitly state not a successful repair");
  assert.ok(result.attempts.some((a) => a.stage === "poll_ci" && a.ok === false));
  assert.ok(result.attempts.some((a) => a.stage === "failed" && a.ok === false));
}

assert.equal(
  classifyRepairNeed({ failedChecks: [{ operation: "homepage.reorder.verify", evidence: "sortOrder" }] }),
  "cms_or_db",
);
assert.equal(decideRepairStrategy(buildCodeRepairPlan({ errorMessage: "RTL carousel component broken" })), "prepare_code_pr");
assert.equal(
  decideRepairStrategy(
    buildCodeRepairPlan({ failedChecks: [{ operation: "products.attach_media.verify", evidence: "x" }] }),
  ),
  "execute_master_ops",
);

console.log("P2_MASTER_AI_CODE_REPAIR_CLASSIFICATION_PASS");
console.log("P2_MASTER_AI_CODE_REPAIR_INTEGRATION_PR_CYCLE_PASS");
console.log("P2_MASTER_AI_CODE_REPAIR_CI_FAILURE_NOT_SUCCESS_PASS");
console.log(
  JSON.stringify({
    imported_real_executor: typeof executeIsolatedCodeRepair === "function",
    protected_release: isProtectedBranch("release/sunvera-jolie-unified"),
    ci_failure_status: "needs_retry",
  }),
);
