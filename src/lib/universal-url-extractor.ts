import dns from "node:dns/promises";
import net from "node:net";

export type ExtractedUrlImage = {
  url: string;
  alt: string;
  width: number;
  height: number;
  source: "jsonld" | "og" | "html" | "link";
};

export type ExtractedUrlVideo = {
  url: string;
  title: string;
  source: "jsonld" | "og" | "html";
};

export type UniversalUrlExtraction = {
  inputUrl: string;
  finalUrl: string;
  sourceDomain: string;
  platform: string;
  extractionStatus: "full" | "partial" | "failed";
  confidence: number;
  isProductLike: boolean;
  title: string;
  description: string;
  shortDescription: string;
  brand: string;
  category: string;
  sku: string;
  barcode: string;
  price: number | null;
  compareAtPrice: number | null;
  currency: string;
  availability: string;
  rating: number | null;
  reviewCount: number | null;
  size: string;
  volume: string;
  variants: Array<Record<string, unknown>>;
  attributes: Record<string, string>;
  images: ExtractedUrlImage[];
  videos: ExtractedUrlVideo[];
  canonicalUrl: string;
  textExcerpt: string;
  metadata: Record<string, string>;
  structuredProductData: Array<Record<string, unknown>>;
  warnings: string[];
};

const MAX_HTML_BYTES = 3_000_000;
const MAX_IMAGES = 40;
const MAX_VIDEOS = 12;
const MAX_METADATA = 80;
const MAX_REDIRECTS = 5;

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      const code = parseInt(n, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    });
}

function cleanText(value: unknown, max = 12000) {
  return decodeEntities(String(value ?? ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizeUrl(value: string, baseUrl: string) {
  const raw = decodeEntities(String(value ?? "").trim());
  if (!raw || raw.startsWith("data:") || raw.startsWith("javascript:") || raw.startsWith("#")) return "";
  try {
    const url = new URL(raw, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function attr(tag: string, name: string) {
  const pattern = new RegExp(
    "\\b" + name.replace(/[.*+?^()|[\]\\]/g, "\\$&") + "\\s*=\\s*[\\\"']([^\\\"']+)[\\\"']",
    "i",
  );
  return decodeEntities(pattern.exec(tag)?.[1] ?? "");
}

function metaTags(html: string) {
  const out: Record<string, string> = {};
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = attr(tag, "property") || attr(tag, "name") || attr(tag, "itemprop");
    const value = attr(tag, "content");
    if (key && value && Object.keys(out).length < MAX_METADATA) out[key.toLowerCase()] = cleanText(value, 1000);
  }
  return out;
}

function collectJsonLd(html: string) {
  const rows: unknown[] = [];
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      rows.push(JSON.parse(raw));
    } catch {
      try {
        rows.push(JSON.parse(raw.replace(/<!--[\s\S]*?-->/g, "").trim()));
      } catch {
        // Ignore malformed structured data.
      }
    }
  }
  return rows;
}

function flattenStructured(value: unknown): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    result.push(record);
    if (Array.isArray(record["@graph"])) record["@graph"].forEach(visit);
  };
  visit(value);
  return result;
}

function isType(record: Record<string, unknown>, type: string) {
  const raw = record["@type"];
  if (Array.isArray(raw)) return raw.some((item) => String(item).toLowerCase() === type.toLowerCase());
  return String(raw ?? "").toLowerCase() === type.toLowerCase();
}

function pickProductJsonLd(rows: unknown[]) {
  for (const row of rows) {
    for (const record of flattenStructured(row)) {
      if (isType(record, "Product") || isType(record, "ProductGroup")) return record;
    }
  }
  return null;
}

function asString(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const name = (value as Record<string, unknown>).name;
    if (typeof name === "string") return name.trim();
  }
  return "";
}

