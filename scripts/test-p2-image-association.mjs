import { Client } from "pg";

const baseUrl = process.env.P2_BASE_URL ?? "http://127.0.0.1:3000";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const client = new Client({ connectionString: databaseUrl });
const suffix = `p2-images-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const productIds = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createProduct(name, sku) {
  const [row] = (
    await client.query(
      `insert into products (name, slug, sku, category_slug, price, stock, track_inventory, allow_backorders, status, active)
       values ($1, $2, $3, 'skincare', 1000, 10, true, false, 'published', true)
       returning id`,
      [name, `${suffix}-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`, sku],
    )
  ).rows;
  productIds.push(row.id);
  return row.id;
}

async function addImage(productId, url, sortOrder, isPrimary = false) {
  await client.query(
    `insert into product_images (product_id, url, alt, image_type, sort_order, is_primary)
     values ($1, $2, $3, 'gallery', $4, $5)`,
    [productId, url, `fixture-${productId}`, sortOrder, isPrimary],
  );
}

try {
  await client.connect();

  const withImages = await createProduct("P2 Image Owner", `${suffix}-OWNER`);
  const secondProduct = await createProduct("P2 Second Image Owner", `${suffix}-SECOND`);
  const noImages = await createProduct("P2 No Images", `${suffix}-NONE`);

  const firstUrl = `https://example.test/${suffix}-first.jpg`;
  const secondUrl = `https://example.test/${suffix}-second.jpg`;
  const secondExtraUrl = `https://example.test/${suffix}-second-extra.jpg`;

  await addImage(withImages, firstUrl, 0, true);
  await addImage(secondProduct, secondUrl, 0, true);
  await addImage(secondProduct, secondExtraUrl, 1, false);

  const response = await fetch(`${baseUrl}/api/catalog`);
  const data = await response.json();

  assert(response.ok, `catalog request failed: ${response.status}`);
  const owner = (data.products ?? []).find((p) => p.id === withImages);
  const second = (data.products ?? []).find((p) => p.id === secondProduct);
  const empty = (data.products ?? []).find((p) => p.id === noImages);

  assert(owner, "image owner product missing from catalog");
  assert(second, "second image owner product missing from catalog");
  assert(empty, "no-image product missing from catalog");

  assert(owner.images.length === 1, `expected one image for owner, got ${owner.images.length}`);
  assert(owner.images[0].url === firstUrl, `owner received wrong image: ${JSON.stringify(owner.images)}`);
  assert(owner.images[0].isPrimary === true, "owner primary image flag was lost");

  assert(second.images.length === 2, `expected two images for second product, got ${second.images.length}`);
  assert(second.images[0].url === secondUrl, `second product image ordering mismatch: ${JSON.stringify(second.images)}`);
  assert(second.images[1].url === secondExtraUrl, `second product extra image mismatch: ${JSON.stringify(second.images)}`);

  assert(empty.images.length === 0, `product without images should return an empty image list, got ${empty.images.length}`);
  assert(!owner.images.some((image) => image.url === secondUrl || image.url === secondExtraUrl), "cross-product image association detected");
  assert(!second.images.some((image) => image.url === firstUrl), "reverse cross-product image association detected");

  console.log("P2_IMAGE_ASSOCIATION_REGRESSION_PASS");
} finally {
  if (client._connected) {
    if (productIds.length) {
      await client.query("delete from products where id = any($1::int[])", [productIds]).catch(() => {});
    }
    await client.end();
  }
}
