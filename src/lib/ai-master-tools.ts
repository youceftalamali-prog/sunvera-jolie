import { db } from "@/db";
import {
  banners,
  categories,
  customers,
  homepageSections,
  media,
  navigationItems,
  orders,
  productImages,
  products,
  shippingRates,
  trustBadges,
  wilayas,
} from "@/db/schema";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getSettingsMap, getTheme, saveSection, saveTheme } from "@/lib/settings";
import {
  normalizeProduct,
  normalizeProductTypography,
  normalizeProductTypographyPatch,
  validateProduct,
  validateProductSku,
  writeImages,
  writeVariants,
} from "@/lib/master-product-write";
import { deleteStoredFileIfUnreferenced, findMediaReferences } from "@/lib/media-references";
import { isAllowedStatusTransition, STATUSES } from "@/lib/status";
import { mediaPublicUrl, storeFile } from "@/lib/storage";
import { sanitizeHtml } from "@/lib/sanitize";
import { generateImage } from "@/lib/ai-gateway";
import { assertPublishableProductImage, duplicateProduct } from "@/lib/product-write";

export type MasterExecutionAction = {
  domain: string;
  operation: string;
  summary: string;
  requiresConfirmation: boolean;
  payload?: string;
};

export type MasterExecutionPlan = {
  summary: string;
  intent: string;
  actions: MasterExecutionAction[];
};

export type MasterArtifact = {
  type: "image" | "video";
  url: string;
  mediaId?: number;
  title?: string;
  alt?: string;
};

export type ExecutionResult = {
  index: number;
  domain: string;
  operation: string;
  ok: boolean;
  executed: boolean;
  requiresConfirmation?: boolean;
  message: string;
  data?: unknown;
  artifacts?: MasterArtifact[];
};

type Payload = Record<string, unknown>;

const SAFE_OPERATIONS = new Set([
  "products.update_content",
  "products.attach_media",
  "products.duplicate",
  "products.create_draft",
  "products.publish",
  "homepage.update_section",
  "homepage.reorder",
  "categories.create",
  "categories.update",
  "settings.update",
  "settings.update_theme",
  "cms.banner_save",
  "cms.badge_save",
  "cms.nav_save",
]);

const PROTECTED_OPERATIONS = new Set([
  "media.generate",
  "products.create",
  "products.update_financial",
  "products.archive",
  "products.delete_permanently",
  "media.delete",
  "media.edit",
  "orders.update_status",
  "shipping.update_rate",
  "settings.update_protected",
  "cms.banner_delete",
  "cms.badge_delete",
  "cms.nav_delete",
  "categories.archive",
]);

const CONFIRMABLE_OPERATIONS = new Set([...SAFE_OPERATIONS, ...PROTECTED_OPERATIONS]);

const READ_ONLY_OPERATIONS = new Set([
  "products.list",
  "products.get",
  "media.list",
  "orders.list",
  "categories.list",
  "shipping.list",
  "settings.get",
  "cms.list",
  "customers.list",
  "account.inspect",
]);

const PROTECTED_KEY_PATTERN =
  /(?:price|stock|cost|inventory|order|shipping|payment|security|customer|delete|remove|hard|credential|secret|password|role|permission|archive)/i;

const PROTECTED_SETTINGS_SECTIONS = new Set(["checkout", "security", "ai"]);

function parsePayload(raw?: string): Payload {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Payload) : {};
  } catch {
    return {};
  }
}

const OPERATION_ALIASES: Record<string, string> = {
  "products.create_draft": "products.create_draft",
  "products.create": "products.create",
  "products.update_content": "products.update_content",
  "products.update_financial": "products.update_financial",
  "products.publish": "products.publish",
  "products.attach_media": "products.attach_media",
  "products.duplicate": "products.duplicate",
  "products.archive": "products.archive",
  "products.delete_permanently": "products.delete_permanently",
  "media.generate": "media.generate",
  "media.edit": "media.edit",
  "media.delete": "media.delete",
  "homepage.update_section": "homepage.update_section",
  "homepage.reorder": "homepage.reorder",
  "categories.create": "categories.create",
  "categories.update": "categories.update",
  "categories.archive": "categories.archive",
  "settings.update": "settings.update",
  "settings.update_theme": "settings.update_theme",
  "settings.update_protected": "settings.update_protected",
  "cms.banner_save": "cms.banner_save",
  "cms.banner_delete": "cms.banner_delete",
  "cms.badge_save": "cms.badge_save",
  "cms.badge_delete": "cms.badge_delete",
  "cms.nav_save": "cms.nav_save",
  "cms.nav_delete": "cms.nav_delete",
};

function canonicalMasterOperation(domain: string, operation: string) {
  const raw = String(operation ?? "").trim().toLowerCase();
  if (!raw) return raw;
  if (raw.includes(".")) return OPERATION_ALIASES[raw] ?? raw;

  const candidate = String(domain ?? "").trim().toLowerCase() + "." + raw;
  if (OPERATION_ALIASES[candidate]) return OPERATION_ALIASES[candidate];

  const aliasByOperation: Record<string, string> = {
    create_draft: "products.create_draft",
    create: "products.create",
    update_content: "products.update_content",
    update_financial: "products.update_financial",
    publish: "products.publish",
    attach_media: "products.attach_media",
    duplicate: "products.duplicate",
    archive: "products.archive",
    delete_permanently: "products.delete_permanently",
    generate: "media.generate",
    edit: "media.edit",
    delete_media: "media.delete",
    update_section: "homepage.update_section",
    reorder: "homepage.reorder",
  };

  return aliasByOperation[raw] ?? raw;
}

export function normalizeMasterAction(action: MasterExecutionAction): MasterExecutionAction {
  return {
    ...action,
    domain: String(action.domain ?? "").trim().toLowerCase(),
    operation: canonicalMasterOperation(action.domain, action.operation),
    summary: String(action.summary ?? "").trim(),
    payload: typeof action.payload === "string" ? action.payload : "{}",
  };
}

function isProtectedAction(action: MasterExecutionAction, payload: Payload) {
  if (READ_ONLY_OPERATIONS.has(action.operation)) return false;
  if (PROTECTED_OPERATIONS.has(action.operation)) return true;
  if (!SAFE_OPERATIONS.has(action.operation)) return true;

  if (action.operation === "settings.update") {
    const section = String(payload.section ?? "").trim().toLowerCase();
    return PROTECTED_SETTINGS_SECTIONS.has(section);
  }

  if (action.domain === "products") {
    const patch = payload.patch;
    if (patch && typeof patch === "object" && !Array.isArray(patch)) {
      const keys = Object.keys(patch as Record<string, unknown>);
      if (keys.some((key) => PROTECTED_KEY_PATTERN.test(key))) return true;
      if (String((patch as Record<string, unknown>).status ?? "").toLowerCase() === "archived") return true;
    }
    return false;
  }

  // Other explicitly safe operations (including homepage.reorder) are not
  // made protected by broad keyword matching such as "order" inside "reorder".
  return false;
}

