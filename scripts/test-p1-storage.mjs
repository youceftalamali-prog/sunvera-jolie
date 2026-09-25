import { Client } from "pg";

const baseUrl = process.env.P1_BASE_URL ?? "http://127.0.0.1:3000";
const databaseUrl = process.env.DATABASE_URL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!adminPassword) throw new Error("ADMIN_PASSWORD is required");

const client = new Client({ connectionString: databaseUrl });
const filename = `p1-storage-production-${Date.now()}.png`;
const pngBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function login() {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: adminPassword }),
  });
  const data = await response.json().catch(() => ({}));
  assert(response.ok, `admin login failed: ${JSON.stringify(data)}`);
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/svj_admin=[^;]+/);
  assert(match, "admin session cookie was not returned");
  return match[0];
}

async function getMedia(cookie) {
  const response = await fetch(`${baseUrl}/api/admin/media?q=${encodeURIComponent(filename)}`, {
    headers: { cookie },
  });
  const data = await response.json();
  return { response, data };
}

try {
  await client.connect();
  const cookie = await login();

  const form = new FormData();
  form.append("folder", "other");
  form.append("files", new File([pngBytes], filename, { type: "image/png" }));

  const upload = await fetch(`${baseUrl}/api/admin/media`, {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  const uploadText = await upload.text();
  const uploadData = uploadText ? JSON.parse(uploadText) : {};

  assert(upload.status === 400, `production local upload should be blocked, got ${upload.status}: ${uploadText}`);
  assert(uploadData.storage?.mode === "local", `expected local storage mode in CI, got ${uploadData.storage?.mode}`);
  assert(
    String(uploadData.storage?.warning ?? "").includes("NOT PRODUCTION-READY"),
    "production storage warning was not returned",
  );
  assert(
    String(uploadData.error ?? "").toLowerCase().includes("production storage is not configured"),
    `unexpected storage error: ${uploadData.error}`,
  );

  const existingRows = Number(
    (await client.query("select count(*)::int as n from media where filename = $1", [filename])).rows[0].n,
  );
  assert(existingRows === 0, `blocked production upload created ${existingRows} media row(s)`);

  const listing = await getMedia(cookie);
  assert(listing.response.ok, `media listing failed: ${JSON.stringify(listing.data)}`);
  assert(
    !(listing.data.media ?? []).some((row) => row.filename === filename),
    "blocked production upload appeared in the media library",
  );

  console.log("P1_STORAGE_REGRESSION_PASS");
} finally {
  if (client._connected) await client.end();
}
