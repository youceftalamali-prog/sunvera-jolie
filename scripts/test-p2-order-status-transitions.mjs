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

async function changeStatus(cookie, id, status) {
  const response = await fetch(baseUrl + "/api/admin/orders", {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ id, status }),
  });
  let data = {};
  try { data = await response.json(); } catch {}
  return { response, data };
}

const client = new Client({ connectionString: databaseUrl });
const suffix = "p2-status-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
let orderId;

try {
  await client.connect();

  const result = await client.query(
    "insert into orders (reference, full_name, phone, wilaya, subtotal, shipping, discount, total, status) " +
      "values ($1, 'P2 Status Fixture', '0550000000', 'Algiers', 1000, 100, 0, 1100, 'pending') returning id",
    [suffix + "-order"],
  );
  orderId = result.rows[0]?.id;
  assert(orderId, "fixture order was not created");

  const cookie = await loginAdmin();

  const invalidJump = await changeStatus(cookie, orderId, "delivered");
  assert(invalidJump.response.status === 409, "pending -> delivered should be rejected");
  assert(invalidJump.data?.from === "pending", "invalid transition response should include current status");
  assert(invalidJump.data?.to === "delivered", "invalid transition response should include requested status");

  for (const status of ["confirmed", "processing", "shipped", "out_for_delivery", "delivered", "returned"]) {
    const result = await changeStatus(cookie, orderId, status);
    assert(result.response.ok, "valid transition to " + status + " was rejected: " + result.response.status);
    assert(result.data?.order?.status === status, "order did not persist status " + status);
  }

  const closed = await changeStatus(cookie, orderId, "processing");
  assert(closed.response.status === 409, "returned -> processing should be rejected");

  const invalidStatus = await changeStatus(cookie, orderId, "unknown-status");
  assert(invalidStatus.response.status === 400, "unknown status should be rejected as invalid");

  const dbRow = await client.query("select status from orders where id = $1", [orderId]);
  assert(dbRow.rows[0]?.status === "returned", "final order status was not returned");

  console.log("P2_ORDER_STATUS_TRANSITIONS_REGRESSION_PASS");
} finally {
  if (client._connected) {
    if (orderId) await client.query("delete from orders where id = $1", [orderId]).catch(() => {});
    await client.end();
  }
}
