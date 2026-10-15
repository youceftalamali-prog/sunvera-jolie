import fs from "fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readStringSet(source, name) {
  const declaration = new RegExp(String.raw`const ${name} = new Set\(\[([\s\S]*?)\]\);`).exec(source);
  if (!declaration) throw new Error(`${name} declaration is missing`);
  return [...declaration[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
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
const cms = await fs.readFile("src/lib/cms.ts", "utf8");
const masterAiUi = await fs.readFile("src/components/admin/SunVeraMasterAI.tsx", "utf8");
const productApi = await fs.readFile("src/app/api/admin/products/route.ts", "utf8");
const productQueries = await fs.readFile("src/lib/queries.ts", "utf8");

assert(route.includes("function stripCodeFences"), "stripCodeFences is missing");
assert(route.includes("const prepareMasterAIRequest = async () =>"), "request and attachment preparation must be isolated from the main route");
assert(route.includes("const handleConfirmedPlan = async"), "confirmed action execution must be isolated from the main route");
assert(route.includes("const handleDirectConversation = async () =>"), "direct chat must be isolated from store-task planning");
assert(route.includes("const generateMasterPlan = async () =>"), "planning generation must be isolated from request orchestration");
assert(route.includes("const parseGeneratedPlan = async () =>"), "plan parsing and recovery must be isolated from request orchestration");
assert(route.includes("const validateAndRepairPlan ="), "plan validation and repair must be isolated from request orchestration");
assert(route.includes("const initializeExecutionReview = async () =>"), "post-execution verification must be isolated from request orchestration");
assert(route.includes("const attemptCriticRepair = async () =>"), "critic repair must be isolated from request orchestration");
assert(route.includes("const chatHasImages = attachments.length > 0 || (attachmentsForContext.length > 0 && (retryRequest || isLikelyImageReference(effectiveInstruction)));"), "persisted media must not force vision for ordinary text-only chat");
assert(route.includes("attachedImages: chatHasImages ? attachmentsForContext.map"), "only relevant images should be included in the direct-chat vision payload");
assert(route.includes("balancedJsonCandidates(cleaned)"), "balanced JSON extraction is missing");
assert(route.includes('"plan" in decoded'), "plan wrapper support is missing");
assert(route.includes("root.actions"), "actions wrapper support is missing");
assert(route.includes("root.steps"), "steps wrapper support is missing");
assert(route.includes("root.executable_actions"), "executable_actions wrapper support is missing");
assert(route.includes("root.executableActions"), "executableActions wrapper support is missing");

const plannerOperations = new Set(readStringSet(route, "MASTER_PLAN_OPERATIONS"));
const validatorOperations = readStringSet(validator, "KNOWN_OPERATIONS");
for (const operation of validatorOperations) {
  assert(plannerOperations.has(operation), `Master AI planner is missing validator operation: ${operation}`);
}
assert(route.includes("Those operations belong to the separate task workflow."), "capability answers must distinguish chat from task execution");
assert(route.includes("Never claim a store change succeeded unless the task workflow returns successful execution evidence."), "Master AI must not claim unverified store changes");

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
assert(executor.includes("function nonNegativeWholeNumber"), "Master AI must validate integer CMS fields before database writes");
assert(executor.includes('sortOrder: nonNegativeWholeNumber(payload.sortOrder, "sortOrder")'), "Master AI CMS sort orders must be validated before integer writes");
assert(executor.includes("Shipping fees must be non-negative whole numbers."), "Master AI shipping fees must match integer database columns");
assert(executor.includes('rawPatch.productCount = nonNegativeWholeNumber(rawPatch.productCount, "productCount")'), "homepage productCount must be validated before integer writes");
assert(executor.includes('focalX: percentageCoordinate(payload.focalX, "focalX")') && executor.includes('focalY: percentageCoordinate(payload.focalY, "focalY")'), "Master AI image focal coordinates must be normalized to valid integers");
assert(executor.includes("parentId must be a positive whole number."), "navigation parent IDs must be validated before integer writes");
assert(executor.includes("Homepage productIds contains a product id that does not exist."), "executor must reject unknown homepage product ids");
assert(executor.includes("homepage.reorder contains duplicate section ids."), "executor must reject duplicate homepage reorder ids");
assert(executor.includes("homepage.reorder must contain every current homepage section id exactly once."), "executor must enforce complete homepage reorder");
assert(executor.includes('throw new Error(id > 0 ? "Banner not found." : "Banner creation failed.")'), "executor must fail closed for missing banner updates");
assert(executor.includes('throw new Error(id > 0 ? "Trust badge not found." : "Trust badge creation failed.")'), "executor must fail closed for missing badge updates");
assert(executor.includes('throw new Error(id > 0 ? "Navigation item not found." : "Navigation item creation failed.")'), "executor must fail closed for missing navigation updates");

assert(aiProviders.includes("const perProviderTimeoutMs = 300_000;"), "All Master AI provider calls must allow five minutes per provider");
assert(aiProviders.includes('export type DirectProvider = "llmtech" | "xkiro";'), "Only the approved providers may remain");
assert(aiProviders.includes('const maxProviderCalls = 2;'), "Master AI must allow one fallback provider");
assert(aiProviders.includes('"xkiro:deepseek/deepseek-v4-flash"'), "Free DeepSeek V4 Flash must be available through xKiro");
assert(aiProviders.includes('text: ["xkiro:deepseek/deepseek-v4-flash", "llmtech:nvidia/Qwen3.8-27B-NVFP4"]'), "Master AI must prefer xKiro DeepSeek for text and retain LLM Tech as fallback");
assert(aiProviders.includes('vision: ["xkiro:sensenova/sensenova-6.8-flash-lite", "llmtech:nvidia/Qwen3.8-27B-NVFP4"]'), "Master AI must prefer xKiro vision and retain LLM Tech as fallback");
assert(aiProviders.includes('"sensenova/sensenova-6.8-flash-lite"'), "xKiro vision model must be registered");
assert(!aiProviders.includes("tokenharbor:") && !aiProviders.includes("openrouter:"), "Unapproved retired providers must not return");
assert(verifier.includes("const productExecutions = execution.filter"), "deterministic verification must match execution to each product");
assert(verifier.includes("Number.isInteger(item.index)"), "deterministic verification must use action indexes");
assert(executor.includes("const copy = await duplicateProduct(id);"), "Master AI must use the atomic shared product duplication helper");
assert(executor.includes("Array.isArray(productInput.images)"), "Master AI must accept images nested in the product object");
assert(executor.includes('case "media.edit":') && executor.includes("async function executeMediaEdit("), "Master AI media.edit must have a real executor");
assert(executor.includes('"media.edit",'), "Master AI media.edit must be confirmable as a protected operation");
assert(executor.includes("Media metadata updated."), "Master AI media.edit must report successful metadata updates");
assert(executor.includes("validateProduct({ ...productInput, images }"), "published product validation must use the actual image payload");
assert(verifier.includes("Array.isArray(nestedProduct.images)"), "verification must account for nested product images");
assert(masterProductWriter.includes('from "@/lib/product-write"'), "Master AI must share the admin product writers");
assert(!masterProductWriter.includes("export async function writeImages"), "duplicate image writer must be removed");
assert(!masterProductWriter.includes("export async function writeVariants"), "duplicate variant writer must be removed");
assert(storage.includes("isHttpUrl(d.secure_url)") && storage.includes("isHttpUrl(d.url)"), "cloud storage upload responses must be validated");
assert(storage.includes("Remote storage must return an HTTPS file URL in production"), "production media URLs must use HTTPS");
assert(mediaRoute.includes('"video/mp4"') && mediaRoute.includes('"video/webm"'), "product media upload must allow MP4/WebM");
assert(mediaLibrary.includes('preview.mimeType?.startsWith("video/")'), "media library must preview video assets");
assert(sharedProductWriter.includes("return db.transaction(async (tx) =>"), "product duplication must remain atomic");
assert(sharedProductWriter.includes("assertPublishableProductImage"), "publication must require a static image");
assert(executor.includes("await assertPublishableProductImage(tx, id)"), "Master AI publication must use the shared image check");
assert(rateLimit.includes('req.headers.get("cf-connecting-ip")'), "Cloudflare client IP must be used for trusted rate limiting");
assert(wrangler.includes('"RATE_LIMIT_TRUST_PROXY": "true"'), "Cloudflare must enable trusted proxy rate limiting");
assert(cms.includes("return db.transaction(async (tx) =>"), "homepage section ordering must be transactional");
assert(cms.includes("Homepage section order cannot contain duplicate ids."), "homepage section ordering must reject duplicate ids");
assert(!masterAiUi.includes("/.netlify/functions/master-ai-background"), "Cloudflare Master AI must not fall back to a Netlify-only endpoint");
assert(masterAiUi.includes("const maxPollAttempts = 180"), "Master AI UI polling must match the bounded planning budget");
assert(productApi.includes("assertPublishableProducts"), "all product publish paths must validate images and category");
assert(productQueries.includes('and(eq(products.status, "published"), eq(products.active, true))'), "inactive products must stay out of the public catalog");
assert(sharedProductWriter.includes('errors.push("Invalid product status")'), "product status values must be validated");
assert(sharedProductWriter.includes('throw new Error("Variant stock must be a non-negative whole number.")'), "variant stock must be validated before database writes");
assert(executor.includes("if (row.status === \"published\") await assertPublishableProductImage(tx, row.id);"), "Master AI create must enforce publication image requirements");
console.log("P2_MASTER_AI_EXECUTOR_HARDENING_CONTRACT_PASS");