function safePatch(source: Payload) {
  const raw = source.patch;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const allowed = new Set([
    "name",
    "shortDescription",
    "description",
    "typography",
    "benefits",
    "ingredients",
    "howToUse",
    "warnings",
    "size",
    "volume",
    "skinType",
    "hairType",
    "productType",
    "routineStep",
    "tags",
    "bestSeller",
    "newArrival",
    "featured",
    "seoTitle",
    "seoDescription",
    "seoKeywords",
    "canonicalUrl",
    "categorySlug",
    "subcategorySlug",
  ]);

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(key)) continue;
    if (key === "tags" && Array.isArray(value)) {
      const tags = value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean);
      if (tags.length) out[key] = tags.join(", ");
      continue;
    }
    if (key === "typography") {
      const typographyPatch = normalizeProductTypographyPatch(value);
      if (Object.keys(typographyPatch).length) out[key] = typographyPatch;
      continue;
    }
    if (key === "description" || key === "howToUse") {
      out[key] = sanitizeHtml(String(value ?? ""));
      continue;
    }
    if (typeof value === "string" || typeof value === "boolean") out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

async function verifyCategory(slug: string) {
  const [row] = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  if (!row) throw new Error("Category does not exist: " + slug);
}

async function executeReadOnlyAction(
  action: MasterExecutionAction,
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] } | undefined> {
  switch (action.operation) {
    case "products.list": {
      const rows = await db
        .select({
          id: products.id,
          name: products.name,
          price: products.price,
          stock: products.stock,
          status: products.status,
          active: products.active,
          categorySlug: products.categorySlug,
        })
        .from(products)
        .orderBy(desc(products.id))
        .limit(30);
      return { message: "Products loaded.", data: rows };
    }

    case "products.get": {
      const id = Number(payload.id);
      if (!Number.isInteger(id) || id <= 0) throw new Error("products.get requires a valid product id.");
      const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
      if (!product) throw new Error("Product not found.");
      const images = await db
        .select()
        .from(productImages)
        .where(eq(productImages.productId, id))
        .orderBy(asc(productImages.sortOrder));
      return { message: "Product loaded.", data: { product, images } };
    }

    case "media.list": {
      const rows = await db
        .select({
          id: media.id,
          filename: media.filename,
          title: media.title,
          folder: media.folder,
          provider: media.provider,
          url: media.url,
        })
        .from(media)
        .orderBy(desc(media.id))
        .limit(50);
      return { message: "Media library loaded.", data: rows };
    }

    case "orders.list": {
      const rows = await db
        .select({
          id: orders.id,
          reference: orders.reference,
          fullName: orders.fullName,
          status: orders.status,
          total: orders.total,
          wilaya: orders.wilaya,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .orderBy(desc(orders.id))
        .limit(30);
      return { message: "Orders loaded.", data: rows };
    }

    case "categories.list": {
      const rows = await db.select().from(categories).orderBy(asc(categories.sortOrder));
      return { message: "Categories loaded.", data: rows };
    }

    case "shipping.list": {
      const rows = await db
        .select({
          wilayaCode: shippingRates.wilayaCode,
          fee: shippingRates.fee,
          stopDeskFee: shippingRates.stopDeskFee,
          etaDays: shippingRates.etaDays,
          active: shippingRates.active,
        })
        .from(shippingRates)
        .orderBy(asc(shippingRates.wilayaCode));
      return { message: "Shipping rates loaded.", data: rows };
    }

    case "settings.get": {
      const settings = await getSettingsMap();
      const theme = await getTheme();
      return {
        message: "Store settings loaded.",
        data: {
          store: settings.store,
          social: settings.social,
          announcement: settings.announcement,
          footer: settings.footer,
          newsletter: settings.newsletter,
          checkout: settings.checkout,
          seo: settings.seo,
          analytics: settings.analytics,
          theme,
        },
      };
    }

    case "cms.list": {
      const [sections, bannerRows, badgeRows, navRows] = await Promise.all([
        db.select().from(homepageSections).orderBy(asc(homepageSections.sortOrder)),
        db.select().from(banners).orderBy(asc(banners.sortOrder)),
        db.select().from(trustBadges).orderBy(asc(trustBadges.sortOrder)),
        db.select().from(navigationItems).orderBy(asc(navigationItems.sortOrder)),
      ]);
      return {
        message: "CMS content loaded.",
        data: { sections, banners: bannerRows, trustBadges: badgeRows, navigation: navRows },
      };
    }

    case "customers.list": {
      const rows = await db
        .select({
          id: customers.id,
          fullName: customers.fullName,
          phone: customers.phone,
          email: customers.email,
          createdAt: customers.createdAt,
        })
        .from(customers)
        .orderBy(desc(customers.id))
        .limit(30);
      return { message: "Customers loaded.", data: rows };
    }

    case "account.inspect": {
      return {
        message: "The Account section is reserved for the account-module integration. Master AI can already control the other connected admin domains.",
      };
    }
  
  }

  return undefined;
}

async function executeProductsUpdateContent(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("products.update_content requires a valid product id.");

  const patch = safePatch(payload);
  if (!patch) throw new Error("No allowed product content fields were provided.");

  if (patch.typography && typeof patch.typography === "object" && !Array.isArray(patch.typography)) {
    const [existing] = await db
      .select({ typography: products.typography })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);
    if (!existing) throw new Error("Product not found.");
    const existingTypography = existing.typography && typeof existing.typography === "object" && !Array.isArray(existing.typography)
      ? existing.typography as Record<string, unknown>
      : {};
    const requestedTypographyPatch = patch.typography as Record<string, unknown>;
    const mergedTypography: Record<string, unknown> = { ...existingTypography };
    for (const key of ["title", "shortDescription", "description"] as const) {
      const requestedStyle = requestedTypographyPatch[key];
      if (!requestedStyle || typeof requestedStyle !== "object" || Array.isArray(requestedStyle)) continue;
      const currentStyle = existingTypography[key] && typeof existingTypography[key] === "object" && !Array.isArray(existingTypography[key])
        ? existingTypography[key] as Record<string, unknown>
        : {};
      mergedTypography[key] = { ...currentStyle, ...(requestedStyle as Record<string, unknown>) };
    }
    patch.typography = normalizeProductTypography(mergedTypography);
  }

  if (typeof patch.categorySlug === "string" && patch.categorySlug) {
    await verifyCategory(patch.categorySlug);
  }

  const [row] = await db.update(products).set(patch as never).where(eq(products.id, id)).returning();
  if (!row) throw new Error("Product not found.");
  return { message: "Product content updated.", data: { productId: row.id } };
}

async function executeProductsCreateDraft(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const rawProduct = payload.product;
  if (!rawProduct || typeof rawProduct !== "object" || Array.isArray(rawProduct)) {
    throw new Error("products.create_draft requires a product object.");
  }

  const productInput = { ...(rawProduct as Record<string, unknown>) };
  productInput.status = "draft";
  productInput.sku = String(productInput.sku ?? "").trim();
  productInput.barcode = String(productInput.barcode ?? "").trim();

  // Do not let generic product defaults invent facts for AI-created drafts.
  for (const field of [
    "subcategorySlug",
    "shortDescription",
    "description",
    "benefits",
    "ingredients",
    "howToUse",
    "warnings",
    "size",
    "volume",
    "skinType",
    "hairType",
    "productType",
    "routineStep",
    "tags",
    "seoTitle",
    "seoDescription",
    "seoKeywords",
    "canonicalUrl",
  ]) {
    if (productInput[field] === undefined || productInput[field] === null) productInput[field] = "";
  }

  const numericPrice = Number(productInput.price);
  productInput.price = Number.isFinite(numericPrice) && numericPrice >= 0 ? numericPrice : 0;
  const numericStock = Number(productInput.stock);
  productInput.stock = Number.isFinite(numericStock) && numericStock >= 0 ? Math.floor(numericStock) : 0;

  if (!String(productInput.categorySlug ?? "").trim()) {
    throw new Error("products.create_draft requires a categorySlug selected from the store categories.");
  }

  // A draft must never become visible in the storefront merely because the
  // shared product normalizer defaults active=true for ordinary admin writes.
  const normalized = {
    ...normalizeProduct(productInput),
    status: "draft" as const,
    active: false,
  };
  await verifyCategory(normalized.categorySlug);

  const rawImages = Array.isArray(payload.images)
    ? payload.images
    : Array.isArray(productInput.images)
      ? productInput.images as unknown[]
      : [];
  const rawVariants = Array.isArray(payload.variants)
    ? payload.variants
    : Array.isArray(productInput.variants)
      ? productInput.variants as unknown[]
      : [];
  const images = rawImages.map((image, index) => {
    const item = image && typeof image === "object" && !Array.isArray(image)
      ? { ...(image as Record<string, unknown>) }
      : {};
    const hasExplicitPrimary = rawImages.some((candidate) =>
      Boolean(candidate && typeof candidate === "object" && !Array.isArray(candidate) && (candidate as Record<string, unknown>).isPrimary)
    );
    if (index === 0 && rawImages.length && !hasExplicitPrimary) item.isPrimary = true;
    return item;
  });
  const created = await db.transaction(async (tx) => {
    const [row] = await tx.insert(products).values(normalized).returning();
    if (!row) throw new Error("Product draft creation failed.");
    await writeImages(tx, row.id, images as never[]);
    await writeVariants(tx, row.id, rawVariants as never[]);
    return row;
  });

  return {
    message: "Product draft created from the supplied content/images.",
    data: {
      productId: created.id,
      name: created.name,
      status: created.status,
      editUrl: "/admin/products/" + created.id + "/edit",
      storefrontPreviewUrl: "/product/" + created.slug,
    },
  };
}

async function executeProductsCreate(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const rawProduct = payload.product;
  if (!rawProduct || typeof rawProduct !== "object" || Array.isArray(rawProduct)) {
    throw new Error("products.create requires a product object.");
  }
  const productInput = rawProduct as Record<string, unknown>;
  const status = String(productInput.status ?? "draft");
  const images = Array.isArray(payload.images)
    ? payload.images
    : Array.isArray(productInput.images)
      ? productInput.images as unknown[]
      : [];
  const variants = Array.isArray(payload.variants)
    ? payload.variants
    : Array.isArray(productInput.variants)
      ? productInput.variants as unknown[]
      : [];
  const errors = validateProduct({ ...productInput, images }, status === "published");
  if (errors.length) throw new Error(errors.join("; "));
  await validateProductSku(String(productInput.sku ?? ""));
  const normalized = normalizeProduct(productInput);
  await verifyCategory(normalized.categorySlug);

  const created = await db.transaction(async (tx) => {
    const [row] = await tx.insert(products).values(normalized).returning();
    if (!row) throw new Error("Product creation failed.");
    await writeImages(tx, row.id, images as never[]);
    await writeVariants(tx, row.id, variants as never[]);
    if (row.status === "published") await assertPublishableProductImage(tx, row.id);
    return row;
  });

  return {
    message: "Product created.",
    data: { productId: created.id, name: created.name, status: created.status },
  };
}

function buildFinancialProductPatch(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Financial product patch is required.");
  }

  const source = raw as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const key of ["price", "comparePrice", "costPrice", "stock", "lowStockThreshold"]) {
    if (source[key] === undefined) continue;
    const value = Number(source[key]);
    if (!Number.isFinite(value) || value < 0 || (key === "price" && value <= 0)) {
      throw new Error("Invalid " + key + ".");
    }
    if ((key === "stock" || key === "lowStockThreshold") && !Number.isSafeInteger(value)) {
      throw new Error(key + " must be a non-negative whole number.");
    }
    patch[key] = value;
  }

  for (const key of ["trackInventory", "allowBackorders"]) {
    if (source[key] === undefined) continue;
    if (typeof source[key] !== "boolean") throw new Error("Invalid " + key + ".");
    patch[key] = source[key];
  }
  if (!Object.keys(patch).length) throw new Error("No financial product fields were provided.");
  return patch;
}

