import fs from "fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const homepage = await fs.readFile("src/app/page.tsx", "utf8");
const cms = await fs.readFile("src/lib/cms.ts", "utf8");
const categoryImage = await fs.readFile("src/components/CategoryCardImage.tsx", "utf8");
const layout = await fs.readFile("src/app/layout.tsx", "utf8");
const header = await fs.readFile("src/components/Header.tsx", "utf8");
const mobileNav = await fs.readFile("src/components/MobileNav.tsx", "utf8");

// Public reads must not seed or reorder CMS sections.
assert(cms.includes("export async function getSections"), "getSections must be exported");
assert(!/export async function getSections[\s\S]{0,200}ensureCollectionsSection\(\)/.test(cms), "getSections must not call ensureCollectionsSection");
assert(cms.includes("export async function ensureCollectionsSection"), "ensureCollectionsSection remains available for explicit seed paths");

// Homepage must render every enabled section, not an allowlist subset.
assert(homepage.includes("const displaySections = sections"), "homepage must assign displaySections = sections");
assert(!homepage.includes("publicSectionKeys"), "homepage must not filter with publicSectionKeys");
assert(!homepage.includes("STOREFRONT_SECTION_KEYS"), "homepage must not filter with STOREFRONT_SECTION_KEYS");
assert(!homepage.includes("requestedOrder"), "homepage must not hard-code a presentation order that overrides CMS sortOrder");
assert(!homepage.includes("defaultCmsOrder"), "homepage must not hard-code defaultCmsOrder presentation overrides");
assert(homepage.includes("a.sortOrder - b.sortOrder"), "homepage must sort by CMS sortOrder");

const requiredCases = [
  "hero",
  "trust_badges",
  "categories",
  "best_sellers",
  "promo_banner",
  "collections",
  "new_arrivals",
  "routine",
  "skincare",
  "hair_care",
  "testimonials",
  "newsletter",
  "about",
  "featured",
];
for (const key of requiredCases) {
  assert(homepage.includes(`case "${key}":`), `homepage switch must handle section key: ${key}`);
}

// Category images: correct field + name preserved when image missing.
assert(homepage.includes("CategoryCardImage"), "homepage must use CategoryCardImage");
assert(homepage.includes("src={c.imageUrl}"), "category cards must pass imageUrl");
assert(homepage.includes("fallbackIcon={c.image}"), "category cards must pass icon fallback");
assert(homepage.includes("{c.name}"), "category name must remain visible");
assert(categoryImage.includes("onError={() => setFailed(true)}"), "CategoryCardImage must fall back on load error");
assert(categoryImage.includes("fallbackIcon || \"✦\""), "CategoryCardImage must show fallback icon when image is missing");

// Navigation chrome must remain wired in the storefront layout.
assert(layout.includes("<Header"), "layout must render Header");
assert(layout.includes("<MobileNav"), "layout must render MobileNav");
assert(layout.includes("<Footer"), "layout must render Footer");
assert(header.includes("aria-label=\"Main\""), "Header must expose main navigation");
assert(mobileNav.includes("Mobile quick navigation"), "MobileNav bottom bar must remain");

console.log("P2_HOMEPAGE_CMS_SECTION_RENDERING_CONTRACT_PASS");
