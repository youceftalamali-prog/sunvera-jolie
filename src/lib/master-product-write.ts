import { normalizeProductTypography } from "@/lib/product-write";

export {
  normalizeProduct,
  normalizeProductTypography,
  validateProduct,
  validateProductSku,
  writeImages,
  writeVariants,
} from "@/lib/product-write";

// Keep the Master AI's partial typography patch API, but share the underlying
// normalization and product/media writers with the admin product form.
export function normalizeProductTypographyPatch(input: unknown): Record<string, unknown> {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const normalized = normalizeProductTypography(source);
  const patch: Record<string, unknown> = {};
  for (const key of ["title", "shortDescription", "description"] as const) {
    const value = source[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const supplied = value as Record<string, unknown>;
    const stylePatch: Record<string, unknown> = {};
    for (const field of ["fontFamily", "fontSize", "fontWeight", "color"] as const) {
      if (field in supplied) stylePatch[field] = normalized[key][field];
    }
    if (Object.keys(stylePatch).length) patch[key] = stylePatch;
  }
  return patch;
}
