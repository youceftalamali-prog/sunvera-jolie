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
import { isAdmin, isAdminRequest } from "@/lib/auth";
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

  // Phase 2: normalize common AI action shapes into the canonical executor payload.
  // Some providers return the record id beside the payload instead of inside it.
  if (payload.id === undefined && action.id !== undefined) payload.id = action.id;
  if (payload.sectionId === undefined && action.sectionId !== undefined) payload.sectionId = action.sectionId;

  if (operation === "homepage.update_section") {
    const sectionValue = payload.id ?? payload.sectionId ?? action.id ?? action.sectionId ?? action.section_id ?? action.section ?? action.sectionKey ??
      action.section_key ?? action.site_section ?? action.siteSection ?? payload.sectionKey;
    const sectionId = resolveHomepageSectionId(sectionValue, context);
    if (sectionId) payload.id = sectionId;
    if (!payload.patch || typeof payload.patch !== "object" || Array.isArray(payload.patch)) {
      const details = action.changes && typeof action.changes === "object" && !Array.isArray(action.changes)
        ? action.changes
        : action.details && typeof action.details === "object" && !Array.isArray(action.details) ? action.details : null;
      if (details) payload.patch = objectPayload(details);
    }
  }
  if (operation === "settings.update_theme") {
    const rawThemePatch =
      (payload.patch && typeof payload.patch === "object" && !Array.isArray(payload.patch) ? payload.patch : null) ??
      (payload.theme && typeof payload.theme === "object" && !Array.isArray(payload.theme) ? payload.theme : null) ??
      (payload.colors && typeof payload.colors === "object" && !Array.isArray(payload.colors) ? payload.colors : null) ??
      (action.patch && typeof action.patch === "object" && !Array.isArray(action.patch) ? action.patch : null) ??
      (action.theme && typeof action.theme === "object" && !Array.isArray(action.theme) ? action.theme : null) ??
      (action.colors && typeof action.colors === "object" && !Array.isArray(action.colors) ? action.colors : null);

    if (rawThemePatch) {
      const source = objectPayload(rawThemePatch);
      const nestedColors =
        source.colors && typeof source.colors === "object" && !Array.isArray(source.colors)
          ? objectPayload(source.colors)
          : {};
      const allowedThemeFields = new Set([
        "primary", "secondary", "accent", "background", "surface",
        "textColor", "mutedColor", "buttonBg", "buttonText", "borderColor",
        "headingFont", "bodyFont", "buttonFont",
      ]);
      const normalizedTheme: Record<string, unknown> = {};
      for (const [key, value] of Object.entries({ ...source, ...nestedColors })) {
        if (allowedThemeFields.has(key)) normalizedTheme[key] = value;
      }
      if (Object.keys(normalizedTheme).length) payload.patch = normalizedTheme;
    }
  }

  if (operation === "homepage.reorder") {
    const rawOrder = payload.order ?? payload.sectionOrder ?? action.order ?? action.sectionOrder ?? action.sections;
    if (Array.isArray(rawOrder)) {
      const resolved = rawOrder.map((item) => resolveHomepageSectionId(item, context));
      const allResolved = resolved.length === rawOrder.length && resolved.every((id): id is number => Boolean(id));
      if (allResolved) {
        const uniqueRequested = [...new Set(resolved as number[])];
        if (uniqueRequested.length === resolved.length && context?.sections?.length) {
          // Allow the owner to name only the sections that should move to the front.
          // Keep every other current section, once, in its existing relative order.
          const currentOrder = context.sections
            .map((section) => Number(section.id))
            .filter((id) => Number.isInteger(id) && id > 0);
          const remaining = currentOrder.filter((id) => !uniqueRequested.includes(id));
          payload.order = [...uniqueRequested, ...remaining];
        } else {
          payload.order = resolved as number[];
        }
      }
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




function isUrlReadRequest(instruction: string) {
  const text = String(instruction ?? "").trim();
  if (!text || !/https?:\/\/[^\s<>"']+/i.test(text)) return false;

  const mutationIntent = /(?:create|add|import|publish|update|edit|delete|remove|save|make|set|place|put|attach|assign|draft|generate|إنش(?:ئ|اء)|انش(?:ئ|اء)|اصنع|أضف|اضف|استورد|استيراد|انشر|نشر|حدّث|حدث|عدّل|عدل|احفظ|حفظ|احذف|حذف|ضع|اجعل|أنشئ)/i.test(text);
  if (mutationIntent) return false;

  const urlOnly = text.replace(/https?:\/\/[^\s<>"']+/gi, "").trim();
  if (!urlOnly) return true;

  return /(?:read|inspect|analy[sz]e|analysis|check|verify|extract|fetch|scan|show|view|look|information|details|قرأ|اقرأ|قراءة|حلل|حلّل|تحليل|افحص|فحص|تحقق|تحقّق|استخرج|استخراج|معلومات|تفاصيل|شوف|شاهد)/i.test(text);
}

function buildDeterministicUrlReadPlan(
  instruction: string,
  urlExtractions: UniversalUrlExtraction[],
): MasterPlan | null {
  if (!urlExtractions.length) return null;

  const successful = urlExtractions.filter((result) => result.extractionStatus !== "failed");

  return {
    summary:
      successful.length > 0
        ? "Read and analyze " + String(successful.length) + " supplied URL source" + (successful.length === 1 ? "" : "s") + " from deterministic extraction evidence."
        : "The supplied URL could not be extracted successfully; no CMS action was executed.",
    intent: String(instruction || "Read the supplied URL and report the extracted information."),
    actions: [],
  };
}

function buildDeterministicUrlReply(urlExtractions: UniversalUrlExtraction[]) {
  if (!urlExtractions.length) return "No URL extraction result is available.";

  return urlExtractions.map((result, index) => {
    const lines = [
      "URL " + String(index + 1) + ": " + (result.finalUrl || result.inputUrl || "unknown"),
      "Platform: " + (result.platform || "Unknown"),
      "Extraction: " + result.extractionStatus + " (confidence " + String(Math.round((Number(result.confidence) || 0) * 100)) + "%)",
      "Title: " + (result.title || "—"),
      "Brand: " + (result.brand || "—"),
      "Category: " + (result.category || "—"),
      "Price: " + String(result.price ?? "—") + (result.currency ? " " + result.currency : ""),
      "Compare-at price: " + String(result.compareAtPrice ?? "—") + (result.currency ? " " + result.currency : ""),
      "SKU: " + (result.sku || "—"),
      "Barcode: " + (result.barcode || "—"),
      "Size: " + (result.size || "—"),
      "Volume: " + (result.volume || "—"),
      "Availability: " + (result.availability || "—"),
      "Images: " + String(result.images?.length ?? 0),
      "Videos: " + String(result.videos?.length ?? 0),
      "Description: " + (result.description || result.shortDescription || "—"),
    ];
    if (result.warnings?.length) lines.push("Warnings: " + result.warnings.join(" | "));
    return lines.join("\n");
  }).join("\n\n");
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


function isHomepageDesignRequest(instruction: string) {
  const text = String(instruction ?? "").trim().toLowerCase();
  const homepage = /(?:homepage|home page|landing page|صفحة رئيسية|الصفحة الرئيسية|الرئيسية|واجهة الموقع|الواجهة)/i.test(text);
  const design = /(?:redesign|re[- ]?design|design|style|luxury|premium|elegant|layout|beauty|luxury beauty|تصميم|أعد التصميم|اعد التصميم|إعادة تصميم|اعادة تصميم|فخم|فاخرة|فاخر|أنيق|انيق|رقي|راقية|هوية|ألوان|الوان|خطوط|مظهر|واجهة)/i.test(text);
  return homepage && design;
}

function buildDeterministicHomepageDesignPlan(
  context: Awaited<ReturnType<typeof buildContext>>,
  instruction: string,
): MasterPlan {
  const luxuryTheme = {
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

  const sections = [...context.sections].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0));
  const actions: MasterAction[] = [
    {
      domain: "settings",
      operation: "settings.update_theme",
      summary: "Apply a premium luxury-beauty visual system for SunVera Jolie.",
      requiresConfirmation: false,
      payload: JSON.stringify({ patch: luxuryTheme }),
    },
  ];

  for (const section of sections) {
    const key = String(section.key ?? "").toLowerCase();
    const patch: Record<string, unknown> = {
      textColor: key.includes("hero") || key.includes("promo") ? "#1F2B34" : "#1F2B34",
      background: key.includes("hero")
        ? "#F8EFE7"
        : key.includes("trust")
          ? "#FFFDF9"
          : key.includes("categories") || key.includes("best_sellers")
            ? "#FFF9F4"
            : key.includes("testimonial")
              ? "#F8EFE7"
              : key.includes("newsletter")
                ? "#1F2B34"
                : "#FFFDF9",
      settings: {
        colors: {
          background: key.includes("newsletter") ? "#1F2B34" : "#FFFDF9",
          text: key.includes("newsletter") ? "#FFFDF9" : "#1F2B34",
          accent: "#B88945",
          surface: "#F8EFE7",
          muted: "#7B746D",
          border: "#E9DED3",
          buttonBackground: "#B88945",
          buttonText: "#FFFDF9",
        },
      },
    };

    if (key.includes("hero")) {
      patch.textPosition = "left";
      patch.overlayOpacity = 10;
    }
    if (key.includes("promo") || key.includes("banner")) {
      patch.textPosition = "center";
      patch.overlayOpacity = 8;
    }

    actions.push({
      domain: "homepage",
      operation: "homepage.update_section",
      summary: "Refine the existing " + (section.title || section.key || "homepage") + " section to match the luxury SunVera Jolie design direction.",
      requiresConfirmation: false,
      payload: JSON.stringify({ id: Number(section.id), patch }),
    });
  }

  return {
    summary: "Applied a safe luxury redesign baseline to the existing SunVera Jolie homepage structure.",
    intent: String(instruction || "Redesign the homepage in a luxury, elegant SunVera Jolie style."),
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

import { runMasterAI } from "@/lib/master-ai-runner";

export async function POST(req: Request) {
  return runMasterAI(req);
}
