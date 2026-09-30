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
  validateProduct,
  validateProductSku,
  writeImages,
  writeVariants,
} from "@/lib/product-write";
import { deleteStoredFileIfUnreferenced, findMediaReferences } from "@/lib/media-references";
import { isAllowedStatusTransition, STATUSES } from "@/lib/status";
import { mediaPublicUrl, storeFile } from "@/lib/storage";

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
  "products.create",
  "products.update_financial",
  "products.archive",
  "products.delete_permanently",
  "media.delete",
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

async function executeOne(
  action: MasterExecutionAction,
  options: { autoSelectModel?: boolean } = {},
): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
  const payload = parsePayload(action.payload);

  if (READ_ONLY_OPERATIONS.has(action.operation)) {
    if (action.operation === "products.list") {
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

    if (action.operation === "products.get") {
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

    if (action.operation === "media.list") {
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

    if (action.operation === "orders.list") {
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

    if (action.operation === "categories.list") {
      const rows = await db.select().from(categories).orderBy(asc(categories.sortOrder));
      return { message: "Categories loaded.", data: rows };
    }

    if (action.operation === "shipping.list") {
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

    if (action.operation === "settings.get") {
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

    if (action.operation === "cms.list") {
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

    if (action.operation === "customers.list") {
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

    if (action.operation === "account.inspect") {
      return {
        message: "The Account section is reserved for the account-module integration. Master AI can already control the other connected admin domains.",
      };
    }
  }

  if (action.operation === "products.update_content") {
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("products.update_content requires a valid product id.");

    const patch = safePatch(payload);
    if (!patch) throw new Error("No allowed product content fields were provided.");

    if (typeof patch.categorySlug === "string" && patch.categorySlug) {
      await verifyCategory(patch.categorySlug);
    }

    const [row] = await db.update(products).set(patch as never).where(eq(products.id, id)).returning();
    if (!row) throw new Error("Product not found.");
    return { message: "Product content updated.", data: { productId: row.id } };
  }

  if (action.operation === "products.create_draft") {
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

    const normalized = normalizeProduct(productInput);
    await verifyCategory(normalized.categorySlug);

    const rawImages = Array.isArray(payload.images) ? payload.images : [];
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
      await writeVariants(tx, row.id, (Array.isArray(payload.variants) ? payload.variants : []) as never[]);
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

  if (action.operation === "products.create") {
    const rawProduct = payload.product;
    if (!rawProduct || typeof rawProduct !== "object" || Array.isArray(rawProduct)) {
      throw new Error("products.create requires a product object.");
    }
    const productInput = rawProduct as Record<string, unknown>;
    const status = String(productInput.status ?? "draft");
    const errors = validateProduct(productInput, status === "published");
    if (errors.length) throw new Error(errors.join("; "));
    await validateProductSku(String(productInput.sku ?? ""));
    const normalized = normalizeProduct(productInput);
    await verifyCategory(normalized.categorySlug);

    const created = await db.transaction(async (tx) => {
      const [row] = await tx.insert(products).values(normalized).returning();
      if (!row) throw new Error("Product creation failed.");
      await writeImages(tx, row.id, (payload.images ?? []) as never[]);
      await writeVariants(tx, row.id, (payload.variants ?? []) as never[]);
      return row;
    });

    return {
      message: "Product created.",
      data: { productId: created.id, name: created.name, status: created.status },
    };
  }

  if (action.operation === "products.update_financial") {
    const id = Number(payload.id);
    const raw = payload.patch;
    if (!Number.isInteger(id) || id <= 0) throw new Error("products.update_financial requires a valid product id.");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Financial product patch is required.");

    const source = raw as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of ["price", "comparePrice", "costPrice", "stock", "lowStockThreshold"]) {
      if (source[key] === undefined) continue;
      const value = Number(source[key]);
      if (!Number.isFinite(value) || value < 0) throw new Error("Invalid " + key + ".");
      patch[key] = key === "stock" || key === "lowStockThreshold" ? Math.floor(value) : value;
    }
    for (const key of ["trackInventory", "allowBackorders"]) {
      if (source[key] !== undefined) {
        if (typeof source[key] !== "boolean") throw new Error("Invalid " + key + ".");
        patch[key] = source[key];
      }
    }
    if (!Object.keys(patch).length) throw new Error("No financial product fields were provided.");

    const [row] = await db.update(products).set(patch as never).where(eq(products.id, id)).returning({
      id: products.id,
      name: products.name,
      price: products.price,
      comparePrice: products.comparePrice,
      costPrice: products.costPrice,
      stock: products.stock,
    });
    if (!row) throw new Error("Product not found.");
    return { message: "Product financial fields updated.", data: row };
  }

  if (action.operation === "products.publish") {
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("products.publish requires a valid product id.");

    const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!product) throw new Error("Product not found.");

    const images = await db.select().from(productImages).where(eq(productImages.productId, id)).limit(100);
    const errors = validateProduct({ ...product, images }, true);
    if (errors.length) {
      throw new Error("Product cannot be published yet: " + errors.join("; "));
    }

    const [row] = await db
      .update(products)
      .set({ status: "published", active: true })
      .where(eq(products.id, id))
      .returning({ id: products.id, status: products.status, active: products.active });
    if (!row) throw new Error("Product not found.");
    return { message: "Product published.", data: row };
  }

  if (action.operation === "products.attach_media") {
    const productId = Number(payload.productId);
    const mediaId = Number(payload.mediaId);
    if (!Number.isInteger(productId) || !Number.isInteger(mediaId)) throw new Error("products.attach_media requires productId and mediaId.");

    const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1);
    const [asset] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
    if (!product || !asset) throw new Error("Product or media asset not found.");

    const existingRows = await db
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
      await db.update(productImages)
        .set({ isPrimary: false })
        .where(eq(productImages.productId, productId));
    }

    const [row] = await db.insert(productImages).values({
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

    return { message: "Media attached to product.", data: { productImageId: row?.id, productId, mediaId } };
  }

  if (action.operation === "homepage.update_section") {
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

    if (rawPatch.productIds !== undefined) {
      if (!Array.isArray(rawPatch.productIds)) {
        throw new Error("Homepage productIds must be an array.");
      }
      const productIds = rawPatch.productIds.map(Number);
      if (productIds.some((productId) => !Number.isInteger(productId) || productId <= 0)) {
        throw new Error("Homepage productIds must contain positive integer product ids.");
      }
      const uniqueProductIds = [...new Set(productIds)];
      if (uniqueProductIds.length !== productIds.length) {
        throw new Error("Homepage productIds contains duplicate product ids.");
      }
      if (uniqueProductIds.length) {
        const existingProducts = await db
          .select({ id: products.id })
          .from(products)
          .where(inArray(products.id, uniqueProductIds));
        if (existingProducts.length !== uniqueProductIds.length) {
          throw new Error("Homepage productIds contains a product id that does not exist.");
        }
      }
    }

    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawPatch)) {
      if (key === "overlayOpacity") {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) throw new Error("Homepage overlayOpacity must be numeric.");
        const percentage = Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
        safe[key] = Math.max(0, Math.min(100, Math.round(percentage)));
        continue;
      }
      safe[key] = value;
    }

    const [row] = await db
      .update(homepageSections)
      .set(safe as never)
      .where(eq(homepageSections.id, id))
      .returning();
    if (!row) throw new Error("Homepage section not found.");
    return { message: "Homepage section updated.", data: { sectionId: row.id } };
  }

  if (action.operation === "homepage.reorder") {
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

  if (action.operation === "categories.create" || action.operation === "categories.update") {
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

  if (action.operation === "products.duplicate") {
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("products.duplicate requires a valid product id.");
    const [original] = await db.select().from(products).where(eq(products.id, id)).limit(1);
    if (!original) throw new Error("Product not found.");

    const suffix = Date.now().toString(36).toUpperCase();
    const [copy] = await db.insert(products).values({
      ...original,
      id: undefined as unknown as number,
      name: String(original.name) + " (Copy)",
      slug: String(original.slug) + "-copy-" + suffix.toLowerCase(),
      sku: String(original.sku) + "-" + suffix,
      status: "draft",
      createdAt: new Date(),
    }).returning();
    if (!copy) throw new Error("Product duplication failed.");

    const images = await db.select().from(productImages).where(eq(productImages.productId, id));
    if (images.length) {
      await db.insert(productImages).values(
        images.map(({ id: _id, productId: _productId, ...rest }) => ({ ...rest, productId: copy.id })),
      );
    }
    return { message: "Product duplicated as a draft.", data: { productId: copy.id } };
  }

  if (action.operation === "products.archive") {
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

  if (action.operation === "products.delete_permanently") {
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("products.delete_permanently requires a valid product id.");
    const [row] = await db.delete(products).where(eq(products.id, id)).returning({ id: products.id, name: products.name });
    if (!row) throw new Error("Product not found.");
    return { message: "Product permanently deleted.", data: row };
  }

  if (action.operation === "media.delete") {
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

  if (action.operation === "categories.archive") {
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

  if (action.operation === "orders.update_status") {
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

  if (action.operation === "shipping.update_rate") {
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

  if (action.operation === "settings.update") {
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

  if (action.operation === "settings.update_protected") {
    const section = String(payload.section ?? "").trim();
    const patch = payload.patch;
    if (!PROTECTED_SETTINGS_SECTIONS.has(section)) throw new Error("Unsupported protected settings section.");
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Protected settings patch is required.");
    const saved = await saveSection(section as keyof Awaited<ReturnType<typeof getSettingsMap>>, patch as never);
    return { message: "Protected settings section " + section + " updated.", data: saved };
  }

  if (action.operation === "settings.update_theme") {
    const patch = payload.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Theme patch is required.");
    const saved = await saveTheme(patch as never);
    return { message: "Theme settings updated.", data: saved };
  }

  if (action.operation === "cms.banner_save") {
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

  if (action.operation === "cms.banner_delete") {
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("cms.banner_delete requires a valid banner id.");
    const [row] = await db.delete(banners).where(eq(banners.id, id)).returning({ id: banners.id, title: banners.title });
    if (!row) throw new Error("Banner not found.");
    return { message: "Banner deleted.", data: row };
  }

  if (action.operation === "cms.badge_save") {
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

  if (action.operation === "cms.badge_delete") {
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("cms.badge_delete requires a valid badge id.");
    const [row] = await db.delete(trustBadges).where(eq(trustBadges.id, id)).returning({ id: trustBadges.id, title: trustBadges.title });
    if (!row) throw new Error("Trust badge not found.");
    return { message: "Trust badge deleted.", data: row };
  }

  if (action.operation === "cms.nav_save") {
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

  if (action.operation === "cms.nav_delete") {
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("cms.nav_delete requires a valid navigation id.");
    const [row] = await db.delete(navigationItems).where(eq(navigationItems.id, id)).returning({ id: navigationItems.id, label: navigationItems.label });
    if (!row) throw new Error("Navigation item not found.");
    return { message: "Navigation item deleted.", data: row };
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

  for (let index = 0; index < plan.actions.length; index += 1) {
    const action = normalizeMasterAction(plan.actions[index]);
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
