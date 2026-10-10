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
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: adminPassword }),
  });
  assert(response.ok, `admin login failed: ${response.status}`);
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/svj_admin=[^;]+/);
  assert(match, "admin login did not return svj_admin cookie");
  return match[0];
}

async function getMedia(cookie, params) {
  const query = new URLSearchParams(params);
  const response = await fetch(`${baseUrl}/api/admin/media?${query}`, {
    headers: { cookie },
  });
  const data = await response.json();
  assert(response.ok, `media request failed: ${response.status}`);
  return data;
}

const routeSource = await readFile("src/app/api/admin/media/route.ts", "utf8");
assert(routeSource.includes("limit(pageSize + 1)"), "P2-3 must use a page-sized database query");
assert(routeSource.includes(".offset(offset)"), "P2-3 must use SQL offset pagination");
assert(!routeSource.includes(".limit(200)"), "P2-3 must remove the fixed 200-row media limit");

const client = new Client({ connectionString: databaseUrl });
const suffix = `p2-media-page-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let mediaIds = [];

try {
  await client.connect();

  const values = Array.from({ length: 105 }, (_, i) => [
    `${suffix}-${String(i).padStart(3, "0")}.jpg`,
    `${suffix} fixture ${i}`,
  ]);
  const placeholders = values.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}, 'fixture://', 'other', 'image/jpeg', 1000, 100, 100)`).join(", ");
  const params = values.flat();

  const result = await client.query(
    `insert into media (filename, alt, url, folder, mime_type, size, width, height)
     values ${placeholders}
     returning id`,
    params,
  );
  mediaIds = result.rows.map((row) => row.id);
  assert(mediaIds.length === 105, `expected 105 media fixtures, got ${mediaIds.length}`);

  const cookie = await loginAdmin();

  const page1 = await getMedia(cookie, { page: "1", pageSize: "50", q: suffix });
  assert(page1.media.length === 50, `page 1 should contain 50 fixtures, got ${page1.media.length}`);
  assert(page1.pagination?.page === 1, "page 1 metadata missing");
  assert(page1.pagination?.pageSize === 50, "page size metadata mismatch");
  assert(page1.pagination?.hasPrevious === false, "page 1 should not have a previous page");
  assert(page1.pagination?.hasMore === true, "page 1 should report more results");

  const page2 = await getMedia(cookie, { page: "2", pageSize: "50", q: suffix });
  assert(page2.media.length === 50, `page 2 should contain 50 fixtures, got ${page2.media.length}`);
  assert(page2.pagination?.page === 2, "page 2 metadata missing");
  assert(page2.pagination?.hasPrevious === true, "page 2 should have a previous page");
  assert(page2.pagination?.hasMore === true, "page 2 should report more results");

  const page3 = await getMedia(cookie, { page: "3", pageSize: "50", q: suffix });
  assert(page3.media.length === 5, `page 3 should contain the remaining 5 fixtures, got ${page3.media.length}`);
  assert(page3.pagination?.page === 3, "page 3 metadata missing");
  assert(page3.pagination?.hasPrevious === true, "page 3 should have a previous page");
  assert(page3.pagination?.hasMore === false, "page 3 should be the last page");

  const firstIds = new Set(page1.media.map((row) => row.id));
  const secondIds = new Set(page2.media.map((row) => row.id));
  const thirdIds = new Set(page3.media.map((row) => row.id));
  assert(firstIds.size === 50, "page 1 contains duplicate media IDs");
  assert(secondIds.size === 50, "page 2 contains duplicate media IDs");
  assert(thirdIds.size === 5, "page 3 contains duplicate media IDs");

  assert([...firstIds].every((id) => !secondIds.has(id)), "page 1 and page 2 overlap");
  assert([...firstIds].every((id) => !thirdIds.has(id)), "page 1 and page 3 overlap");
  assert([...secondIds].every((id) => !thirdIds.has(id)), "page 2 and page 3 overlap");

  const combined = new Set([...firstIds, ...secondIds, ...thirdIds]);
  assert(combined.size === 105, `pagination should expose all 105 fixtures exactly once, got ${combined.size}`);

  const custom = await getMedia(cookie, { page: "1", pageSize: "12", q: suffix });
  assert(custom.media.length === 12, `custom page size should return 12 rows, got ${custom.media.length}`);
  assert(custom.pagination?.pageSize === 12, "custom page size was not preserved");

  console.log("P2_MEDIA_PAGINATION_REGRESSION_PASS");
} finally {
  if (client._connected) {
    if (mediaIds.length) {
      await client.query("delete from media where id = any($1::int[])", [mediaIds]).catch(() => {});
    }
    await client.end();
  }
}
