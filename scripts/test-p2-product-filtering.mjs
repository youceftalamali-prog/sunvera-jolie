import { readFile } from "node:fs/promises";
import { Client } from "pg";

const baseUrl = process.env.P2_BASE_URL ?? "http://127.0.0.1:3000";
const databaseUrl = process.env.DATABASE_URL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!adminPassword) throw new Error("ADMIN_PASSWORD is required");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loginAdmin() {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: adminPassword }),
  });
  assert(response.ok, `admin login failed: ${response.status}`);
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/svj_admin=[^;]+/);
  assert(match, "admin login did not return svj_admin cookie");
  return match[0];
}

async function search(cookie, query) {
  const response = await fetch(
    `${baseUrl}/api/admin/products?q=${encodeURIComponent(query)}`,
    { headers: { cookie } },
  );
  const data = await response.json();
  assert(response.ok, `product search failed for "${query}": ${response.status}`);
  return data.products ?? [];
}

const routeSource = await readFile("src/app/api/admin/products/route.ts", "utf8");
assert(routeSource.includes("ilike(products.name"), "P2-1 implementation must use database ILIKE filtering");
assert(routeSource.includes("ilike(products.sku"), "P2-1 implementation must search SKU in the database");
assert(routeSource.includes("ilike(products.categorySlug"), "P2-1 implementation must search category in the database");
assert(routeSource.includes("ilike(products.brand"), "P2-1 implementation must search brand in the database");
assert(!routeSource.includes(".filter((r)"), "P2-1 must not load all products and filter them in JavaScript");

const client = new Client({ connectionString: databaseUrl });
const suffix = `p2-filter-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const productIds = [];

async function createProduct(values) {
  const [row] = (
    await client.query(
      `insert into products
        (name, slug, sku, brand, category_slug, price, stock, track_inventory, allow_backorders, status, active)
       values ($1, $2, $3, $4, $5, 1000, 10, true, false, 'published', true)
       returning id`,
      [
        values.name,
        `${suffix}-${values.name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
        values.sku,
        values.brand,
        values.category,
      ],
    )
  ).rows;
  productIds.push(row.id);
  return row.id;
}

try {
  await client.connect();

  const byName = await createProduct({
    name: `${suffix} Vitamin C Serum`,
    sku: `${suffix}-NAME`,
    brand: "SunVera Jolie",
    category: "skincare",
  });
  const bySku = await createProduct({
    name: `${suffix} Hyaluronic Serum`,
    sku: `${suffix}-SKU-MARKER`,
    brand: "SunVera Jolie",
    category: "skincare",
  });
  const byCategory = await createProduct({
    name: `${suffix} Cleanser`,
    sku: `${suffix}-CATEGORY`,
    brand: "SunVera Jolie",
    category: `${suffix}-category-marker`,
  });
  const byBrand = await createProduct({
    name: `${suffix} Toner`,
    sku: `${suffix}-BRAND`,
    brand: `${suffix} Brand Marker`,
    category: "skincare",
  });
  const unrelated = await createProduct({
    name: `${suffix} Unrelated`,
    sku: `${suffix}-UNRELATED`,
    brand: "SunVera Jolie",
    category: "haircare",
  });

  const cookie = await loginAdmin();

  for (const [query, expectedId] of [
    [`${suffix} vitamin`, byName],
    [`${suffix}-sku-marker`, bySku],
    [`${suffix}-category-marker`, byCategory],
    [`${suffix} brand marker`, byBrand],
  ]) {
    const rows = await search(cookie, query);
    assert(rows.some((row) => row.id === expectedId), `search "${query}" did not return expected product`);
    assert(!rows.some((row) => row.id === unrelated), `search "${query}" returned unrelated product`);
    assert(rows.length === 1, `search "${query}" returned unexpected rows: ${rows.map((row) => row.id).join(", ")}`);
  }

  const noMatch = await search(cookie, `${suffix}-no-such-product`);
  assert(noMatch.length === 0, `non-matching search returned products: ${noMatch.map((row) => row.id).join(", ")}`);

  const emptyQuery = await search(cookie, `${suffix} unavailable`);
  assert(emptyQuery.length === 0, "unexpected empty-query fixture match");

  console.log("P2_PRODUCT_FILTERING_REGRESSION_PASS");
} finally {
  if (client._connected) {
    if (productIds.length) {
      await client.query("delete from products where id = any($1::int[])", [productIds]).catch(() => {});
    }
    await client.end();
  }
}
