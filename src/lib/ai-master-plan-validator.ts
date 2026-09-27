import { normalizeMasterAction, type MasterExecutionPlan } from "@/lib/ai-master-tools";

type ValidationContext = {
  sections: Array<{ id?: number; key?: string; enabled?: boolean; sortOrder?: number }>;
  categories?: Array<{ id?: number; slug?: string }>;
  recentProducts?: Array<{ id?: number; categorySlug?: string }>;
  recentMedia?: Array<{ id?: number }>;
  uploadedImages?: Array<{ mediaId?: number }>;
  productIds?: number[];
  categorySlugs?: string[];
  mediaIds?: number[];
  sectionIds?: number[];
  externalImageUrls?: string[];
};

export type MasterPlanValidationIssue = {
  index: number;
  operation: string;
  field: string;
  message: string;
};

const KNOWN_OPERATIONS = new Set([
  "products.update_content",
  "products.attach_media",
  "products.duplicate",
  "products.create_draft",
  "products.create",
  "products.update_financial",
  "products.publish",
  "products.archive",
  "products.delete_permanently",
  "media.generate",
  "media.edit",
  "media.delete",
  "homepage.update_section",
  "homepage.reorder",
  "categories.create",
  "categories.update",
  "categories.archive",
  "settings.update",
  "settings.update_theme",
  "settings.update_protected",
  "cms.banner_save",
  "cms.banner_delete",
  "cms.badge_save",
  "cms.badge_delete",
  "cms.nav_save",
  "cms.nav_delete",
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
  "orders.update_status",
  "shipping.update_rate",
]);

const HOMEPAGE_PATCH_FIELDS = new Set([
  "title",
  "subtitle",
  "body",
  "imageUrl",
  "imageMobileUrl",
  "imageTabletUrl",
  "buttonText",
  "buttonUrl",
  "button2Text",
  "button2Url",
  "background",
  "textColor",
  "textPosition",
  "overlayOpacity",
  "productMode",
  "productCount",
  "productIds",
  "items",
  "settings",
  "enabled",
]);

function parsePayload(raw: string | undefined) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return null;
  }
}

function asPositiveInt(value: unknown) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function existingIds(context: ValidationContext, key: "section" | "product" | "media") {
  if (key === "section") {
    return new Set((context.sectionIds ?? context.sections?.map((row) => Number(row.id)).filter(Number.isInteger) ?? []));
  }
  if (key === "product") {
    return new Set(
      (context.productIds ?? context.recentProducts?.map((row) => Number(row.id)).filter(Number.isInteger) ?? []),
    );
  }
  return new Set(
    (context.mediaIds ?? [
      ...(context.recentMedia ?? []).map((row) => Number(row.id)),
      ...(context.uploadedImages ?? []).map((row) => Number(row.mediaId)),
    ]).filter(Number.isInteger),
  );
}