function toNumber(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/[^0-9.,-]/g, "").replace(/,(?=\d{3}\b)/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function detectPlatform(url: URL, html: string) {
  const haystack = html.slice(0, 500_000).toLowerCase();
  const host = url.hostname.toLowerCase();
  if (host.includes("myshopify.com") || haystack.includes("shopify.theme") || haystack.includes("/cdn/shop/")) return "Shopify";
  if (haystack.includes("woocommerce") || haystack.includes("/wp-content/plugins/woocommerce/")) return "WooCommerce";
  if (haystack.includes("prestashop") || haystack.includes("prestashop_js")) return "PrestaShop";
  if (haystack.includes("bigcommerce") || haystack.includes("cdn11.bigcommerce.com")) return "BigCommerce";
  if (haystack.includes("magento") || haystack.includes("mage/cookies")) return "Magento";
  if (/(^|[.])amazon\./i.test(host)) return "Amazon";
  if (host.includes("ebay.")) return "eBay";
  if (host.includes("aliexpress.")) return "AliExpress";
  if (host.includes("alibaba.")) return "Alibaba";
  return "Unknown";
}

function addImage(map: Map<string, ExtractedUrlImage>, image: ExtractedUrlImage) {
  if (!image.url || map.has(image.url) || map.size >= MAX_IMAGES) return;
  try {
    const u = new URL(image.url);
    if (/^(data:|javascript:)/i.test(image.url)) return;
    if (u.hostname === "www.google-analytics.com") return;
    if (/\.svg(?:[?#]|$)/i.test(u.pathname)) return;
  } catch {
    return;
  }
  map.set(image.url, image);
}

function parseSrcset(value: string, baseUrl: string, map: Map<string, ExtractedUrlImage>, alt: string) {
  for (const part of value.split(",")) {
    const token = part.trim().split(/\s+/)[0];
    const url = normalizeUrl(token, baseUrl);
    if (url) addImage(map, { url, alt, width: 0, height: 0, source: "html" });
    if (map.size >= MAX_IMAGES) break;
  }
}

function extractImages(html: string, pageUrl: string, meta: Record<string, string>, product: Record<string, unknown> | null) {
  const map = new Map<string, ExtractedUrlImage>();
  const structuredImages = product?.image;
  const structured = Array.isArray(structuredImages) ? structuredImages : structuredImages ? [structuredImages] : [];
  for (const item of structured) {
    const url = normalizeUrl(asString(item), pageUrl);
    if (url) addImage(map, { url, alt: cleanText(product?.name, 300), width: 0, height: 0, source: "jsonld" });
  }

  for (const key of ["og:image", "og:image:url", "twitter:image", "twitter:image:src"]) {
    const url = normalizeUrl(meta[key] || "", pageUrl);
    if (url) addImage(map, { url, alt: cleanText(product?.name, 300), width: 0, height: 0, source: "og" });
  }

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = attr(tag, "rel").toLowerCase();
    const url = normalizeUrl(attr(tag, "href"), pageUrl);
    if (url && /image_src|preload/i.test(rel)) addImage(map, { url, alt: "", width: 0, height: 0, source: "link" });
  }

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const alt = cleanText(attr(tag, "alt"), 300);
    const width = toNumber(attr(tag, "width")) ?? 0;
    const height = toNumber(attr(tag, "height")) ?? 0;
    for (const candidate of [
      attr(tag, "src"),
      attr(tag, "data-src"),
      attr(tag, "data-original"),
      attr(tag, "data-lazy-src"),
    ]) {
      const url = normalizeUrl(candidate, pageUrl);
      if (url) addImage(map, { url, alt, width, height, source: "html" });
    }
    parseSrcset(attr(tag, "srcset") || attr(tag, "data-srcset"), pageUrl, map, alt);
    if (map.size >= MAX_IMAGES) break;
  }

  return [...map.values()];
}

function extractVideos(html: string, pageUrl: string, meta: Record<string, string>, product: Record<string, unknown> | null) {
  const out = new Map<string, ExtractedUrlVideo>();
  const add = (value: unknown, source: ExtractedUrlVideo["source"], title = "") => {
    const url = normalizeUrl(asString(value), pageUrl);
    if (!url || out.has(url) || out.size >= MAX_VIDEOS) return;
    out.set(url, { url, title: cleanText(title, 300), source });
  };

  add(meta["og:video"], "og");
  add(meta["og:video:url"], "og");
  const structuredVideos = product?.video;
  if (Array.isArray(structuredVideos)) structuredVideos.forEach((item) => add(item, "jsonld", asString(product?.name)));
  else if (structuredVideos) add(structuredVideos, "jsonld", asString(product?.name));

  for (const match of html.matchAll(/<(?:video|source)\b[^>]*>/gi)) {
    add(attr(match[0], "src"), "html");
  }
  return [...out.values()];
}

function extractProductFields(product: Record<string, unknown> | null, meta: Record<string, string>, title: string) {
  const offersRaw = product?.offers;
  const offers = Array.isArray(offersRaw) ? offersRaw : offersRaw ? [offersRaw] : [];
  const offer = offers.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
  const aggregateRating = product?.aggregateRating && typeof product.aggregateRating === "object"
    ? product.aggregateRating as Record<string, unknown>
    : null;

  return {
    title: asString(product?.name) || meta["og:title"] || title,
    description: cleanText(product?.description) || meta["og:description"] || meta.description || "",
    shortDescription: "",
    brand: asString(product?.brand) || meta["product:brand"] || "",
    category: asString(product?.category) || meta["product:category"] || "",
    sku: asString(product?.sku) || meta["product:retailer_item_id"] || "",
    barcode: asString(product?.gtin13) || asString(product?.gtin14) || asString(product?.gtin) || "",
    price: toNumber(offer?.price) ?? toNumber(meta["product:price:amount"] ?? meta["og:price:amount"]),
    compareAtPrice: null as number | null,
    currency: asString(offer?.priceCurrency) || meta["product:price:currency"] || meta["og:price:currency"] || "",
    availability: asString(offer?.availability) || "",
    rating: toNumber(aggregateRating?.ratingValue),
    reviewCount: toNumber(aggregateRating?.reviewCount ?? aggregateRating?.ratingCount),
    size: asString(product?.size),
    volume: asString(product?.volume),
    variants: offers.slice(0, 20).filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>,
    attributes: Object.fromEntries(
      ["color", "size", "material", "gender", "pattern", "weight"]
        .map((key) => [key, asString(product?.[key])] as const)
        .filter((entry) => Boolean(entry[1])),
    ),
  };
}

function extractMetaProductFallback(meta: Record<string, string>, title: string) {
  return {
    title: meta["og:title"] || meta["twitter:title"] || title,
    description: meta["og:description"] || meta.description || "",
    shortDescription: "",
    brand: meta["product:brand"] || "",
    category: meta["product:category"] || "",
    sku: meta["product:retailer_item_id"] || "",
    barcode: "",
    price: toNumber(meta["product:price:amount"] ?? meta["og:price:amount"]),
    compareAtPrice: null as number | null,
    currency: meta["product:price:currency"] || meta["og:price:currency"] || "",
    availability: meta["product:availability"] || "",
    rating: null,
    reviewCount: null,
    size: "",
    volume: "",
    variants: [],
    attributes: {},
  };
}

function extractHtmlExcerpt(html: string) {
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] || html;
  return cleanText(body.replace(/<(nav|footer|header|aside|script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " "), 5000);
}

function findCanonical(html: string, pageUrl: string, meta: Record<string, string>) {
  const match = html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*>/i);
  return normalizeUrl((match ? attr(match[0], "href") : "") || meta["og:url"] || pageUrl, pageUrl);
}

function extractImagesFromProviderData(data: unknown, pageUrl: string, productName = "") {
  const map = new Map<string, ExtractedUrlImage>();
  const maybe = (value: unknown) => {
    if (typeof value !== "string") return;
    const url = normalizeUrl(value, pageUrl);
    if (url) addImage(map, { url, alt: productName, width: 0, height: 0, source: "jsonld" });
  };
  const node = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
  const product = node?.product && typeof node.product === "object" ? node.product as Record<string, unknown> : node;
  if (product?.image) {
    const images = Array.isArray(product.image) ? product.image : [product.image];
    images.forEach(maybe);
  }
  if (product?.images && Array.isArray(product.images)) {
    product.images.forEach((item) => {
      if (typeof item === "string") maybe(item);
      else if (item && typeof item === "object") {
        const row = item as Record<string, unknown>;
        maybe(row.src ?? row.url);
      }
    });
  }
  return [...map.values()];
}

async function assertPublicUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http and https URLs are supported.");
  if (url.username || url.password) throw new Error("URLs with embedded credentials are not allowed.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Private/local hosts are not allowed.");
  }

  const blockedAddress = (address: string) => {
    const version = net.isIP(address);
    if (version === 4) {
      const [a, b] = address.split(".").map(Number);
      return a === 10 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        a === 127 ||
        (a === 169 && b === 254) ||
        address === "0.0.0.0";
    }
    if (version === 6) {
      const normalized = address.toLowerCase();
      return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") ||
        normalized.startsWith("fe80:") || normalized === "::";
    }
    return false;
  };

  if (net.isIP(host)) {
    if (blockedAddress(host)) throw new Error("Private/local hosts are not allowed.");
    return url;
  }

  const addresses = await dns.lookup(host, { all: true });
  if (!addresses.length || addresses.some((entry) => blockedAddress(entry.address))) {
    throw new Error("The URL resolves to a private or local network address.");
  }
  return url;
}