async function executeProductsUpdateFinancial(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("products.update_financial requires a valid product id.");
  const patch = buildFinancialProductPatch(payload.patch);

  const row = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(products).where(eq(products.id, id)).limit(1).for("update");
    if (!current) throw new Error("Product not found.");
    const finalPrice = Number(patch.price ?? current.price);
    const finalComparePrice = Number(patch.comparePrice ?? current.comparePrice ?? 0);
    if (finalComparePrice > 0 && finalComparePrice < finalPrice) {
      throw new Error("Compare-at price must be higher than the price.");
    }
    const [updated] = await tx.update(products).set(patch as never).where(eq(products.id, id)).returning({
      id: products.id,
      name: products.name,
      price: products.price,
      comparePrice: products.comparePrice,
      costPrice: products.costPrice,
      stock: products.stock,
    });
    if (!updated) throw new Error("Product not found.");
    return updated;
  });
  return { message: "Product financial fields updated.", data: row };
}

async function executeProductsPublish(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("products.publish requires a valid product id.");

  const row = await db.transaction(async (tx) => {
    const [product] = await tx.select().from(products).where(eq(products.id, id)).limit(1).for("update");
    if (!product) throw new Error("Product not found.");
    const errors = validateProduct(product, false);
    if (errors.length) throw new Error("Product cannot be published yet: " + errors.join("; "));
    await assertPublishableProductImage(tx, id);
    const [updated] = await tx
      .update(products)
      .set({ status: "published", active: true })
      .where(eq(products.id, id))
      .returning({ id: products.id, status: products.status, active: products.active });
    if (!updated) throw new Error("Product not found.");
    return updated;
  });
  return { message: "Product published.", data: row };
}