export function validateMasterPlan(plan: MasterExecutionPlan, context: ValidationContext) {
  const issues: MasterPlanValidationIssue[] = [];
  const sectionIds = existingIds(context, "section");
  const productIds = existingIds(context, "product");
  const mediaIds = existingIds(context, "media");
  const categorySlugs = new Set(
    context.categorySlugs ??
      context.categories?.map((row) => String(row.slug ?? "")).filter(Boolean) ??
      [],
  );

  plan.actions.forEach((rawAction, index) => {
    const action = normalizeMasterAction(rawAction);
    if (!KNOWN_OPERATIONS.has(action.operation)) {
      issues.push({
        index,
        operation: action.operation,
        field: "operation",
        message: "Operation is not supported by the Master AI execution layer.",
      });
      return;
    }

    const payload = parsePayload(action.payload);
    if (!payload) {
      issues.push({
        index,
        operation: action.operation,
        field: "payload",
        message: "Payload is not valid JSON.",
      });
      return;
    }

    if (action.operation === "homepage.update_section") {
      const id = asPositiveInt(payload.id);
      if (!id || !sectionIds.has(id)) {
        issues.push({
          index,
          operation: action.operation,
          field: "id",
          message: "Homepage section id does not exist in the current CMS context.",
        });
      }
      const patch = payload.patch;
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        issues.push({
          index,
          operation: action.operation,
          field: "patch",
          message: "Homepage section patch must be an object.",
        });
      } else {
        for (const key of Object.keys(patch as Record<string, unknown>)) {
          if (!HOMEPAGE_PATCH_FIELDS.has(key)) {
            issues.push({
              index,
              operation: action.operation,
              field: "patch." + key,
              message: "Homepage section field is not supported by the CMS executor.",
            });
          }
        }
      }
    }

    if (action.operation === "homepage.reorder") {
      const order = Array.isArray(payload.order) ? payload.order.map(asPositiveInt) : null;
      if (!order || order.some((id) => !id)) {
        issues.push({
          index,
          operation: action.operation,
          field: "order",
          message: "Homepage reorder requires a non-empty array of positive section ids.",
        });
      } else {
        const numericOrder = order as number[];
        const unique = new Set(numericOrder);
        if (unique.size !== numericOrder.length) {
          issues.push({
            index,
            operation: action.operation,
            field: "order",
            message: "Homepage reorder contains duplicate section ids.",
          });
        }
        if (numericOrder.some((id) => !sectionIds.has(id))) {
          issues.push({
            index,
            operation: action.operation,
            field: "order",
            message: "Homepage reorder contains a section id missing from the current CMS context.",
          });
        }
        if (sectionIds.size && numericOrder.length !== sectionIds.size) {
          issues.push({
            index,
            operation: action.operation,
            field: "order",
            message: "Homepage reorder must contain every current homepage section id exactly once.",
          });
        }
      }
    }

    const idOperations = new Set([
      "products.update_content",
      "products.update_financial",
      "products.publish",
      "products.archive",
      "products.delete_permanently",
      "products.duplicate",
      "products.get",
      "media.edit",
      "media.delete",
    ]);
    if (idOperations.has(action.operation)) {
      const id = asPositiveInt(payload.id);
      const validSet = action.operation.startsWith("media.") ? mediaIds : productIds;
      if (!id || !validSet.has(id)) {
        issues.push({
          index,
          operation: action.operation,
          field: "id",
          message: "Referenced record id does not exist in the current admin context.",
        });
      }
    }

    if (action.operation === "products.create_draft") {
      const product =
        payload.product && typeof payload.product === "object" && !Array.isArray(payload.product)
          ? (payload.product as Record<string, unknown>)
          : null;
      if (!product) {
        issues.push({
          index,
          operation: action.operation,
          field: "product",
          message: "products.create_draft requires a product object.",
        });
      } else {
        const categorySlug = String(product.categorySlug ?? "").trim();
        if (!categorySlug || !categorySlugs.has(categorySlug)) {
          issues.push({
            index,
            operation: action.operation,
            field: "product.categorySlug",
            message: "products.create_draft requires an existing categorySlug.",
          });
        }
      }

      if (payload.images !== undefined) {
        if (!Array.isArray(payload.images)) {
          issues.push({
            index,
            operation: action.operation,
            field: "images",
            message: "Product images must be an array.",
          });
        } else {
          for (const [imageIndex, image] of payload.images.entries()) {
            const imageRecord =
              image && typeof image === "object" && !Array.isArray(image)
                ? (image as Record<string, unknown>)
                : {};
            const mediaId = asPositiveInt(imageRecord.mediaId);
            const imageUrl = String(imageRecord.url ?? "").trim();
            const allowedExternalImageUrls = new Set(context.externalImageUrls ?? []);
            const isApprovedExternalImage =
              /^https?:\\/\\/[^\\s]+$/i.test(imageUrl) && allowedExternalImageUrls.has(imageUrl);
            if ((!mediaId || !mediaIds.has(mediaId)) && !isApprovedExternalImage) {
              issues.push({
                index,
                operation: action.operation,
                field: "images[" + imageIndex + "].mediaId",
                message: "Each product image must reference existing media or an image URL extracted from the supplied URL.",
              });
            }
          }
        }
      }
    }
  });

  return { valid: issues.length === 0, issues };
}
