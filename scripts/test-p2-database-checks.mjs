import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectCheckViolation(client, label, fn) {
  try {
    await fn();
  } catch (e) {
    assert(e?.code === "23514", label + ": expected CHECK violation 23514, got " + (e?.code ?? "no code"));
    return;
  }
  throw new Error(label + ": negative/invalid value was accepted by the database");
}

const client = new Client({ connectionString: databaseUrl });
const suffix = "p2-checks-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
let productId;
let orderId;

try {
  await client.connect();

  const productResult = await client.query(
    "insert into products (name, slug, sku, category_slug, price, compare_price, cost_price, stock, low_stock_threshold, track_inventory, allow_backorders, status, active) " +
      "values ($1, $2, $3, 'skincare', 1000, 1200, 500, 10, 2, true, false, 'published', true) returning id",
    [suffix + " Product", suffix + "-product", suffix + "-sku"],
  );
  productId = productResult.rows[0]?.id;
  assert(productId, "fixture product was not created");

  await expectCheckViolation(client, "products.price", () =>
    client.query("update products set price = -1 where id = $1", [productId]),
  );
  await expectCheckViolation(client, "products.compare_price", () =>
    client.query("update products set compare_price = -1 where id = $1", [productId]),
  );
  await expectCheckViolation(client, "products.cost_price", () =>
    client.query("update products set cost_price = -1 where id = $1", [productId]),
  );
  await expectCheckViolation(client, "products.stock", () =>
    client.query("update products set stock = -1 where id = $1", [productId]),
  );
  await expectCheckViolation(client, "products.low_stock_threshold", () =>
    client.query("update products set low_stock_threshold = -1 where id = $1", [productId]),
  );

  await client.query(
    "insert into product_variants (product_id, label, sku, price, compare_price, stock) values ($1, 'Valid Variant', $2, 1200, 1400, 4)",
    [productId, suffix + "-variant"],
  );
  const variantId = (await client.query("select max(id) as id from product_variants where product_id = $1", [productId])).rows[0].id;

  await expectCheckViolation(client, "product_variants.price", () =>
    client.query("update product_variants set price = -1 where id = $1", [variantId]),
  );
  await expectCheckViolation(client, "product_variants.compare_price", () =>
    client.query("update product_variants set compare_price = -1 where id = $1", [variantId]),
  );
  await expectCheckViolation(client, "product_variants.stock", () =>
    client.query("update product_variants set stock = -1 where id = $1", [variantId]),
  );

  const orderResult = await client.query(
    "insert into orders (reference, full_name, phone, wilaya, subtotal, shipping, discount, total, status) " +
      "values ($1, 'P2 Check Fixture', '0550000000', 'Algiers', 1000, 100, 0, 1100, 'pending') returning id",
    [suffix + "-order"],
  );
  orderId = orderResult.rows[0]?.id;
  assert(orderId, "fixture order was not created");

  await expectCheckViolation(client, "orders.subtotal", () =>
    client.query("update orders set subtotal = -1 where id = $1", [orderId]),
  );
  await expectCheckViolation(client, "orders.shipping", () =>
    client.query("update orders set shipping = -1 where id = $1", [orderId]),
  );
  await expectCheckViolation(client, "orders.discount", () =>
    client.query("update orders set discount = -1 where id = $1", [orderId]),
  );
  await expectCheckViolation(client, "orders.total", () =>
    client.query("update orders set total = -1 where id = $1", [orderId]),
  );

  await expectCheckViolation(client, "order_items.unit_price", () =>
    client.query(
      "insert into order_items (order_id, product_id, name, unit_price, quantity) values ($1, $2, 'Invalid Price Item', -1, 1)",
      [orderId, productId],
    ),
  );
  await expectCheckViolation(client, "order_items.quantity", () =>
    client.query(
      "insert into order_items (order_id, product_id, name, unit_price, quantity) values ($1, $2, 'Invalid Quantity Item', 100, 0)",
      [orderId, productId],
    ),
  );

  await client.query(
    "insert into order_items (order_id, product_id, name, unit_price, quantity) values ($1, $2, 'Valid Item', 100, 1)",
    [orderId, productId],
  );

  const verify = await client.query(
    "select p.price, p.stock, o.subtotal, o.total, oi.unit_price, oi.quantity " +
      "from products p cross join orders o join order_items oi on oi.order_id = o.id " +
      "where p.id = $1 and o.id = $2 and oi.name = 'Valid Item'",
    [productId, orderId],
  );
  assert(verify.rows[0]?.price === 1000, "valid product price was not preserved");
  assert(verify.rows[0]?.stock === 10, "valid product stock was not preserved");
  assert(verify.rows[0]?.subtotal === 1000, "valid order subtotal was not preserved");
  assert(verify.rows[0]?.total === 1100, "valid order total was not preserved");
  assert(verify.rows[0]?.unit_price === 100, "valid item unit price was not preserved");
  assert(verify.rows[0]?.quantity === 1, "valid item quantity was not preserved");

  console.log("P2_DATABASE_CHECKS_REGRESSION_PASS");
} finally {
  if (client._connected) {
    if (orderId) await client.query("delete from orders where id = $1", [orderId]).catch(() => {});
    if (productId) await client.query("delete from products where id = $1", [productId]).catch(() => {});
    await client.end();
  }
}
