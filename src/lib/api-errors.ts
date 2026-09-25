export function publicProductError(error: unknown, fallback: string) {
  const value = error as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string; detail?: string; message?: string };
    detail?: string;
  };
  const code = value.code ?? value.cause?.code;
  const constraint = value.constraint ?? value.cause?.constraint ?? "";
  const detail = value.detail ?? value.cause?.detail ?? value.cause?.message ?? "";

  const errorText = String(error instanceof Error ? error.message : error ?? "").toLowerCase();
  if (code === "23505" || errorText.includes("duplicate key") || errorText.includes("unique constraint")) {
    const uniqueTarget = (constraint + " " + detail + " " + errorText).toLowerCase();
    if (uniqueTarget.includes("products_sku_unique_idx")) return "SKU already exists for another product.";
    if (uniqueTarget.includes("product_variants_sku_unique_idx")) return "Variant SKU already exists for another product.";
    if (uniqueTarget.includes("slug")) return "A product with this slug already exists.";
    return "A product with these values already exists.";
  }

  if (error instanceof Error) {
    const message = error.message;
    if (
      message === "SKU already exists for another product." ||
      message === "Variant SKUs must be unique within a product." ||
      message === "Variant SKU already exists for another product." ||
      message === "Product not found"
    ) return message;
  }
  return fallback;
}

const SAFE_MEDIA_PREFIXES = [
  "The uploaded file is empty",
  "Unsupported file extension",
  "Unsupported image type",
  "Image is too large",
  "File is not a readable image",
  "File content is",
  "Cloudinary upload failed",
  "Remote storage upload failed",
  "Production storage is not configured.",
  "S3 credentials were detected, but S3 uploads are not implemented.",

  "Could not resolve a safe upload path",
];

export function publicMediaError(error: unknown, fallback = "Upload failed. Please try again.") {
  const message = error instanceof Error ? error.message : "";
  return SAFE_MEDIA_PREFIXES.some((prefix) => message.startsWith(prefix)) ? message : fallback;
}

const SAFE_ORDER_PREFIXES = [
  "Your cart is empty",
  "Product ",
  "The selected variant is invalid or unavailable",
  "Insufficient stock for",
  "The selected wilaya is invalid or unavailable.",
  "A valid active wilaya is required.",
  "A valid commune is required.",
  "The selected commune is invalid or unavailable for this wilaya.",
  "A product in your cart is no longer available",
];

export function publicOrderError(error: unknown, fallback = "Could not create the order. Please try again.") {
  const message = error instanceof Error ? error.message : "";
  return SAFE_ORDER_PREFIXES.some((prefix) => message.startsWith(prefix)) ? message : fallback;
}
