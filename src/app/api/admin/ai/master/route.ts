import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  banners,
  categories,
  customers,
  homepageSections,
  media,
  navigationItems,
  orders,
  products,
  trustBadges,
  shippingRates,
} from "@/db/schema";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import { generateText, type AIRoute } from "@/lib/ai-gateway";
import { getSettingsMap } from "@/lib/settings";
import { mediaPublicUrl } from "@/lib/storage";
import {
  executeConfirmedMasterPlan,
  executeMasterPlan,
  normalizeMasterAction,
  type MasterExecutionPlan,
} from "@/lib/ai-master-tools";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  addAIMessage,
  createAIConversation,
  getAIConversation,
  getAIMessages,
  type AIConversationMemory,
  updateAIConversation,
} from "@/lib/ai-conversations";

export const dynamic = "force-dynamic";

type MasterAction = {
  domain: string;
  operation: string;
  summary: string;
  requiresConfirmation: boolean;
  payload: string;
};

type MasterPlan = {
  summary: string;
  intent: string;
  actions: MasterAction[];
};

const DOMAINS = ["homepage", "products", "media", "orders", "categories", "shipping", "settings", "customers", "account", "cms"] as const;

async function buildContext(uploadedImages: Array<{ mediaId: number; url: string; filename: string; alt: string }> = [], activeProductId: number | null = null) {
  const [sections, productRows, categoryRows, mediaRows, ordersByStatus, recentProducts, recentOrders, bannerRows, badgeRows, navRows, shippingRows, customersCount] = await Promise.all([
    db.select({
      key: homepageSections.key,
      title: homepageSections.title,
      enabled: homepageSections.enabled,
      sortOrder: homepageSections.sortOrder,
    }).from(homepageSections).orderBy(asc(homepageSections.sortOrder)),
    db.select({
      id: products.id,
      name: products.name,
      price: products.price,
      stock: products.stock,
      status: products.status,
      active: products.active,
      categorySlug: products.categorySlug,
    }).from(products),
    db.select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      active: categories.active,
      sortOrder: categories.sortOrder,
    }).from(categories).orderBy(asc(categories.sortOrder)),
    db.select({
      id: media.id,
      folder: media.folder,
      filename: media.filename,
      title: media.title,
      provider: media.provider,
    }).from(media).orderBy(desc(media.id)).limit(50),
    db.select({ status: orders.status, count: sql.raw("count(*)::int") }).from(orders).groupBy(orders.status),
    db.select({
      id: products.id,
      name: products.name,
      price: products.price,
      status: products.status,
      stock: products.stock,
      categorySlug: products.categorySlug,
      active: products.active,
    }).from(products).orderBy(desc(products.id)).limit(20),
    db.select({
      id: orders.id,
      reference: orders.reference,
      fullName: orders.fullName,
      status: orders.status,
      total: orders.total,
      wilaya: orders.wilaya,
    }).from(orders).orderBy(desc(orders.id)).limit(20),
    db.select({
      id: banners.id,
      title: banners.title,
      active: banners.active,
      sortOrder: banners.sortOrder,
    }).from(banners).orderBy(asc(banners.sortOrder)).limit(20),
    db.select({
      id: trustBadges.id,
      title: trustBadges.title,
      active: trustBadges.active,
      sortOrder: trustBadges.sortOrder,
    }).from(trustBadges).orderBy(asc(trustBadges.sortOrder)).limit(20),
    db.select({
      id: navigationItems.id,
      label: navigationItems.label,
      url: navigationItems.url,
      location: navigationItems.location,
      active: navigationItems.active,
      sortOrder: navigationItems.sortOrder,
    }).from(navigationItems).orderBy(asc(navigationItems.sortOrder)).limit(30),
    db.select({
      wilayaCode: shippingRates.wilayaCode,
      fee: shippingRates.fee,
      stopDeskFee: shippingRates.stopDeskFee,
      etaDays: shippingRates.etaDays,
      active: shippingRates.active,
    }).from(shippingRates).orderBy(asc(shippingRates.wilayaCode)).limit(70),
    db.select({ count: sql.raw("count(*)::int") }).from(customers),
  ]);

  let activeProduct: typeof products.$inferSelect | null = null;
  if (activeProductId) {
    const [row] = await db.select().from(products).where(eq(products.id, activeProductId)).limit(1);
    activeProduct = row ?? null;
  }

  return {
    sections,
    activeProduct,
    productsCount: productRows.length,
    categoriesCount: categoryRows.length,
    mediaCount: mediaRows.length,
    customersCount: customersCount[0]?.count ?? 0,
    categories: categoryRows.slice(0, 70),
    recentMedia: mediaRows,
    ordersByStatus,
    recentProducts,
    recentOrders,
    banners: bannerRows,
    trustBadges: badgeRows,
    navigation: navRows,
    shippingRates: shippingRows,
    uploadedImages,
    account: {
      adminAccountControls: "Account module integration is planned next; do not invent unsupported account mutations.",
    },
  };
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }
  return fallback;
}

