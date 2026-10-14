import { Client } from "pg";

const baseUrl = process.env.P2_BASE_URL ?? "http://127.0.0.1:3000";
const databaseUrl = process.env.DATABASE_URL;
const adminPassword = process.env.ADMIN_PASSWORD;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!adminPassword) throw new Error("ADMIN_PASSWORD is required");

function assert(condition, message) {
  if (!condition) throw new Error(message);
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
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }
  return { response, data };
}

async function executePlan(cookie, operation, payload, instruction) {
  const plan = {
    summary: "P2 Master AI execution integration test",
    intent: instruction,
    actions: [{
      domain: operation.split(".")[0],
      operation,
      summary: instruction,
      requiresConfirmation: false,
      payload: JSON.stringify(payload),
    }],
  };
  const result = await request("/api/admin/ai/master", "POST", {
    instruction,
    confirmedPlan: plan,
    confirmIndexes: [0],
    autoModel: true,
    webMode: "off",
  }, cookie);
  assert(result.response.ok, `${operation} endpoint returned HTTP ${result.response.status}: ${JSON.stringify(result.data)}`);
  const item = result.data.execution?.find((entry) => entry.operation === operation);
  assert(item?.executed === true && item?.ok === true, `${operation} was not successfully executed: ${JSON.stringify(result.data.execution)}`);
  return item;
}

const client = new Client({ connectionString: databaseUrl });
const suffix = `p2-master-runtime-${Date.now()}`;

