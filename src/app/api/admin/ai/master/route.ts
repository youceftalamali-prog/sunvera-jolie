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
import { validateMasterPlan, type MasterPlanValidationIssue } from "@/lib/ai-master-plan-validator";
import { verifyLiveHomepageResult, type LiveResultVerification } from "@/lib/ai-live-result-verifier";
import { verifyMasterExecution, type MasterDeterministicVerification } from "@/lib/ai-master-verifier";
import {
  buildMasterCriticSystemPrompt,
  buildMasterCriticUserMessage,
  buildMasterRepairSystemPrompt,
  masterCriticSchema,
  parseMasterCritic,
  type MasterCriticResult,
} from "@/lib/ai-master-critic";
import {
  buildDesignVisionSystemPrompt,
  buildDesignVisionUserMessage,
  buildFallbackDesignBlueprint,
  designBlueprintSchema,
  isHomepageDesignReference,
  parseDesignBlueprint,
} from "@/lib/ai-design-intelligence";
import {
  executeConfirmedMasterPlan,
  executeMasterPlan,
  normalizeMasterAction,
  type MasterExecutionPlan,
} from "@/lib/ai-master-tools";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { extractUrlsFromText, extractUniversalUrl, type UniversalUrlExtraction } from "@/lib/universal-url-extractor";
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

type ScreenScan = {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  visibleText: string;
  elements: Array<{
    tag: string;
    role?: string;
    label?: string;
    text?: string;
    type?: string;
    rect: { x: number; y: number; width: number; height: number };
  }>;
  sections: Array<{ key: string; text?: string; rect: { x: number; y: number; width: number; height: number } }>;
};

const DOMAINS = ["homepage", "products", "media", "orders", "categories", "shipping", "settings", "customers", "account", "cms"] as const;

function detectExplicitAuthorizedOperations(instruction: string, hasImages: boolean) {
  const text = String(instruction ?? "").toLowerCase();
  const authorized = new Set<string>();
  const createDraftIntent = /(?:انش(?:ئ|ي|اء)|أنش(?:ئ|ي|اء)|اصنع|create|new|draft|مسودة|منتج|صفحة منتج)/i.test(text);
  if (createDraftIntent && (hasImages || /(?:منتج|product|صفحة|page|draft|مسودة)/i.test(text))) authorized.add("products.create_draft");
  const financialIntent = /(?:غير|غيّر|تغيير|بدل|بدّل|اجعل|عدل|عدّل|خفض|ارفع|رفع|set|change|update|increase|decrease|raise|lower).{0,80}(?:سعر|السعر|price|cost|التكلفة|stock|المخزون|inventory)/i.test(text) || /(?:سعر|السعر|price).{0,80}(?:من|إلى|الى|from|to)/i.test(text);
  if (financialIntent) authorized.add("products.update_financial");
  return [...authorized];
}