async function executeProductsAttachMedia(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const productId = Number(payload.productId);
  const mediaId = Number(payload.mediaId);
  if (!Number.isInteger(productId) || !Number.isInteger(mediaId)) throw new Error("products.attach_media requires productId and mediaId.");

  return db.transaction(async (tx) => {
    // Serialize attachments per product so concurrent primary-image changes cannot leave
    // a product with no primary image or create duplicate slots for the same media row.
    const [product] = await tx.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1).for("update");
    const [asset] = await tx.select().from(media).where(eq(media.id, mediaId)).limit(1);
    if (!product || !asset) throw new Error("Product or media asset not found.");

    const existingRows = await tx
      .select({ id: productImages.id, mediaId: productImages.mediaId })
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .limit(100);
    const existing = existingRows.find((row) => Number(row.mediaId) === mediaId);
    if (existing) {
      return {
        message: "Media is already attached to the product.",
        data: { productImageId: existing.id, productId, mediaId, existing: true },
      };
    }

    const isPrimary = Boolean(payload.isPrimary ?? false);
    if (isPrimary) {
      await tx.update(productImages)
        .set({ isPrimary: false })
        .where(eq(productImages.productId, productId));
    }

    const [row] = await tx.insert(productImages).values({
      productId,
      mediaId,
      url: asset.url,
      alt: String(payload.alt ?? asset.alt ?? ""),
      imageType: String(payload.imageType ?? "gallery"),
      sortOrder: Number(payload.sortOrder ?? 0),
      isPrimary,
      title: String(payload.title ?? asset.title ?? ""),
      caption: String(payload.caption ?? asset.caption ?? ""),
      focalX: Number(payload.focalX ?? 50),
      focalY: Number(payload.focalY ?? 50),
    }).returning();
    if (!row) throw new Error("Could not attach media to product.");

    return { message: "Media attached to product.", data: { productImageId: row.id, productId, mediaId } };
  });
}

async function executeProductsDuplicate(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("products.duplicate requires a valid product id.");
  // Reuse the admin product writer so Master AI gets the same atomic product + image +
  // variant duplication behavior as the product-management screen.
  const copy = await duplicateProduct(id);
  return { message: "Product duplicated as a draft.", data: { productId: copy.id } };
}

async function executeProductsArchive(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("products.archive requires a valid product id.");
  const [row] = await db.update(products).set({ status: "archived", active: false }).where(eq(products.id, id)).returning({
    id: products.id,
    name: products.name,
    status: products.status,
    active: products.active,
  });
  if (!row) throw new Error("Product not found.");
  return { message: "Product archived and removed from the storefront.", data: row };
}

async function executeProductsDeletePermanently(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("products.delete_permanently requires a valid product id.");
  const [row] = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id, name: products.name });
  if (!row) throw new Error("Product not found.");
  return { message: "Product permanently deleted.", data: row };
}

type GeneratedImageInput = {
  b64_json?: string;
  url?: string;
  mime_type?: string;
  content_type?: string;
};

type GeneratedImageBytes = {
  bytes: Uint8Array;
  candidateMime: string;
};

function decodeGeneratedImageBase64(image: GeneratedImageInput, maxUploadMb: number): GeneratedImageBytes {
  let base64 = image.b64_json ?? "";
  let candidateMime = String(image.mime_type ?? image.content_type ?? "").split(";")[0].trim().toLowerCase();
  const dataUrl = base64.match(/^data:(image\/(?:png|jpeg|webp|avif));base64,/i);
  if (dataUrl) {
    candidateMime = dataUrl[1].toLowerCase();
    base64 = base64.slice(dataUrl[0].length);
  }
  base64 = base64.replace(/\s/g, "");
  if (base64.length > Math.ceil(maxUploadMb * 1024 * 1024 * 1.4)) {
    throw new Error("Generated image exceeds the configured upload-size limit.");
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes, candidateMime };
}

async function readGeneratedImageResponse(response: Response, maxUploadMb: number): Promise<Uint8Array> {
  const maxBytes = maxUploadMb * 1024 * 1024;
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) throw new Error("Generated image exceeds the configured upload-size limit.");
  if (!response.body) {
    const body = await response.arrayBuffer();
    if (body.byteLength > maxBytes) throw new Error("Generated image exceeds the configured upload-size limit.");
    return new Uint8Array(body);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error("Generated image exceeds the configured upload-size limit.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function downloadGeneratedImage(imageUrl: string, initialMime: string, maxUploadMb: number): Promise<GeneratedImageBytes> {
  const sourceUrl = new URL(imageUrl);
  if (
    sourceUrl.protocol !== "https:" ||
    /^(?:localhost|.*\.local|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$)/i.test(sourceUrl.hostname)
  ) {
    throw new Error("The image provider returned an unsupported image URL.");
  }
  const response = await fetch(sourceUrl, { redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error("Could not download the generated image (" + response.status + ").");
  const candidateMime = String(response.headers.get("content-type") ?? initialMime).split(";")[0].trim().toLowerCase();
  const bytes = await readGeneratedImageResponse(response, maxUploadMb);
  return { bytes, candidateMime };
}

async function getGeneratedImageBytes(image: GeneratedImageInput, maxUploadMb: number): Promise<GeneratedImageBytes> {
  if (image.b64_json) return decodeGeneratedImageBase64(image, maxUploadMb);
  if (image.url) {
    const initialMime = String(image.mime_type ?? image.content_type ?? "").split(";")[0].trim().toLowerCase();
    return downloadGeneratedImage(image.url, initialMime, maxUploadMb);
  }
  throw new Error("The image provider returned neither an image URL nor base64 image data.");
}

function resolveGeneratedImageMime(bytes: Uint8Array, candidateMime: string): string {
  const png = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  const avif = bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 12)).includes("ftypavif");
  if (png) return "image/png";
  if (jpeg) return "image/jpeg";
  if (webp) return "image/webp";
  if (avif) return "image/avif";
  return candidateMime;
}

async function saveGeneratedImage(
  bytes: Uint8Array,
  candidateMime: string,
  index: number,
  payload: Payload,
  title: string,
  prompt: string,
  maxUploadMb: number,
  allowedTypes: string,
): Promise<MasterArtifact> {
  const extensionByMime: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  const extension = extensionByMime[candidateMime];
  if (!extension) throw new Error("Generated file format is not supported: " + (candidateMime || "unknown") + ".");
  if (bytes.byteLength > maxUploadMb * 1024 * 1024) throw new Error("Generated image exceeds the configured upload-size limit.");

  const filename = "master-ai-" + Date.now().toString(36) + "-" + (index + 1) + "." + extension;
  const backingBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(backingBuffer).set(bytes);
  const file = new File([backingBuffer], filename, { type: candidateMime });
  let stored: Awaited<ReturnType<typeof storeFile>> | null = null;
  try {
    stored = await storeFile(file, "ai-generated", maxUploadMb, allowedTypes);
    const saved = await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(media).values({
        url: stored!.url || "",
        storageKey: stored!.storageKey,
        provider: stored!.provider,
        filename: stored!.filename,
        alt: String(payload.alt ?? title).slice(0, 500),
        mimeType: stored!.mimeType,
        size: stored!.size,
        width: stored!.width,
        height: stored!.height,
        folder: "ai-generated",
        title,
        caption: prompt.slice(0, 1000),
        focalX: 50,
        focalY: 50,
        source: "master-ai",
      }).returning();
      if (!inserted) throw new Error("Generated image was stored but its media record could not be created.");
      if (inserted.url) return inserted;
      const [updated] = await tx.update(media).set({ url: mediaPublicUrl(inserted) }).where(eq(media.id, inserted.id)).returning();
      if (!updated) throw new Error("Generated image was stored but its public media URL could not be saved.");
      return updated;
    });
    return {
      type: "image",
      url: saved.url,
      mediaId: saved.id,
      title: saved.title || title,
      alt: saved.alt || title,
    };
  } catch (error) {
    if (stored) {
      await deleteStoredFileIfUnreferenced({ provider: stored.provider, storageKey: stored.storageKey }).catch(() => {});
    }
    throw error;
  }
}

