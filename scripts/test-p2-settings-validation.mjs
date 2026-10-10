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

async function postSettings(cookie, body) {
  const response = await fetch(baseUrl + "/api/admin/settings", {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  let data = {};
  try { data = await response.json(); } catch {}
  return { response, data };
}

const client = new Client({ connectionString: databaseUrl });
const keySuffix = "p2_validation_" + Date.now();

try {
  await client.connect();
  const cookie = await loginAdmin();

  const unknownSection = await postSettings(cookie, {
    section: "store",
    patch: { [keySuffix]: "must-not-persist" },
  });
  assert(unknownSection.response.status === 400, "unknown section field was accepted");

  const unknownTheme = await postSettings(cookie, {
    theme: { [keySuffix]: "must-not-persist" },
  });
  assert(unknownTheme.response.status === 400, "unknown theme field was accepted");

  const invalidType = await postSettings(cookie, {
    section: "announcement",
    patch: { active: "true" },
  });
  assert(invalidType.response.status === 400, "invalid boolean type was accepted");

  const invalidNumber = await postSettings(cookie, {
    section: "checkout",
    patch: { freeShippingThreshold: "not-a-number" },
  });
  assert(invalidNumber.response.status === 400, "invalid numeric value was accepted");

  const valid = await postSettings(cookie, {
    section: "checkout",
    patch: { freeShippingThreshold: 9100 },
  });
  assert(valid.response.ok, "valid settings update was rejected: " + valid.response.status);
  assert(valid.data?.value?.freeShippingThreshold === 9100, "valid numeric setting was not persisted");

  const stored = await client.query(
    "select value from store_settings where key = 'checkout'",
  );
  const value = stored.rows[0]?.value ?? {};
  assert(!Object.prototype.hasOwnProperty.call(value, keySuffix), "unknown section key leaked into database");
  
  console.log("P2_SETTINGS_VALIDATION_REGRESSION_PASS");
} finally {
  if (client._connected) await client.end();
}