function parsePlan(raw: string): MasterPlan | null {
  const candidates = [
    raw.trim(),
    raw.replace(/^\s*\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}\s*$/i, "").trim(),
  ];
  const firstObject = raw.indexOf("{");
  const lastObject = raw.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    candidates.push(raw.slice(firstObject, lastObject + 1));
  }
  for (const candidate of candidates) {
    try {
      const decoded = JSON.parse(candidate) as unknown;
      const parsed =
        decoded && typeof decoded === "object" && "plan" in decoded
          ? (decoded as { plan?: unknown }).plan
          : decoded;
      if (!parsed || typeof parsed !== "object") continue;
      const root = parsed as Record<string, unknown>;
      const rawActions = Array.isArray(root.actions)
        ? root.actions
        : Array.isArray(root.steps)
          ? root.steps
          : root.action && typeof root.action === "object"
            ? [root.action]
            : [];
      const actions: MasterAction[] = rawActions
        .filter((action): action is Record<string, unknown> => Boolean(action) && typeof action === "object")
        .map((action) => {
          const domainValue = String(action.domain ?? "").trim().toLowerCase();
          const operation = String(action.operation ?? action.name ?? "analyze").trim();
          const summary = String(action.summary ?? action.description ?? operation).trim();
          const mutationHint = /(?:create|add|update|edit|delete|remove|change|publish|assign|set|reorder|move|replace|تحرير|تعديل|حذف|إضافة|إنشاء|نشر|تغيير)/i.test(operation);
          return {
            domain: domainValue,
            operation,
            summary,
            requiresConfirmation: normalizeBoolean(action.requiresConfirmation, mutationHint),
            payload: typeof action.payload === "string" ? action.payload : "{}",
          };
        })
        .filter((action): action is MasterAction =>
          DOMAINS.includes(action.domain as (typeof DOMAINS)[number]) &&
          Boolean(action.operation) &&
          Boolean(action.summary),
        )
        .slice(0, 20);
      if (!root.summary && !root.intent && !actions.length) continue;
      return {
        summary: String(root.summary || "SunVera Master AI"),

        intent: String(root.intent || "Multi-domain admin request"),
        actions,
      };
    } catch {
      // Try the next extraction strategy.
    }
  }
  return null;
}

function isLikelyImageReference(text: string) {
  return /(image|images|photo|photos|picture|pictures|packaging|label|عبوة|العبوة|الصورة|صورة|الصور|من الصورة|من الصور)/i.test(text);
}

