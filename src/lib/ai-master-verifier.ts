import { db } from "@/db";
import { homepageSections, media, productImages, products } from "@/db/schema";
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
  execution: Array<{ index?: number; operation: string; executed: boolean; ok: boolean; data?: unknown; message: string; artifacts?: Array<Record<string, unknown>> }>,
): Promise<MasterDeterministicVerification> {
  const checks: MasterDeterministicVerification["checks"] = [];
  const productIds = new Set<number>();
  const sectionIds = new Set<number>();
  let reorderRequested = false;

  for (const item of execution) {
    if (!item.executed || !item.ok || !item.data || typeof item.data !== "object" || Array.isArray(item.data)) continue;
    const data = item.data as Record<string, unknown>;
    const productId = Number(data.productId ?? data.id);
    if (Number.isInteger(productId) && productId > 0) productIds.add(productId);
  }

  for (const action of plan.actions) {
    const payload = parsePayload(action.payload);
    const id = Number(payload.id ?? payload.productId);
    if (
      [
        "products.publish",
        "products.update_content",
        "products.update_financial",
        "products.create",
        "products.create_draft",
        "products.archive",
        "products.attach_media",
      ].includes(action.operation) &&
      Number.isInteger(id) &&
      id > 0
    ) {
      productIds.add(id);
    }
    if (action.operation === "homepage.update_section") {
      const sectionId = Number(payload.id);
      if (Number.isInteger(sectionId) && sectionId > 0) sectionIds.add(sectionId);
    }
    if (action.operation === "homepage.reorder") {
      reorderRequested = true;
    }
  }

  if (productIds.size) {
    const ids = [...productIds];
    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        status: products.status,
        active: products.active,
        price: products.price,
        stock: products.stock,
      })
      .from(products)
      .where(inArray(products.id, ids));

    const imageRows = await db
      .select({
        productId: productImages.productId,
        id: productImages.id,
        mediaId: productImages.mediaId,
      })
      .from(productImages)
      .where(inArray(productImages.productId, ids));

    for (const id of ids) {
      const product = rows.find((row) => row.id === id);
      if (!product) {
        checks.push({
          operation: "product.verify",
          ok: false,
          target: String(id),
          evidence: "Product record was not found after execution.",
        });
        continue;
      }

      const productExecutions = execution.filter((item) => {
        if (!item.executed || !item.ok) return false;
        const resultData =
          item.data && typeof item.data === "object" && !Array.isArray(item.data)
            ? (item.data as Record<string, unknown>)
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
        const createExecution = productExecutions.find(
          (item) => item.operation === "products.create" || item.operation === "products.create_draft",
        );
        const createAction = Number.isInteger(createExecution?.index)
          ? plan.actions[createExecution?.index as number]
          : undefined;
        const createPayload = parsePayload(createAction?.payload);
        const nestedProduct =
          createPayload.product && typeof createPayload.product === "object" && !Array.isArray(createPayload.product)
            ? (createPayload.product as Record<string, unknown>)
            : {};
        const requestedImages =
          (Array.isArray(createPayload.images) && createPayload.images.length > 0) ||
          (Array.isArray(nestedProduct.images) && nestedProduct.images.length > 0);
        checks.push({
          operation: "products.create.verify",
          ok: !requestedImages || hasImages,
          target: String(id),
          evidence: `product exists; status=${product.status}; images=${hasImages ? "present" : "none"}${
            requestedImages && !hasImages ? "; requested images are missing" : ""
          }`,
        });
      }

      if (executedOps.has("products.update_financial")) {
        const financialExecution = productExecutions.find((item) => item.operation === "products.update_financial");
        const financialAction = Number.isInteger(financialExecution?.index)
          ? plan.actions[financialExecution?.index as number]
          : undefined;
        const financialPayload = parsePayload(financialAction?.payload);
        const patch =
          financialPayload.patch && typeof financialPayload.patch === "object" && !Array.isArray(financialPayload.patch)
            ? (financialPayload.patch as Record<string, unknown>)
            : {};
        const resultData =
          financialExecution?.data && typeof financialExecution.data === "object" && !Array.isArray(financialExecution.data)
            ? (financialExecution.data as Record<string, unknown>)
            : {};
        let ok = true;
        const evidenceParts: string[] = [];
        if (patch.price !== undefined) {
          const expected = Number(resultData.price ?? patch.price);
          const matches = Number(product.price) === expected;
          ok = ok && matches;
          evidenceParts.push(`price db=${product.price} expected=${expected}`);
        }
        if (patch.stock !== undefined) {
          const expected = Number(resultData.stock ?? patch.stock);
          const matches = Number(product.stock) === expected;
          ok = ok && matches;
          evidenceParts.push(`stock db=${product.stock} expected=${expected}`);
        }
        if (!evidenceParts.length) {
          evidenceParts.push(`price=${product.price}; stock=${product.stock}`);
        }
        checks.push({
          operation: "products.update_financial.verify",
          ok,
          target: String(id),
          evidence: evidenceParts.join("; "),
        });
      }

      if (executedOps.has("products.attach_media")) {
        const attachExecution = productExecutions.find((item) => item.operation === "products.attach_media");
        const attachAction = Number.isInteger(attachExecution?.index)
          ? plan.actions[attachExecution?.index as number]
          : undefined;
        const attachPayload = parsePayload(attachAction?.payload);
        const resultData =
          attachExecution?.data && typeof attachExecution.data === "object" && !Array.isArray(attachExecution.data)
            ? (attachExecution.data as Record<string, unknown>)
            : {};
        const mediaId = Number(resultData.mediaId ?? attachPayload.mediaId);
        const linked =
          Number.isInteger(mediaId) && mediaId > 0
            ? imageRows.some((row) => row.productId === id && Number(row.mediaId) === mediaId)
            : imageRows.some((row) => row.productId === id);
        checks.push({
          operation: "products.attach_media.verify",
          ok: linked,
          target: String(id),
          evidence: linked
            ? `mediaId=${mediaId || "any"} linked on product`
            : `mediaId=${mediaId || "unknown"} not found on product images after execution`,
        });
      }

      if (executedOps.has("products.update_content")) {
        const contentExecution = productExecutions.find((item) => item.operation === "products.update_content");
        const contentAction = Number.isInteger(contentExecution?.index)
          ? plan.actions[contentExecution?.index as number]
          : undefined;
        const contentPayload = parsePayload(contentAction?.payload);
        const patch =
          contentPayload.patch && typeof contentPayload.patch === "object" && !Array.isArray(contentPayload.patch)
            ? (contentPayload.patch as Record<string, unknown>)
            : {};
        if (typeof patch.name === "string" && patch.name.trim()) {
          const ok = product.name === patch.name;
          checks.push({
            operation: "products.update_content.verify",
            ok,
            target: String(id),
            evidence: ok
              ? `name matches "${product.name}"`
              : `name mismatch db="${product.name}" expected="${patch.name}"`,
          });
        } else {
          checks.push({
            operation: "products.update_content.verify",
            ok: true,
            target: String(id),
            evidence: `product exists after content update; name=${product.name}`,
          });
        }
      }
    }
  }

  if (sectionIds.size) {
    const ids = [...sectionIds];
    const rows = await db
      .select({
        id: homepageSections.id,
        key: homepageSections.key,
        enabled: homepageSections.enabled,
        sortOrder: homepageSections.sortOrder,
        productMode: homepageSections.productMode,
        productIds: homepageSections.productIds,
        title: homepageSections.title,
      })
      .from(homepageSections)
      .where(inArray(homepageSections.id, ids))
      .orderBy(asc(homepageSections.sortOrder));

    for (const id of ids) {
      const row = rows.find((item) => item.id === id);
      const sectionExecution = execution.find((item) => {
        if (!item.executed || !item.ok || item.operation !== "homepage.update_section") return false;
        const resultData =
          item.data && typeof item.data === "object" && !Array.isArray(item.data)
            ? (item.data as Record<string, unknown>)
            : {};
        const resultId = Number(resultData.sectionId ?? resultData.id);
        if (Number.isInteger(resultId) && resultId === id) return true;
        const action = Number.isInteger(item.index) ? plan.actions[item.index as number] : undefined;
        return Number(parsePayload(action?.payload).id) === id;
      });
      const sectionAction = Number.isInteger(sectionExecution?.index)
        ? plan.actions[sectionExecution?.index as number]
        : undefined;
      const sectionPayload = parsePayload(sectionAction?.payload);
      const patch =
        sectionPayload.patch && typeof sectionPayload.patch === "object" && !Array.isArray(sectionPayload.patch)
          ? (sectionPayload.patch as Record<string, unknown>)
          : {};

      if (!row) {
        checks.push({
          operation: "homepage.update_section.verify",
          ok: false,
          target: String(id),
          evidence: "Homepage section was not found after execution.",
        });
        continue;
      }

      let ok = true;
      const evidenceParts = [
        `key=${row.key}`,
        `enabled=${String(row.enabled)}`,
        `productMode=${row.productMode}`,
        `productIds=${JSON.stringify(row.productIds ?? [])}`,
      ];
      if (typeof patch.title === "string" && patch.title.trim()) {
        const titleMatches = row.title === patch.title;
        ok = ok && titleMatches;
        evidenceParts.push(titleMatches ? `title matches` : `title mismatch db="${row.title}" expected="${patch.title}"`);
      }
      if (typeof patch.enabled === "boolean") {
        const enabledMatches = row.enabled === patch.enabled;
        ok = ok && enabledMatches;
        evidenceParts.push(`enabled expected=${String(patch.enabled)}`);
      }
      checks.push({
        operation: "homepage.update_section.verify",
        ok,
        target: String(id),
        evidence: evidenceParts.join("; "),
      });
    }
  }

  if (reorderRequested) {
    const reorderExecution = execution.find(
      (item) => item.executed && item.ok && item.operation === "homepage.reorder",
    );
    const reorderAction = Number.isInteger(reorderExecution?.index)
      ? plan.actions[reorderExecution?.index as number]
      : undefined;
    const reorderPayload = parsePayload(reorderAction?.payload);
    const order = Array.isArray(reorderPayload.order)
      ? reorderPayload.order.map((value) => Number(value)).filter((id) => Number.isInteger(id) && id > 0)
      : [];

    if (order.length) {
      const rows = await db
        .select({ id: homepageSections.id, sortOrder: homepageSections.sortOrder })
        .from(homepageSections)
        .where(inArray(homepageSections.id, order))
        .orderBy(asc(homepageSections.sortOrder));
      const byId = new Map(rows.map((row) => [row.id, row.sortOrder]));
      let ok = true;
      const mismatches: string[] = [];
      order.forEach((id, index) => {
        const actual = byId.get(id);
        if (actual === undefined || actual !== index) {
          ok = false;
          mismatches.push(`id=${id} expectedOrder=${index} actual=${String(actual)}`);
        }
      });
      checks.push({
        operation: "homepage.reorder.verify",
        ok,
        target: order.join(","),
        evidence: ok
          ? `sortOrder matches requested sequence of ${order.length} sections`
          : mismatches.slice(0, 5).join("; "),
      });
    } else {
      checks.push({
        operation: "homepage.reorder.verify",
        ok: false,
        evidence: "Reorder execution reported success but order payload was empty or invalid.",
      });
    }
  }

  // Re-read media rows produced by media.generate so success is never claimed from artifacts alone.
  const generateExecutions = execution.filter(
    (item) => item.executed && item.ok && item.operation === "media.generate",
  );
  for (const gen of generateExecutions) {
    const data =
      gen.data && typeof gen.data === "object" && !Array.isArray(gen.data)
        ? (gen.data as Record<string, unknown>)
        : {};
    const artifacts = Array.isArray(gen.artifacts) ? gen.artifacts : [];
    const mediaIds = new Set<number>();
    const rawId = Number(data.mediaId ?? data.id);
    if (Number.isInteger(rawId) && rawId > 0) mediaIds.add(rawId);
    for (const artifact of artifacts) {
      const mid = Number(artifact.mediaId ?? artifact.id);
      if (Number.isInteger(mid) && mid > 0) mediaIds.add(mid);
    }
    if (!mediaIds.size) {
      checks.push({
        operation: "media.generate.verify",
        ok: false,
        evidence: "media.generate reported success but no mediaId was present in data/artifacts.",
      });
      continue;
    }
    const ids = [...mediaIds];
    const rows = await db
      .select({ id: media.id, url: media.url, filename: media.filename })
      .from(media)
      .where(inArray(media.id, ids));
    const found = new Set(rows.map((r) => r.id));
    for (const id of ids) {
      const row = rows.find((r) => r.id === id);
      checks.push({
        operation: "media.generate.verify",
        ok: found.has(id),
        target: String(id),
        evidence: row
          ? `media id=${id} exists; url=${String(row.url ?? "").slice(0, 80)}; filename=${String(row.filename ?? "")}`
          : `media id=${id} not found in media table after generate`,
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