async function executeMediaGenerate(
  payload: Payload,
  options: { autoSelectModel?: boolean } = {},
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const prompt = String(payload.prompt ?? payload.description ?? payload.instruction ?? "").trim().slice(0, 6000);
  if (!prompt) throw new Error("media.generate requires a detailed image prompt.");

  const safeRatios = new Set(["1:1", "3:4", "4:3", "9:16", "16:9"]);
  const requestedRatio = String(payload.aspectRatio ?? payload.aspect_ratio ?? "");
  const aspectRatio = safeRatios.has(requestedRatio) ? requestedRatio : "1:1";
  const requestedResolution = String(payload.resolution ?? "");
  const resolution = /^(?:1K|2K|4K|1024x1024|2048x2048|4096x4096)$/i.test(requestedResolution)
    ? requestedResolution
    : undefined;
  const requestedCount = Math.floor(Number(payload.n ?? payload.count ?? 1));
  const count = Number.isFinite(requestedCount) ? Math.max(1, Math.min(4, requestedCount)) : 1;
  const inputReferences = (Array.isArray(payload.inputReferences) ? payload.inputReferences : [])
    .map((value) => String(value ?? "").trim())
    .filter((value) => {
      try { return new URL(value).protocol === "https:"; } catch { return false; }
    })
    .slice(0, 4);

  const generated = await generateImage(prompt, {
    aspectRatio,
    resolution,
    n: count,
    inputReferences,
    autoSelectModel: options.autoSelectModel === true,
    modelOverride: String(payload.model ?? "").trim() || undefined,
  });
  const images = Array.isArray(generated.images) ? generated.images.slice(0, count) : [];
  if (!images.length) throw new Error("The image provider returned no generated images.");

  const settings = await getSettingsMap();
  const maxUploadMb = Math.max(1, Math.min(40, Number(settings.security?.maxUploadMb) || 8));
  const allowedTypes = "image/jpeg,image/png,image/webp,image/avif";
  const artifacts: MasterArtifact[] = [];
  const failures: string[] = [];
  const title = String(payload.title ?? "Master AI generated image").trim().slice(0, 180) || "Master AI generated image";

  for (let index = 0; index < images.length; index += 1) {
    try {
      const image = images[index] as GeneratedImageInput;
      const { bytes, candidateMime: providerMime } = await getGeneratedImageBytes(image, maxUploadMb);
      const candidateMime = resolveGeneratedImageMime(bytes, providerMime);
      artifacts.push(await saveGeneratedImage(bytes, candidateMime, index, payload, title, prompt, maxUploadMb, allowedTypes));
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "Could not save a generated image.");
    }
  }

  if (!artifacts.length) {
    throw new Error("Image generation completed, but no image could be saved to the media library. " + failures.join(" | "));
  }

  return {
    message: "Generated image saved to the media library.",
    data: {
      mediaIds: artifacts.map((artifact) => artifact.mediaId).filter((id): id is number => typeof id === "number"),
      model: generated.route.model,
      savedCount: artifacts.length,
      warnings: failures,
    },
    artifacts,
  };
}

async function validateHomepageProductIds(rawProductIds: unknown) {
  if (rawProductIds === undefined) return;
  if (!Array.isArray(rawProductIds)) {
    throw new Error("Homepage productIds must be an array.");
  }

  const productIds = rawProductIds.map(Number);
  if (productIds.some((productId) => !Number.isInteger(productId) || productId <= 0)) {
    throw new Error("Homepage productIds must contain positive integer product ids.");
  }

  const uniqueProductIds = [...new Set(productIds)];
  if (uniqueProductIds.length !== productIds.length) {
    throw new Error("Homepage productIds contains duplicate product ids.");
  }
  if (!uniqueProductIds.length) return;

  const existingProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(inArray(products.id, uniqueProductIds));
  if (existingProducts.length !== uniqueProductIds.length) {
    throw new Error("Homepage productIds contains a product id that does not exist.");
  }
}

function normalizeHomepageSectionPatch(rawPatch: Record<string, unknown>) {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawPatch)) {
    if (key !== "overlayOpacity") {
      safe[key] = value;
      continue;
    }

    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new Error("Homepage overlayOpacity must be numeric.");
    const percentage = Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
    safe[key] = Math.max(0, Math.min(100, Math.round(percentage)));
  }
  return safe;
}

async function executeHomepageUpdateSection(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("homepage.update_section requires a section id.");

  const patch = payload.patch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("Homepage section patch is required.");
  }

  const allowed = new Set([
    "title", "subtitle", "body", "imageUrl", "imageMobileUrl", "imageTabletUrl",
    "buttonText", "buttonUrl", "button2Text", "button2Url", "background", "textColor",
    "textPosition", "overlayOpacity", "productMode", "productCount", "productIds",
    "items", "settings", "enabled",
  ]);
  const rawPatch = patch as Record<string, unknown>;
  const unsupported = Object.keys(rawPatch).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    throw new Error("Homepage section patch contains unsupported fields: " + unsupported.join(", ") + ".");
  }

  const [existingSection] = await db
    .select({ id: homepageSections.id })
    .from(homepageSections)
    .where(eq(homepageSections.id, id))
    .limit(1);
  if (!existingSection) throw new Error("Homepage section not found.");

  await validateHomepageProductIds(rawPatch.productIds);
  const safe = normalizeHomepageSectionPatch(rawPatch);
  const [row] = await db
    .update(homepageSections)
    .set(safe as never)
    .where(eq(homepageSections.id, id))
    .returning();
  if (!row) throw new Error("Homepage section not found.");
  return { message: "Homepage section updated.", data: { sectionId: row.id } };
}

async function executeHomepageReorder(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const order = Array.isArray(payload.order) ? payload.order.map(Number) : [];
  if (!order.length) throw new Error("homepage.reorder requires section id order.");
  if (order.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error("homepage.reorder requires only positive integer section ids.");
  }

  const uniqueOrder = [...new Set(order)];
  if (uniqueOrder.length !== order.length) {
    throw new Error("homepage.reorder contains duplicate section ids.");
  }

  const currentSections = await db
    .select({ id: homepageSections.id })
    .from(homepageSections)
    .orderBy(asc(homepageSections.sortOrder));
  const currentIds = currentSections.map((section) => Number(section.id));
  if (uniqueOrder.length !== currentIds.length || uniqueOrder.some((id) => !currentIds.includes(id))) {
    throw new Error("homepage.reorder must contain every current homepage section id exactly once.");
  }

  await db.transaction(async (tx) => {
    for (let index = 0; index < order.length; index += 1) {
      await tx.update(homepageSections).set({ sortOrder: index }).where(eq(homepageSections.id, order[index]));
    }
  });
  return { message: "Homepage sections reordered.", data: { count: order.length } };
}