function normalizeMasterPlanForExecution(
  plan: MasterPlan,
  imageAttachments: Array<{ mediaId: number; url: string; filename: string; alt: string }>,
  activeProductId: number | null,
) {
  const normalizedActions = plan.actions.map((rawAction) => {
    const action = normalizeMasterAction(rawAction as MasterExecutionPlan["actions"][number]);
    let payload: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(action.payload || "{}") as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
    } catch {
      payload = {};
    }

    if (
      activeProductId &&
      ["products.update_content", "products.update_financial", "products.publish"].includes(action.operation) &&
      (!Number.isInteger(Number(payload.id)) || Number(payload.id) <= 0)
    ) {
      payload.id = activeProductId;
    }

    if (action.operation === "media.edit" && imageAttachments.length) {
      const mediaId = Number(payload.id);
      if (!Number.isInteger(mediaId) || mediaId <= 0) {
        payload.id = imageAttachments[0].mediaId;
      }
    }

    if (action.operation === "products.create_draft") {
      const product =
        payload.product && typeof payload.product === "object" && !Array.isArray(payload.product)
          ? { ...(payload.product as Record<string, unknown>) }
          : {};
      product.status = "draft";
      if (product.price === undefined || product.price === null || !Number.isFinite(Number(product.price))) product.price = 0;
      if (product.stock === undefined || product.stock === null || !Number.isFinite(Number(product.stock))) product.stock = 0;
      if (product.comparePrice === undefined || product.comparePrice === null || !Number.isFinite(Number(product.comparePrice))) product.comparePrice = 0;
      if (product.costPrice === undefined || product.costPrice === null || !Number.isFinite(Number(product.costPrice))) product.costPrice = 0;

      // Never fabricate SKU/barcode in a visual draft.
      product.sku = String(product.sku ?? "").trim();
      product.barcode = String(product.barcode ?? "").trim();

      payload.product = product;

      if (imageAttachments.length) {
        const existingImages = Array.isArray(payload.images) ? payload.images : [];
        const existingMediaIds = new Set(
          existingImages
            .map((image) => Number(image && typeof image === "object" && !Array.isArray(image) ? (image as Record<string, unknown>).mediaId : 0))
            .filter((id) => Number.isInteger(id) && id > 0),
        );
        const imagePayloads = [
          ...existingImages,
          ...imageAttachments
            .filter((image) => !existingMediaIds.has(image.mediaId))
            .map((image) => ({
              mediaId: image.mediaId,
              url: image.url,
              alt: image.alt || image.filename,
            })),
        ];
        if (imagePayloads.length) {
          const hasPrimary = imagePayloads.some(
            (image) =>
              image &&
              typeof image === "object" &&
              !Array.isArray(image) &&
              Boolean((image as Record<string, unknown>).isPrimary),
          );
          if (!hasPrimary && imagePayloads[0] && typeof imagePayloads[0] === "object" && !Array.isArray(imagePayloads[0])) {
            (imagePayloads[0] as Record<string, unknown>).isPrimary = true;
          }
        }
        payload.images = imagePayloads;
      }
    }

    return {
      ...action,
      payload: JSON.stringify(payload),
    };
  });

  return {
    ...plan,
    actions: normalizedActions,
  };
}

function extractProductId(
  execution: Array<{ operation?: string; data?: unknown }> = [],
  plan?: MasterPlan | null,
) {
  const fromExecution = execution.find((item) => {
    const data = item?.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return false;
    const value = Number((data as Record<string, unknown>).productId);
    return Number.isInteger(value) && value > 0;
  });
  if (fromExecution?.data && typeof fromExecution.data === "object" && !Array.isArray(fromExecution.data)) {
    const value = Number((fromExecution.data as Record<string, unknown>).productId);
    if (Number.isInteger(value) && value > 0) return value;
  }

  for (const item of execution) {
    const data = item?.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const product = (data as Record<string, unknown>).product;
      if (product && typeof product === "object" && !Array.isArray(product)) {
        const value = Number((product as Record<string, unknown>).id);
        if (Number.isInteger(value) && value > 0) return value;
      }
    }
  }

  for (const action of plan?.actions ?? []) {
    if (String(action.domain) !== "products" && !String(action.domain).startsWith("products.")) continue;
    try {
      const payload = JSON.parse(action.payload || "{}") as Record<string, unknown>;
      const value = Number(payload.id);
      if (Number.isInteger(value) && value > 0) return value;
    } catch {
      // Ignore malformed action payloads; the execution result is authoritative.
    }
  }

  return null;
}

