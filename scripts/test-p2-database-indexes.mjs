import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const expected = [
  ["products", "products_category_idx"],
  ["products", "products_status_idx"],
  ["products", "products_status_category_idx"],
  ["products", "products_status_routine_idx"],
  ["product_images", "product_images_product_idx"],
  ["product_images", "product_images_media_idx"],
  ["banners", "banners_active_schedule_idx"],
];

const client = new Client({ connectionString: databaseUrl });

try {
  await client.connect();

  const result = await client.query(
    "select tablename, indexname from pg_indexes where schemaname = current_schema()",
  );
  const indexes = new Set(result.rows.map((row) => row.tablename + ":" + row.indexname));

  for (const [table, index] of expected) {
    assert(indexes.has(table + ":" + index), "missing expected index " + index + " on " + table);
  }

  const uniqueNames = new Set(expected.map(([, index]) => index));
  assert(uniqueNames.size === expected.length, "expected index names must be unique");

  console.log("P2_DATABASE_INDEXES_REGRESSION_PASS");
} finally {
  if (client._connected) await client.end();
}
