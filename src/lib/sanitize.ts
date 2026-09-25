import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p", "br", "strong", "b", "em", "i", "u", "s",
  "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "a", "img",
  "table", "thead", "tbody", "tr", "td", "th",
  "span", "div", "blockquote", "hr", "figure", "figcaption",
];

const ALLOWED_ATTR = [
  "href", "title", "target", "rel",
  "src", "alt", "width", "height",
  "colspan", "rowspan", "align", "class",
];

// Blocks script/iframe/object/embed, all on* handlers, javascript:/data: URLs.
// Only http(s), mailto, tel and relative URLs survive for href/src.
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "style", "link", "meta", "form", "input", "button"],
    FORBID_ATTR: ["style", "onerror", "onload", "onclick", "onmouseover", "formaction", "srcdoc"],
    USE_PROFILES: { html: true },
  }) as unknown as string;
}

// Validates a CSS color token (hex, rgb/rgba, hsl/hsla or a named color word).
export function isSafeColor(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return true;
  if (/^rgba?\([\d\s.,%]+\)$/i.test(v)) return true;
  if (/^hsla?\([\d\s.,deg%]+\)$/i.test(v)) return true;
  if (/^[a-z]{3,20}$/i.test(v)) return true;
  return false;
}

// Pixel/analytics IDs must be alphanumeric (with optional dashes/underscores).
export function isSafeId(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[A-Za-z0-9_-]{1,64}$/.test(value.trim());
}