function applyMediaTextFields(payload: Payload, patch: Record<string, unknown>) {
  for (const key of ["title", "alt", "caption"] as const) {
    if (payload[key] === undefined) continue;
    if (typeof payload[key] !== "string" && typeof payload[key] !== "number" && typeof payload[key] !== "boolean") {
      throw new TypeError(key + " must be a string or scalar value.");
    }
    patch[key] = String(payload[key]).slice(0, key === "alt" ? 500 : 1000);
  }
}

function applyMediaFolder(payload: Payload, patch: Record<string, unknown>) {
  if (payload.folder === undefined) return;
  if (typeof payload.folder !== "string") throw new Error("folder must be a string.");
  const allowedFolders = new Set(["products", "homepage", "banners", "categories", "brand", "ai", "marketing", "content", "other"]);
  if (!allowedFolders.has(payload.folder)) throw new Error("Unknown media folder.");
  patch.folder = payload.folder;
}

function applyMediaFocalPoints(payload: Payload, patch: Record<string, unknown>) {
  for (const key of ["focalX", "focalY"] as const) {
    if (payload[key] === undefined) continue;
    const value = Number(payload[key]);
    if (!Number.isFinite(value)) throw new Error(key + " must be a number.");
    patch[key] = Math.max(0, Math.min(100, Math.round(value)));
  }
}

function buildMediaMetadataPatch(payload: Payload): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  applyMediaTextFields(payload, patch);
  applyMediaFolder(payload, patch);
  applyMediaFocalPoints(payload, patch);
  if (!Object.keys(patch).length) throw new Error("media.edit requires at least one supported metadata field.");
  return patch;
}

async function executeMediaEdit(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const id = Number(payload.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("media.edit requires a valid media id.");
  const [asset] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!asset) throw new Error("Media asset not found.");

  const patch = buildMediaMetadataPatch(payload);
  const [row] = await db.update(media).set(patch).where(eq(media.id, id)).returning({
    id: media.id,
    title: media.title,
    alt: media.alt,
    caption: media.caption,
    folder: media.folder,
    focalX: media.focalX,
    focalY: media.focalY,
  });
  if (!row) throw new Error("Media asset not found.");
  return { message: "Media metadata updated.", data: row };
}

async function executeMediaDelete(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("media.delete requires a valid media id.");
  const [asset] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!asset) throw new Error("Media asset not found.");
  const refs = await findMediaReferences(asset);
  if (refs.productImages.length || refs.textReferences.length) {
    throw new Error("Media is still referenced by the store. Replace or detach references before deleting it.");
  }
  await db.delete(media).where(eq(media.id, id));
  const cleanup = await deleteStoredFileIfUnreferenced({ provider: asset.provider, storageKey: asset.storageKey });
  return { message: "Media asset deleted.", data: { mediaId: id, cleanup } };
}

async function executeCategoryWrite(
  payload: Payload,
  action: MasterExecutionAction,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const name = String(payload.name ?? "").trim();
  const slug = String(payload.slug ?? "").trim();
  if (!name || !slug) throw new Error("Category name and slug are required.");

  const values = {
    name,
    slug,
    group: String(payload.group ?? "Skincare"),
    parentSlug: String(payload.parentSlug ?? ""),
    tagline: String(payload.tagline ?? ""),
    description: String(payload.description ?? ""),
    image: String(payload.image ?? ""),
    imageUrl: String(payload.imageUrl ?? ""),
    seoTitle: String(payload.seoTitle ?? ""),
    seoDescription: String(payload.seoDescription ?? ""),
    active: payload.active === undefined ? true : Boolean(payload.active),
    sortOrder: Number(payload.sortOrder ?? 0),
  };

  if (action.operation === "categories.create") {
    const [row] = await db.insert(categories).values(values).returning();
    return { message: "Category created.", data: { categoryId: row?.id } };
  }

  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("categories.update requires a category id.");
  const [row] = await db.update(categories).set(values).where(eq(categories.id, id)).returning();
  if (!row) throw new Error("Category not found.");
  return { message: "Category updated.", data: { categoryId: row.id } };
}

async function executeCategoryArchive(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("categories.archive requires a valid category id.");
  const [row] = await db.update(categories).set({ active: false }).where(eq(categories.id, id)).returning({
    id: categories.id,
    name: categories.name,
    active: categories.active,
  });
  if (!row) throw new Error("Category not found.");
  return { message: "Category archived.", data: row };
}

async function executeOrderStatusUpdate(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const id = Number(payload.id);
  const status = String(payload.status ?? "") as (typeof STATUSES)[number];
  if (!Number.isInteger(id) || id <= 0) throw new Error("orders.update_status requires a valid order id.");
  if (!STATUSES.includes(status)) throw new Error("Invalid order status.");
  const [current] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, id)).limit(1);
  if (!current) throw new Error("Order not found.");
  if (!isAllowedStatusTransition(current.status, status)) {
    throw new Error("Invalid order status transition from " + current.status + " to " + status + ".");
  }

  const patch: Record<string, unknown> = { status };
  if (payload.adminNotes !== undefined) patch.adminNotes = String(payload.adminNotes);
  const [row] = await db.update(orders).set(patch).where(eq(orders.id, id)).returning({
    id: orders.id,
    reference: orders.reference,
    status: orders.status,
    adminNotes: orders.adminNotes,
  });
  if (!row) throw new Error("Order not found.");
  return { message: "Order status updated.", data: row };
}

async function executeShippingRateUpdate(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const code = String(payload.wilayaCode ?? "").trim();
  const fee = Number(payload.fee);
  const stopDeskFee = Number(payload.stopDeskFee ?? 0);
  const etaDays = String(payload.etaDays ?? "2-4");
  if (!code) throw new Error("Wilaya code is required.");
  if (![fee, stopDeskFee].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error("Shipping fees must be non-negative.");
  }
  const [wilaya] = await db.select({ code: wilayas.code }).from(wilayas).where(eq(wilayas.code, code)).limit(1);
  if (!wilaya) throw new Error("Wilaya not found: " + code);

  const [row] = await db.insert(shippingRates).values({
    wilayaCode: code,
    fee,
    stopDeskFee,
    etaDays,
  }).onConflictDoUpdate({
    target: shippingRates.wilayaCode,
    set: { fee, stopDeskFee, etaDays },
  }).returning();
  return { message: "Shipping rate updated.", data: row };
}

async function executeProtectedSettingsUpdate(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const section = String(payload.section ?? "").trim();
  const patch = payload.patch;
  if (!PROTECTED_SETTINGS_SECTIONS.has(section)) throw new Error("Unsupported protected settings section.");
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Protected settings patch is required.");
  const saved = await saveSection(section as keyof Awaited<ReturnType<typeof getSettingsMap>>, patch as never);
  return { message: "Protected settings section " + section + " updated.", data: saved };
}

