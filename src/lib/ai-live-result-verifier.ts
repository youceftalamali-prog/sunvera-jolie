import type { MasterExecutionPlan } from "@/lib/ai-master-tools";

export type LiveResultVerification = {
  checked: boolean;
  status: "pass" | "needs_repair" | "blocked";
  url: string;
  httpStatus: number | null;
  observedSectionOrder: string[];
  expectedSectionOrder: string[];
  missingSections: string[];
  unexpectedSections: string[];
  contentMismatches: Array<{
    sectionKey: string;
    field: string;
    expected: string;
    observed: boolean;
  }>;
  summary: string;
  issues: string[];
};

const PUBLIC_HOMEPAGE_KEYS = [
  "hero",
  "trust_badges",
  "categories",
  "best_sellers",
  "promo_banner",
  "testimonials",
  "newsletter",
];

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractSectionBlocks(html: string) {
  const blocks: Array<{ key: string; html: string }> = [];
  const pattern = /<div[^>]*data-master-control=["']true["'][^>]*data-section-key=["']([^"']+)["'][^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*data-master-control=["']true|$)/gi;
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(html))) {
    blocks.push({ key: match[1], html: match[2] });
  }
  return blocks;
}

function parseSectionOrder(html: string) {
  const keys: string[] = [];
  const pattern = /data-master-control=["']true["'][^>]*data-section-key=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(html))) keys.push(match[1]);
  return keys;
}

function planHomepageExpectations(
  plan: MasterExecutionPlan,
  sections: Array<{ id: number; key: string }>,
) {
  const expectations: Array<{ sectionKey: string; field: string; value: string }> = [];

  for (const action of plan.actions) {
    if (action.operation !== "homepage.update_section") continue;
    try {
      const payload = JSON.parse(action.payload || "{}") as {
        id?: unknown;
        patch?: Record<string, unknown>;
      };
      const id = Number(payload.id);
      const sectionKey = sections.find((section) => section.id === id)?.key;
      if (!sectionKey) continue;
      const patch = payload.patch && typeof payload.patch === "object" ? payload.patch : {};
      for (const field of ["title", "subtitle", "buttonText", "buttonUrl", "imageUrl", "imageMobileUrl", "imageTabletUrl"]) {
        const value = patch[field];
        if (typeof value === "string" && value.trim()) {
          expectations.push({
            sectionKey,
            field,
            value: value.trim(),
          });
        }
      }
    } catch {
      // Plan validation handles malformed payloads earlier.
    }
  }

  return expectations;
}

export async function verifyLiveHomepageResult(
  baseUrl: string,
  plan: MasterExecutionPlan,
  enabledSections: Array<{ id: number; key: string }>,
): Promise<LiveResultVerification> {
  const root = String(baseUrl || "").replace(/\/$/, "");
  const url = root + "/";
  const expectedSectionOrder = enabledSections
    .map((section) => section.key)
    .filter((key) => PUBLIC_HOMEPAGE_KEYS.includes(key));
  const result: LiveResultVerification = {
    checked: false,
    status: "blocked",
    url,
    httpStatus: null,
    observedSectionOrder: [],
    expectedSectionOrder,
    missingSections: [],
    unexpectedSections: [],
    contentMismatches: [],
    summary: "Live homepage verification was not completed.",
    issues: [],
  };

  if (!root) {
    result.issues.push("No live homepage base URL is available.");
    result.summary = "Live verification is blocked because the site URL is unavailable.";
    return result;
  }

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(15_000),
    });

    result.httpStatus = response.status;
    if (!response.ok) {
      result.issues.push("Homepage returned HTTP " + response.status + ".");
      result.summary = "Live homepage verification failed because the homepage is not reachable successfully.";
      return result;
    }

    const html = await response.text();
    result.checked = true;
    result.observedSectionOrder = parseSectionOrder(html);
    result.missingSections = expectedSectionOrder.filter((key) => !result.observedSectionOrder.includes(key));
    result.unexpectedSections = result.observedSectionOrder.filter((key) => !expectedSectionOrder.includes(key));

    if (result.missingSections.length) {
      result.issues.push("Expected homepage sections are missing from the live HTML: " + result.missingSections.join(", "));
    }

    if (result.unexpectedSections.length) {
      result.issues.push("Unexpected homepage sections are present in the live HTML: " + result.unexpectedSections.join(", "));
    }

    const filteredObserved = result.observedSectionOrder.filter((key) => expectedSectionOrder.includes(key));
    if (JSON.stringify(filteredObserved) !== JSON.stringify(expectedSectionOrder)) {
      result.issues.push(
        "Live homepage section order differs from the CMS-backed public section order. Expected " +
          expectedSectionOrder.join(" → ") +
          " but observed " +
          filteredObserved.join(" → ") +
          ".",
      );
    }

    const blocks = extractSectionBlocks(html);
    const expectations = planHomepageExpectations(plan, enabledSections);
    for (const expectation of expectations) {
      const matchingBlocks = blocks.filter((block) => block.key === expectation.sectionKey);
      if (!matchingBlocks.length) {
        result.contentMismatches.push({
          sectionKey: expectation.sectionKey,
          field: expectation.field,
          expected: expectation.value,
          observed: false,
        });
        continue;
      }

      const observed = matchingBlocks.some((block) =>
        normalizeText(block.html).includes(normalizeText(expectation.value)),
      );

      if (!observed) {
        result.contentMismatches.push({
          sectionKey: expectation.sectionKey,
          field: expectation.field,
          expected: expectation.value,
          observed: false,
        });
      }
    }

    if (result.contentMismatches.length) {
      result.issues.push(
        "One or more homepage changes were saved but could not be found in the live HTML response.",
      );
    }

    if (result.issues.length) {
      result.status = "needs_repair";
      result.summary = "Live homepage verification found differences between the requested CMS result and the served page.";
    } else {
      result.status = "pass";
      result.summary = "Live homepage verification passed: the page is reachable and the expected CMS-backed sections are present in the expected order.";
    }

    return result;
  } catch (error) {
    result.issues.push(error instanceof Error ? error.message : "Unknown live verification error.");
    result.summary = "Live homepage verification was blocked by a fetch or network error.";
    return result;
  }
}
