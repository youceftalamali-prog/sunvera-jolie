import { db } from "@/db";
import {
  categories,
  homepageSections,
  media,
  productImages,
  products,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateImage } from "@/lib/ai-gateway";
import { getSettingsMap } from "@/lib/settings";
import { mediaPublicUrl, safeLocalFilePath, storeFile } from "@/lib/storage";

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
  "media.generate",
  "media.edit",
  "homepage.update_section",
  "homepage.reorder",
  "categories.create",
  "categories.update",
]);

const READ_ONLY_OPERATIONS = new Set([
  "getSections",
  "getCount",
  "getCountAndRecent",
  "list",
  "analyze",
  "analysis",
  "review",
  "inspect",
]);

const PROTECTED_KEY_PATTERN =
  /(?:price|stock|cost|inventory|order|shipping|payment|security|customer|delete|remove|hard|credential|secret|password|role|permission|archive)/i;

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
  if (!SAFE_OPERATIONS.has(action.operation)) return true;
  if (PROTECTED_KEY_PATTERN.test(action.operation) || PROTECTED_KEY_PATTERN.test(action.domain)) return true;

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

async function executeOne(action: MasterExecutionAction): Promise<{ message: string; data?: unknown }> {
  const payload = parsePayload(action.payload);

  if (READ_ONLY_OPERATIONS.has(action.operation)) {
    return { message: "Read-only step completed from the live admin context." };
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

  throw new Error("Unsupported Master AI operation: " + action.operation);
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
        executed: readOnly,
        requiresConfirmation: readOnly ? false : true,
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
