import type { SecuritySettings } from "@/lib/settings";

/**
 * Server-side view of Admin → Settings → Security & Uploads, shaped for the client
 * upload components so the browser can reject a bad file before it is ever sent.
 */
export function uploadLimitsFrom(security: Pick<SecuritySettings, "maxUploadMb" | "allowedTypes">) {
  const allowedTypes = String(security.allowedTypes ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const maxUploadMb = Number(security.maxUploadMb);
  return {
    maxUploadMb: Number.isFinite(maxUploadMb) && maxUploadMb > 0 ? maxUploadMb : 8,
    allowedTypes: allowedTypes.length ? allowedTypes : ["image/jpeg", "image/png", "image/webp", "image/avif"],
  };
}