async function fetchTextPublic(inputUrl: string, maxBytes = MAX_HTML_BYTES) {
  let current = await assertPublicUrl(inputUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        "User-Agent": "SunVeraJolie-UniversalURLExtractor/1.0",
        Accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.8,*/*;q=0.5",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect response without a Location header.");
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error("Source returned HTTP " + response.status + ".");
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxBytes) throw new Error("Source page is too large to process.");
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error("Source page is too large to process.");
    return {
      url: current.toString(),
      text: Buffer.from(buffer).toString("utf8"),
      contentType: response.headers.get("content-type") || "",
    };
  }
  throw new Error("Too many redirects.");
}

async function tryProviderData(pageUrl: URL, platform: string) {
  const attempts: string[] = [];
  if (platform === "Shopify") {
    const match = pageUrl.pathname.match(/\/products\/([^/]+)/i);
    if (match) {
      attempts.push(new URL("/products/" + encodeURIComponent(match[1]) + ".json", pageUrl.origin).toString());
      attempts.push(new URL("/products/" + encodeURIComponent(match[1]) + ".js", pageUrl.origin).toString());
    }
  } else if (platform === "WooCommerce") {
    const slug = pageUrl.pathname.split("/").filter(Boolean).pop();
    if (slug) attempts.push(new URL("/wp-json/wc/store/v1/products?slug=" + encodeURIComponent(slug), pageUrl.origin).toString());
  }

  for (const attempt of attempts) {
    try {
      const safe = await assertPublicUrl(attempt);
      const response = await fetch(safe, {
        redirect: "manual",
        headers: {
          "User-Agent": "SunVeraJolie-UniversalURLExtractor/1.0",
          Accept: "application/json,text/plain;q=0.8,*/*;q=0.5",
        },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) continue;
      const text = await response.text();
      if (text.length > 1_500_000) continue;
      return JSON.parse(text) as unknown;
    } catch {
      // Continue with HTML extraction.
    }
  }
  return null;
}

