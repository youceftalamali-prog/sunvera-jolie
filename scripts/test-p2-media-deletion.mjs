import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const baseUrl = process.env.P2_BASE_URL ?? "http://127.0.0.1:3000";
const databaseUrl = process.env.DATABASE_URL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!adminPassword) throw new Error("ADMIN_PASSWORD is required");

const UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR ?? ".uploads";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const client = new Client({ connectionString: databaseUrl });
const suffix = `p2-media-del-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const storageKey = `products/${suffix}.png`;
const absoluteFile = path.join(process.cwd(), UPLOAD_DIR, storageKey);

let cookie = "";
let mediaId = null;
let productA = null;
let productB = null;
let bannerId = null;
const productImageIds = [];

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

async function deleteMedia(query) {
  return fetch(`${baseUrl}/api/admin/media?${query}`, { method: "DELETE", headers: { cookie } });
}

async function countProductImages(predicate, params) {
  const result = await client.query(`select count(*)::int as n from product_images where ${predicate}`, params);
  return result.rows[0].n;
}

try {
  await client.connect();

  // The whole CI suite authenticates from one shared bucket (RATE_LIMIT_TRUST_PROXY=false makes
  // every caller "untrusted") and admin login is capped at 8 attempts per 15 minutes. Reset that
  // fixture bucket so this test neither fails on the budget of earlier tests nor consumes the
  // budget of later ones. The rate limiter itself is covered by scripts/test-p1-rate-limit.mjs.
  await client.query("delete from rate_limit_buckets where namespace = 'admin-login'");
  cookie = await loginAdmin();

  // --- fixtures -------------------------------------------------------------
  const productARow = await client.query(
    `insert into products (name, slug, sku, category_slug, price, stock, track_inventory, allow_backorders, status, active)
     values ($1, $2, $3, 'skincare', 1000, 10, true, false, 'published', true) returning id`,
    [`${suffix} Owner`, `${suffix}-owner`, `${suffix}-OWNER`],
  );
  productA = productARow.rows[0].id;

  const productBRow = await client.query(
    `insert into products (name, slug, sku, category_slug, price, stock, track_inventory, allow_backorders, status, active)
     values ($1, $2, $3, 'skincare', 1500, 5, true, false, 'published', true) returning id`,
    [`${suffix} Legacy`, `${suffix}-legacy`, `${suffix}-LEGACY`],
  );
  productB = productBRow.rows[0].id;

  const mediaRow = await client.query(
    `insert into media (url, storage_key, provider, filename, alt, mime_type, size, width, height, folder, title, source)
     values ('', $1, 'local', $2, $2, 'image/png', 128, 8, 8, 'products', $2, 'upload') returning id`,
    [storageKey, `${suffix}.png`],
  );
  mediaId = mediaRow.rows[0].id;
  const mediaUrl = `/api/media/${mediaId}?v=${suffix}`;
  await client.query("update media set url = $1 where id = $2", [mediaUrl, mediaId]);

  // A real file on disk, so the cleanup path can be verified end to end.
  await mkdir(path.dirname(absoluteFile), { recursive: true });
  await writeFile(absoluteFile, Buffer.from("89504e470d0a1a0a", "hex"));

  // Product A: the asset is its main image, plus an unrelated external image that must survive.
  const imageA1 = await client.query(
    `insert into product_images (product_id, url, media_id, alt, image_type, sort_order, is_primary)
     values ($1, $2, $3, 'linked', 'main', 0, true) returning id`,
    [productA, mediaUrl, mediaId],
  );
  productImageIds.push(imageA1.rows[0].id);
  const imageA2 = await client.query(
    `insert into product_images (product_id, url, media_id, alt, image_type, sort_order, is_primary)
     values ($1, $2, null, 'external', 'gallery', 1, false) returning id`,
    [productA, `https://example.test/${suffix}-keep.jpg`],
  );
  productImageIds.push(imageA2.rows[0].id);

  // Product B: legacy row that only carries the URL (media_id is null) — must still be detected.
  const imageB1 = await client.query(
    `insert into product_images (product_id, url, media_id, alt, image_type, sort_order, is_primary)
     values ($1, $2, null, 'legacy-url-only', 'gallery', 0, false) returning id`,
    [productB, mediaUrl],
  );
  productImageIds.push(imageB1.rows[0].id);

  // A CMS value that embeds the same asset URL.
  const bannerRow = await client.query(
    `insert into banners (title, subtitle, image_desktop, image_mobile, active, sort_order)
     values ($1, '', $2, '', true, 0) returning id`,
    [`${suffix} banner`, mediaUrl],
  );
  bannerId = bannerRow.rows[0].id;

  // --- guards ---------------------------------------------------------------
  const anonymous = await fetch(`${baseUrl}/api/admin/media?id=${mediaId}`, { method: "DELETE" });
  assert(anonymous.status === 401, `anonymous delete should be rejected, got ${anonymous.status}`);

  const badId = await deleteMedia("id=not-a-number");
  assert(badId.status === 400, `non-numeric id should return 400, got ${badId.status}`);

  const missing = await deleteMedia("id=2147480000");
  assert(missing.status === 404, `unknown media id should return 404, got ${missing.status}`);

  // --- blocked delete -------------------------------------------------------
  const blocked = await deleteMedia(`id=${mediaId}`);
  const blockedBody = await blocked.json();
  assert(blocked.status === 409, `referenced asset should not delete without force, got ${blocked.status}`);
  assert(blockedBody.forceRequired === true, "409 response should ask for an explicit force=1");
  assert(blockedBody.usage === 2, `expected 2 product image slots, got ${blockedBody.usage}`);
  const blockedProductIds = (blockedBody.products ?? []).map((p) => p.id).sort((a, b) => a - b);
  assert(
    JSON.stringify(blockedProductIds) === JSON.stringify([productA, productB].sort((a, b) => a - b)),
    `409 should list every product using the asset, got ${JSON.stringify(blockedBody.products)}`,
  );
  const byUrl = (blockedBody.productImages ?? []).filter((r) => r.matchedBy === "url");
  assert(byUrl.length === 1, `URL-only reference was not detected: ${JSON.stringify(blockedBody.productImages)}`);
  const textTables = (blockedBody.textReferences ?? []).map((r) => `${r.table}.${r.column}`);
  assert(
    textTables.includes("banners.image_desktop"),
    `banner reference missing from textReferences: ${JSON.stringify(textTables)}`,
  );
  assert(typeof blockedBody.error === "string" && blockedBody.error.length > 0, "409 should explain why");
  assert(!blockedBody.error.includes("constraint"), "409 message leaked database details");

  // Nothing may have changed yet.
  const mediaStillThere = await client.query("select id from media where id = $1", [mediaId]);
  assert(mediaStillThere.rows.length === 1, "blocked delete removed the media row");
  assert((await countProductImages("media_id = $1 or url = $2", [mediaId, mediaUrl])) === 2, "blocked delete touched product images");
  const bannerStillThere = await client.query("select id from banners where id = $1", [bannerId]);
  assert(bannerStillThere.rows.length === 1, "blocked delete removed the banner");
  assert((await stat(absoluteFile)).isFile(), "blocked delete removed the physical file");

  // --- forced delete --------------------------------------------------------
  const forced = await deleteMedia(`id=${mediaId}&force=1`);
  const forcedBody = await forced.json();
  assert(forced.ok, `forced delete failed: ${forced.status} ${JSON.stringify(forcedBody)}`);
  assert(forcedBody.ok === true, "forced delete should report ok");
  assert(forcedBody.removedReferences === 2, `expected 2 removed slots, got ${forcedBody.removedReferences}`);
  assert(
    JSON.stringify(forcedBody.productsWithoutImages ?? []) === JSON.stringify([productB]),
    `expected product ${productB} to be reported without images, got ${JSON.stringify(forcedBody.productsWithoutImages)}`,
  );
  assert(
    (forcedBody.repairedPrimaryFor ?? []).includes(productA),
    `product ${productA} should have received a new main image, got ${JSON.stringify(forcedBody.repairedPrimaryFor)}`,
  );
  assert(forcedBody.cleanup?.deleted === true, `stored file should be cleaned up: ${JSON.stringify(forcedBody.cleanup)}`);

  // Referential integrity: nothing points at the deleted asset any more.
  const mediaGone = await client.query("select id from media where id = $1", [mediaId]);
  assert(mediaGone.rows.length === 0, "media row survived a forced delete");
  assert((await countProductImages("media_id = $1", [mediaId])) === 0, "product_images.media_id still references the deleted asset");
  assert((await countProductImages("url = $1", [mediaUrl])) === 0, "product_images.url still references the deleted asset");

  const survivors = await client.query(
    "select product_id, url, is_primary, image_type from product_images where product_id = any($1::int[]) order by product_id, sort_order",
    [[productA, productB]],
  );
  assert(survivors.rows.length === 1, `only the unrelated external image should survive, got ${JSON.stringify(survivors.rows)}`);
  assert(survivors.rows[0].product_id === productA, "the wrong product kept an image");
  assert(survivors.rows[0].is_primary === true, "the surviving image was not promoted to main image");

  // Text references are reported, never rewritten behind the admin's back.
  const bannerAfter = await client.query("select image_desktop from banners where id = $1", [bannerId]);
  assert(bannerAfter.rows.length === 1, "forced delete removed the banner row");
  assert(bannerAfter.rows[0].image_desktop === mediaUrl, "forced delete rewrote a CMS value");

  // The physical file is gone, and the storefront no longer serves a broken image.
  const fileGone = await stat(absoluteFile).then(
    () => false,
    () => true,
  );
  assert(fileGone, "physical file was left behind after deletion");

  const catalog = await fetch(`${baseUrl}/api/catalog`);
  const catalogBody = await catalog.json();
  assert(catalog.ok, `catalog request failed: ${catalog.status}`);
  const ownerInCatalog = (catalogBody.products ?? []).find((p) => p.id === productA);
  const legacyInCatalog = (catalogBody.products ?? []).find((p) => p.id === productB);
  assert(ownerInCatalog, "product A disappeared from the catalog");
  assert(
    ownerInCatalog.images.length === 1 && ownerInCatalog.images[0].url.startsWith("https://example.test/"),
    `product A should keep only its external image, got ${JSON.stringify(ownerInCatalog.images)}`,
  );
  assert(
    !ownerInCatalog.images.some((i) => String(i.url).includes(`/api/media/${mediaId}`)),
    "product A still renders the deleted asset",
  );
  if (legacyInCatalog) {
    assert(legacyInCatalog.images.length === 0, `product B should have no images, got ${JSON.stringify(legacyInCatalog.images)}`);
  }

  // A stale admin form must not resurrect the deleted reference (P2-9 referential integrity).
  const resurrect = await fetch(`${baseUrl}/api/admin/products`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      id: productA,
      name: `${suffix} Owner`,
      slug: `${suffix}-owner`,
      sku: `${suffix}-OWNER`,
      categorySlug: "skincare",
      price: 1000,
      stock: 10,
      status: "published",
      images: [
        { url: mediaUrl, mediaId, alt: "stale slot", imageType: "main", isPrimary: true, sortOrder: 0 },
        { url: `https://example.test/${suffix}-keep.jpg`, alt: "external", imageType: "gallery", sortOrder: 1 },
      ],
    }),
  });
  const resurrectBody = await resurrect.json();
  assert(resurrect.ok, `product update failed: ${resurrect.status} ${JSON.stringify(resurrectBody)}`);
  assert((await countProductImages("media_id = $1", [mediaId])) === 0, "a deleted media id was written back into product_images");
  assert((await countProductImages("url = $1", [mediaUrl])) === 0, "a deleted local media URL was written back into product_images");
  const afterResurrect = await client.query(
    "select url from product_images where product_id = $1 order by sort_order",
    [productA],
  );
  assert(
    afterResurrect.rows.length === 1 && afterResurrect.rows[0].url.startsWith("https://example.test/"),
    `stale slot survived the product update: ${JSON.stringify(afterResurrect.rows)}`,
  );

  const servedAsset = await fetch(`${baseUrl}/api/media/${mediaId}`);
  assert(servedAsset.status === 404, `deleted asset should 404, got ${servedAsset.status}`);

  console.log("P2_MEDIA_DELETION_SAFETY_REGRESSION_PASS");
} finally {
  if (client._connected) {
    if (productImageIds.length) {
      await client.query("delete from product_images where id = any($1::int[])", [productImageIds]).catch(() => {});
    }
    await client.query(`delete from product_images where url like $1`, [`/api/media/%${suffix}%`]).catch(() => {});
    if (bannerId) await client.query("delete from banners where id = $1", [bannerId]).catch(() => {});
    if (mediaId) await client.query("delete from media where id = $1", [mediaId]).catch(() => {});
    await client.query(`delete from media where storage_key = $1`, [storageKey]).catch(() => {});
    const ids = [productA, productB].filter(Boolean);
    if (ids.length) await client.query("delete from products where id = any($1::int[])", [ids]).catch(() => {});
    await client.end();
  }
  await rm(absoluteFile, { force: true }).catch(() => {});
}
