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
import { eq } from "drizzle-orm";
import { generateImage } from "@/lib/ai-gateway";
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
  "products.publish",
  "products.duplicate",
  "media.generate",
  "media.edit",
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

function isProtectedAction(action: MasterExecutionAction, payload: Payload) {
  if (READ_ONLY_OPERATIONS.has(action.operation)) return false;
  if (PROTECTED_OPERATIONS.has(action.operation)) return true;
  if (!SAFE_OPERATIONS.has(action.operation)) return true;
  if (PROTECTED_KEY_PATTERN.test(action.operation) || PROTECTED_KEY_PATTERN.test(action.domain)) return true;

  if (action.operation === "settings.update") {
    const section = String(payload.section ?? "").trim().toLowerCase();
    if (PROTECTED_SETTINGS_SECTIONS.has(section)) return true;
  }

  if (action.domain === "products") {
    const patch = payload.patch;
    if (patch && typeof patch === "object" && !Array.isArray(patch)) {
      const keys = Object.keys(patch as Record<string, unknown>);
      if (keys.some((key) => PROTECTED_KEY_PATTERN.test(key))) return true;
      if (String((patch as Record<string, unknown>).status ?? "").toLowerCase() === "archived") return true;
    }
  }

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
    "active",
    "status",
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

async function persistGeneratedImage(
  result: { images: Array<{ b64_json?: string; url?: string }> },
  folder: string,
) {
  const image = result.images[0];
  if (!image) throw new Error("Image model returned no image.");

  let buffer: Buffer;
  let mimeType = "image/png";

  if (image.b64_json) {
    buffer = Buffer.from(image.b64_json, "base64");
  } else if (image.url) {
    const response = await fetch(image.url);
    if (!response.ok) throw new Error("Could not download generated image.");
    const contentType = response.headers.get("content-type");
    if (contentType?.startsWith("image/")) mimeType = contentType;
    buffer = Buffer.from(await response.arrayBuffer());
  } else {
    throw new Error("Image model returned no usable image payload.");
  }

  const extension =
    mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : mimeType === "image/avif" ? "avif" : "png";
  const file = new File([new Uint8Array(buffer)], "sunvera-ai-" + Date.now() + "." + extension, { type: mimeType });

  const settings = await getSettingsMap();
  const stored = await storeFile(
    file,
    folder || "ai-generated",
    settings.security.maxUploadMb,
    settings.security.allowedTypes,
  );

  const [row] = await db
    .insert(media)
    .values({
      ...stored,
      alt: "SunVera AI generated image",
      title: "SunVera AI generated image",
      folder: folder || "ai-generated",
      source: "ai",
      url: stored.url,
    })
    .returning();

  if (!row) throw new Error("Could not save generated media.");

  if (!row.url) {
    const url = mediaPublicUrl(row);
    const [updated] = await db.update(media).set({ url }).where(eq(media.id, row.id)).returning();
    return updated ?? { ...row, url };
  }

  return row;
}

async function executeOne(action: MasterExecutionAction): Promise<{ message: string; data?: unknown; artifacts?: MasterArtifact[] }> {
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

    const [row] = await db.insert(productImages).values({
      productId,
      mediaId,
      url: asset.url,
      alt: String(payload.alt ?? asset.alt ?? ""),
      imageType: String(payload.imageType ?? "gallery"),
      sortOrder: Number(payload.sortOrder ?? 0),
      isPrimary: Boolean(payload.isPrimary ?? false),
      title: String(payload.title ?? asset.title ?? ""),
      caption: String(payload.caption ?? asset.caption ?? ""),
      focalX: Number(payload.focalX ?? 50),
      focalY: Number(payload.focalY ?? 50),
    }).returning();

    return { message: "Media attached to product.", data: { productImageId: row?.id, productId, mediaId } };
  }

  if (action.operation === "media.generate") {
    const prompt = String(payload.prompt ?? "").trim();
    if (!prompt) throw new Error("media.generate requires a prompt.");

    const generated = await generateImage(prompt, {
      aspectRatio: typeof payload.aspectRatio === "string" ? payload.aspectRatio : undefined,
      resolution: typeof payload.resolution === "string" ? payload.resolution : undefined,
      n: 1,
    });
    const asset = await persistGeneratedImage(generated, String(payload.folder ?? "ai-generated"));

    const attachToProductId = Number(payload.attachToProductId ?? 0);
    if (Number.isInteger(attachToProductId) && attachToProductId > 0) {
      const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, attachToProductId)).limit(1);
      if (!product) throw new Error("Product not found for generated-image attachment.");
      await db.insert(productImages).values({
        productId: attachToProductId,
        mediaId: asset.id,
        url: asset.url,
        alt: String(payload.alt ?? asset.alt),
        imageType: String(payload.imageType ?? "gallery"),
        sortOrder: Number(payload.sortOrder ?? 0),
        isPrimary: Boolean(payload.isPrimary ?? false),
        title: String(payload.title ?? asset.title),
        caption: String(payload.caption ?? ""),
        focalX: 50,
        focalY: 50,
      });
    }

    const sectionId = Number(payload.attachToHomepageSectionId ?? 0);
    if (Number.isInteger(sectionId) && sectionId > 0) {
      await db.update(homepageSections)
        .set({ imageUrl: asset.url })
        .where(eq(homepageSections.id, sectionId));
    }

    return {
      message: "Image generated and saved to the media library.",
      data: { mediaId: asset.id, url: asset.url, attachedToProductId: attachToProductId || null, attachedToHomepageSectionId: sectionId || null },
      artifacts: [
        {
          type: "image",
          url: asset.url,
          mediaId: asset.id,
          title: asset.title,
          alt: asset.alt,
        },
      ],
    };
  }

  if (action.operation === "media.edit") {
    const id = Number(payload.id);
    const prompt = String(payload.prompt ?? "").trim();
    if (!Number.isInteger(id) || id <= 0 || !prompt) throw new Error("media.edit requires a media id and prompt.");

    const [asset] = await db.select().from(media).where(eq(media.id, id)).limit(1);
    if (!asset) throw new Error("Media asset not found.");

    const generated = await generateImage(prompt, {
      inputReferences: asset.url ? [asset.url] : undefined,
      aspectRatio: typeof payload.aspectRatio === "string" ? payload.aspectRatio : undefined,
      resolution: typeof payload.resolution === "string" ? payload.resolution : undefined,
      n: 1,
    });
    const replacement = await persistGeneratedImage(generated, asset.folder || "ai-generated");

    await db.update(media).set({
      url: replacement.url,
      storageKey: replacement.storageKey,
      provider: replacement.provider,
      filename: replacement.filename,
      mimeType: replacement.mimeType,
      size: replacement.size,
      width: replacement.width,
      height: replacement.height,
      title: String(payload.title ?? asset.title),
      caption: String(payload.caption ?? asset.caption),
      alt: String(payload.alt ?? asset.alt),
      source: "ai",
    }).where(eq(media.id, id));

    await db.update(productImages).set({ url: replacement.url }).where(eq(productImages.mediaId, id));

    return {
      message: "Image edited and replaced in place.",
      data: { mediaId: id, url: replacement.url },
      artifacts: [
        {
          type: "image",
          url: replacement.url,
          mediaId: id,
          title: replacement.title,
          alt: replacement.alt,
        },
      ],
    };
  }

  if (action.operation === "homepage.update_section") {
    const id = Number(payload.id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("homepage.update_section requires a section id.");

    const patch = payload.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("Homepage section patch is required.");

    const allowed = new Set([
      "title", "subtitle", "body", "imageUrl", "imageMobileUrl", "imageTabletUrl",
      "buttonText", "buttonUrl", "button2Text", "button2Url", "background", "textColor",
      "textPosition", "overlayOpacity", "productMode", "productCount", "productIds",
      "items", "settings", "enabled",
    ]);
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
      if (allowed.has(key)) safe[key] = value;
    }
    const [row] = await db.update(homepageSections).set(safe as never).where(eq(homepageSections.id, id)).returning();
    if (!row) throw new Error("Homepage section not found.");
    return { message: "Homepage section updated.", data: { sectionId: row.id } };
  }

  if (action.operation === "homepage.reorder") {
    const order = Array.isArray(payload.order) ? payload.order.map(Number).filter(Number.isInteger) : [];
    if (!order.length) throw new Error("homepage.reorder requires section id order.");
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
    return { message: id > 0 ? "Banner updated." : "Banner created.", data: { bannerId: row?.id } };
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
    return { message: id > 0 ? "Trust badge updated." : "Trust badge created.", data: { badgeId: row?.id } };
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
    return { message: id > 0 ? "Navigation item updated." : "Navigation item created.", data: { navigationId: row?.id } };
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

export async function executeConfirmedMasterPlan(plan: MasterExecutionPlan, indexes: number[]) {
  const results: ExecutionResult[] = [];
  const unique = [...new Set(indexes.map(Number).filter((value) => Number.isInteger(value) && value >= 0))];

  for (const index of unique) {
    const action = plan.actions[index];
    if (!action) {
      results.push({ index, domain: "unknown", operation: "unknown", ok: false, executed: false, message: "Confirmed action no longer exists." });
      continue;
    }
    if (!CONFIRMABLE_OPERATIONS.has(action.operation)) {
      results.push({ index, domain: action.domain, operation: action.operation, ok: false, executed: false, message: "This Master AI operation is not confirmable." });
      continue;
    }

    try {
      const result = await executeOne(action);
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

export async function executeMasterPlan(plan: MasterExecutionPlan, mode: "assisted" | "autonomous") {
  const results: ExecutionResult[] = [];

  for (let index = 0; index < plan.actions.length; index += 1) {
    const action = plan.actions[index];
    const protectedAction = isProtectedAction(action, parsePayload(action.payload));
    const requiresConfirmation =
      mode === "autonomous"
        ? protectedAction
        : action.requiresConfirmation || protectedAction;

    if (requiresConfirmation) {
      const readOnly = READ_ONLY_OPERATIONS.has(action.operation);
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
      const result = await executeOne(action);
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
