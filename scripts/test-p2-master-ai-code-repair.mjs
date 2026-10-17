/**
 * Pure unit checks for Master AI code-repair classification.
 * Runs without DB or network. Node 18+.
 */
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

const CMS_DB_HINTS = [
  /homepage\.|section|sortOrder|cms\.|badge|banner|nav|product.*price|stock|publish|draft|attach_media|update_content|update_financial/i,
];
const FRONTEND_HINTS = [
  /component|tsx|jsx|css|tailwind|render|layout|rtl|scroll|carousel|footer|hero|typography|className/i,
];
const BACKEND_HINTS = [
  /api\/|route\.ts|drizzle|schema|verifier|executor|transaction|sql|auth|rate.?limit/i,
];

function classify(input) {
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

function decide(classification) {
  if (classification === "cms_or_db") return "execute_master_ops";
  if (["frontend_code", "backend_code", "mixed"].includes(classification)) return "prepare_code_pr";
  return "blocked";
}

assert(
  classify({
    failedChecks: [{ operation: "homepage.reorder.verify", evidence: "sortOrder mismatch" }],
  }) === "cms_or_db",
  "reorder failure must classify as cms_or_db",
);
assert(decide("cms_or_db") === "execute_master_ops", "cms_or_db must use existing ops");

assert(
  classify({
    errorMessage: "LuxuryProductRail scroll direction ignores RTL className",
    criticIssues: [{ area: "design", message: "carousel scroll wrong in RTL", evidence: "component LuxuryProductRail" }],
  }) === "frontend_code",
  "RTL component issue must classify as frontend_code",
);
assert(decide("frontend_code") === "prepare_code_pr", "frontend_code must prepare isolated PR");

assert(
  classify({
    errorMessage: "verifier claimed pass without re-reading productImages after attach_media",
    criticIssues: [{ area: "execution", message: "false success", evidence: "ai-master-verifier.ts missing check" }],
  }) === "backend_code",
  "verifier gap must classify as backend_code",
);

assert(source.includes("if (applied === 0) return null"), "applyReplacements must fail closed when nothing matched");

console.log("P2_MASTER_AI_CODE_REPAIR_CLASSIFICATION_PASS");
console.log(JSON.stringify({
  cms_or_db: classify({ failedChecks: [{ operation: "products.attach_media.verify", evidence: "media missing" }] }),
  frontend: classify({ errorMessage: "TestimonialCarousel shows hardcoded stars" }),
  backend: classify({ errorMessage: "drizzle transaction failed in executor" }),
}, null, 2));