async function executeThemeUpdate(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const patch = payload.patch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Theme patch is required.");
  const saved = await saveTheme(patch as never);
  return { message: "Theme settings updated.", data: saved };
}

async function executeSettingsUpdate(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const section = String(payload.section ?? "").trim();
  const patch = payload.patch;
  if (!section || !patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("settings.update requires section and patch.");
  }
  if (PROTECTED_SETTINGS_SECTIONS.has(section)) {
    throw new Error("This settings section requires confirmation.");
  }
  const saved = await saveSection(section as keyof Awaited<ReturnType<typeof getSettingsMap>>, patch as never);
  return { message: "Settings section " + section + " updated.", data: saved };
}

async function executeBannerSave(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const id = Number(payload.id ?? 0);
  const values = {
    title: String(payload.title ?? ""),
    subtitle: String(payload.subtitle ?? ""),
    imageDesktop: String(payload.imageDesktop ?? ""),
    imageMobile: String(payload.imageMobile ?? ""),
    buttonText: String(payload.buttonText ?? ""),
    buttonUrl: String(payload.buttonUrl ?? ""),
    background: String(payload.background ?? ""),
    textColor: String(payload.textColor ?? ""),
    active: payload.active === undefined ? true : Boolean(payload.active),
    sortOrder: Number(payload.sortOrder ?? 0),
    startsAt: payload.startsAt ? new Date(String(payload.startsAt)) : null,
    endsAt: payload.endsAt ? new Date(String(payload.endsAt)) : null,
  };
  const [row] = id > 0
    ? await db.update(banners).set(values).where(eq(banners.id, id)).returning()
    : await db.insert(banners).values(values).returning();
  if (!row) throw new Error(id > 0 ? "Banner not found." : "Banner creation failed.");
  return { message: id > 0 ? "Banner updated." : "Banner created.", data: { bannerId: row.id } };
}

async function executeBannerDelete(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("cms.banner_delete requires a valid banner id.");
  const [row] = await db.delete(banners).where(eq(banners.id, id)).returning({ id: banners.id, title: banners.title });
  if (!row) throw new Error("Banner not found.");
  return { message: "Banner deleted.", data: row };
}

async function executeBadgeSave(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const id = Number(payload.id ?? 0);
  const values = {
    icon: String(payload.icon ?? "✨"),
    title: String(payload.title ?? "Badge"),
    description: String(payload.description ?? ""),
    active: payload.active === undefined ? true : Boolean(payload.active),
    sortOrder: Number(payload.sortOrder ?? 0),
  };
  const [row] = id > 0
    ? await db.update(trustBadges).set(values).where(eq(trustBadges.id, id)).returning()
    : await db.insert(trustBadges).values(values).returning();
  if (!row) throw new Error(id > 0 ? "Trust badge not found." : "Trust badge creation failed.");
  return { message: id > 0 ? "Trust badge updated." : "Trust badge created.", data: { badgeId: row.id } };
}

async function executeBadgeDelete(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("cms.badge_delete requires a valid badge id.");
  const [row] = await db.delete(trustBadges).where(eq(trustBadges.id, id)).returning({ id: trustBadges.id, title: trustBadges.title });
  if (!row) throw new Error("Trust badge not found.");
  return { message: "Trust badge deleted.", data: row };
}

async function executeNavigationSave(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const id = Number(payload.id ?? 0);
  const values = {
    label: String(payload.label ?? "Link"),
    url: String(payload.url ?? "/"),
    location: String(payload.location ?? "header"),
    column: String(payload.column ?? ""),
    parentId: payload.parentId === undefined ? null : Number(payload.parentId),
    mega: Boolean(payload.mega ?? false),
    image: String(payload.image ?? ""),
    sortOrder: Number(payload.sortOrder ?? 0),
    active: payload.active === undefined ? true : Boolean(payload.active),
  };
  const [row] = id > 0
    ? await db.update(navigationItems).set(values).where(eq(navigationItems.id, id)).returning()
    : await db.insert(navigationItems).values(values).returning();
  if (!row) throw new Error(id > 0 ? "Navigation item not found." : "Navigation item creation failed.");
  return { message: id > 0 ? "Navigation item updated." : "Navigation item created.", data: { navigationId: row.id } };
}

async function executeNavigationDelete(
  payload: Payload,
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("cms.nav_delete requires a valid navigation id.");
  const [row] = await db.delete(navigationItems).where(eq(navigationItems.id, id)).returning({ id: navigationItems.id, label: navigationItems.label });
  if (!row) throw new Error("Navigation item not found.");
  return { message: "Navigation item deleted.", data: row };
}

async function executeOne(
  action: MasterExecutionAction,
  options: { autoSelectModel?: boolean } = {},
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const payload = parsePayload(action.payload);

  const readOnlyResult = await executeReadOnlyAction(action, payload);
  if (readOnlyResult) return readOnlyResult;

  switch (action.operation) {
    case "products.update_content":
      return executeProductsUpdateContent(payload);
    case "products.create_draft":
      return executeProductsCreateDraft(payload);
    case "products.create":
      return executeProductsCreate(payload);
    case "media.generate":
      return executeMediaGenerate(payload, options);
    case "products.update_financial":
      return executeProductsUpdateFinancial(payload);
    case "products.publish":
      return executeProductsPublish(payload);
    case "products.attach_media":
      return executeProductsAttachMedia(payload);
    case "homepage.update_section":
      return executeHomepageUpdateSection(payload);
    case "homepage.reorder":
      return executeHomepageReorder(payload);
    case "categories.create":
    case "categories.update":
      return executeCategoryWrite(payload, action);
    case "products.duplicate":
      return executeProductsDuplicate(payload);
    case "products.archive":
      return executeProductsArchive(payload);
    case "products.delete_permanently":
      return executeProductsDeletePermanently(payload);
    case "media.edit":
      return executeMediaEdit(payload);
    case "media.delete":
      return executeMediaDelete(payload);
    case "categories.archive":
      return executeCategoryArchive(payload);
    case "orders.update_status":
      return executeOrderStatusUpdate(payload);
    case "shipping.update_rate":
      return executeShippingRateUpdate(payload);
    case "settings.update":
      return executeSettingsUpdate(payload);
    case "settings.update_protected":
      return executeProtectedSettingsUpdate(payload);
    case "settings.update_theme":
      return executeThemeUpdate(payload);
    case "cms.banner_save":
      return executeBannerSave(payload);
    case "cms.banner_delete":
      return executeBannerDelete(payload);
    case "cms.badge_save":
      return executeBadgeSave(payload);
    case "cms.badge_delete":
      return executeBadgeDelete(payload);
    case "cms.nav_save":
      return executeNavigationSave(payload);
    case "cms.nav_delete":
      return executeNavigationDelete(payload);
  }

  throw new Error("Unsupported Master AI operation: " + action.operation);
}

