import { Client } from "pg";

const baseUrl = process.env.P1_BASE_URL ?? "http://127.0.0.1:3000";
const databaseUrl = process.env.DATABASE_URL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!adminPassword) throw new Error("ADMIN_PASSWORD is required");

const client = new Client({ connectionString: databaseUrl });
const suffix = `p1-atomic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const products = [];
const variantIds = [];
const imageUrls = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function dbProduct(name, sku, price = 1000) {
  const slug = `${suffix}-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  const [row] = (
    await client.query(
      `insert into products (name, slug, sku, category_slug, price, stock, track_inventory, allow_backorders, status, active)
       values ($1, $2, $3, 'skincare', $4, 20, true, false, 'published', true)
       returning id`,
      [name, slug, sku, price],
    )
  ).rows;
  products.push(row.id);
  return row;
}

async function dbVariant(productId, label, sku, price = 1200) {
  const [row] = (
    await client.query(
      `insert into product_variants (product_id, label, sku, price, stock)
       values ($1, $2, $3, $4, 5) returning id`,
      [productId, label, sku, price],
    )
  ).rows;
  variantIds.push(row.id);
  return row;
}

async function request(path, method, body, cookie) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
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

try {
  await client.connect();

  const login = await request("/api/admin/login", "POST", { password: adminPassword });
  assert(login.response.ok, `admin login failed: ${JSON.stringify(login.data)}`);
  const setCookie = login.response.headers.get("set-cookie") ?? "";
  const adminCookieMatch = setCookie.match(/svj_admin=[^;]+/);
  assert(adminCookieMatch, `admin cookie missing: ${setCookie}`);
  const adminCookie = adminCookieMatch[0];

  const noImageSlug = `${suffix}-published-without-image`;
  let result = await request(
    "/api/admin/products",
    "POST",
    {
      name: "P1 Published Without Image",
      slug: noImageSlug,
      sku: `${suffix}-NO-IMAGE`,
      categorySlug: "skincare",
      price: 1500,
      stock: 2,
      status: "published",
      images: [],
      variants: [],
    },
    adminCookie,
  );
  assert(result.response.status === 409, `published product without an image must fail, got ${result.response.status}`);
  assert(Number((await client.query("select count(*)::int as n from products where slug = $1", [noImageSlug])).rows[0].n) === 0,
    "publishing without an image left a product row");

  const videoOnlySlug = `${suffix}-published-video-only`;
  const videoOnlyUrl = `https://example.test/${suffix}-product-video.mp4`;
  imageUrls.push(videoOnlyUrl);
  result = await request(
    "/api/admin/products",
    "POST",
    {
      name: "P1 Published Video Only",
      slug: videoOnlySlug,
      sku: `${suffix}-VIDEO-ONLY`,
      categorySlug: "skincare",
      price: 1500,
      stock: 2,
      status: "published",
      images: [{ url: videoOnlyUrl, alt: "product video", imageType: "gallery", isPrimary: true }],
      variants: [],
    },
    adminCookie,
  );
  assert(result.response.status === 409, `video-only product must not publish, got ${result.response.status}`);
  assert(Number((await client.query("select count(*)::int as n from products where slug = $1", [videoOnlySlug])).rows[0].n) === 0,
    "video-only publication left a product row");

  const bulkDraft = await dbProduct("P1 Bulk Publish Without Image", `${suffix}-BULK-DRAFT`);
  await client.query("update products set status = 'draft', active = false where id = $1", [bulkDraft.id]);
  result = await request(
    "/api/admin/products",
    "PATCH",
    { action: "bulk", ids: [bulkDraft.id], patch: { status: "published" } },
    adminCookie,
  );
  assert(result.response.status === 409, `bulk publishing without an image must fail, got ${result.response.status}`);
  const bulkDraftState = (await client.query("select status, active from products where id = $1", [bulkDraft.id])).rows[0];
  assert(bulkDraftState.status === "draft" && bulkDraftState.active === false, "failed bulk publish changed product state");

  result = await request(
    "/api/admin/products",
    "PATCH",
    { action: "bulk", ids: [bulkDraft.id], patch: { price: 1000.5 } },
    adminCookie,
  );
  assert(result.response.status === 400, `fractional bulk price must be rejected before DB writes, got ${result.response.status}`);
  const bulkPrice = Number((await client.query("select price from products where id = $1", [bulkDraft.id])).rows[0].price);
  assert(bulkPrice === 1000, `rejected fractional bulk price changed the product: ${bulkPrice}`);

  const inactivePublished = await dbProduct("P1 Inactive Published", `${suffix}-INACTIVE-PUBLISHED`);
  await client.query("update products set active = false where id = $1", [inactivePublished.id]);
  const catalogResponse = await fetch(`${baseUrl}/api/catalog`);
  const catalogData = await catalogResponse.json();
  assert(!catalogData.products.some((product) => product.id === inactivePublished.id), "inactive published product leaked into the public catalog");

  const conflictProduct = await dbProduct("P1 Atomic Conflict", `${suffix}-CONFLICT`);
  const conflictVariant = await dbVariant(conflictProduct.id, "P1 Conflict Variant", `${suffix}-VAR-CONFLICT`);

  const failedCreateSlug = `${suffix}-create-failure`;
  const createImage = `https://example.test/${suffix}-create.jpg`;
  imageUrls.push(createImage);

  result = await request(
    "/api/admin/products",
    "POST",
    {
      name: "P1 Atomic Create Failure",
      slug: failedCreateSlug,
      sku: `${suffix}-CREATE`,
      categorySlug: "skincare",
      price: 1500,
      stock: 10,
      status: "published",
      images: [{ url: createImage, alt: "atomic create test", imageType: "main", isPrimary: true }],
      variants: [{ label: "Bad Variant", sku: `${suffix}-VAR-CONFLICT`, price: 1800, stock: 2 }],
    },
    adminCookie,
  );

  assert(result.response.status === 409, `expected create conflict 409, got ${result.response.status}: ${JSON.stringify(result.data)}`);

  const createdCount = Number((await client.query("select count(*)::int as n from products where slug = $1", [failedCreateSlug])).rows[0].n);
  const imageCount = Number((await client.query("select count(*)::int as n from product_images where url = $1", [createImage])).rows[0].n);
  assert(createdCount === 0, `failed create left product row: ${createdCount}`);
  assert(imageCount === 0, `failed create left image row: ${imageCount}`);

  const invalidVariantSlug = `${suffix}-invalid-variant`;
  result = await request(
    "/api/admin/products",
    "POST",
    {
      name: "P1 Atomic Invalid Variant",
      slug: invalidVariantSlug,
      sku: `${suffix}-INVALID-VARIANT`,
      categorySlug: "skincare",
      price: 1500,
      stock: 10,
      status: "draft",
      images: [],
      variants: [{ label: "Fractional stock", sku: `${suffix}-FRACTIONAL-VARIANT`, price: 1600, stock: 1.5 }],
    },
    adminCookie,
  );
  assert(result.response.status === 409, `fractional variant stock should fail, got ${result.response.status}`);
  assert(Number((await client.query("select count(*)::int as n from products where slug = $1", [invalidVariantSlug])).rows[0].n) === 0,
    "invalid variant write left a partial product");

  const targetSku = `${suffix}-TARGET`;
  const target = await dbProduct("P1 Atomic Update Target", targetSku, 2100);
  const targetImage = `https://example.test/${suffix}-target-old.jpg`;
  imageUrls.push(targetImage);
  await client.query(
    `insert into product_images (product_id, url, alt, image_type, sort_order, is_primary)
     values ($1, $2, 'old image', 'main', 0, true)`,
    [target.id, targetImage],
  );
  await dbVariant(target.id, "Original Variant", `${suffix}-TARGET-VAR`, 2200);

  const updateImage = `https://example.test/${suffix}-target-new.jpg`;
  imageUrls.push(updateImage);

  result = await request(
    "/api/admin/products",
    "PATCH",
    {
      id: target.id,
      name: "P1 Atomic Update Target Changed",
      slug: target.slug,
      sku: targetSku,
      categorySlug: "skincare",
      price: 9999,
      stock: 3,
      status: "published",
      images: [{ url: updateImage, alt: "new image", imageType: "main", isPrimary: true }],
      variants: [{ label: "Conflicting Variant", sku: `${suffix}-VAR-CONFLICT`, price: 3000, stock: 1 }],
    },
    adminCookie,
  );

  assert(result.response.status === 409, `expected update conflict 409, got ${result.response.status}: ${JSON.stringify(result.data)}`);

  const [afterProduct] = (await client.query(
    "select price, stock from products where id = $1",
    [target.id],
  )).rows;
  assert(afterProduct.price === 2100, `update rollback failed for price: ${afterProduct.price}`);
  assert(afterProduct.stock === 20, `update rollback failed for stock: ${afterProduct.stock}`);

  const targetImages = (await client.query(
    "select url from product_images where product_id = $1 order by sort_order",
    [target.id],
  )).rows;
  assert(targetImages.length === 1 && targetImages[0].url === targetImage, `update rollback failed for images: ${JSON.stringify(targetImages)}`);

  const targetVariants = (await client.query(
    "select label, sku from product_variants where product_id = $1 order by id",
    [target.id],
  )).rows;
  assert(
    targetVariants.length === 1 &&
      targetVariants[0].label === "Original Variant" &&
      targetVariants[0].sku === `${suffix}-TARGET-VAR`,
    `update rollback failed for variants: ${JSON.stringify(targetVariants)}`,
  );

  assert(conflictVariant.id, "conflict fixture variant missing");
  console.log("P1_ATOMICITY_REGRESSION_PASS");
} finally {
  if (client._connected) {
    if (products.length) {
      await client.query("delete from products where id = any($1::int[])", [products]).catch(() => {});
    }
    await client.end();
  }
}
