import fs from "fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const route = await fs.readFile("netlify/functions/_lib/master-ai-runner.ts", "utf8");
const validator = await fs.readFile("src/lib/ai-master-plan-validator.ts", "utf8");
const aiProviders = await fs.readFile("src/lib/ai-direct-providers.ts", "utf8");
const verifier = await fs.readFile("src/lib/ai-master-verifier.ts", "utf8");
const sharedProductWriter = await fs.readFile("src/lib/product-write.ts", "utf8");
const masterProductWriter = await fs.readFile("src/lib/master-product-write.ts", "utf8");
const storage = await fs.readFile("src/lib/storage.ts", "utf8");
const mediaRoute = await fs.readFile("src/app/api/admin/media/route.ts", "utf8");
const mediaLibrary = await fs.readFile("src/app/admin/media/page.tsx", "utf8");
const rateLimit = await fs.readFile("src/lib/rate-limit.ts", "utf8");
const wrangler = await fs.readFile("wrangler.jsonc", "utf8");

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
assert(route.includes('if (operation === "settings.update_theme")'), "theme update normalization is missing");
assert(route.includes("allowedThemeFields"), "theme field allowlist is missing");
assert(route.includes("payload.patch = normalizedTheme"), "nested theme colors must normalize into patch");
assert(route.includes("const currentOrder = context.sections"), "partial homepage reorder expansion is missing");
assert(route.includes("const remaining = currentOrder.filter((id) => !uniqueRequested.includes(id))"), "homepage reorder must preserve unspecified sections");

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

assert(aiProviders.includes('const perProviderTimeoutMs = task === "master_plan" ? 60_000 : 15_000;'), "Master AI planner timeout must stay bounded to one minute per provider");
assert(aiProviders.includes('const maxProviderCalls = task === "master_plan" ? 5 : candidates.length;'), "Master AI planner must try fallback providers");
assert(aiProviders.includes('"tokenharbor:deepseek-v4.1-flash:free"'), "Token Harbor fallback model id must match the configured catalog");
assert(verifier.includes("const productExecutions = execution.filter"), "deterministic verification must match execution to each product");
assert(verifier.includes("Number.isInteger(item.index)"), "deterministic verification must use action indexes");
assert(executor.includes("const copy = await duplicateProduct(id);"), "Master AI must use the atomic shared product duplication helper");
assert(executor.includes("Array.isArray(productInput.images)"), "Master AI must accept images nested in the product object");
assert(executor.includes("validateProduct({ ...productInput, images }"), "published product validation must use the actual image payload");
assert(verifier.includes("Array.isArray(nestedProduct.images)"), "verification must account for nested product images");
assert(masterProductWriter.includes('from "@/lib/product-write"'), "Master AI must share the admin product writers");
assert(!masterProductWriter.includes("export async function writeImages"), "duplicate image writer must be removed");
assert(!masterProductWriter.includes("export async function writeVariants"), "duplicate variant writer must be removed");
assert(storage.includes("isHttpUrl(d.secure_url)") && storage.includes("isHttpUrl(d.url)"), "cloud storage upload responses must be validated");
assert(mediaRoute.includes('"video/mp4"') && mediaRoute.includes('"video/webm"'), "product media upload must allow MP4/WebM");
assert(mediaLibrary.includes('preview.mimeType?.startsWith("video/")'), "media library must preview video assets");
assert(sharedProductWriter.includes("return db.transaction(async (tx) =>"), "product duplication must remain atomic");
assert(rateLimit.includes('req.headers.get("cf-connecting-ip")'), "Cloudflare client IP must be used for trusted rate limiting");
assert(wrangler.includes('"RATE_LIMIT_TRUST_PROXY": "true"'), "Cloudflare must enable trusted proxy rate limiting");
console.log("P2_MASTER_AI_EXECUTOR_HARDENING_CONTRACT_PASS");

