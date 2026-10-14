import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "pg";

const baseUrl = process.env.P2_CLOUD_BASE_URL ?? "http://127.0.0.1:3200";
const databaseUrl = process.env.DATABASE_URL;
const adminPassword = process.env.ADMIN_PASSWORD;
const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;
for (const [name, value] of Object.entries({ DATABASE_URL: databaseUrl, ADMIN_PASSWORD: adminPassword, CLOUDINARY_CLOUD_NAME: cloudName, CLOUDINARY_API_KEY: apiKey, CLOUDINARY_API_SECRET: apiSecret })) {
  if (!value) throw new Error(`${name} is required for the live cloud-storage integration test`);
}
if (process.env.CLOUD_STORAGE_TEST_CONFIRM !== "YES_UPLOAD_AND_DELETE_TEST_ASSETS") {
  throw new Error("Set CLOUD_STORAGE_TEST_CONFIRM=YES_UPLOAD_AND_DELETE_TEST_ASSETS to explicitly authorize temporary Cloudinary uploads and deletion.");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function jsonRequest(pathname, method, body, cookie) {
  const response = await fetch(baseUrl + pathname, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const raw = await response.text();
  let data = {};
  if (raw) { try { data = JSON.parse(raw); } catch { data = { raw }; } }
  return { response, data };
}
async function executePlan(cookie, operation, payload, instruction) {
  const plan = {
    summary: "Cloud storage integration test",
    intent: instruction,
    actions: [{ domain: operation.split(".")[0], operation, summary: instruction, requiresConfirmation: false, payload: JSON.stringify(payload) }],
  };
  const result = await jsonRequest("/api/admin/ai/master", "POST", {
    instruction, confirmedPlan: plan, confirmIndexes: [0], autoModel: true, webMode: "off",
  }, cookie);
  assert(result.response.ok, `${operation} endpoint returned HTTP ${result.response.status}: ${JSON.stringify(result.data)}`);
  const item = result.data.execution?.find((entry) => entry.operation === operation);
  assert(item?.executed === true && item?.ok === true, `${operation} failed: ${JSON.stringify(result.data.execution)}`);
  return item;
}
function cloudinarySignature(params) {
  const canonical = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`).join("&");
  return (awaitlessSha1(canonical + apiSecret));
}
function awaitlessSha1(value) {
  // Node's built-in crypto is synchronous; keeping this helper local avoids logging credentials.
  return createHash("sha1").update(value).digest("hex");
}
async function destroyCloudAsset(resourceType, publicId) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const params = { public_id: publicId, timestamp };
  const form = new FormData();
  form.append("public_id", publicId);
  form.append("timestamp", timestamp);
  form.append("api_key", apiKey);
  form.append("signature", cloudinarySignature(params));
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, { method: "POST", body: form });
  const body = await response.json().catch(() => ({}));
  assert(response.ok && body.result === "ok", `Cloudinary cleanup failed for a test asset (${resourceType}); status=${response.status}, result=${String(body.result ?? "unknown")}`);
}
async function verifyPublicAsset(url, label) {
  assert(typeof url === "string" && url.startsWith("https://"), `${label} did not return an HTTPS public URL`);
  const response = await fetch(url, { headers: { range: "bytes=0-63" }, signal: AbortSignal.timeout(20000) });
  assert(response.ok || response.status === 206, `${label} public URL could not be fetched: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  assert(bytes.byteLength > 0, `${label} URL returned an empty response`);
  return { status: response.status, bytesRead: bytes.byteLength };
}

const { createHash } = await import("node:crypto");
const client = new Client({ connectionString: databaseUrl });
const suffix = `cloud-int-${Date.now()}-${process.pid}`;
const createdMedia = [];
let productId = null;
let sectionId = null;
let originalSection = null;
let cookie = "";
let tempDir = null;
let cleanupErrors = [];
try {
  await client.connect();
  const login = await jsonRequest("/api/admin/login", "POST", { password: adminPassword });
  assert(login.response.ok, `admin login failed: HTTP ${login.response.status}`);
  cookie = /svj_admin=[^;]+/.exec(login.response.headers.get("set-cookie") ?? "")?.[0] ?? "";
  assert(cookie, "admin login did not return the admin session cookie");

  const category = (await client.query("select slug from categories order by sort_order, id limit 1")).rows[0];
  assert(category?.slug, "no category exists for the temporary product");
  const productResult = await executePlan(cookie, "products.create_draft", {
    product: {
      name: "Temporary Cloud Upload Test " + suffix,
      slug: suffix.toLowerCase(),
      categorySlug: category.slug,
      price: 0, stock: 0, status: "draft", active: false, sku: "", barcode: "",
      shortDescription: "Temporary cloud-storage integration test", description: "",
    },
    images: [], variants: [],
  }, "Create a temporary draft for the cloud storage integration test.");
  productId = Number(productResult.data?.productId);
  assert(Number.isInteger(productId) && productId > 0, "temporary draft was not created");

  const section = (await client.query(
    "select id, image_url, image_mobile_url, image_tablet_url from homepage_sections order by sort_order, id limit 1",
  )).rows[0];
  assert(section && Number.isInteger(Number(section.id)), "no homepage section exists for image-link verification");
  sectionId = Number(section.id);
  originalSection = section;

  tempDir = await mkdtemp(path.join(os.tmpdir(), "sunvera-cloud-test-"));
  const pngPath = path.join(tempDir, `${suffix}.png`);
  const mp4Path = path.join(tempDir, `${suffix}.mp4`);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await import("node:fs/promises").then(({ writeFile }) => writeFile(pngPath, png));
  // Produce a tiny valid MP4 fixture instead of sending a fake ftyp header to the cloud provider.
  execFileSync("/usr/bin/ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=32x32:d=1", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", mp4Path]);

  async function uploadFile(filePath, mime, folder) {
    const bytes = await readFile(filePath);
    const form = new FormData();
    form.append("folder", folder);
    form.append("files", new Blob([bytes], { type: mime }), path.basename(filePath));
    const response = await fetch(baseUrl + "/api/admin/media", { method: "POST", headers: { cookie }, body: form });
    const raw = await response.text();
    const body = raw ? JSON.parse(raw) : {};
    assert(response.status === 201 && body.storage?.mode === "cloudinary", `real ${mime} upload failed or did not use Cloudinary: HTTP ${response.status}, mode=${body.storage?.mode}, errors=${JSON.stringify(body.errors ?? [])}`);
    const asset = body.created?.[0];
    assert(asset?.id && asset?.provider === "cloudinary" && asset?.storageKey && asset?.url, `upload response missing Cloudinary asset metadata: ${JSON.stringify(asset)}`);
    createdMedia.push({ id: Number(asset.id), publicId: asset.storageKey, mime, resourceType: mime.startsWith("video/") ? "video" : "image", url: asset.url });
    const dbRow = (await client.query("select id, url, storage_key, provider, mime_type, size from media where id = $1", [asset.id])).rows[0];
    assert(dbRow && dbRow.provider === "cloudinary" && dbRow.storage_key === asset.storageKey && dbRow.url === asset.url && dbRow.mime_type === mime && Number(dbRow.size) === bytes.byteLength,
      `uploaded ${mime} metadata did not persist correctly: ${JSON.stringify(dbRow)}`);
    const publicCheck = await verifyPublicAsset(asset.url, mime);
    return { asset, publicCheck };
  }

  const imageUpload = await uploadFile(pngPath, "image/png", "products");
  const videoUpload = await uploadFile(mp4Path, "video/mp4", "products");

  await executePlan(cookie, "products.attach_media", {
    productId, mediaId: Number(imageUpload.asset.id), isPrimary: true, alt: "Temporary cloud-upload verification",
  }, "Attach the temporary uploaded cloud image to the temporary product.");
  const attached = (await client.query(
    "select pi.product_id, pi.media_id, pi.url, pi.is_primary, m.provider, m.url as media_url from product_images pi join media m on m.id = pi.media_id where pi.product_id = $1 and pi.media_id = $2",
    [productId, Number(imageUpload.asset.id)],
  )).rows[0];
  assert(attached && Number(attached.product_id) === productId && Number(attached.media_id) === Number(imageUpload.asset.id) &&
    attached.provider === "cloudinary" && attached.media_url === imageUpload.asset.url && attached.url === imageUpload.asset.url && attached.is_primary === true,
    `cloud image did not persist as a product image: ${JSON.stringify(attached)}`);

  const testSectionUrl = imageUpload.asset.url;
  await executePlan(cookie, "homepage.update_section", {
    id: sectionId, patch: { imageUrl: testSectionUrl },
  }, "Temporarily set the homepage section image to the uploaded cloud image for integration testing.");
  const sectionAfter = (await client.query(
    "select image_url from homepage_sections where id = $1", [sectionId],
  )).rows[0];
  assert(sectionAfter?.image_url === testSectionUrl, `homepage section did not persist the uploaded cloud image URL: ${JSON.stringify(sectionAfter)}`);

  console.log("P2_CLOUD_STORAGE_INTEGRATION_PASS");
  console.log(JSON.stringify({
    provider: "cloudinary",
    image: { id: Number(imageUpload.asset.id), urlReachable: true, ...imageUpload.publicCheck, linkedToProduct: true, linkedToHomepageSection: true },
    video: { id: Number(videoUpload.asset.id), urlReachable: true, ...videoUpload.publicCheck, mimeType: "video/mp4" },
    databaseVerified: true,
    cleanup: "scheduled in finally; pass is emitted only after upload/link checks",
  }, null, 2));
} catch (error) {
  console.error("P2_CLOUD_STORAGE_INTEGRATION_FAIL");
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
} finally {
  if (client._connected) {
    if (sectionId !== null && originalSection) {
      await client.query(
        "update homepage_sections set image_url=$1, image_mobile_url=$2, image_tablet_url=$3 where id=$4",
        [originalSection.image_url, originalSection.image_mobile_url, originalSection.image_tablet_url, sectionId],
      ).catch((e) => cleanupErrors.push("restore homepage section: " + e.message));
    }
    if (productId !== null) {
      await client.query("delete from product_images where product_id=$1", [productId])
        .catch((e) => cleanupErrors.push("remove product image references: " + e.message));
      await client.query("delete from products where id=$1", [productId])
        .catch((e) => cleanupErrors.push("remove temporary product: " + e.message));
    }
    for (const asset of createdMedia) {
      await client.query("delete from product_images where media_id=$1", [asset.id])
        .catch((e) => cleanupErrors.push("remove image reference: " + e.message));
    }
    for (const asset of createdMedia) {
      await client.query("delete from media where id=$1", [asset.id])
        .catch((e) => cleanupErrors.push("remove media row " + asset.id + ": " + e.message));
      const remaining = await client.query("select id from media where id=$1", [asset.id])
        .catch((e) => { cleanupErrors.push("verify media row cleanup " + asset.id + ": " + e.message); return { rows: [{ id: asset.id }] }; });
      if (remaining.rows.length) cleanupErrors.push("media row " + asset.id + " still exists; retaining its cloud asset for safety");
    }
    await client.end().catch((e) => cleanupErrors.push("close database connection: " + e.message));
  }
  // Never delete the remote object if the database still contains a row/reference to it.
  if (cleanupErrors.length === 0) {
    for (const asset of createdMedia.toReversed()) {
      try { await destroyCloudAsset(asset.resourceType, asset.publicId); }
      catch (e) { cleanupErrors.push("Cloudinary cleanup " + asset.resourceType + ": " + (e instanceof Error ? e.message : String(e))); }
    }
  }
  if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch((e) => cleanupErrors.push("remove temporary fixtures: " + e.message));
  if (cleanupErrors.length) {
    console.error("P2_CLOUD_STORAGE_CLEANUP_FAIL");
    console.error(JSON.stringify(cleanupErrors));
    process.exitCode = 1;
  } else {
    console.log("P2_CLOUD_STORAGE_CLEANUP_PASS");
  }
}