export async function executeConfirmedMasterPlan(
  plan: MasterExecutionPlan,
  indexes: number[],
  options: { autoSelectModel?: boolean } = {},
) {
  const results: ExecutionResult[] = [];
  const unique = [...new Set(indexes.map(Number).filter((value) => Number.isInteger(value) && value >= 0))];

  for (const index of unique) {
    const rawAction = plan.actions[index];
    if (!rawAction) {
      results.push({ index, domain: "unknown", operation: "unknown", ok: false, executed: false, message: "Confirmed action no longer exists." });
      continue;
    }
    const action = normalizeMasterAction(rawAction);
    if (!CONFIRMABLE_OPERATIONS.has(action.operation)) {
      results.push({ index, domain: action.domain, operation: action.operation, ok: false, executed: false, message: "This Master AI operation is not confirmable." });
      continue;
    }

    try {
      const result = await executeOne(action, options);
      results.push({
        index,
        domain: action.domain,
        operation: action.operation,
        ok: true,
        executed: true,
        requiresConfirmation: false,
        message: result.message,
        data: result.data,
        artifacts: result.artifacts,
      });
    } catch (error) {
      results.push({
        index,
        domain: action.domain,
        operation: action.operation,
        ok: false,
        executed: false,
        requiresConfirmation: false,
        message: error instanceof Error ? error.message : "Confirmed tool execution failed.",
      });
    }
  }

  return results;
}

export async function executeMasterPlan(
  plan: MasterExecutionPlan,
  mode: "assisted" | "autonomous",
  options: { autoSelectModel?: boolean; authorizedOperations?: string[] } = {},
) {
  const results: ExecutionResult[] = [];
  const authorizedOperations = new Set((options.authorizedOperations ?? []).map((operation) => canonicalMasterOperation("", operation)));
  const generatedAssetsForThisRequest: MasterArtifact[] = [];
  let generatedAssetAttachedToHomepage = false;

  for (let index = 0; index < plan.actions.length; index += 1) {
    let action = normalizeMasterAction(plan.actions[index]);

    // When one explicit request asks for both a generated image and a new draft,
    // attach the image saved by an earlier media.generate action automatically.
    if (action.operation === "products.create_draft" && generatedAssetsForThisRequest.length) {
      const payload = parsePayload(action.payload);
      const existingImages = Array.isArray(payload.images) ? payload.images : [];
      const existingMediaIds = new Set(
        existingImages
          .map((image) => Number(
            image && typeof image === "object" && !Array.isArray(image)
              ? (image as Record<string, unknown>).mediaId
              : 0,
          ))
          .filter((id) => Number.isInteger(id) && id > 0),
      );
      const generatedImages = generatedAssetsForThisRequest
        .filter((asset) => typeof asset.mediaId === "number" && !existingMediaIds.has(asset.mediaId))
        .map((asset) => ({
          mediaId: asset.mediaId,
          url: asset.url,
          alt: asset.alt || asset.title || "AI generated product image",
          title: asset.title || "AI generated product image",
          isPrimary: false,
        }));
      const mergedImages = [...existingImages, ...generatedImages];
      if (mergedImages.length && !mergedImages.some((image) =>
        Boolean(image && typeof image === "object" && !Array.isArray(image) && (image as Record<string, unknown>).isPrimary),
      )) {
        const first = mergedImages[0];
        if (first && typeof first === "object" && !Array.isArray(first)) {
          (first as Record<string, unknown>).isPrimary = true;
        }
      }
      if (generatedImages.length) {
        payload.images = mergedImages;
        action = { ...action, payload: JSON.stringify(payload) };
      }
    }

    if (action.operation === "homepage.update_section" &&
        !generatedAssetAttachedToHomepage &&
        generatedAssetsForThisRequest.length &&
        /(?:homepage|home page|home-page|الصفحة الرئيسية|صفحة رئيسية|واجهة الموقع|الرئيسية)/i.test(plan.intent) &&
        /(?:image|photo|visual|banner|hero|صورة|صور|بانر)/i.test(plan.intent) &&
        /(?:generate|create|produce|design|render|draw|insert|add|place|use|replace|update|أنشئ|انشئ|اصنع|صمم|صمّم|أنتج|انتج|إنتاج|انتاج|ولّد|ولد|ضع|أضف|اضف|أدرج|ادخل|إدخال|استبدل|استخدم)/i.test(plan.intent)) {
      const payload = parsePayload(action.payload);
      const rawPatch = payload.patch;
      if (rawPatch && typeof rawPatch === "object" && !Array.isArray(rawPatch)) {
        const patch = { ...(rawPatch as Record<string, unknown>) };
        const sectionId = Number(payload.id);
        const [section] = Number.isInteger(sectionId) && sectionId > 0
          ? await db.select({ key: homepageSections.key, title: homepageSections.title }).from(homepageSections).where(eq(homepageSections.id, sectionId)).limit(1)
          : [];
        const sectionIdentity = String(section?.key ?? "") + " " + String(section?.title ?? "") + " " + action.summary;
        const intent = String(plan.intent ?? "");
        const wantsHero = /(?:hero|main banner|الرئيسية|الواجهة|البطل)/i.test(intent);
        const wantsPromo = /(?:promo|promotion|banner|بانر|إعلان|اعلان)/i.test(intent);
        const identityMatches = wantsHero
          ? /hero|الرئيسية|الواجهة/i.test(sectionIdentity)
          : wantsPromo
            ? /banner|promo|بانر|إعلان|اعلان/i.test(sectionIdentity)
            : /hero|banner|promo|الرئيسية|الواجهة/i.test(sectionIdentity);
        if (identityMatches) {
          patch.imageUrl = generatedAssetsForThisRequest[0].url;
          payload.patch = patch;
          action = { ...action, payload: JSON.stringify(payload) };
          generatedAssetAttachedToHomepage = true;
        }
      }
    }

    const explicitlyAuthorized = authorizedOperations.has(action.operation);
    const protectedAction = isProtectedAction(action, parsePayload(action.payload)) && !explicitlyAuthorized;
    // In autonomous mode, safe operations stay autonomous even if the model
    // conservatively marked requiresConfirmation=true. Protected operations
    // remain guarded by isProtectedAction/explicit authorization.
    const requiresConfirmation = protectedAction;

    if (requiresConfirmation) {
      results.push({
        index,
        domain: action.domain,
        operation: action.operation,
        ok: true,
        executed: false,
        requiresConfirmation: true,
        message:
          mode === "autonomous"
            ? "Protected action held for confirmation."
            : "Action is ready but autonomous execution is disabled.",
      });
      continue;
    }

    try {
      const result = await executeOne(action, options);
      if (action.operation === "media.generate" && result.artifacts?.length) {
        generatedAssetsForThisRequest.push(...result.artifacts.filter((artifact) =>
          artifact.type === "image" && typeof artifact.mediaId === "number" && Boolean(artifact.url),
        ));
      }
      results.push({
        index,
        domain: action.domain,
        operation: action.operation,
        ok: true,
        executed: true,
        message: result.message,
        data: result.data,
        artifacts: result.artifacts,
      });
    } catch (error) {
      results.push({
        index,
        domain: action.domain,
        operation: action.operation,
        ok: false,
        executed: false,
        message: error instanceof Error ? error.message : "Tool execution failed.",
      });
    }
  }

  return results;
}
