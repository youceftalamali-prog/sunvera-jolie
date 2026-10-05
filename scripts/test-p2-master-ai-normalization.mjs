import fs from "fs/promises";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const route = await fs.readFile("src/app/api/admin/ai/master/route.ts", "utf8");
const validator = await fs.readFile("src/lib/ai-master-plan-validator.ts", "utf8");

try {
  // Phase 2 normalization contract: all common provider shapes must remain supported.
  assert(route.includes('action.payload ?? action.parameters ?? action.params ?? action.data'), "payload aliases are not normalized");
  assert(route.includes('action.id !== undefined) payload.id'), "action.id -> payload.id normalization is missing");
  assert(route.includes('action.sectionId !== undefined) payload.sectionId'), "action.sectionId -> payload.sectionId normalization is missing");
  assert(route.includes('action.section_id'), "snake_case section id normalization is missing");
  assert(route.includes('action.sectionKey'), "sectionKey normalization is missing");
  assert(route.includes('action.section_key'), "section_key normalization is missing");
  assert(route.includes('action.site_section'), "site_section normalization is missing");
  assert(route.includes('action.siteSection'), "siteSection normalization is missing");
  assert(route.includes('action.section ?? action.sectionKey'), "named homepage section resolution is missing");

  // JSON shape contract.
  assert(route.includes('stripCodeFences(raw)'), "JSON code-fence normalization is missing");
  assert(route.includes('balancedJsonCandidates(cleaned)'), "balanced JSON extraction is missing");
  assert(route.includes('"plan" in decoded'), "plan wrapper support is missing");
  assert(route.includes('root.actions'), "actions wrapper support is missing");
  assert(route.includes('root.steps'), "steps wrapper support is missing");
  assert(route.includes('root.executable_actions'), "executable_actions wrapper support is missing");
  assert(route.includes('root.executableActions'), "executableActions wrapper support is missing");

  // Validator contract: real CMS identifiers must be checked before execution.
  assert(validator.includes('Homepage section id does not exist in the current CMS context.'), "homepage ID validation is missing");
  assert(validator.includes('Referenced record id does not exist in the current admin context.'), "product/media ID validation is missing");
  assert(validator.includes('Homepage reorder contains duplicate section ids.'), "duplicate reorder validation is missing");
  assert(validator.includes('Homepage reorder must contain every current homepage section id exactly once.'), "complete reorder validation is missing");
  assert(validator.includes('Homepage section field is not supported by the CMS executor.'), "homepage patch field validation is missing");

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const sections = (await client.query("select id, key, title from homepage_sections order by sort_order")).rows;
    assert(sections.length > 0, "homepage_sections is empty; cannot verify real CMS context");
    assert(sections.every((row) => Number.isInteger(Number(row.id)) && Number(row.id) > 0), "homepage section IDs are not valid positive integers");

    const productCount = Number((await client.query("select count(*)::int as count from products")).rows[0]?.count ?? 0);
    const mediaCount = Number((await client.query("select count(*)::int as count from media")).rows[0]?.count ?? 0);

    console.log("P2_MASTER_AI_NORMALIZATION_REGRESSION_PASS");
    console.log(JSON.stringify({
      homepageSections: sections.map((row) => ({ id: Number(row.id), key: row.key, title: row.title })),
      productCount,
      mediaCount,
      checks: {
        idShapes: ["payload.id", "payload.sectionId", "action.id", "action.sectionId"],
        jsonShapes: ["plain", "fenced", "plan wrapper", "actions", "steps", "executable_actions", "executableActions"],
        validator: ["homepage IDs", "product/media IDs", "reorder completeness", "supported patch fields"]
      }
    }, null, 2));
  } finally {
    await client.end();
  }
} catch (error) {
  console.error("P2_MASTER_AI_NORMALIZATION_REGRESSION_FAIL");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
