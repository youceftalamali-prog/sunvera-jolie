import { db } from "@/db";
import { homepageSections, productImages, products } from "@/db/schema";
import { MASTER_PRODUCT_CONTENT_FIELDS } from "@/lib/ai-master-tools";
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

  for (const [actionIndex, action] of plan.actions.entries()) {
    const payload = parsePayload(action.payload);
    const id = Number(payload.id ?? payload.productId);
    if (["products.publish", "products.update_content", "products.update_financial", "products.create", "products.create_draft", "products.archive"].includes(action.operation) && Number.isInteger(id) && id > 0) {
      productIds.add(id);
    }

    if (action.operation === "products.update_content") {
      const executionItem = execution.find((item) => Number((item as { index?: number }).index) === actionIndex);
      const patch = payload.patch;
      const data =
        executionItem?.data && typeof executionItem.data === "object" && !Array.isArray(executionItem.data)
          ? executionItem.data as Record<string, unknown>
          : null;
      const before =
        data?.before && typeof data.before === "object" && !Array.isArray(data.before)
          ? data.before as Record<string, unknown>
          : null;
      const after =
        data?.after && typeof data.after === "object" && !Array.isArray(data.after)
          ? data.after as Record<string, unknown>
          : null;

      if (!executionItem?.executed || !executionItem.ok) {
        checks.push({
          operation: "products.update_content.verify",
          ok: false,
          target: String(id),
          evidence: "Product content update was not successfully executed.",
        });
      } else if (!before || !after || !patch || typeof patch !== "object" || Array.isArray(patch)) {
        checks.push({
          operation: "products.update_content.verify",
          ok: false,
          target: String(id),
          evidence: "Before/after evidence or the requested patch was missing from the execution receipt.",
        });
      } else {
        const patchRecord = patch as Record<string, unknown>;
        const allowed = new Set<string>(MASTER_PRODUCT_CONTENT_FIELDS);
        const unsupported = Object.keys(patchRecord).filter((key) => !allowed.has(key));
        const changedUnexpectedly: string[] = [];
        const requestedMismatches: string[] = [];

        const verificationFields = [
          "id","name","slug","sku","barcode","brand","categorySlug","subcategorySlug",
          "shortDescription","description","benefits","ingredients","howToUse","warnings",
          "size","volume","skinType","hairType","productType","routineStep","tags",
          "price","comparePrice","costPrice","currency","stock","lowStockThreshold",
          "trackInventory","allowBackorders","rating","reviewsCount","tone","emoji",
          "bestSeller","newArrival","featured","status","active",
          "seoTitle","seoDescription","seoKeywords","canonicalUrl",
        ];

        const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

        for (const field of Object.keys(patchRecord)) {
          if (!allowed.has(field)) continue;
          if (!same(after[field], patchRecord[field])) requestedMismatches.push(field);
        }

        for (const field of verificationFields) {
          if (Object.prototype.hasOwnProperty.call(patchRecord, field)) continue;
          if (!same(before[field], after[field])) changedUnexpectedly.push(field);
        }

        const ok =
          unsupported.length === 0 &&
          requestedMismatches.length === 0 &&
          changedUnexpectedly.length === 0;

        checks.push({
          operation: "products.update_content.verify",
          ok,
          target: String(id),
          evidence: ok
            ? "requested fields verified; unrelated product fields unchanged"
            : [
                unsupported.length ? "unsupported=" + unsupported.join(",") : "",
                requestedMismatches.length ? "requested_mismatch=" + requestedMismatches.join(",") : "",
                changedUnexpectedly.length ? "unexpected_change=" + changedUnexpectedly.join(",") : "",
              ].filter(Boolean).join("; "),
        });
      }
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
      const executedOps = execution.filter((item) => item.executed && item.ok).map((item) => item.operation);
      if (executedOps.includes("products.publish")) {
        const ok = product.status === "published" && product.active === true;
        checks.push({
          operation: "products.publish.verify",
          ok,
          target: String(id),
          evidence: `status=${product.status}; active=${String(product.active)}`,
        });
      }
      if (executedOps.includes("products.create") || executedOps.includes("products.create_draft")) {
        const hasImages = imageRows.some((row) => row.productId === id);
        checks.push({
          operation: "products.create.verify",
          ok: true,
          target: String(id),
          evidence: `product exists; status=${product.status}; images=${hasImages ? "present" : "none"}`,
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
