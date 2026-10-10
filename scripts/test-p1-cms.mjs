import { Client } from "pg";
import fs from "fs/promises";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: databaseUrl });
const suffix = `p1-cms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const products = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createProduct(name) {
  const [row] = (
    await client.query(
      `insert into products (name, slug, sku, category_slug, price, stock, track_inventory, allow_backorders, status, active)
       values ($1, $2, $3, 'skincare', 1000, 10, true, false, 'published', true)
       returning id`,
      [name, `${suffix}-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`, `${suffix}-${name}`],
    )
  ).rows;
  products.push(row.id);
  return row.id;
}

try {
  await client.connect();

  const firstId = await createProduct("P1 CMS First");
  const secondId = await createProduct("P1 CMS Second");
  await createProduct("P1 CMS Third");

  const source = await fs.readFile("src/lib/cms.ts", "utf8");
  assert(source.includes("inArray(productsT.id, uniqueIds)"), "cms.ts is not filtering productsByIds with inArray");

  const selected = (
    await client.query(
      "select id from products where id = any($1::int[]) order by id desc",
      [[firstId, secondId]],
    )
  ).rows.map((row) => Number(row.id));

  assert(selected.length === 2, `expected 2 selected products, got ${selected.length}`);
  assert(selected.every((id) => [firstId, secondId].includes(id)), `unexpected selected IDs: ${selected}`);

  const absent = (await client.query("select id from products where id = any($1::int[])", [[999999999]])).rows;
  assert(absent.length === 0, `unknown ID unexpectedly returned ${absent.length} rows`);

  const empty = [];
  assert(empty.length === 0, "empty ID list should return no products");

  console.log("P1_CMS_PRODUCTS_BY_IDS_REGRESSION_PASS");
} finally {
  if (client._connected) {
    if (products.length) {
      await client.query("delete from products where id = any($1::int[])", [products]).catch(() => {});
    }
    await client.end();
  }
}
