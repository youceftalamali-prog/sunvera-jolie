import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: databaseUrl });
const suffix = `p1-sku-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const products = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createProduct(name, sku) {
  const [row] = (
    await client.query(
      `insert into products (name, slug, sku, category_slug, price, stock, track_inventory, allow_backorders, status, active)
       values ($1, $2, $3, 'skincare', 1000, 10, true, false, 'published', true) returning id`,
      [name, `${suffix}-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`, sku],
    )
  ).rows;
  products.push(row.id);
  return row.id;
}

async function duplicateProductSku(sku) {
  try {
    await createProduct("P1 Duplicate SKU", sku);
    return null;
  } catch (e) {
    return e;
  }
}

async function duplicateVariant(productId, sku) {
  try {
    await client.query(
      `insert into product_variants (product_id, label, sku, price, stock)
       values ($1, 'Duplicate Variant', $2, 1200, 5)`,
      [productId, sku],
    );
    return null;
  } catch (e) {
    return e;
  }
}

try {
  await client.connect();

  const productA = await createProduct("P1 SKU A", `${suffix}-MAIN`);
  const productB = await createProduct("P1 SKU B", `${suffix}-SECOND`);

  let error = await duplicateProductSku(`${suffix}-main`);
  assert(error?.code === "23505", `case-insensitive duplicate product SKU was not rejected: ${error?.code ?? "no error"}`);

  const [variantA] = (
    await client.query(
      `insert into product_variants (product_id, label, sku, price, stock)
       values ($1, 'P1 Variant A', $2, 1100, 5) returning id`,
      [productA, `${suffix}-VAR`],
    )
  ).rows;
  assert(variantA?.id, "failed to create baseline variant");

  error = await duplicateVariant(productB, `${suffix}-var`);
  assert(error?.code === "23505", `case-insensitive duplicate variant SKU was not rejected: ${error?.code ?? "no error"}`);

  await client.query(
    `insert into product_variants (product_id, label, sku, price, stock)
     values ($1, 'P1 Empty SKU Variant', '', 900, 5)`,
    [productB],
  );
  await client.query(
    `insert into product_variants (product_id, label, sku, price, stock)
     values ($1, 'P1 Second Empty SKU Variant', '', 950, 5)`,
    [productB],
  );

  console.log("P1_SKU_REGRESSION_PASS");
} finally {
  if (client._connected) {
    if (products.length) {
      await client.query("delete from products where id = any($1::int[])", [products]).catch(() => {});
    }
    await client.end();
  }
}
