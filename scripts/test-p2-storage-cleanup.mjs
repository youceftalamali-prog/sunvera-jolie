import { execFile } from "node:child_process";
import { mkdir, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Client } from "pg";

const run = promisify(execFile);

const baseUrl = process.env.P2_BASE_URL ?? "http://127.0.0.1:3000";
const databaseUrl = process.env.DATABASE_URL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!adminPassword) throw new Error("ADMIN_PASSWORD is required");

const UPLOAD_DIR = path.resolve(process.cwd(), process.env.LOCAL_UPLOAD_DIR ?? ".uploads");
const SWEEP_SCRIPT = path.join(process.cwd(), "scripts", "cleanup-orphan-uploads.mjs");
/** 1×1 PNG: passes the signature sniff and the extension/MIME checks. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const client = new Client({ connectionString: databaseUrl });
const suffix = `p2-cleanup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createdMediaIds = [];
const createdFiles = [];
let cookie = "";

async function loginAdmin() {
  // Shared CI bucket (RATE_LIMIT_TRUST_PROXY=false ⇒ one "untrusted" key) capped at 8 logins.
  await client.query("delete from rate_limit_buckets where namespace = 'admin-login'");
  const response = await fetch(baseUrl + "/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: adminPassword }),
  });
  assert(response.ok, "admin login failed: " + response.status);
  const match = (response.headers.get("set-cookie") ?? "").match(/svj_admin=[^;]+/);
  assert(match, "admin login did not return svj_admin cookie");
  return match[0];
}

async function listUploadFiles(dir = UPLOAD_DIR) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listUploadFiles(full)));
    else if (entry.isFile()) out.push(path.relative(UPLOAD_DIR, full).split(path.sep).join("/"));
  }
  return out;
}

async function exists(target) {
  return stat(target).then(
    () => true,
    () => false,
  );
}

async function uploadPng(fields = {}) {
  const form = new FormData();
  form.append("files", new Blob([PNG_BYTES], { type: "image/png" }), `${fields.name ?? suffix}.png`);
  form.append("folder", fields.folder ?? "products");
  if (fields.replaceId) form.append("replaceId", String(fields.replaceId));
  const response = await fetch(baseUrl + "/api/admin/media", {
    method: "POST",
    headers: { cookie },
    body: form,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function deleteMedia(id, force = false) {
  const response = await fetch(`${baseUrl}/api/admin/media?id=${id}${force ? "&force=1" : ""}`, {
    method: "DELETE",
    headers: { cookie },
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function insertMediaRow({ provider, storageKey, url, folder = "products" }) {
  const result = await client.query(
    `insert into media (url, storage_key, provider, filename, alt, mime_type, size, width, height, folder, title, source)
     values ($1, $2, $3, $4, $4, 'image/png', 68, 1, 1, $5, $4, 'upload') returning id`,
    [url, storageKey, provider, `${suffix}.png`, folder],
  );
  const id = result.rows[0].id;
  createdMediaIds.push(id);
  return id;
}

async function sweep(extraArgs = []) {
  const { stdout } = await run(
    process.execPath,
    [SWEEP_SCRIPT, "--json", "--older-than-minutes=30", ...extraArgs],
    { env: { ...process.env, DATABASE_URL: databaseUrl }, cwd: process.cwd() },
  );
  return JSON.parse(stdout);
}

async function ageFile(target, minutes) {
  const when = new Date(Date.now() - minutes * 60 * 1000);
  await utimes(target, when, when);
}

try {
  await client.connect();
  cookie = await loginAdmin();
  await mkdir(path.join(UPLOAD_DIR, "products"), { recursive: true });

  // --- 1. upload → delete removes the physical file -------------------------
  const uploaded = await uploadPng({ name: `${suffix}-cycle` });
  assert(uploaded.status === 201, `upload failed: ${uploaded.status} ${JSON.stringify(uploaded.body)}`);
  const asset = uploaded.body.created?.[0];
  assert(asset?.storageKey, `upload did not report a storage key: ${JSON.stringify(uploaded.body)}`);
  createdMediaIds.push(asset.id);
  const assetPath = path.join(UPLOAD_DIR, asset.storageKey);
  createdFiles.push(assetPath);
  assert(await exists(assetPath), "uploaded file was not written to the local upload directory");
  assert(asset.url === `/api/media/${asset.id}?v=${asset.storageKey.split("/").pop().replace(/\.[a-z0-9]+$/i, "")}`,
    `unexpected public url: ${asset.url}`);

  const removed = await deleteMedia(asset.id);
  assert(removed.status === 200 && removed.body.ok === true, `delete failed: ${JSON.stringify(removed.body)}`);
  assert(removed.body.cleanup?.deleted === true, `stored file was not cleaned up: ${JSON.stringify(removed.body.cleanup)}`);
  assert(!(await exists(assetPath)), "physical file survived the deletion of its media row");

  // --- 2. a failed replace must not leave the freshly stored file behind ----
  const beforeFailedReplace = (await listUploadFiles()).sort();
  const failedReplace = await uploadPng({ name: `${suffix}-ghost`, replaceId: 2147480000 });
  assert(failedReplace.status === 404, `replace against a missing row should 404, got ${failedReplace.status}`);
  const afterFailedReplace = (await listUploadFiles()).sort();
  assert(
    JSON.stringify(beforeFailedReplace) === JSON.stringify(afterFailedReplace),
    `failed replace orphaned a file: ${JSON.stringify(afterFailedReplace.filter((f) => !beforeFailedReplace.includes(f)))}`,
  );

  // --- 3. a storage key shared by two rows is never unlinked early ----------
  const sharedKey = `products/${suffix}-shared.png`;
  const sharedPath = path.join(UPLOAD_DIR, sharedKey);
  createdFiles.push(sharedPath);
  await writeFile(sharedPath, PNG_BYTES);
  const firstRow = await insertMediaRow({ provider: "local", storageKey: sharedKey, url: "" });
  const secondRow = await insertMediaRow({ provider: "local", storageKey: sharedKey, url: "" });

  const firstDelete = await deleteMedia(firstRow, true);
  assert(firstDelete.status === 200, `first shared-key delete failed: ${firstDelete.status}`);
  assert(
    firstDelete.body.cleanup?.deleted === false,
    `a still-referenced file was deleted: ${JSON.stringify(firstDelete.body.cleanup)}`,
  );
  assert(
    String(firstDelete.body.cleanup?.kept ?? "").includes("still referenced"),
    `cleanup should explain why the file was kept: ${JSON.stringify(firstDelete.body.cleanup)}`,
  );
  assert(await exists(sharedPath), "shared storage key was unlinked while another row still used it");

  const secondDelete = await deleteMedia(secondRow, true);
  assert(secondDelete.status === 200, `second shared-key delete failed: ${secondDelete.status}`);
  assert(secondDelete.body.cleanup?.deleted === true, `last reference should remove the file: ${JSON.stringify(secondDelete.body.cleanup)}`);
  assert(!(await exists(sharedPath)), "shared file was left behind after its last reference disappeared");

  // --- 4. remote assets are never deleted locally ---------------------------
  const remoteKey = `sunvera/products/${suffix}-remote`;
  const remoteRow = await insertMediaRow({
    provider: "cloudinary",
    storageKey: remoteKey,
    url: `https://res.cloudinary.com/sunvera/image/upload/${remoteKey}.png`,
  });
  const remoteDelete = await deleteMedia(remoteRow, true);
  assert(remoteDelete.status === 200, `remote delete failed: ${remoteDelete.status}`);
  assert(
    remoteDelete.body.cleanup?.deleted === false,
    `remote asset must not be reported as deleted: ${JSON.stringify(remoteDelete.body.cleanup)}`,
  );
  assert(!(await exists(path.join(UPLOAD_DIR, remoteKey + ".png"))), "unexpected local file for a remote asset");

  // --- 5. the orphan sweep ---------------------------------------------------
  const referencedKey = `products/${suffix}-referenced.png`;
  const referencedPath = path.join(UPLOAD_DIR, referencedKey);
  createdFiles.push(referencedPath);
  await writeFile(referencedPath, PNG_BYTES);
  await ageFile(referencedPath, 120);
  createdMediaIds.push(await insertMediaRow({ provider: "local", storageKey: referencedKey, url: "" }));

  const orphanKey = `products/${suffix}-orphan.png`;
  const orphanPath = path.join(UPLOAD_DIR, orphanKey);
  createdFiles.push(orphanPath);
  await writeFile(orphanPath, PNG_BYTES);
  await ageFile(orphanPath, 120);

  const recentOrphanKey = `products/${suffix}-recent.png`;
  const recentOrphanPath = path.join(UPLOAD_DIR, recentOrphanKey);
  createdFiles.push(recentOrphanPath);
  await writeFile(recentOrphanPath, PNG_BYTES); // mtime = now: inside the grace window

  const dryRun = await sweep();
  assert(dryRun.mode === "dry-run", `expected a dry run, got ${dryRun.mode}`);
  assert(dryRun.orphanKeys.includes(orphanKey), `aged orphan was not reported: ${JSON.stringify(dryRun.orphanKeys)}`);
  assert(!dryRun.orphanKeys.includes(referencedKey), "a referenced file was reported as an orphan");
  assert(!dryRun.orphanKeys.includes(recentOrphanKey), "a file inside the grace window was reported as an orphan");
  assert(dryRun.deleted === 0, "dry run deleted files");
  assert(await exists(orphanPath), "dry run removed the orphan file");

  const wetRun = await sweep(["--delete"]);
  assert(wetRun.mode === "delete", `expected delete mode, got ${wetRun.mode}`);
  assert(wetRun.deleted >= 1, `sweep deleted nothing: ${JSON.stringify(wetRun)}`);
  assert(!(await exists(orphanPath)), "aged orphan file was not removed by the sweep");
  assert(await exists(referencedPath), "sweep removed a file that a media row still references");
  assert(await exists(recentOrphanPath), "sweep removed a file that is newer than the grace window");

  console.log("P2_STORAGE_ORPHAN_CLEANUP_REGRESSION_PASS");
} finally {
  if (client._connected) {
    if (createdMediaIds.length) {
      await client.query("delete from media where id = any($1::int[])", [createdMediaIds]).catch(() => {});
    }
    await client.query("delete from media where storage_key like $1", [`%${suffix}%`]).catch(() => {});
    await client.end();
  }
  // Only this test's own files are removed: anything else in the upload directory belongs to
  // another test run or to real data.
  for (const file of createdFiles) await rm(file, { force: true }).catch(() => {});
  for (const key of await listUploadFiles()) {
    if (key.includes(suffix)) await rm(path.join(UPLOAD_DIR, key), { force: true }).catch(() => {});
  }
}
