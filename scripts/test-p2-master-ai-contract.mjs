import fs from "fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const route = await fs.readFile("src/app/api/admin/ai/master/route.ts", "utf8");
const validator = await fs.readFile("src/lib/ai-master-plan-validator.ts", "utf8");

assert(route.includes("function stripCodeFences"), "stripCodeFences is missing");
assert(route.includes("balancedJsonCandidates(cleaned)"), "balanced JSON extraction is missing");
assert(route.includes('"plan" in decoded'), "plan wrapper support is missing");
assert(route.includes("root.actions"), "actions wrapper support is missing");
assert(route.includes("root.steps"), "steps wrapper support is missing");
assert(route.includes("root.executable_actions"), "executable_actions wrapper support is missing");
assert(route.includes("root.executableActions"), "executableActions wrapper support is missing");

assert(route.includes("action.id !== undefined) payload.id"), "action.id normalization is missing");
assert(route.includes("action.sectionId !== undefined) payload.sectionId"), "action.sectionId normalization is missing");
assert(route.includes("action.section_id"), "section_id normalization is missing");
assert(route.includes("action.sectionKey"), "sectionKey normalization is missing");
assert(route.includes("action.section_key"), "section_key normalization is missing");
assert(route.includes("action.site_section"), "site_section normalization is missing");
assert(route.includes("action.siteSection"), "siteSection normalization is missing");
assert(route.includes("resolveHomepageSectionId(sectionValue, context)"), "homepage section resolution is missing");

assert(validator.includes("Homepage section id does not exist in the current CMS context."), "homepage ID validation is missing");
assert(validator.includes("Referenced record id does not exist in the current admin context."), "product/media ID validation is missing");
assert(validator.includes("Homepage reorder contains duplicate section ids."), "duplicate reorder validation is missing");
assert(validator.includes("Homepage reorder must contain every current homepage section id exactly once."), "complete reorder validation is missing");
assert(validator.includes("Homepage section field is not supported by the CMS executor."), "homepage patch validation is missing");

console.log("P2_MASTER_AI_NORMALIZATION_CONTRACT_PASS");
const executor = await fs.readFile("src/lib/ai-master-tools.ts", "utf8");
assert(executor.includes("Homepage section patch contains unsupported fields:"), "executor must reject unsupported homepage patch fields");
assert(executor.includes("Homepage productIds contains a product id that does not exist."), "executor must reject unknown homepage product ids");
assert(executor.includes("homepage.reorder contains duplicate section ids."), "executor must reject duplicate homepage reorder ids");
assert(executor.includes("homepage.reorder must contain every current homepage section id exactly once."), "executor must enforce complete homepage reorder");
assert(executor.includes('throw new Error(id > 0 ? "Banner not found." : "Banner creation failed.")'), "executor must fail closed for missing banner updates");
assert(executor.includes('throw new Error(id > 0 ? "Trust badge not found." : "Trust badge creation failed.")'), "executor must fail closed for missing badge updates");
assert(executor.includes('throw new Error(id > 0 ? "Navigation item not found." : "Navigation item creation failed.")'), "executor must fail closed for missing navigation updates");

console.log("P2_MASTER_AI_EXECUTOR_HARDENING_CONTRACT_PASS");

