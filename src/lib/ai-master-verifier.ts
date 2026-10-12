import { db } from "@/db";
import { homepageSections, productImages, products } from "@/db/schema";
import { asc, eq, inArray } from "drizzle-orm";

export type MasterDeterministicVerification = {
  checked: boolean;
  status: "pass" | "needs_repair" | "blocked";
  summary: string;
  checks: Array<{
    operation: string;
    ok: boolean;
    target?: string;
    evidence: string;
  }>;
};

function parsePayload(raw?: string) {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function verifyMasterExecution(
  plan: { actions: Array<{ operation: string; payload?: string }> },
  execution: Array<{ index?: number; operation: string; executed: boolean; ok: boolean; data?: unknown; message: string }>,
): Promise<MasterDeterministicVerification> {
  const checks: MasterDeterministicVerification["checks"] = [];
  const productIds = new Set<number>();
  const sectionIds = new Set<number>();

  for (const item of execution) {
    if (!item.executed || !item.ok || !item.data || typeof item.data !== "object" || Array.isArray(item.data)) continue;
    const productId = Number((item.data as Record<string, unknown>).productId);
    if (Number.isInteger(productId) && productId > 0) productIds.add(productId);
  }

  for (const action of plan.actions) {
    const payload = parsePayload(action.payload);
    const id = Number(payload.id ?? payload.productId);
    if (["products.publish", "products.update_content", "products.update_financial", "products.create", "products.create_draft", "products.archive"].includes(action.operation) && Number.isInteger(id) && id > 0) {
      productIds.add(id);
    }
    if (action.operation === "homepage.update_section") {
      const sectionId = Number(payload.id);
      if (Number.isInteger(sectionId) && sectionId > 0) sectionIds.add(sectionId);
    }
  }

  if (productIds.size) {
    const ids = [...productIds];
    const rows = await db.select({
      id: products.id,
      name: products.name,
      status: products.status,
      active: products.active,
    }).from(products).where(inArray(products.id, ids));

    const imageRows = await db.select({
      productId: productImages.productId,
      id: productImages.id,
    }).from(productImages).where(inArray(productImages.productId, ids));

    for (const id of ids) {
      const product = rows.find((row) => row.id === id);
      if (!product) {
        checks.push({ operation: "product.verify", ok: false, target: String(id), evidence: "Product record was not found after execution." });
        continue;
      }
      // Match each successful execution to its own plan action/product. A publish action
      // for one product must not make every product in the same batch look published.
      const productExecutions = execution.filter((item) => {
        if (!item.executed || !item.ok) return false;
        const resultData = item.data && typeof item.data === "object" && !Array.isArray(item.data)
          ? item.data as Record<string, unknown>
          : {};
        const resultId = Number(resultData.productId ?? resultData.id);
        if (Number.isInteger(resultId) && resultId > 0 && resultId === id) return true;
        const action = Number.isInteger(item.index) ? plan.actions[item.index as number] : undefined;
        const payload = parsePayload(action?.payload);
        return Number(payload.id ?? payload.productId) === id;
      });
      const executedOps = new Set(productExecutions.map((item) => item.operation));
      if (executedOps.has("products.publish")) {
        const ok = product.status === "published" && product.active === true;
        checks.push({
          operation: "products.publish.verify",
          ok,
          target: String(id),
          evidence: `status=${product.status}; active=${String(product.active)}`,
        });
      }
      if (executedOps.has("products.create") || executedOps.has("products.create_draft")) {
        const hasImages = imageRows.some((row) => row.productId === id);
        const createExecution = productExecutions.find((item) =>
          item.operation === "products.create" || item.operation === "products.create_draft",
        );
        const createAction = Number.isInteger(createExecution?.index)
          ? plan.actions[createExecution?.index as number]
          : undefined;
        const createPayload = parsePayload(createAction?.payload);
        const nestedProduct = createPayload.product && typeof createPayload.product === "object" && !Array.isArray(createPayload.product)
          ? createPayload.product as Record<string, unknown>
          : {};
        const requestedImages = (Array.isArray(createPayload.images) && createPayload.images.length > 0) ||
          (Array.isArray(nestedProduct.images) && nestedProduct.images.length > 0);
        checks.push({
          operation: "products.create.verify",
          ok: !requestedImages || hasImages,
          target: String(id),
          evidence: `product exists; status=${product.status}; images=${hasImages ? "present" : "none"}${requestedImages && !hasImages ? "; requested images are missing" : ""}`,
        });
      }
    }
  }

  if (sectionIds.size) {
    const ids = [...sectionIds];
    const rows = await db.select({
      id: homepageSections.id,
      key: homepageSections.key,
      enabled: homepageSections.enabled,
      sortOrder: homepageSections.sortOrder,
      productMode: homepageSections.productMode,
      productIds: homepageSections.productIds,
    }).from(homepageSections).where(inArray(homepageSections.id, ids)).orderBy(asc(homepageSections.sortOrder));

    for (const id of ids) {
      const row = rows.find((item) => item.id === id);
      checks.push({
        operation: "homepage.update_section.verify",
        ok: Boolean(row),
        target: String(id),
        evidence: row
          ? `key=${row.key}; enabled=${String(row.enabled)}; productMode=${row.productMode}; productIds=${JSON.stringify(row.productIds ?? [])}`
          : "Homepage section was not found after execution.",
      });
    }
  }

  const failed = checks.filter((check) => !check.ok);
  return {
    checked: true,
    status: failed.length ? "needs_repair" : "pass",
    summary: failed.length
      ? `Deterministic verification found ${failed.length} failed check(s).`
      : checks.length
        ? `Deterministic verification passed ${checks.length} check(s) against the database.`
        : "No deterministic post-execution checks were applicable.",
    checks,
  };
}
