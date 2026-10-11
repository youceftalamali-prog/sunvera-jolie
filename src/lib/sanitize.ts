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
  "colspan", "rowspan", "align", "class", "style",
];

const SAFE_PRODUCT_FONTS = new Set([
  "system-ui", "arial", "tahoma", "georgia", "sans-serif", "serif", "monospace",
  "cairo", "tajawal", "amiri", "playfair display", "noto sans arabic",
  "noto naskh arabic", "times new roman",
]);

function sanitizeInlineProductStyle(raw: string): string {
  const safe: string[] = [];
  for (const declaration of raw.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator <= 0) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (!value || /[<>]/.test(value) || /url\s*\(|expression\s*\(/i.test(value)) continue;

    let normalized = "";
    if (property === "color" || property === "background-color") {
      if (isSafeColor(value)) normalized = value;
    } else if (property === "font-family") {
      const families = value.split(",").map((family) => family.trim().replace(/^["']|["']$/g, ""));
      if (families.length > 0 && families.length <= 4 && families.every((family) => SAFE_PRODUCT_FONTS.has(family.toLowerCase()))) {
        normalized = families.join(", ");
      }
    } else if (property === "font-size") {
      const match = value.match(/^(\d{1,2})(px|rem|em)$/i);
      if (match) {
        const size = Number(match[1]);
        if (size >= 10 && size <= 72) normalized = size + match[2].toLowerCase();
      }
    } else if (property === "font-weight" && /^(400|500|600|700|800|900|normal|bold)$/i.test(value)) {
      normalized = value.toLowerCase();
    } else if (property === "text-align" && /^(left|right|center|justify|start|end)$/i.test(value)) {
      normalized = value.toLowerCase();
    } else if (property === "text-decoration" && /^(none|underline|line-through|overline)$/i.test(value)) {
      normalized = value.toLowerCase();
    } else if (property === "line-height" && /^(1|1\.\d{1,2}|2|2\.\d{1,2}|3)$/.test(value)) {
      normalized = value;
    } else if (property === "direction" && /^(ltr|rtl)$/i.test(value)) {
      normalized = value.toLowerCase();
    }

    if (normalized) safe.push(property + ": " + normalized);
  }
  return safe.join("; ");
}

// Blocks script/iframe/object/embed, all event handlers, and javascript:/data: URLs.
// Inline product styles are allow-listed property by property; arbitrary CSS is discarded.
export function sanitizeHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  const sanitized = DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "style", "link", "meta", "form", "input", "button"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "formaction", "srcdoc"],
    USE_PROFILES: { html: true },
  }) as unknown as string;

  return sanitized.replace(/\sstyle=(?:"([^"]*)"|'([^']*)')/gi, (_match, doubleQuoted: string | undefined, singleQuoted: string | undefined) => {
    const safeStyle = sanitizeInlineProductStyle(doubleQuoted ?? singleQuoted ?? "");
    return safeStyle ? ' style="' + safeStyle + '"' : "";
  });
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