function buildConversationHistory(
  messages: Array<{ role: string; content: string }>,
) {
  return messages
    .slice(-12)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 4000),
    }));
}

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawId = new URL(req.url).searchParams.get("conversationId");
  const conversationId = Number(rawId);
  if (!Number.isInteger(conversationId) || conversationId <= 0) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  const conversation = await getAIConversation(conversationId);
  if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  const messages = await getAIMessages(conversation.id, 100);
  return NextResponse.json({
    conversationId: conversation.id,
    context: conversation.workingContext,
    messages: messages.map((message) => ({
      id: String(message.id),
      role: message.role,
      text: message.content,
      reply: message.role === "assistant" ? message.content : undefined,
      plan: message.plan,
      route: message.route,
      execution: message.execution,
      webMode: message.webMode,
      attachments: Array.isArray(message.attachments) ? message.attachments : undefined,
      status: "done",
    })),
  });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimit("admin-ai-master", clientIp(req), 12, 10 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Too many Master AI requests. Try again later." }, { status: 429 });

  const body = (await req.json()) as {
    instruction?: string;
    webMode?: "auto" | "on" | "off";
    confirmedPlan?: MasterExecutionPlan;
    confirmIndexes?: number[];
    attachments?: Array<{ mediaId?: number; url?: string; filename?: string; alt?: string }>;
    conversationId?: number;
    autoModel?: boolean;
    textModel?: string;
    visionModel?: string;
  };
  const instruction = String(body.instruction || "").trim();
  const autoModel = body.autoModel === true;
  const webMode = body.webMode === "on" ? "on" : body.webMode === "off" ? "off" : "auto";
  if (!instruction && !body.confirmedPlan) return NextResponse.json({ error: "Instruction is required" }, { status: 400 });

  let conversation = body.conversationId ? await getAIConversation(Number(body.conversationId)) : null;
  if (!conversation) {
    conversation = await createAIConversation(instruction || "Confirmed Master AI action");
  }

  const previousMessages = await getAIMessages(conversation.id, 40);
  const previousMemory = (conversation.workingContext || {}) as AIConversationMemory;
  const conversationHistory = buildConversationHistory(previousMessages);
  const persistedMediaIds = Array.isArray(conversation.activeMediaIds)
    ? conversation.activeMediaIds.filter((id): id is number => Number.isInteger(id))
    : [];

  const settings = await getSettingsMap();
  const autonomyMode = settings.ai.autonomyMode === "assisted" ? "assisted" : "autonomous";

  const requestedAttachments = Array.isArray(body.attachments) ? body.attachments : [];
  const attachmentIds = requestedAttachments
    .map((item) => Number(item?.mediaId))
    .filter((id) => Number.isInteger(id) && id > 0);

  let attachments: Array<{ mediaId: number; url: string; filename: string; alt: string }> = [];
  if (attachmentIds.length) {
    const rows = await db
      .select()
      .from(media)
      .where(inArray(media.id, attachmentIds));
    const byId = new Map(rows.map((row) => [row.id, row]));
    attachments = attachmentIds
      .map((id) => byId.get(id))
      .filter((row): row is typeof media.$inferSelect => Boolean(row && String(row.mimeType).startsWith("image/")))
      .map((row) => ({
        mediaId: row.id,
        url: mediaPublicUrl(row),
        filename: row.filename,
        alt: row.alt,
      }));
  }

  let persistedAttachments: Array<{ mediaId: number; url: string; filename: string; alt: string }> = [];
  if (!attachments.length && persistedMediaIds.length) {
    const rows = await db.select().from(media).where(inArray(media.id, persistedMediaIds));
    const byId = new Map(rows.map((row) => [row.id, row]));
    persistedAttachments = persistedMediaIds
      .map((id) => byId.get(id))
      .filter((row): row is typeof media.$inferSelect => Boolean(row && String(row.mimeType).startsWith("image/")))
      .map((row) => ({
        mediaId: row.id,
        url: mediaPublicUrl(row),
        filename: row.filename,
        alt: row.alt,
      }));
  }

  const attachmentsForContext = attachments.length ? attachments : persistedAttachments;
  const shouldUseVision =
    attachments.length > 0 ||
    (attachmentsForContext.length > 0 && isLikelyImageReference(instruction));

  // Persist the active media as soon as the user sends them so the conversation
  // keeps the images even if the AI provider fails on this turn.
  if (attachments.length) {
    await updateAIConversation(conversation.id, {
      activeProductId: conversation.activeProductId ?? null,
      activeMediaIds: attachments.map((item) => item.mediaId),
      workingContext: previousMemory,
    });
  }

  await addAIMessage(conversation.id, {
    role: "user",
    content: instruction || "Confirmed the selected Master AI action.",
    attachments: attachments.length ? attachments : [],
    webMode,
  });

  if (body.confirmedPlan && Array.isArray(body.confirmIndexes) && body.confirmIndexes.length) {
    const execution = await executeConfirmedMasterPlan(body.confirmedPlan, body.confirmIndexes, { autoSelectModel: autoModel });
    const executionContext = execution.map((item) => ({
      index: item.index,
      domain: item.domain,
      operation: item.operation,
      executed: item.executed,
      ok: item.ok,
      requiresConfirmation: item.requiresConfirmation,
      message: item.message,
      data: item.data,
    }));

    const confirmationSystem = [
      "You are SunVera Jolie Master AI, confirming an explicitly approved administrative action.",
      "Reply in the same language as the owner.",
      "State exactly what was executed and any failures. Do not claim actions that were not executed.",
      "Be concise and propose the next useful step when appropriate.",
    ].join("\n");

    let reply = execution.map((item) =>
      (item.executed ? "✓ " : "! ") + item.message
    ).join("\n");

    try {
      const finalResult = await generateText(
        "chat",
        [
          { role: "system", content: confirmationSystem },
          {
            role: "user",
            content: JSON.stringify({
              userInstruction: instruction || "Confirmed the selected actions.",
              execution: executionContext,
              currentAdminContext: await buildContext(),
            }),
          },
        ],
        {
          temperature: 0.45,
          webSearch: false,
          webFetch: false,
          modelOverride: autoModel ? undefined : String(body.textModel || "").trim() || undefined,
          autoSelectModel: autoModel,
        },
      );
      if (finalResult.text) reply = finalResult.text;
    } catch {
      // Keep the deterministic execution summary.
    }

    const confirmedProductId = extractProductId(
      execution.map((item) => ({ operation: item.operation, data: item.data })),
      body.confirmedPlan as MasterPlan,
    );
    const activeProductId = confirmedProductId ?? conversation.activeProductId ?? null;
    const activeMediaIds = attachments.length
      ? attachments.map((item) => item.mediaId)
      : (conversation.activeMediaIds ?? []);
    const nextMemory: AIConversationMemory = {
      ...previousMemory,
      activeProductId,
      activeMediaIds,
      lastPlan: body.confirmedPlan,
      lastExecution: execution,
      lastAssistantReply: reply,
    };
    await updateAIConversation(conversation.id, {
      activeProductId,
      activeMediaIds,
      workingContext: nextMemory,
    });
    await addAIMessage(conversation.id, {
      role: "assistant",
      content: reply,
      plan: body.confirmedPlan,
      route: { task: "planning", modality: "text", model: "confirmed", label: "Confirmed action", source: "configured" },
      execution,
      webMode,
    });

    return NextResponse.json({
      conversationId: conversation.id,
      plan: body.confirmedPlan,
      route: { task: "planning", modality: "text", model: "confirmed", label: "Confirmed action", source: "configured" },
      autonomyMode,
      execution,
      reply,
      webMode,
    });
  }

  let context: Awaited<ReturnType<typeof buildContext>>;
  try {
    context = await buildContext(attachmentsForContext, conversation.activeProductId ?? null);
  } catch (error) {
    console.error("[Master AI] Context build failed:", error);
    return NextResponse.json(
      {
        conversationId: conversation.id,
        error: "Master AI could not load the admin context.",
        detail: error instanceof Error ? error.message : "Unknown context error",
      },
      { status: 500 },
    );
  }

  const system = [
    "You are SunVera Jolie Master AI, the central administrator assistant for a premium Algerian beauty store.",
    "Understand whether the user wants conversation, analysis, or store work. For pure conversation or advice, you may return an empty actions array and the final assistant response will answer naturally.",
    "For store work, create a small, safe multi-domain plan.",
    "Return ONLY valid JSON: {summary:string,intent:string,actions:[{domain,operation,summary,requiresConfirmation,payload:string}]}.",
    "Valid domains: homepage, products, media, orders, categories, shipping, settings, customers, account, cms.",
    "Use only the provided store context and conversation memory. Do not invent IDs, product names, order references, media IDs, or capabilities.",
    "This is a persistent conversation. Treat prior messages, the active product, saved image references, and saved visual analysis as already known. Do not ask the owner to resend an image or repeat product details that are already in the conversation context.",
    "When the owner uses a short follow-up such as 'update it', 'change the title', 'write the description', or 'make it French', resolve 'it/the product/the image' using the active conversation context before asking a clarifying question.",
    "Read-only analysis can be marked requiresConfirmation=false.",
    "The store is using controlled autonomous mode. Safe content, media, homepage, category, navigation, banner, badge, theme, and public settings actions can be executed automatically. Financial, destructive, shipping, order, checkout, security, AI-configuration, and customer mutations require confirmation.",
    "Never autonomously change order status, shipping fees, prices, stock, payment settings, security settings, AI settings, credentials, customers, or destructive product/media/category/CMS records. Mark those requiresConfirmation=true.",
    "For every action, put a compact JSON object as the payload string. Use ids and values from the provided context only. For actions without parameters use \"{}\".",
    "Supported autonomous operations include: products.update_content, products.attach_media, products.duplicate, products.create_draft, media.generate, media.edit, homepage.update_section, homepage.reorder, categories.create, categories.update, settings.update, settings.update_theme, cms.banner_save, cms.badge_save, cms.nav_save.",
    "Products.publish is a protected public-site action and always requires confirmation.",
    "For every action, use the exact fully-qualified operation name such as products.create_draft, products.update_content, media.edit, or products.publish. Never return shorthand names such as create_draft, update_content, edit, or publish.",
    "Set requiresConfirmation=false for read-only and safe autonomous content operations. Set requiresConfirmation=true for protected operations, including products.publish.",
    "Supported protected operations include: products.create, products.update_financial, products.publish, products.archive, products.delete_permanently, media.delete, orders.update_status, shipping.update_rate, settings.update_protected, cms.banner_delete, cms.badge_delete, cms.nav_delete, categories.archive.",
    "Use products.archive for normal product deletion requests unless the owner explicitly asks for permanent deletion. Use products.update_financial for price/stock/cost changes.",
    "For media.generate, payload can contain prompt, folder, attachToProductId, imageType, alt, title, caption, isPrimary, aspectRatio, resolution.",
    "For media.edit, payload can contain id, prompt, title, caption, alt, aspectRatio, resolution.",
    "For products.update_content, payload can contain id and a patch of copy, SEO, and presentation fields only. Do not use it to change status, active visibility, price, stock, or cost.",
    "For homepage.update_section, payload can contain id and patch for text, media URLs, buttons, products, items, settings, or enabled state.",
    "Read-only operations include: products.list, products.get, media.list, orders.list, categories.list, shipping.list, settings.get, cms.list, customers.list, account.inspect.",
    "If the request cannot be executed safely with the connected tools yet, describe the intended action and use an empty payload instead of inventing a capability.",
    "Prefer a small number of high-value actions.",
    "For products.create, payload must contain product plus optional images and variants.",
    "For products.create_draft, payload must contain product with status draft, an existing categorySlug, and optional images/variants. Price may be left at 0 when it is not visible in the supplied images; never invent a retail price.",
    "For products.update_financial, payload must contain id plus patch with price/comparePrice/costPrice/stock or inventory controls.",
    "For orders.update_status, payload must contain order id and a valid next status.",
    "For shipping.update_rate, payload must contain wilayaCode, fee, stopDeskFee and etaDays.",
    "For settings.update, payload must contain section and patch; checkout/security/ai must instead use settings.update_protected and requiresConfirmation=true.",
    "For CMS banner/badge/navigation operations use their corresponding ids and fields from context.",

  ].join("\n");

  let latestVisualAnalysis = String(previousMemory.visualAnalysis || "");
  let selectedVisionRoute: AIRoute | null = null;
  let generated: Awaited<ReturnType<typeof generateText>>;
  const masterPlanSchema = {
  name: "sunvera_master_plan",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      intent: { type: "string" },
      actions: {
        type: "array",
        minItems: 0,
        maxItems: 20,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            domain: { type: "string", enum: ["homepage", "products", "media", "orders", "categories", "shipping", "settings", "customers", "account", "cms"] },
            operation: { type: "string" },
            summary: { type: "string" },
            requiresConfirmation: { type: "boolean" },
            payload: { type: "string" },
          },
          required: ["domain", "operation", "summary", "requiresConfirmation", "payload"],
        },
      },
    },
    required: ["summary", "intent", "actions"],
  },
} satisfies NonNullable<Parameters<typeof generateText>[2]>["jsonSchema"];;
  try {
    if (shouldUseVision) {
      // Vision models are used only for image understanding. We deliberately do not
      // combine multimodal input with strict JSON-schema planning because some Vision
      // models can inspect the image successfully but do not support structured output.
      const visionResult = await generateText(
        "vision",
        [
          {
            role: "system",
            content:
              "You are the product-image analyst for SunVera Jolie. Analyze only what is visible in the supplied product images. " +
              "Extract readable product text, apparent product type/category, brand, visible size/volume, visible ingredients or claims, packaging details, and other useful facts. " +
              "Do not invent missing facts, prices, SKU values, medical claims, or ingredient lists. Reply with concise factual notes in the same language as the owner.",
          },
          {
            role: "user" as const,
            content: [
              {
                type: "text" as const,
                text:
                  instruction ||
                  "Analyze these product images for creating a new SunVera Jolie product draft. Focus on visible evidence only.",
              },
              ...attachments.map((attachment) => ({
                type: "image_url" as const,
                image_url: { url: attachment.url },
              })),
            ],
          },
        ],
        {
          temperature: 0.2,
          maxTokens: 3072,
          modelOverride: autoModel ? undefined : String(body.visionModel || "").trim() || undefined,
          autoSelectModel: autoModel,
        },
      );

      selectedVisionRoute = visionResult.route;
      latestVisualAnalysis = visionResult.text;
      if (!visionResult.text) {
        throw new Error(
          "Vision model returned no image analysis (" +
            visionResult.route.model +
            "). Check the configured OpenRouter Vision model or available model credits.",
        );
      }

      const planningContext = JSON.stringify({
        ownerRequest: instruction,
        conversationHistory,
        conversationMemory: previousMemory,
        currentAdminContext: context,
        visualAnalysis: visionResult.text,
        instructions:
          "Use the visual analysis plus store context and conversation memory to create the Master AI plan. " +

          "For a new product from these images, use products.create_draft, keep status draft, choose a real existing categorySlug, " +
          "and include every supplied image in payload.images using its mediaId. Never invent a retail price; use 0 when not visible. " +
          "Never invent ingredients, medical claims, size, SKU, or unsupported facts.",
      });

      generated = await generateText(
        "master_plan",
        [
          { role: "system", content: system },
          { role: "user", content: planningContext },
        ],
        {
          maxTokens: 4096,
          modelOverride: autoModel ? undefined : String(body.textModel || "").trim() || undefined,
          autoSelectModel: autoModel,
          jsonSchema: masterPlanSchema,
        },
      );
    } else {
      generated = await generateText(
        "master_plan",
        [
          { role: "system", content: system },
          {
            role: "user",
            content: JSON.stringify({
              userInstruction: instruction,
              conversationHistory,
              conversationMemory: previousMemory,
              currentAdminContext: context,
            }),
          },
        ],
        {
          maxTokens: 4096,
          modelOverride: autoModel ? undefined : String(body.textModel || "").trim() || undefined,
          autoSelectModel: autoModel,
          jsonSchema: masterPlanSchema,
        },
      );
    }
  } catch (error) {
    console.error("[Master AI] Plan generation failed:", error);
    return NextResponse.json(
      {
        conversationId: conversation.id,
        error: "Master AI plan generation failed.",
        detail: error instanceof Error ? error.message : "Unknown provider error",
      },
      { status: 502 },
    );
  }

  if (!generated.text) return NextResponse.json({ conversationId: conversation.id, error: "AI provider unavailable" }, { status: 503 });

  const parsedPlan = parsePlan(generated.text);
  if (!parsedPlan) return NextResponse.json({ conversationId: conversation.id, error: "AI returned an invalid Master plan" }, { status: 422 });

  const plan = normalizeMasterPlanForExecution(
    parsedPlan,
    attachmentsForContext,
    conversation.activeProductId ?? null,
  );
  const execution = await executeMasterPlan(plan as MasterExecutionPlan, autonomyMode, {
    autoSelectModel: autoModel,
  });

  const executionContext = execution.length
    ? execution.map((item) => ({
        domain: item.domain,
        operation: item.operation,
        executed: item.executed,
        ok: item.ok,
        requiresConfirmation: item.requiresConfirmation,
        message: item.message,
        data: item.data,
      }))
    : [];

  const responseSystem = [
    "You are SunVera Jolie Master AI, a warm and capable executive assistant for a premium Algerian beauty store.",
    "Continue the conversation naturally. Reply in the same language as the user.",
    "Explain what you understood, what you changed or analyzed, and any important protected actions that were held.",
    "Be proactive: when useful, suggest concrete next improvements, optimizations, content ideas, or business actions related to the user's request.",
    "Do not invent store facts. Use the supplied execution and admin context.",
    "The user prefers direct help: when a safe content task is requested and autonomous mode executed it, state that it was completed rather than asking for permission again.",
    "When web search is available, use it when the request benefits from current external information, competitors, trends, product research, official documentation, pricing, or other up-to-date facts. Cite sources naturally in the response when the web tool provides them.",
  ].join("\n");

  const responseUser = JSON.stringify({
    userInstruction: instruction,
    autonomyMode,
    conversationHistory,
    conversationMemory: previousMemory,
    plan,
    execution: executionContext,
    currentAdminContext: context,
  });

  let finalReply = "";
  try {
    const finalResult = await generateText(
      "chat",
      [
        { role: "system", content: responseSystem },
        { role: "user", content: responseUser },
      ],
      {
        temperature: 0.55,
        webSearch: webMode !== "off",
        webFetch: webMode !== "off",
        modelOverride: autoModel ? undefined : String(body.textModel || "").trim() || undefined,
        autoSelectModel: autoModel,
      },
    );
    finalReply = finalResult.text;
  } catch {
    try {
      const fallback = await generateText(
        "chat",
        [
          { role: "system", content: responseSystem },
          { role: "user", content: responseUser },
        ],
        {
          temperature: 0.55,
          modelOverride: autoModel ? undefined : String(body.textModel || "").trim() || undefined,
          autoSelectModel: autoModel,
        },
      );
      finalReply = fallback.text;
    } catch {
      finalReply = execution.length
        ? execution.map((item) => (item.executed ? "✓ " : "• ") + item.message).join("\n")
        : plan.summary;
    }
  }

  const detectedProductId = extractProductId(execution, plan);
  const activeProductId = detectedProductId ?? conversation.activeProductId ?? null;
  const activeMediaIds = attachments.length
    ? attachments.map((item) => item.mediaId)
    : (conversation.activeMediaIds ?? []);
  const nextMemory: AIConversationMemory = {
    ...previousMemory,
    activeProductId,
    activeMediaIds,
    visualAnalysis: latestVisualAnalysis,
    lastPlan: plan,
    lastExecution: execution,
    lastAssistantReply: finalReply,
  };

  await updateAIConversation(conversation.id, {
    title: conversation.title === "New chat" ? instruction : conversation.title,
    activeProductId,
    activeMediaIds,
    workingContext: nextMemory,
  });
  await addAIMessage(conversation.id, {
    role: "assistant",
    content: finalReply,
    plan,
    route: generated.route,
    execution,
    webMode,
  });

  return NextResponse.json({
    conversationId: conversation.id,
    plan,
    route: generated.route,
    autonomyMode,
    execution,
    reply: finalReply,
    webMode,
    modelSelection: {
      mode: autoModel ? "auto" : "manual",
      text: generated.route,
      vision: selectedVisionRoute,
    },
  });
}