function mergeFields(base: ReturnType<typeof extractMetaProductFallback>, provider: unknown, platform: string) {
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) return base;
  const p = provider as Record<string, unknown>;
  if (platform === "WooCommerce") {
    const prices = p.prices && typeof p.prices === "object" ? p.prices as Record<string, unknown> : {};
    return {
      ...base,
      title: cleanText(p.name) || base.title,
      description: cleanText(p.description) || base.description,
      shortDescription: cleanText(p.short_description),
      sku: asString(p.sku) || base.sku,
      price: toNumber(prices.price) ?? base.price,
      currency: asString(prices.currency_code) || base.currency,
      variants: Array.isArray(p.variations) ? p.variations.slice(0, 20) as Array<Record<string, unknown>> : base.variants,
    };
  }
  if (platform === "Shopify" && p.product && typeof p.product === "object") {
    const product = p.product as Record<string, unknown>;
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const firstVariant = variants[0] && typeof variants[0] === "object" ? variants[0] as Record<string, unknown> : {};
    return {
      ...base,
      title: asString(product.title) || base.title,
      description: cleanText(product.body_html) || base.description,
      brand: asString(product.vendor) || base.brand,
      category: asString(product.product_type) || base.category,
      sku: asString(firstVariant.sku) || base.sku,
      price: toNumber(firstVariant.price) ?? base.price,
      variants: variants.slice(0, 20) as Array<Record<string, unknown>>,
      attributes: Array.isArray(product.options)
        ? Object.fromEntries(product.options.slice(0, 20).map((item) => {
            const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
            return [asString(row.name) || "option", Array.isArray(row.values) ? row.values.map(String).join(", ") : ""] as const;
          }).filter((entry) => entry[1]))
        : base.attributes,
    };
  }
  return base;
}

