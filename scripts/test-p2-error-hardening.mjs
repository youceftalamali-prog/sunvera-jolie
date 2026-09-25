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
  const response = await fetch(baseUrl + "/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: adminPassword }),
  });
  assert(response.ok, "admin login failed: " + response.status);
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/svj_admin=[^;]+/);
  assert(match, "admin login did not return svj_admin cookie");
  return match[0];
}

const repoRoutes = [
  "src/app/api/admin/products/route.ts",
  "src/app/api/admin/media/route.ts",
  "src/app/api/orders/route.ts",
];
for (const path of repoRoutes) {
  const source = await readFile(path, "utf8");
  assert(!source.includes("(e as Error).message"), path + " still exposes raw exception text");
}

const client = new Client({ connectionString: databaseUrl });
const suffix = "p2-errors-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
let firstId;
let secondId;

try {
  await client.connect();
  const first = await client.query(
    "insert into products (name, slug, sku, category_slug, price, stock, track_inventory, allow_backorders, status, active) " +
      "values ($1, $2, $3, 'skincare', 1000, 10, true, false, 'published', true) returning id",
    [suffix + " First", suffix + "-same-slug", suffix + "-SKU-1"],
  );
  firstId = first.rows[0]?.id;
  assert(firstId, "fixture product was not created");

  const cookie = await loginAdmin();
  const response = await fetch(baseUrl + "/api/admin/products", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      name: suffix + " Second",
      slug: suffix + "-same-slug",
      sku: suffix + "-SKU-2",
      categorySlug: "skincare",
      price: 1000,
      comparePrice: 0,
      costPrice: 0,
      stock: 10,
      lowStockThreshold: 2,
      trackInventory: true,
      allowBackorders: false,
      status: "draft",
    }),
  });
  const data = await response.json();
  assert(response.status === 409, "duplicate slug should return HTTP 409");
  assert(typeof data.error === "string", "error response should include a public error message");
  assert(!String(data.error).includes("duplicate key"), "database duplicate-key details leaked");
  assert(!String(data.error).includes("constraint"), "database constraint details leaked");
  assert(!String(data.error).includes("products_slug_key"), "database constraint name leaked");
  assert(data.error === "A product with this slug already exists.", "unexpected public duplicate-slug message");

  const created = await client.query(
    "select id from products where slug = $1 and id <> $2",
    [suffix + "-same-slug", firstId],
  );
  secondId = created.rows[0]?.id ?? null;
  assert(secondId === null, "duplicate product should not have been created");

  console.log("P2_ERROR_MESSAGE_HARDENING_REGRESSION_PASS");
} finally {
  if (client._connected) {
    const ids = [firstId, secondId].filter(Boolean);
    if (ids.length) await client.query("delete from products where id = any($1::int[])", [ids]).catch(() => {});
    await client.end();
  }
}