async function waitForApplication() {
  const deadline = Date.now() + 30_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
      lastError = new Error(`health endpoint returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    // eslint-disable-next-line no-await-in-loop -- readiness polling must pause between checks.
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`application did not become ready within 30 seconds: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
let createdProductId = null;
let createdMediaId = null;
let sectionId = null;
let originalSectionTitle = null;
let changedSectionTitle = null;

try {
  await client.connect();
  await waitForApplication();

  const login = await request("/api/admin/login", "POST", { password: adminPassword });
  assert(login.response.ok, `admin login failed: ${JSON.stringify(login.data)}`);
  const setCookie = login.response.headers.get("set-cookie") ?? "";
  const match = /svj_admin=[^;]+/.exec(setCookie);
  assert(match, "admin login did not return the svj_admin cookie");
  const cookie = match[0];

  const category = (await client.query("select slug from categories order by sort_order, id limit 1")).rows[0];
  assert(category?.slug, "no category is available for a Master AI draft creation test");

  const slug = suffix.toLowerCase();
  const productResult = await executePlan(cookie, "products.create_draft", {
    product: {
      name: "Master AI Runtime Test " + suffix,
      slug,
      categorySlug: category.slug,
      price: 0,
      stock: 0,
      status: "draft",
      active: false,
      sku: "",
      barcode: "",
      shortDescription: "Temporary integration-test draft",
      description: "",
    },
    images: [],
    variants: [],
  }, "Create a temporary draft for the Master AI runtime integration test.");

  createdProductId = Number(productResult.data?.productId);
  assert(Number.isInteger(createdProductId) && createdProductId > 0, `create_draft did not return a product id: ${JSON.stringify(productResult)}`);
  const product = (await client.query(
    "select id, slug, status, active from products where id = $1",
    [createdProductId],
  )).rows[0];
  assert(product?.slug === slug && product.status === "draft" && product.active === false,
    `created draft was not persisted with the expected state: ${JSON.stringify(product)}`);

  // Verify content edits persist independently of draft creation.
  const changedDescription = "Verified Master AI description " + suffix;
  await executePlan(cookie, "products.update_content", {
    id: createdProductId,
    patch: { shortDescription: "Verified short description " + suffix, description: changedDescription },
  }, "Update the temporary product description for the Master AI runtime integration test.");
  const contentProduct = (await client.query(
    "select short_description, description from products where id = $1",
    [createdProductId],
  )).rows[0];
  assert(contentProduct?.short_description === "Verified short description " + suffix &&
    contentProduct?.description === changedDescription,
    `products.update_content reported success but content did not persist: ${JSON.stringify(contentProduct)}`);

  // Price and stock are protected changes: explicitly confirm them, then verify DB state.
  await executePlan(cookie, "products.update_financial", {
    id: createdProductId,
    patch: { price: 1234, stock: 17 },
  }, "Set temporary test product price and stock for the Master AI runtime integration test.");
  const financialProduct = (await client.query(
    "select price, stock from products where id = $1",
    [createdProductId],
  )).rows[0];
  assert(Number(financialProduct?.price) === 1234 && Number(financialProduct?.stock) === 17,
    `products.update_financial reported success but price/stock did not persist: ${JSON.stringify(financialProduct)}`);

  // Exercise product-image association independently from file-upload infrastructure.
  const mediaResult = await client.query(
    "insert into media (url, filename, title, alt, mime_type, folder, source) values ($1, $2, $3, $4, $5, $6, $7) returning id",
    [`https://example.invalid/${suffix}.jpg`, `${suffix}.jpg`, "Runtime test image", "Runtime test alt", "image/jpeg", "products", "integration-test"],
  );
  const testMediaId = Number(mediaResult.rows[0]?.id);
  assert(Number.isInteger(testMediaId) && testMediaId > 0, "could not create a temporary media record");
  createdMediaId = testMediaId;
  await executePlan(cookie, "products.attach_media", {
    productId: createdProductId,
    mediaId: testMediaId,
    isPrimary: true,
    alt: "Verified attached image " + suffix,
  }, "Attach a temporary media record to the test product.");
  const attachedImage = (await client.query(
    "select media_id, url, alt, is_primary from product_images where product_id = $1 and media_id = $2",
    [createdProductId, testMediaId],
  )).rows[0];
  assert(attachedImage && Number(attachedImage.media_id) === testMediaId &&
    attachedImage.url === `https://example.invalid/${suffix}.jpg` &&
    attachedImage.alt === "Verified attached image " + suffix && attachedImage.is_primary === true,
    `products.attach_media reported success but image association did not persist: ${JSON.stringify(attachedImage)}`);

  const editedTitle = "Edited media title " + suffix;
  const editedAlt = "Edited media alt " + suffix;
  const editedCaption = "Edited media caption " + suffix;
  await executePlan(cookie, "media.edit", {
    id: testMediaId,
    title: editedTitle,
    alt: editedAlt,
    caption: editedCaption,
    folder: "homepage",
    focalX: 22,
    focalY: 78,
  }, "Edit metadata on a temporary media record for the Master AI runtime integration test.");
  const editedMedia = (await client.query(
    "select title, alt, caption, folder, focal_x, focal_y from media where id = $1",
    [testMediaId],
  )).rows[0];
  assert(editedMedia?.title === editedTitle &&
    editedMedia?.alt === editedAlt &&
    editedMedia?.caption === editedCaption &&
    editedMedia?.folder === "homepage" &&
    Number(editedMedia?.focal_x) === 22 &&
    Number(editedMedia?.focal_y) === 78,
    `media.edit reported success but metadata did not persist: ${JSON.stringify(editedMedia)}`);

  const section = (await client.query(
    "select id, title from homepage_sections order by sort_order, id limit 1",
  )).rows[0];
  assert(section && Number.isInteger(Number(section.id)), "no homepage section is available for runtime verification");
  sectionId = Number(section.id);
  originalSectionTitle = section.title;
  changedSectionTitle = `${String(originalSectionTitle || "Homepage section")} [${suffix}]`;

  await executePlan(cookie, "homepage.update_section", {
    id: sectionId,
    patch: { title: changedSectionTitle },
  }, "Temporarily update a homepage section title for the Master AI runtime integration test.");

  const updatedSection = (await client.query(
    "select title from homepage_sections where id = $1",
    [sectionId],
  )).rows[0];
  assert(updatedSection?.title === changedSectionTitle,
    `homepage.update_section reported success but the database title did not change: ${JSON.stringify(updatedSection)}`);

  console.log("P2_MASTER_AI_RUNTIME_INTEGRATION_PASS");
  console.log(JSON.stringify({
    product: { id: createdProductId, status: product.status, active: false, persisted: true },
    content: { shortDescriptionAndDescriptionUpdatedAndVerified: true },
    financial: { price: 1234, stock: 17, updatedAndVerified: true },
    imageAssociation: { mediaId: createdMediaId, attachedAndVerified: true, uploadTested: false },
    homepageSection: { id: sectionId, titleUpdatedAndVerified: true },
    mediaEdit: { id: testMediaId, metadataUpdatedAndVerified: true },
    operations: ["products.create_draft", "products.update_content", "products.update_financial", "products.attach_media", "media.edit", "homepage.update_section"],
  }, null, 2));
} catch (error) {
  console.error("P2_MASTER_AI_RUNTIME_INTEGRATION_FAIL");
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
} finally {
  const cleanupErrors = [];
  if (client._connected) {
    if (sectionId !== null && originalSectionTitle !== null) {
      await client.query("update homepage_sections set title = $1 where id = $2", [originalSectionTitle, sectionId])
        .catch((error) => cleanupErrors.push("restore homepage section: " + error.message));
      const restored = await client.query("select title from homepage_sections where id = $1", [sectionId])
        .catch((error) => { cleanupErrors.push("verify homepage section restoration: " + error.message); return { rows: [] }; });
      if (restored.rows[0]?.title !== originalSectionTitle) cleanupErrors.push("homepage section title was not restored");
    }
    if (createdProductId !== null) {
      await client.query("delete from product_images where product_id = $1", [createdProductId])
        .catch((error) => cleanupErrors.push("remove temporary product images: " + error.message));
      await client.query("delete from products where id = $1", [createdProductId])
        .catch((error) => cleanupErrors.push("remove temporary product: " + error.message));
      const remainingProduct = await client.query("select id from products where id = $1", [createdProductId])
        .catch((error) => { cleanupErrors.push("verify temporary product cleanup: " + error.message); return { rows: [{ id: createdProductId }] }; });
      if (remainingProduct.rows.length) cleanupErrors.push("temporary product still exists: " + createdProductId);
    }
    if (createdMediaId !== null) {
      await client.query("delete from media where id = $1", [createdMediaId])
        .catch((error) => cleanupErrors.push("remove temporary media: " + error.message));
      const remainingMedia = await client.query("select id from media where id = $1", [createdMediaId])
        .catch((error) => { cleanupErrors.push("verify temporary media cleanup: " + error.message); return { rows: [{ id: createdMediaId }] }; });
      if (remainingMedia.rows.length) cleanupErrors.push("temporary media still exists: " + createdMediaId);
    }
    await client.end().catch((error) => cleanupErrors.push("close database connection: " + error.message));
  }
  if (cleanupErrors.length) {
    console.error("P2_MASTER_AI_RUNTIME_CLEANUP_FAIL");
    console.error(JSON.stringify(cleanupErrors));
    process.exitCode = 1;
  } else {
    console.log("P2_MASTER_AI_RUNTIME_CLEANUP_PASS");
  }
}
