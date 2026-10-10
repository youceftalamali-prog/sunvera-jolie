import { Client } from "pg";

const baseUrl = process.env.P1_BASE_URL ?? "http://127.0.0.1:3000";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: databaseUrl });
const suffix = `p1-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const products = [];
const orders = [];

async function request(body) {
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { response, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createProduct(name, price, stock) {
  const [row] = (await client.query(
    `insert into products (name, slug, sku, category_slug, price, stock, track_inventory, allow_backorders, status, active)
     values ($1, $2, $3, 'skincare', $4, $5, true, false, 'published', true) returning id`,
    [name, `${suffix}-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`, `${suffix}-${name}`, price, stock],
  )).rows;
  products.push(row.id);
  return row.id;
}

async function createVariant(productId, label, price, stock) {
  const [row] = (await client.query(
    `insert into product_variants (product_id, label, sku, price, stock) values ($1, $2, $3, $4, $5) returning id`,
    [productId, label, `${suffix}-${label}`, price, stock],
  )).rows;
  return row.id;
}

async function order(body) {
  const result = await request({
    fullName: "P1 Regression",
    phone: "0551234567",
    wilaya: "Alger",
    wilayaCode: "16",
    commune: "Hydra",
    address: "P1 regression address",
    ...body,
  });
  if (result.data.order?.id) orders.push(result.data.order.id);
  return result;
}

try {
  await client.connect();
  const productId = await createProduct("P1 Variant Product", 1000, 20);
  const variantId = await createVariant(productId, "P1 Test Variant", 1500, 5);
  const otherProductId = await createProduct("P1 Other Product", 900, 20);
  const otherVariantId = await createVariant(otherProductId, "P1 Other Variant", 1700, 5);

  let result = await request({ quoteOnly: true, items: [{ productId, variantId, qty: 2 }] });
  assert(result.response.ok, `variant quote failed: ${JSON.stringify(result.data)}`);
  assert(result.data.quote?.subtotal === 3000, `expected variant subtotal 3000, got ${result.data.quote?.subtotal}`);

  result = await request({ quoteOnly: true, items: [{ productId, variantId: otherVariantId, qty: 1 }] });
  assert(result.response.status === 400, "variant ownership must fail");

  result = await request({ quoteOnly: true, items: [{ productId, variantId: 999999999, qty: 1 }] });
  assert(result.response.status === 400, "invalid variant must fail");

  result = await order({ items: [{ productId, variantId, qty: 6 }] });
  assert(result.response.status === 400, "insufficient variant stock must fail");
  let stock = (await client.query("select stock from product_variants where id = $1", [variantId])).rows[0].stock;
  assert(stock === 5, `failed order changed variant stock to ${stock}`);

  result = await order({ items: [{ productId, variantId, qty: 5, price: 1 }] });
  assert(result.response.ok, `exact variant stock order failed: ${JSON.stringify(result.data)}`);
  stock = (await client.query("select stock from product_variants where id = $1", [variantId])).rows[0].stock;
  const parentStock = (await client.query("select stock from products where id = $1", [productId])).rows[0].stock;
  assert(stock === 0, `expected variant stock 0, got ${stock}`);
  assert(parentStock === 20, `parent stock changed to ${parentStock}`);
  const item = (await client.query("select variant, unit_price, quantity from order_items where order_id = $1", [result.data.order.id])).rows[0];
  assert(item.variant === "P1 Test Variant", `wrong stored variant: ${item.variant}`);
  assert(item.unit_price === 1500 && item.quantity === 5, "order item did not use server variant values");
  assert(result.data.order.subtotal === 7500, `order subtotal mismatch: ${result.data.order.subtotal}`);
  assert(result.data.order.total === result.data.order.subtotal + result.data.order.shipping, "order total mismatch");

  const nonVariantProduct = await createProduct("P1 Non Variant", 1000, 4);
  result = await order({ items: [{ productId: nonVariantProduct, qty: 2 }] });
  assert(result.response.ok, `non-variant order failed: ${JSON.stringify(result.data)}`);
  const nonVariantStock = (await client.query("select stock from products where id = $1", [nonVariantProduct])).rows[0].stock;
  assert(nonVariantStock === 2, `non-variant stock expected 2, got ${nonVariantStock}`);

  const concurrentProduct = await createProduct("P1 Concurrent", 1000, 20);
  const concurrentVariant = await createVariant(concurrentProduct, "P1 Concurrent Variant", 1500, 3);
  const concurrent = await Promise.all([
    order({ items: [{ productId: concurrentProduct, variantId: concurrentVariant, qty: 3 }] }),
    order({ items: [{ productId: concurrentProduct, variantId: concurrentVariant, qty: 3 }] }),
  ]);
  assert(concurrent.filter((x) => x.response.ok).length === 1, "concurrent variant orders oversold or both failed");
  const finalConcurrentStock = (await client.query("select stock from product_variants where id = $1", [concurrentVariant])).rows[0].stock;
  assert(finalConcurrentStock === 0, `concurrent variant stock expected 0, got ${finalConcurrentStock}`);

  console.log("P1_VARIANT_REGRESSION_PASS");
} finally {
  if (client._connected) {
    if (orders.length) await client.query("delete from orders where id = any($1::int[])", [orders]);
    if (products.length) await client.query("delete from products where id = any($1::int[])", [products]);
    await client.end();
  }
}