export function extractUrlsFromText(text: string) {
  return [...new Set(String(text ?? "").match(/https?:\/\/[^\s<>"']+/gi) || [])]
    .map((value) => value.replace(/[),.;!?]+$/, ""))
    .slice(0, 3);
}

export async function extractUniversalUrl(inputUrl: string): Promise<UniversalUrlExtraction> {
  const warnings: string[] = [];
  let requested: URL;

  try {
    requested = await assertPublicUrl(inputUrl);
  } catch (error) {
    return failureResult(inputUrl, error instanceof Error ? error.message : "Invalid URL.");
  }

  try {
    const fetched = await fetchTextPublic(requested.toString());
    const final = new URL(fetched.url);
    const html = fetched.text;
    const meta = metaTags(html);
    const jsonLd = collectJsonLd(html);
    const product = pickProductJsonLd(jsonLd);
    const title = cleanText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "", 500);
    const platform = detectPlatform(final, html);
    const providerRaw = await tryProviderData(final, platform);
    const provider = providerRaw && platform === "WooCommerce" && Array.isArray(providerRaw) ? providerRaw[0] : providerRaw;
    let fields = product ? extractProductFields(product, meta, title) : extractMetaProductFallback(meta, title);
    fields = mergeFields(fields, provider, platform) as typeof fields;

    const images = extractImages(html, final.toString(), meta, product);
    const providerImages = extractImagesFromProviderData(providerRaw, final.toString(), fields.title);
    const allImages = [...new Map([...images, ...providerImages].map((item) => [item.url, item])).values()].slice(0, MAX_IMAGES);
    const videos = extractVideos(html, final.toString(), meta, product);
    const textExcerpt = extractHtmlExcerpt(html);
    const isProductLike = Boolean(
      product ||
      /\/(?:products?|item|p)\//i.test(final.pathname) ||
      /(?:add to cart|buy now|price|sku|availability|in stock|out of stock|ajouter au panier|acheter)/i.test(textExcerpt.slice(0, 2500)),
    );

    const extractionStatus: UniversalUrlExtraction["extractionStatus"] =
      fields.title && (fields.description || allImages.length) ? "full" :
      fields.title || allImages.length ? "partial" : "failed";

    if (!product) warnings.push("No Product JSON-LD was found; values may come from meta tags or a platform API.");
    if (!allImages.length) warnings.push("No image URLs were detected.");
    if (fields.price === null) warnings.push("No reliable price was detected.");
    if (platform === "Unknown") warnings.push("Platform was not identified; generic extraction was used.");

    const confidence = Math.min(0.99, Number((
      0.2 +
      (fields.title ? 0.18 : 0) +
      (fields.description ? 0.18 : 0) +
      (product ? 0.22 : 0) +
      (allImages.length ? 0.14 : 0) +
      (fields.price !== null ? 0.08 : 0)
    ).toFixed(2)));

    return {
      inputUrl,
      finalUrl: final.toString(),
      sourceDomain: final.hostname,
      platform,
      extractionStatus,
      confidence,
      isProductLike,
      title: fields.title,
      description: fields.description,
      shortDescription: fields.shortDescription || fields.description.slice(0, 280),
      brand: fields.brand,
      category: fields.category,
      sku: fields.sku,
      barcode: fields.barcode,
      price: fields.price,
      compareAtPrice: fields.compareAtPrice,
      currency: fields.currency,
      availability: fields.availability,
      rating: fields.rating,
      reviewCount: fields.reviewCount,
      size: fields.size,
      volume: fields.volume,
      variants: fields.variants,
      attributes: fields.attributes,
      images: allImages,
      videos,
      canonicalUrl: findCanonical(html, final.toString(), meta),
      textExcerpt,
      metadata: Object.fromEntries(Object.entries(meta).slice(0, MAX_METADATA)),
      structuredProductData: product ? [product] : [],
      warnings,
    };
  } catch (error) {
    return failureResult(requested.toString(), error instanceof Error ? error.message : "URL extraction failed.");
  }
}

function failureResult(inputUrl: string, warning: string): UniversalUrlExtraction {
  let domain = "";
  try {
    domain = new URL(inputUrl).hostname;
  } catch {
    // Keep empty domain.
  }
  return {
    inputUrl,
    finalUrl: inputUrl,
    sourceDomain: domain,
    platform: "Unknown",
    extractionStatus: "failed",
    confidence: 0,
    isProductLike: false,
    title: "",
    description: "",
    shortDescription: "",
    brand: "",
    category: "",
    sku: "",
    barcode: "",
    price: null,
    compareAtPrice: null,
    currency: "",
    availability: "",
    rating: null,
    reviewCount: null,
    size: "",
    volume: "",
    variants: [],
    attributes: {},
    images: [],
    videos: [],
    canonicalUrl: "",
    textExcerpt: "",
    metadata: {},
    structuredProductData: [],
    warnings: [warning],
  };
}
