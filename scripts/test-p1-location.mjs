import { Client } from "pg";

const baseUrl = process.env.P1_BASE_URL ?? "http://127.0.0.1:3000";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: databaseUrl });
const suffix = `p1-location-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const products = [];
const orders = [];
let originalWilayaActive = null;
let originalCommuneActive = null;
let communeId = null;

async function request(body) {
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { response, data };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createProduct(name, price, stock) {
  const [row] = (
    await client.query(
      `insert into products (name, slug, sku, category_slug, price, stock, track_inventory, allow_backorders, status, active)
       values ($1, $2, $3, 'skincare', $4, $5, true, false, 'published', true) returning id`,
      [name, `${suffix}-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`, `${suffix}-${name}`, price, stock],
    )
  ).rows;
  products.push(row.id);
  return row.id;
}

function validOrderBody(productId, overrides = {}) {
  return {
    fullName: "P1 Location Regression",
    phone: "0551234567",
    wilayaCode: "16",
    wilaya: "Alger",
    commune: "Hydra",
    address: "P1 location regression address",
    items: [{ productId, qty: 1 }],
    ...overrides,
  };
}

try {
  await client.connect();

  const productId = await createProduct("P1 Location Product", 1000, 20);

  const wilayaRow = (
    await client.query("select id, active from wilayas where code = '16'")
  ).rows[0];
  assert(wilayaRow, "seeded wilaya 16 is missing");
  originalWilayaActive = wilayaRow.active;

  const communeRow = (
    await client.query(
      "select id, active from communes where wilaya_code = '16' and name_fr = 'Hydra' limit 1",
    )
  ).rows[0];
  assert(communeRow, "seeded Hydra commune is missing");
  communeId = communeRow.id;
  originalCommuneActive = communeRow.active;

  let result = await request({
    quoteOnly: true,
    items: [{ productId, qty: 1 }],
    wilayaCode: "16",
    wilaya: "Alger",
  });
  assert(result.response.ok, `valid wilaya quote failed: ${JSON.stringify(result.data)}`);
  assert(result.data.quote?.shipping === 400, `expected Alger shipping 400, got ${result.data.quote?.shipping}`);

  result = await request({
    quoteOnly: true,
    items: [{ productId, qty: 1 }],
    wilayaCode: "99",
    wilaya: "Unknown",
  });
  assert(result.response.status === 400, "invalid wilaya must fail instead of falling back to default shipping");

  result = await request({
    quoteOnly: true,
    items: [{ productId, qty: 1 }],
    wilayaCode: "16",
    wilaya: "Oran",
  });
  assert(result.response.status === 400, "wilaya code/name mismatch must fail");

  await client.query("update wilayas set active = false where code = '16'");
  result = await request({
    quoteOnly: true,
    items: [{ productId, qty: 1 }],
    wilayaCode: "16",
    wilaya: "Alger",
  });
  assert(result.response.status === 400, "inactive wilaya must fail");
  await client.query("update wilayas set active = $1 where code = '16'", [originalWilayaActive]);

  result = await request(validOrderBody(productId, { commune: "Oran" }));
  assert(result.response.status === 400, "commune from another wilaya must fail");

  result = await request(validOrderBody(productId, { commune: "Not A Commune" }));
  assert(result.response.status === 400, "unknown commune must fail");

  result = await request(validOrderBody(productId, { commune: "" }));
  assert(result.response.status === 400, "missing commune must fail");

  await client.query("update communes set active = false where id = $1", [communeId]);
  result = await request(validOrderBody(productId, { commune: "Hydra" }));
  assert(result.response.status === 400, "inactive commune must fail");
  await client.query("update communes set active = $1 where id = $2", [originalCommuneActive, communeId]);

  result = await request(validOrderBody(productId, { commune: "Hydra" }));
  assert(result.response.ok, `valid wilaya+commune order failed: ${JSON.stringify(result.data)}`);
  assert(result.data.order?.wilaya === "Alger", `unexpected stored wilaya: ${result.data.order?.wilaya}`);
  assert(result.data.order?.commune === "Hydra", `unexpected stored commune: ${result.data.order?.commune}`);
  assert(result.data.order?.shipping === 400, `expected stored shipping 400, got ${result.data.order?.shipping}`);
  orders.push(result.data.order.id);

  console.log("P1_LOCATION_REGRESSION_PASS");
} finally {
  if (communeId !== null) {
    await client.query("update communes set active = $1 where id = $2", [originalCommuneActive ?? true, communeId]).catch(() => {});
  }
  if (originalWilayaActive !== null) {
    await client.query("update wilayas set active = $1 where code = '16'", [originalWilayaActive]).catch(() => {});
  }
  if (client._connected) {
    if (orders.length) {
      await client.query("delete from orders where id = any($1::int[])", [orders]).catch(() => {});
    }
    if (products.length) {
      await client.query("delete from products where id = any($1::int[])", [products]).catch(() => {});
    }
    await client.end();
  }
}