async function buildContext(uploadedImages: Array<{ mediaId: number; url: string; filename: string; alt: string }> = [], activeProductId: number | null = null) {
  const [sections, productRows, categoryRows, mediaRows, ordersByStatus, recentProducts, recentOrders, bannerRows, badgeRows, navRows, shippingRows, customersCount] = await Promise.all([
    db.select({
      id: homepageSections.id,
      key: homepageSections.key,
      title: homepageSections.title,
      enabled: homepageSections.enabled,
      sortOrder: homepageSections.sortOrder,
      productMode: homepageSections.productMode,
      productCount: homepageSections.productCount,
      productIds: homepageSections.productIds,
      items: homepageSections.items,
      settings: homepageSections.settings,
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
    sectionIds: sections.map((row) => row.id),
    productIds: productRows.map((row) => row.id),
    categorySlugs: categoryRows.map((row) => row.slug),
    mediaIds: mediaRows.map((row) => row.id),
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

function stripCodeFences(raw: string) {
  return raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function balancedJsonCandidates(raw: string) {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (char === "}") {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(raw.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

function normalizeJsonCandidate(raw: string) {
  return raw
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/^\s*JSON\s*[:=]\s*/i, "")
    .trim();
}

const MASTER_PLAN_OPERATIONS = new Set([
  "products.update_content", "products.attach_media", "products.duplicate", "products.create_draft",
  "products.create", "products.update_financial", "products.publish", "products.archive", "products.delete_permanently",
  "media.generate", "media.edit", "media.delete",
  "homepage.update_section", "homepage.reorder",
  "categories.create", "categories.update", "categories.archive",
  "settings.update", "settings.update_theme", "settings.update_protected",
  "cms.banner_save", "cms.banner_delete", "cms.badge_save", "cms.badge_delete", "cms.nav_save", "cms.nav_delete",
  "products.list", "products.get", "media.list", "orders.list", "categories.list", "shipping.list", "settings.get", "cms.list",
  "customers.list", "account.inspect",
]);

function inferMasterOperation(domain: string, operation: string) {
  const rawDomain = String(domain ?? "").trim().toLowerCase();
  const raw = String(operation ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!raw && !rawDomain) return null;
  const compact = raw.replace(/\s+/g, "_");
  const exact = rawDomain + "." + compact;
  const candidates = [raw, compact, exact, rawDomain + "." + raw];
  for (const candidate of candidates) if (MASTER_PLAN_OPERATIONS.has(candidate)) return candidate;

  const textValue = rawDomain + " " + raw;
  const isDelete = /(?:delete|remove|permanently delete|حذف|إزالة)/i.test(textValue);
  const isRead = /(?:list|get|inspect|read|fetch|show|عرض|جلب|قراءة)/i.test(textValue);
  const isReorder = /(?:reorder|re[- ]?order|sequence|sort order|ترتيب|إعادة ترتيب)/i.test(textValue);

  if (isReorder && /(?:homepage|home page|landing|section|قسم|رئيسية)/i.test(textValue)) return "homepage.reorder";
  if (/(?:homepage|home page|landing|hero|section|صفحة رئيسية|الصفحة الرئيسية|قسم|واجهة)/i.test(textValue)) return "homepage.update_section";
  if (/(?:banner|بانر)/i.test(textValue)) return isDelete ? "cms.banner_delete" : "cms.banner_save";
  if (/(?:badge|trust|ثقة|شارة)/i.test(textValue)) return isDelete ? "cms.badge_delete" : "cms.badge_save";
  if (/(?:navigation|nav|menu|تنقل|قائمة)/i.test(textValue)) return isDelete ? "cms.nav_delete" : "cms.nav_save";
  if (/(?:theme|color|colour|typography|font|style|ثيم|لون|ألوان|خط|ستايل)/i.test(textValue)) return isDelete ? "settings.update_protected" : "settings.update_theme";

  if (/(?:product|products|منتج|منتجات)/i.test(textValue)) {
    if (isRead) return raw.includes("get") ? "products.get" : "products.list";
    if (isDelete) return /permanent|permanently|نهائي/i.test(textValue) ? "products.delete_permanently" : "products.archive";
    if (/(?:publish|نشر)/i.test(textValue)) return "products.publish";
    if (/(?:duplicate|copy|نسخة)/i.test(textValue)) return "products.duplicate";
    if (/(?:attach|link|assign|set primary|إرفاق|ربط|تعيين)/i.test(textValue)) return "products.attach_media";
    if (/(?:price|cost|stock|inventory|سعر|تكلفة|مخزون)/i.test(textValue)) return "products.update_financial";
    if (/(?:create draft|draft|مسودة|إنشاء)/i.test(textValue)) return "products.create_draft";
    return "products.update_content";
  }
  if (/(?:media|image|asset|وسائط|صورة)/i.test(textValue)) {
    if (isRead) return "media.list";
    if (isDelete) return "media.delete";
    return "media.edit";
  }
  if (/(?:category|categories|فئة|تصنيف)/i.test(textValue)) {
    if (isRead) return "categories.list";
    if (isDelete) return "categories.archive";
    return /create|add|new|إنشاء|إضافة/i.test(textValue) ? "categories.create" : "categories.update";
  }
  if (/(?:shipping|delivery|شحن|توصيل)/i.test(textValue)) return isRead ? "shipping.list" : "shipping.update_rate";
  if (/(?:order|طلب)/i.test(textValue)) return isRead ? "orders.list" : "orders.update_status";
  if (/(?:customer|customers|عميل|زبون)/i.test(textValue)) return "customers.list";
  if (/(?:account|حساب)/i.test(textValue)) return "account.inspect";
  if (/(?:settings|setting|إعدادات|إعداد)/i.test(textValue)) return isRead ? "settings.get" : "settings.update";
  return null;
}

function resolveHomepageSectionId(value: unknown, context?: Awaited<ReturnType<typeof buildContext>>) {
  if (!context) return null;
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0 && context.sectionIds.includes(numeric)) return numeric;
  const needle = String(value ?? "").trim().toLowerCase();
  if (!needle) return null;
  const match = context.sections.find((section) =>
    String(section.key ?? "").trim().toLowerCase() === needle ||
    String(section.title ?? "").trim().toLowerCase() === needle,
  );
  return match ? Number(match.id) : null;
}

function objectPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

function payloadFromLooseAction(action: Record<string, unknown>, operation: string, context?: Awaited<ReturnType<typeof buildContext>>) {
  let payload: Record<string, unknown> = {};
  const rawPayload = action.payload ?? action.parameters ?? action.params ?? action.data;
  if (typeof rawPayload === "string") {
    try { payload = objectPayload(JSON.parse(rawPayload)); } catch { payload = {}; }
  } else if (rawPayload && typeof rawPayload === "object") {
    payload = objectPayload(rawPayload);
  }
  if (!Object.keys(payload).length) {
    const details = action.details ?? action.changes ?? action.patch ?? action.config ?? action.configuration;
    if (details && typeof details === "object" && !Array.isArray(details)) payload = objectPayload(details);
  }
  if (operation === "homepage.update_section") {
    const sectionValue = payload.id ?? action.sectionId ?? action.section_id ?? action.section ?? action.sectionKey ??
      action.section_key ?? action.site_section ?? action.siteSection ?? payload.sectionId ?? payload.sectionKey;
    const sectionId = resolveHomepageSectionId(sectionValue, context);
    if (sectionId) payload.id = sectionId;
    if (!payload.patch || typeof payload.patch !== "object" || Array.isArray(payload.patch)) {
      const details = action.changes && typeof action.changes === "object" && !Array.isArray(action.changes)
        ? action.changes
        : action.details && typeof action.details === "object" && !Array.isArray(action.details) ? action.details : null;
      if (details) payload.patch = objectPayload(details);
    }
  }
  if (operation === "homepage.reorder") {
    const rawOrder = payload.order ?? payload.sectionOrder ?? action.order ?? action.sectionOrder ?? action.sections;
    if (Array.isArray(rawOrder)) {
      const resolved = rawOrder.map((item) => resolveHomepageSectionId(item, context)).filter((id): id is number => Boolean(id));
      if (resolved.length === rawOrder.length) payload.order = resolved;
    }
  }
  return payload;
}

function parsePlan(raw: string, context?: Awaited<ReturnType<typeof buildContext>>): MasterPlan | null {
  const cleaned = stripCodeFences(raw);
  const rawCandidates = [cleaned, raw.trim(), ...balancedJsonCandidates(cleaned), ...balancedJsonCandidates(raw)];
  const candidates = [...new Set(rawCandidates.map(normalizeJsonCandidate).filter(Boolean))];
  for (const candidate of candidates) {
    try {
      const decoded = JSON.parse(candidate) as unknown;
      const possiblePlan =
        decoded && typeof decoded === "object" && !Array.isArray(decoded) && "plan" in decoded
          ? (decoded as { plan?: unknown }).plan
          : null;
      const rootValue =
        possiblePlan && typeof possiblePlan === "object" && !Array.isArray(possiblePlan)
          ? possiblePlan
          : decoded;
      if (!rootValue || typeof rootValue !== "object" || Array.isArray(rootValue)) continue;
      const root = rootValue as Record<string, unknown>;
      const rawActions =
        (Array.isArray(root.actions) && root.actions) ||
        (Array.isArray(root.steps) && root.steps) ||
        (Array.isArray(root.executable_actions) && root.executable_actions) ||
        (Array.isArray(root.executableActions) && root.executableActions) ||
        (root.action && typeof root.action === "object" ? [root.action] : []);

      const actions: MasterAction[] = rawActions
        .filter((action): action is Record<string, unknown> => Boolean(action) && typeof action === "object")
        .map((action) => {
          const rawDomain = String(action.domain ?? action.domain_name ?? action.area ?? action.site_section ?? action.siteSection ?? action.sectionType ?? "").trim().toLowerCase();
          const operationValue =
            [action.operation, action.operation_name, action.name, action.action, action.type, action.task, action.kind]
              .find((value) => typeof value === "string" && value.trim().length > 0);
          const rawOperation = String(operationValue ?? "").trim();
          const operation = inferMasterOperation(rawDomain, rawOperation);
          if (!operation) return null;
          const domain = operation.split(".")[0];
          const detailsText = typeof action.details === "string" ? action.details :
            typeof action.description === "string" ? action.description :
            typeof action.summary === "string" ? action.summary :
            typeof action.action === "string" ? action.action : operation;
          const mutationHint = /(?:create|add|update|edit|delete|remove|change|publish|assign|set|reorder|move|replace|archive|حذف|إضافة|إنشاء|نشر|تغيير|تعديل|ترتيب)/i.test(operation);
          return {
            domain,
            operation,
            summary: String(detailsText).trim().slice(0, 1600) || operation,
            requiresConfirmation: normalizeBoolean(action.requiresConfirmation, mutationHint),
            payload: JSON.stringify(payloadFromLooseAction(action, operation, context)),
          } as MasterAction;
        })
        .filter((action): action is MasterAction => {
          if (!action) return false;
          return (
            DOMAINS.includes(action.domain as (typeof DOMAINS)[number]) &&
            MASTER_PLAN_OPERATIONS.has(action.operation) &&
            Boolean(action.summary)
          );
        })
        .slice(0, 200);

      const summary = String(root.summary ?? root.title ?? root.plan_summary ?? "").trim();
      const intent = String(root.intent ?? root.goal ?? root.objective ?? "").trim();
      if (!summary && !intent && !actions.length) continue;
      return { summary: summary || "SunVera Master AI", intent: intent || "Multi-domain admin request", actions };
    } catch {
      // Try the next extraction/normalization strategy.
    }
  }
  return null;
}

function buildDeterministicHomepageFallbackPlan(
  context: Awaited<ReturnType<typeof buildContext>>,
  instruction: string,
): MasterPlan {
  const themePatch = {
    primary: "#B88945",
    secondary: "#E9DED3",
    accent: "#B88945",
    background: "#FFFDF9",
    surface: "#F8EFE7",
    textColor: "#1F2B34",
    mutedColor: "#7B746D",
    buttonBg: "#B88945",
    buttonText: "#FFFDF9",
    borderColor: "#E9DED3",
    headingFont: "display",
    bodyFont: "sans",
    buttonFont: "sans",
  };

  const actions: MasterAction[] = [
    {
      domain: "settings",
      operation: "settings.update_theme",
      summary: "Apply the premium SunVera Jolie visual theme baseline from the reference request.",
      requiresConfirmation: false,
      payload: JSON.stringify({ patch: themePatch }),
    },
  ];

  const orderedSections = [...context.sections].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
  for (const section of orderedSections) {
    const key = String(section.key ?? "").toLowerCase();
    const patch: Record<string, unknown> = {};
    if (/hero|banner|promo/.test(key)) {
      patch.textColor = "#1F2B34";
      patch.overlayOpacity = 18;
    } else {
      patch.textColor = "#1F2B34";
    }
    actions.push({
      domain: "homepage",
      operation: "homepage.update_section",
      summary: "Refine the existing homepage section styling without replacing its content or media.",
      requiresConfirmation: false,
      payload: JSON.stringify({ id: section.id, patch }),
    });
  }

  if (context.sectionIds.length) {
    actions.push({
      domain: "homepage",
      operation: "homepage.reorder",
      summary: "Preserve all existing homepage sections in their current CMS order while completing the visual fallback.",
      requiresConfirmation: false,
      payload: JSON.stringify({ order: orderedSections.map((section) => Number(section.id)) }),
    });
  }

  return {
    summary: "Applied a safe homepage visual fallback after AI plan parsing failed.",
    intent: String(instruction || "Match the supplied homepage reference using existing CMS capabilities."),
    actions,
  };
}

function isLikelyImageReference(text: string) {
  return /(image|images|photo|photos|picture|pictures|packaging|label|عبوة|العبوة|الصورة|صورة|الصور|من الصورة|من الصور)/i.test(text);
}

function isRetryInstruction(text: string) {
  return /(?:^|[\\s،.!؟])+?(?:retry|try again|try it again|repeat|redo|rerun|run again|re-?run|أعد المحاولة|اعد المحاولة|أعد المحاوله|اعد المحاوله|حاول مرة أخرى|حاول مره اخرى|كرر المحاولة|كرر المحاوله|إعادة المحاولة|اعادة المحاولة)(?:$|[\\s،.!؟])/i.test(text.trim());
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
    .slice(-30)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 8000),
    }));
}


function buildCompactPlannerContext(
  context: Awaited<ReturnType<typeof buildContext>>,
  mode: "homepage" | "general",
) {
  const compactSections = context.sections.map((row) => ({
    id: row.id,
    key: row.key,
    title: row.title,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
  }));

  const compactProducts = context.recentProducts.slice(0, 12).map((row) => ({
    id: row.id,
    name: row.name,
    categorySlug: row.categorySlug,
    status: row.status,
    active: row.active,
    price: row.price,
    stock: row.stock,
  }));

  const base = {
    sectionIds: context.sectionIds,
    sections: compactSections,
    productIds: context.productIds,
    categorySlugs: context.categorySlugs,
    categories: context.categories.slice(0, 35),
    recentProducts: compactProducts,
    mediaIds: context.mediaIds.slice(0, 30),
    recentMedia: context.recentMedia.slice(0, 12),
    uploadedImages: context.uploadedImages.slice(0, 8),
    banners: context.banners.slice(0, 12),
    trustBadges: context.trustBadges.slice(0, 12),
    navigation: context.navigation.slice(0, 20),
  };

  if (mode === "homepage") {
    return base;
  }

  return {
    ...base,
    productsCount: context.productsCount,
    categoriesCount: context.categoriesCount,
    mediaCount: context.mediaCount,
    customersCount: context.customersCount,
    ordersByStatus: context.ordersByStatus,
    recentOrders: context.recentOrders.slice(0, 10),
    shippingRates: context.shippingRates.slice(0, 20),
    account: context.account,
  };
}

function buildCompactUrlEvidence(extractions: UniversalUrlExtraction[]) {
  return extractions.slice(0, 3).map((result) => ({
    inputUrl: result.inputUrl,
    finalUrl: result.finalUrl,
    sourceDomain: result.sourceDomain,
    platform: result.platform,
    extractionStatus: result.extractionStatus,
    confidence: result.confidence,
    isProductLike: result.isProductLike,
    title: result.title,
    description: result.description.slice(0, 3000),
    shortDescription: result.shortDescription,
    brand: result.brand,
    category: result.category,
    sku: result.sku,
    barcode: result.barcode,
    price: result.price,
    compareAtPrice: result.compareAtPrice,
    currency: result.currency,
    availability: result.availability,
    rating: result.rating,
    reviewCount: result.reviewCount,
    size: result.size,
    volume: result.volume,
    variants: result.variants.slice(0, 8),
    attributes: result.attributes,
    images: result.images.slice(0, 12).map((image) => ({
      url: image.url,
      alt: image.alt,
      width: image.width,
      height: image.height,
      source: image.source,
    })),
    videos: result.videos.slice(0, 4),
    canonicalUrl: result.canonicalUrl,
    textExcerpt: result.textExcerpt.slice(0, 2500),
    warnings: result.warnings.slice(0, 10),
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

  const rl = await rateLimit("admin-ai-master", clientIp(req), 60, 10 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Too many Master AI requests. Try again later." }, { status: 429 });

  try {
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
    screenScan?: ScreenScan;
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
  const retryRequest = isRetryInstruction(instruction);
  const previousUserInstruction =
    [...previousMessages]
      .reverse()
      .find((message) => message.role === "user" && !isRetryInstruction(message.content))
      ?.content || "";
  const effectiveInstruction = retryRequest && previousUserInstruction ? previousUserInstruction : instruction;

  // Universal URL Intelligence: extract public page/product data before Master AI planning.
  // This is read-only evidence; it never mutates the source website.
  let urlExtractions: UniversalUrlExtraction[] = [];
  const detectedUrls = extractUrlsFromText(effectiveInstruction);
  if (detectedUrls.length) {
    const results = await Promise.all(detectedUrls.map((url) => extractUniversalUrl(url)));
    urlExtractions = results;
  }

  const persistedMediaIds = Array.isArray(conversation.activeMediaIds)
    ? conversation.activeMediaIds.filter((id): id is number => Number.isInteger(id))
    : [];

  const settings = await getSettingsMap();
  const autonomyMode = settings.ai.autonomyMode === "assisted" ? "assisted" : "autonomous";
  const screenScan = body.screenScan && typeof body.screenScan === "object" ? body.screenScan : null;

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
    (attachmentsForContext.length > 0 && (retryRequest || isLikelyImageReference(effectiveInstruction)));

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

  const isDesignReference = isHomepageDesignReference(effectiveInstruction, attachmentsForContext.length > 0);

  const system = [
    "You are SunVera Jolie Master AI, the central administrator assistant for a premium Algerian beauty store.",
    "Understand whether the user wants conversation, analysis, or store work. For pure conversation or advice, you may return an empty actions array and the final assistant response will answer naturally.",
    "For store work, create a small, safe multi-domain plan.",
    "Return ONLY valid JSON: {summary:string,intent:string,actions:[{domain,operation,summary,requiresConfirmation,payload:string}]}.",
    "Valid domains: homepage, products, media, orders, categories, shipping, settings, customers, account, cms.",
    "Use only the provided store context and conversation memory. Do not invent IDs, product names, order references, media IDs, or capabilities.",
    "This is a persistent conversation. Treat prior messages, the active product, saved image references, and saved visual analysis as already known. Do not ask the owner to resend an image or repeat product details that are already in the conversation context.",
    "When the owner uses a short follow-up such as 'update it', 'change the title', 'write the description', 'make it French', 'retry', 'try again', or 'redo', resolve it against the most recent substantive user request in the conversation. A retry instruction is not a new store task and must never be treated as a request to inspect the store generally.",
    "When retrying an image-derived product request, use the persisted image attachments and the previous substantive user instruction as the task to execute. Re-run the same product workflow rather than answering that no previous attempt exists.",
    "When the effective user request explicitly asks to create a new product draft from supplied images, you MUST return a products.create_draft action with the product payload and supplied image mediaIds. Do not return an empty actions array for that request.",
    "Read-only analysis can be marked requiresConfirmation=false.",
    "The store uses autonomous execution for safe, reversible store operations. Product publication is a normal reversible storefront operation: when the owner explicitly says publish, publish it directly, then verify status and storefront state. Do not ask for confirmation for publication. Explicit owner commands for product financial fields may execute directly through products.update_financial; destructive, shipping, order, checkout, security, AI-configuration, and customer mutations remain protected.",
    "AUTONOMOUS RESILIENCE POLICY: Complete the owner's goal rather than stopping at the first implementation obstacle. For safe and reversible work, diagnose failures, retry transient provider/database errors, normalize malformed AI output, switch to another compatible model or implementation path, and continue with the closest supported CMS capability. Do not ask for confirmation merely because a response needs repair, a field is unsupported, or the first technical path failed. Never invent IDs, URLs, prices, capabilities, or destructive workarounds. Protected operations must remain protected even in autonomous mode.",
    "When the owner explicitly commands a price/cost/stock change, use products.update_financial with the exact product id from context and exact requested numeric value. Set requiresConfirmation=false for that explicit financial change. Never invent or recommend a financial value the owner did not request.",
    "For image-derived product drafts, treat the uploaded image analysis as the source of truth. Never invent ingredients, benefits, medical claims, manufacturer details, usage steps, warnings, SKU, barcode, size, or hair/skin type.",
    "If usage instructions or warnings are not visible, set them exactly to 'Requires official manufacturer information'. Do not replace that placeholder with a paraphrase or inferred advice.",
    "Leave SKU and barcode blank when they are not visible. Do not generate an AI SKU for an image-derived draft.",
    "Do not proactively suggest or invent price, stock, cost, discounts, or other financial values unless the owner explicitly asks for a recommendation. For image-derived drafts, use price 0 and stock 0 when those values are not visible.",
    "For every action, put a compact JSON object as the payload string. Use ids and values from the provided context only. For actions without parameters use \"{}\".",
    "Supported autonomous operations include: products.update_content, products.attach_media, products.duplicate, products.create_draft, products.publish, homepage.update_section, homepage.reorder, categories.create, categories.update, settings.update, settings.update_theme, cms.banner_save, cms.badge_save, cms.nav_save.",
    "Homepage is fully Master-AI editable through homepage.update_section and homepage.reorder. For every section, patch may update: title, subtitle, body, imageUrl, imageMobileUrl, imageTabletUrl, buttonText, buttonUrl, button2Text, button2Url, background, textColor, textPosition, overlayOpacity, productMode, productCount, productIds, items, settings, enabled.",
    "Homepage settings are persistent JSON and are rendered by the storefront. Use settings for section-specific copy and controls that do not have dedicated columns. Standard editable text keys include: eyebrow, heading, description, secondaryEyebrow, secondaryHeading, secondaryDescription, ctaText, ctaUrl, secondaryCtaText, secondaryCtaUrl, heroEyebrow, heroHeading, heroCtaText, itemCtaText, benefit1, benefit2, benefit3, benefit4, emailPlaceholder, and stages.",
    "For visual control, use settings.colors with keys: background, text, accent, surface, muted, border, buttonBackground, buttonText. The storefront applies these values to the section's visual system. Prefer section.background/textColor for primary section values and settings.colors for the full palette.",
    "For product control, use productMode/productCount/productIds when the section supports products. For card/grid content, use items as an array of objects such as {title,text,url,image,icon}. For the featured routine section, settings.stages is an array of {num,label,text}.",
    "When the owner asks to change homepage text, image, color, CTA, products, order, visibility, or to place a product into a named section such as Best Sellers or Collections, execute the corresponding homepage.update_section or homepage.reorder action automatically. Use the real section id from context. For product placement, set productMode to manual and productIds to the requested existing product ids when the section supports product cards. Do not merely describe the change or return a plan without execution.",
    "When uploaded images are attached and the owner says to put, move, use, feature, or replace them on the homepage, Master AI is the central coordinator: use the uploaded asset URL/mediaId in a homepage.update_section action and apply the CMS change directly. Do not invent a media URL and do not route the task to a separate Homepage AI brain.",
    "The Homepage AI Design Assistant is only a delegated UI surface over the same Master AI gateway. Treat requests coming from that surface with the same model routing and safety rules as Master AI.",

    "Universal URL Intelligence is available whenever the owner includes a public URL. Use urlExtractions as read-only source evidence extracted from HTML, JSON-LD/Schema.org, OpenGraph/meta tags, supported platform APIs, page images, videos, and visible text.",
    "When the owner asks to read, inspect, extract, import, copy, or create a product from a supplied URL, use urlExtractions instead of inventing facts. For an explicit product import/create-draft request, return products.create_draft with a real categorySlug from currentAdminContext and use the extracted image URLs in payload.images when present.",
    "Preserve source facts exactly when they are visible. Never invent missing SKU, barcode, ingredients, claims, warnings, usage, size, variants, brand, price, or other product facts. Missing financial values must remain 0/null as appropriate.",
    "A URL does not authorize any mutation on the source website. URL extraction is read-only and best-effort; respect extractionStatus, confidence, and warnings.",

    "products.publish is supported and executable. If the owner asks to publish a product, execute products.publish directly after resolving the real product id from context or conversation memory. After execution, verify that status is published and active. Do not tell the owner to publish manually unless execution actually failed or a protected prerequisite is missing.",
    "For every action, use the exact fully-qualified operation name such as products.create_draft, products.update_content, media.edit, or products.publish. Never return shorthand names such as create_draft, update_content, edit, or publish.",
    "Set requiresConfirmation=false for read-only and safe/reversible autonomous operations, including products.publish, homepage changes, product content, media attachment, categories, theme, and CMS content. Use confirmation only for genuinely destructive, financial-risk, security, customer, order, shipping, or irreversible operations.",
    "Supported protected operations include: products.create, products.update_financial, products.archive, products.delete_permanently, media.delete, orders.update_status, shipping.update_rate, settings.update_protected, cms.banner_delete, cms.badge_delete, cms.nav_delete, categories.archive.",
    "Use products.archive for normal product deletion requests unless the owner explicitly asks for permanent deletion. Use products.update_financial for price/stock/cost changes.",
    "For products.update_content, payload can contain id and a patch of copy, SEO, and presentation fields only. Do not use it to change status, active visibility, price, stock, or cost.",
    "For homepage.update_section, payload can contain id and patch for text, media URLs, buttons, products, items, settings, or enabled state.",
    "Read-only operations include: products.list, products.get, media.list, orders.list, categories.list, shipping.list, settings.get, cms.list, customers.list, account.inspect.",
    "If the request cannot be executed safely with the connected tools yet, describe the intended action and use an empty payload instead of inventing a capability.",
    "Produce the complete set of actions required to fulfill the owner request. Do not omit necessary actions merely to keep the plan short.",
    "For products.create, payload must contain product plus optional images and variants.",
    "For products.create_draft, payload must contain product with status draft, an existing categorySlug, and optional images/variants. Price may be left at 0 when it is not visible in the supplied images; never invent a retail price.",
    "For products.publish, payload must contain the real product id. If the active product is the target, use that id. Do not require a separate confirmation step.",
    "For products.update_financial, payload must contain id plus patch with price/comparePrice/costPrice/stock or inventory controls.",
    "For orders.update_status, payload must contain order id and a valid next status.",
    "For shipping.update_rate, payload must contain wilayaCode, fee, stopDeskFee and etaDays.",
    "For settings.update, payload must contain section and patch; checkout/security/ai must instead use settings.update_protected and requiresConfirmation=true.",
    "For CMS banner/badge/navigation operations use their corresponding ids and fields from context.",
    "When a Design Blueprint is supplied for a homepage reference image, treat it as the visual source of truth for layout and styling intent.",
    "For homepage design requests, map the blueprint to existing homepage section records from currentAdminContext. Use homepage.update_section with real numeric section ids and homepage.reorder with a complete numeric id order.",
    "Never create or invent homepage section ids. Never put section keys such as \"hero\" or \"best_sellers\" inside homepage.reorder; that operation accepts numeric database ids only.",
    "A homepage reorder must contain every current homepage section id exactly once. If the reference layout intentionally omits existing sections, disable those unwanted sections with homepage.update_section {id, patch:{enabled:false}} and still include their ids once in homepage.reorder (normally after the visible sections). For the provided luxury reference pattern, the visible core sections are hero, trust_badges, categories, best_sellers, promo_banner, testimonials, newsletter; existing extra sections such as collections, routine, new_arrivals, skincare, hair_care, or featured should be disabled when they are absent from the requested reference rather than silently omitted from the reorder.",
    "For homepage design requests, prefer updating existing sections over creating CMS structures. Use the current section key/title only to identify the record, then use its real numeric id in the action payload.",
    "Never invent media URLs or product ids. Use only existing CMS fields supported by the homepage tool.",
    "Preserve existing content unless the reference and request clearly call for a content change. Translate visual intent into the smallest set of CMS actions needed.",

  ].join("\n");

  let latestVisualAnalysis = String(previousMemory.visualAnalysis || "");
  let latestDesignBlueprint: unknown = null;
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
        maxItems: 200,
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
    if (shouldUseVision && isDesignReference) {
      // Design Vision is advisory: a structured blueprint is preferred, but it
      // must never become a hard blocker for an otherwise safe Master AI task.
      let designVisionText = "";

      try {
        const designVisionResult = await generateText(
          "vision",
          [
            { role: "system", content: buildDesignVisionSystemPrompt() },
            {
              role: "user",
              content: buildDesignVisionUserMessage(effectiveInstruction, attachmentsForContext),
            },
          ],
          {
            temperature: 0.15,
            modelOverride: autoModel ? undefined : String(body.visionModel || "").trim() || undefined,
            autoSelectModel: autoModel,
            jsonSchema: designBlueprintSchema,
          },
        );
        selectedVisionRoute = designVisionResult.route;
        designVisionText = designVisionResult.text?.trim() || "";
      } catch (error) {
        console.error("[Master AI] Structured Design Vision failed; falling back to analysis mode:", error);
      }

      // Some vision providers can inspect images but do not reliably honor strict
      // JSON Schema. Retry without schema so the planner can still use the visual
      // evidence instead of treating formatting as a fatal failure.
      if (!designVisionText) {
        try {
          const fallbackVisionResult = await generateText(
            "vision",
            [
              {
                role: "system",
                content:
                  buildDesignVisionSystemPrompt() +
                  "\\nIf structured JSON output is unavailable, return concise plain-text visual analysis covering the visible layout, colors, typography, hero composition, section order, spacing, components, and responsive intent. Do not invent IDs or database values.",
              },
              {
                role: "user",
                content: buildDesignVisionUserMessage(effectiveInstruction, attachmentsForContext),
              },
            ],
            {
              temperature: 0.2,
              modelOverride: autoModel ? undefined : String(body.visionModel || "").trim() || undefined,
              autoSelectModel: autoModel,
            },
          );
          selectedVisionRoute = fallbackVisionResult.route;
          designVisionText = fallbackVisionResult.text?.trim() || "";
        } catch (error) {
          console.error("[Master AI] Unstructured Design Vision fallback failed:", error);
        }
      }

      const parsedDesign = parseDesignBlueprint(designVisionText);
      if (parsedDesign) {
        latestDesignBlueprint = parsedDesign;
      } else if (designVisionText) {
        try {
          const repairedDesign = await generateText(
            "master_plan",
            [
              {
                role: "system",
                content:
                  "You are a Design Blueprint normalization agent. Convert the supplied visual analysis into exactly one valid Design Blueprint object. Preserve the observed design intent. Never invent CMS IDs, product IDs, media IDs, URLs, prices, or database values. Return only JSON matching the supplied schema.",
              },
              {
                role: "user",
                content: JSON.stringify({
                  visualAnalysis: designVisionText.slice(0, 32768),
                  ownerRequest: effectiveInstruction,
                }),
              },
            ],
            {
              temperature: 0.05,
              modelOverride: autoModel ? undefined : String(body.textModel || "").trim() || undefined,
              autoSelectModel: autoModel,
              jsonSchema: designBlueprintSchema,
            },
          );
          selectedVisionRoute = repairedDesign.route;
          latestDesignBlueprint = parseDesignBlueprint(repairedDesign.text);
        } catch (error) {
          console.error("[Master AI] Design Blueprint normalization failed:", error);
        }
      }

      // Final safe fallback: keep the task moving using the existing homepage
      // structure and a conservative premium-beauty design baseline. The raw
      // visual analysis remains available to the Master planner as evidence.
      if (!latestDesignBlueprint) {
        latestDesignBlueprint = buildFallbackDesignBlueprint(
          effectiveInstruction,
          context.sections.map((section) => ({
            key: section.key,
            title: section.title,
            sortOrder: section.sortOrder,
          })),
        );
        console.warn("[Master AI] Using safe Design Blueprint fallback; visual analysis did not produce structured output.");
      }

      latestVisualAnalysis = designVisionText || JSON.stringify(latestDesignBlueprint);
      const planningContext = JSON.stringify({
        ownerRequest: effectiveInstruction,
        currentAdminContext: buildCompactPlannerContext(context, "homepage"),
        urlExtractions: buildCompactUrlEvidence(urlExtractions),
        screenScan,
        visualAnalysis: latestVisualAnalysis.slice(0, 32768),
        designBlueprint: latestDesignBlueprint,
        retryRequest,
        planningInstructions: [
          "Use the Design Blueprint and raw visual analysis as guidance, but do not treat either as a hard execution prerequisite.",
          "Translate visible design intent into existing CMS capabilities and complete the owner's request using safe alternatives when a direct mapping is unavailable.",
          "Use homepage.update_section with real section ids and homepage.reorder with real section id order from currentAdminContext.sections.",
          "Prefer updating existing hero, trust badges, categories, best sellers, promo banner, testimonials, newsletter, and other existing records rather than inventing new section records.",
          "Do not invent section ids, media ids, product ids, URLs, prices, or unsupported fields.",
          "Include every necessary action required to complete the requested task; do not stop because the visual-analysis layer was imperfect.",
        ],
      });

      generated = await generateText(
        "master_plan",
        [
          { role: "system", content: system },
          { role: "user", content: planningContext },
        ],
        {
          maxTokens: 32768,
          modelOverride: autoModel ? undefined : String(body.textModel || "").trim() || undefined,
          autoSelectModel: autoModel,
          jsonSchema: masterPlanSchema,
        },
      );
    } else if (shouldUseVision) {
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
                  effectiveInstruction ||
                  "Analyze these product images for creating a new SunVera Jolie product draft. Focus on visible evidence only.",
              },
              ...attachmentsForContext.map((attachment) => ({
                type: "image_url" as const,
                image_url: { url: attachment.url },
              })),
            ],
          },
        ],
        {
          temperature: 0.2,
          maxTokens: 32768,
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
        ownerRequest: effectiveInstruction,
        currentAdminContext: buildCompactPlannerContext(context, "general"),
        urlExtractions: buildCompactUrlEvidence(urlExtractions),
        visualAnalysis: visionResult.text.slice(0, 32768),
        retryRequest,
        instructions:
          "Use the visual analysis plus store context and conversation memory to create the Master AI plan. " +

          "For a new product from these images, use products.create_draft, keep status draft, choose a real existing categorySlug, " +
          "and include every supplied image in payload.images using its mediaId. Never invent a retail price; use 0 when not visible. " +
          "Never invent ingredients, medical claims, size, SKU, barcode, usage, warnings, or unsupported facts. " +
          "When usage or warnings are not visible, set each field exactly to 'Requires official manufacturer information'. " +
          "Leave SKU and barcode blank when not visible.",
      });

      generated = await generateText(
        "master_plan",
        [
          { role: "system", content: system },
          { role: "user", content: planningContext },
        ],
        {
          maxTokens: 32768,
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
              userInstruction: effectiveInstruction,
              conversationHistory: conversationHistory.slice(-50).map((message) => ({
                role: message.role,
                content: message.content.slice(0, 16000),
              })),
              conversationMemory: {
                activeProductId: previousMemory.activeProductId,
                activeMediaIds: previousMemory.activeMediaIds?.slice(0, 8),
                lastAssistantReply: String(previousMemory.lastAssistantReply || "").slice(0, 12000),
                visualAnalysis: String(previousMemory.visualAnalysis || "").slice(0, 16000),
              },
              currentAdminContext: buildCompactPlannerContext(context, "general"),
              urlExtractions: buildCompactUrlEvidence(urlExtractions),
              screenScan,
            }),
          },
        ],
        {
          maxTokens: 32768,
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

  let parsedPlan = parsePlan(generated.text, context);

  if (!parsedPlan && isUrlReadRequest(effectiveInstruction)) {
    parsedPlan = buildDeterministicUrlReadPlan(effectiveInstruction, urlExtractions);
    if (parsedPlan) console.warn("[Master AI] URL read request recovered deterministically from extracted source evidence.");
  }

  // Master AI 2.0: if a reasoning model returns malformed JSON, automatically
  // repair the structure with a dedicated structured-output pass instead of
  // exposing a parser error to the owner.
  if (!parsedPlan) {
    const repairSystem = [
      "You are the Master AI JSON repair and validation agent for SunVera Jolie.",
      "Convert the supplied draft plan into exactly one valid Master AI plan.",
      "Preserve the original intent and actions; repair only formatting, missing required fields, and obvious schema-shape issues.",
      "Never invent store IDs, media IDs, product IDs, capabilities, or new actions that are not present in the supplied draft/context.",
      "Return only the required structured plan.",
      "Every action must contain domain, operation, summary, requiresConfirmation, and payload as a JSON string.",
      "Valid domains: homepage, products, media, orders, categories, shipping, settings, customers, account, cms.",
    ].join("\n");

    const repairUser = JSON.stringify({
      originalPlan: generated.text.slice(0, 32768),
      userInstruction: effectiveInstruction,
      currentAdminContext: buildCompactPlannerContext(context, isDesignReference ? "homepage" : "general"),
      urlExtractions: buildCompactUrlEvidence(urlExtractions),
      urlReadRequest: isUrlReadRequest(effectiveInstruction),
    });

    try {
      const repaired = await generateText(
        "master_plan",
        [
          { role: "system", content: repairSystem },
          { role: "user", content: repairUser },
        ],
        {
          temperature: 0.1,
          modelOverride: autoModel ? undefined : String(body.textModel || "").trim() || undefined,
          autoSelectModel: autoModel,
        },
      );
      parsedPlan = parsePlan(repaired.text, context);
    } catch (repairError) {
      console.error("[Master AI] Plan repair failed:", repairError);
      try {
        const repairedFallback = await generateText(
          "master_plan",
          [
            { role: "system", content: repairSystem },
            { role: "user", content: repairUser },
          ],
          {
            temperature: 0.1,
            modelOverride: autoModel ? undefined : String(body.textModel || "").trim() || undefined,
            autoSelectModel: autoModel,
          },
        );
        parsedPlan = parsePlan(repairedFallback.text, context);
      } catch (fallbackError) {
        console.error("[Master AI] Fallback plan repair failed:", fallbackError);
      }
    }
  }

  if (!parsedPlan && isDesignReference) {
    parsedPlan = buildDeterministicHomepageFallbackPlan(context, effectiveInstruction);
    console.warn("[Master AI] Using deterministic homepage fallback after plan parsing failed.");
  }

  if (!parsedPlan) {
    return NextResponse.json(
      {
        conversationId: conversation.id,
        error: "AI returned an invalid Master plan",
        detail: "The model response could not be parsed as a valid Master AI JSON plan after automatic repair.",
        rawPreview: generated.text.slice(0, 1800),
      },
      { status: 422 },
    );
  }

  let plan = normalizeMasterPlanForExecution(
    parsedPlan,
    attachmentsForContext,
    conversation.activeProductId ?? null,
  );

  // Master AI 2.0 Phase 2.5 + Universal URL Intelligence: external product images
  // are valid only when they were actually extracted from the supplied URL.
  const planValidationContext = {
    ...context,
    externalImageUrls: urlExtractions.flatMap((result) => result.images.map((image) => image.url)),
  };

  // Master AI 2.0 Phase 2.5: validate the executable plan against real CMS/database
  // identifiers before any action reaches the executor. When validation fails,
  // automatically repair the plan once using the same structured-output pipeline.
  let planValidation = validateMasterPlan(plan as MasterExecutionPlan, planValidationContext);

  if (!planValidation.valid) {
    const validationIssues = planValidation.issues.slice(0, 200);
    const validatorSystem = [
      "You are the SunVera Jolie Master AI execution-plan validator and repair agent.",
      "Repair the supplied plan so it can execute against the current admin context.",
      "Preserve the owner's intent and only fix invalid operations, IDs, payload shapes, and unsupported fields.",
      "Never invent identifiers. Use only IDs, slugs, media IDs, and capabilities present in currentAdminContext.",
      "For homepage.update_section, use an existing numeric homepage section id and only CMS-supported patch fields.",
      "For homepage.reorder, include every current homepage section id exactly once and never use section keys. If the owner is transforming the homepage to match a reference that intentionally omits existing sections, add enabled:false updates for those omitted sections and then include all ids in the reorder.",
      "Return ONLY one valid JSON object matching the Master AI plan schema.",
    ].join("\n");

    const validatorUser = JSON.stringify({
      ownerRequest: effectiveInstruction,
      draftPlan: plan,
      validationIssues,
      currentAdminContext: buildCompactPlannerContext(context, isDesignReference ? "homepage" : "general"),
      urlExtractions: buildCompactUrlEvidence(urlExtractions),
      designBlueprint: latestDesignBlueprint,
    });

    try {
      const repairedPlanResult = await generateText(
        "master_plan",
        [
          { role: "system", content: validatorSystem },
          { role: "user", content: validatorUser },
        ],
        {
          temperature: 0.05,
          modelOverride: autoModel ? undefined : String(body.textModel || "").trim() || undefined,
          autoSelectModel: autoModel,
        },
      );
      const repairedPlan = parsePlan(repairedPlanResult.text, context);
      if (repairedPlan) {
        plan = normalizeMasterPlanForExecution(
          repairedPlan,
          attachmentsForContext,
          conversation.activeProductId ?? null,
        );
        planValidation = validateMasterPlan(plan as MasterExecutionPlan, planValidationContext);
      }
    } catch (validationRepairError) {
      console.error("[Master AI] Plan validation repair failed:", validationRepairError);
    }
  }

  if (!planValidation.valid) {
    const validationIssues: MasterPlanValidationIssue[] = planValidation.issues.slice(0, 200);
    const invalidIndexes = new Set(validationIssues.map((issue) => issue.index));
    const salvageActions = plan.actions.filter((_, index) => !invalidIndexes.has(index));

    if (salvageActions.length > 0) {
      console.warn(
        "[Master AI] Salvaging valid actions after plan validation issues:",
        validationIssues.slice(0, 12),
      );
      plan = { ...plan, actions: salvageActions };
      planValidation = validateMasterPlan(plan as MasterExecutionPlan, planValidationContext);
    }
  }

  if (!planValidation.valid) {
    const validationIssues: MasterPlanValidationIssue[] = planValidation.issues.slice(0, 200);
    return NextResponse.json(
      {
        conversationId: conversation.id,
        error: "Master AI produced an unsafe or invalid execution plan.",
        detail: "The remaining actions failed CMS/database validation after automatic repair and safe-action salvage.",
        validationIssues,
      },
      { status: 422 },
    );
  }

  const authorizedOperations = detectExplicitAuthorizedOperations(effectiveInstruction, attachmentsForContext.length > 0);
  let execution = await executeMasterPlan(plan as MasterExecutionPlan, autonomyMode, {
    autoSelectModel: autoModel,
    authorizedOperations,
  });

  // Master AI 2.0 Phase 3: review the post-execution state against the owner's
  // intent and Design Blueprint. The critic can trigger one bounded, safe repair
  // pass, then verifies the result again.
  let critic: MasterCriticResult | null = null;
  let criticRoute: AIRoute | null = null;
  let liveVerification: LiveResultVerification | null = null;
  let deterministicVerification: MasterDeterministicVerification | null = null;
  let postExecutionContext: typeof context = context;
  const shouldVerifyLive = isDesignReference || plan.actions.some((action) => action.operation.startsWith("homepage."));

  const runCritic = async (currentExecution: typeof execution, currentContext: typeof context) => {
    try {
      const result = await generateText(
        "master_plan",
        [
          { role: "system", content: buildMasterCriticSystemPrompt() },
          {
            role: "user",
            content: buildMasterCriticUserMessage({
              ownerRequest: effectiveInstruction,
              designBlueprint: latestDesignBlueprint,
              liveVerification,
              deterministicVerification,
              plan,
              execution: currentExecution,
              currentAdminContext: currentContext,
            }),
          },
        ],
        {
          temperature: 0.05,
          modelOverride: autoModel ? undefined : String(body.textModel || "").trim() || undefined,
          autoSelectModel: autoModel,
          jsonSchema: masterCriticSchema,
        },
      );
      const parsed = parseMasterCritic(result.text);
      if (!parsed) return { critic: null as MasterCriticResult | null, route: result.route };
      return { critic: parsed, route: result.route };
    } catch (error) {
      console.error("[Master AI] Critic failed:", error);
      return { critic: null as MasterCriticResult | null, route: null as AIRoute | null };
    }
  };

  try {
    postExecutionContext = await buildContext(
      attachmentsForContext,
      conversation.activeProductId ?? null,
    );
  } catch (error) {
    console.error("[Master AI] Post-execution context refresh failed:", error);
  }

  try {
    deterministicVerification = await verifyMasterExecution(plan as MasterExecutionPlan, execution);
  } catch (error) {
    console.error("[Master AI] Deterministic execution verification failed:", error);
  }

  if (shouldVerifyLive) {
    try {
      liveVerification = await verifyLiveHomepageResult(
        new URL(req.url).origin,
        plan as MasterExecutionPlan,
        postExecutionContext.sections
          .filter((section) => section.enabled)
          .map((section) => ({ id: section.id, key: section.key })),
      );
    } catch (error) {
      console.error("[Master AI] Live homepage verification failed:", error);
      liveVerification = {
        checked: false,
        status: "blocked",
        url: new URL(req.url).origin + "/",
        httpStatus: null,
        observedSectionOrder: [],
        expectedSectionOrder: [],
        missingSections: [],
        unexpectedSections: [],
        contentMismatches: [],
        summary: "Live homepage verification failed to run.",
        issues: [error instanceof Error ? error.message : "Unknown live verification error."],
      };
    }
  }

  const initialCritic = await runCritic(execution, postExecutionContext);
  critic = initialCritic.critic;
  criticRoute = initialCritic.route;

  if (critic?.status === "needs_repair") {
    const repairUser = JSON.stringify({
      ownerRequest: effectiveInstruction,
      originalPlan: plan,
      critic,
      liveVerification,
      currentAdminContext: postExecutionContext,
      designBlueprint: latestDesignBlueprint,
      previousExecution: execution,
    });

    try {
      const repairedPlanResult = await generateText(
        "master_plan",
        [
          { role: "system", content: buildMasterRepairSystemPrompt() },
          { role: "user", content: repairUser },
        ],
        {
          temperature: 0.05,
          modelOverride: autoModel ? undefined : String(body.textModel || "").trim() || undefined,
          autoSelectModel: autoModel,
        },
      );

      const repairedParsed = parsePlan(repairedPlanResult.text, context);
      if (repairedParsed) {
        const repairedPlan = normalizeMasterPlanForExecution(
          repairedParsed,
          attachmentsForContext,
          conversation.activeProductId ?? null,
        );
        const repairedValidation = validateMasterPlan(repairedPlan as MasterExecutionPlan, {
          ...postExecutionContext,
          externalImageUrls: urlExtractions.flatMap((result) => result.images.map((image) => image.url)),
        });

        if (repairedValidation.valid) {
          const repairExecution = await executeMasterPlan(
            repairedPlan as MasterExecutionPlan,
            autonomyMode,
            {
              autoSelectModel: autoModel,
              authorizedOperations,
            },
          );

          if (repairExecution.length) {
            execution = [...execution, ...repairExecution];
            plan = {
              ...plan,
              actions: [...plan.actions, ...repairedPlan.actions],
            };
            try {
              postExecutionContext = await buildContext(
                attachmentsForContext,
                conversation.activeProductId ?? null,
              );
            } catch (error) {
              console.error("[Master AI] Post-repair context refresh failed:", error);
            }

            if (shouldVerifyLive) {
              try {
                liveVerification = await verifyLiveHomepageResult(
                  new URL(req.url).origin,
                  plan as MasterExecutionPlan,
                  postExecutionContext.sections
                    .filter((section) => section.enabled)
                    .map((section) => ({ id: section.id, key: section.key })),
                );
              } catch (error) {
                console.error("[Master AI] Post-repair live verification failed:", error);
              }
            }

            const finalCritic = await runCritic(execution, postExecutionContext);
            critic = finalCritic.critic ?? critic;
            criticRoute = finalCritic.route ?? criticRoute;
          }
        } else {
          console.warn("[Master AI] Critic repair plan failed validation:", repairedValidation.issues);
          critic = {
            ...critic,
            status: "blocked",
            summary: "A repair was identified, but the repaired plan did not pass execution validation.",
            issues: [
              ...critic.issues,
              ...repairedValidation.issues.slice(0, 6).map((issue) => ({
                severity: "high" as const,
                area: "cms" as const,
                message: issue.message,
                evidence: issue.field,
              })),
            ].slice(0, 12),
          };
        }
      }
    } catch (repairError) {
      console.error("[Master AI] Critic repair execution failed:", repairError);
      critic = {
        ...critic,
        status: "blocked",
        summary: "A repair was identified, but the automatic repair pass failed.",
        issues: [
          ...critic.issues,
          {
            severity: "high" as const,
            area: "execution" as const,
            message: "Automatic repair could not be completed.",
            evidence: repairError instanceof Error ? repairError.message.slice(0, 240) : "Unknown repair failure",
          },
        ].slice(0, 12),
      };
    }
  }

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
    "Do not proactively suggest or invent prices, stock, or other financial values unless the owner explicitly asks for a recommendation.",
    "The user prefers direct help: when a safe content task is requested and autonomous mode executed it, state that it was completed rather than asking for permission again.",
    "When web search is available, use it when the request benefits from current external information, competitors, trends, product research, official documentation, pricing, or other up-to-date facts. Cite sources naturally in the response when the web tool provides them.",
    "The Critic result is authoritative about whether the requested task was verified. Do not claim a task is fully complete when the Critic status is blocked or needs_repair."
  ].join("\n");

  const responseUser = JSON.stringify({
    userInstruction: effectiveInstruction,
    autonomyMode,
    conversationHistory,
    conversationMemory: previousMemory,
    plan,
    execution: executionContext,
    currentAdminContext: postExecutionContext,
    urlExtractions,
    critic,
    liveVerification,
    deterministicVerification,
    screenScan,
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
        : isUrlReadRequest(effectiveInstruction) && urlExtractions.length
          ? buildDeterministicUrlReply(urlExtractions)
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
    lastCritic: critic,
    lastLiveVerification: liveVerification,
    lastExecution: execution,
    lastAssistantReply: finalReply,
  };

  await updateAIConversation(conversation.id, {
    title: conversation.title === "New chat" ? effectiveInstruction : conversation.title,
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
        critic: criticRoute,
      },
      critic,
      liveVerification,
      deterministicVerification,
      screenScan,
    });
  } catch (error) {
    console.error("[Master AI] Unhandled request failure:", error);
    return NextResponse.json(
      {
        error: "Master AI request failed.",
        detail: error instanceof Error ? error.message : "Unknown Master AI server error.",
      },
      { status: 500 },
    );
  }
}