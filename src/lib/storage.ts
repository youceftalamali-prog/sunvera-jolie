import { createHash, randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { imageSize } from "image-size";

export type StoredFile = {
  url: string;
  storageKey: string;
  provider: string;
  filename: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
};

export type StoredRef = {
  provider: string;
  storageKey: string;
};

export const STORAGE_MODE = () => {
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
    return "cloudinary" as const;
  if (process.env.STORAGE_UPLOAD_URL && process.env.STORAGE_ACCESS_KEY) return "remote" as const;
  if (process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID) return "s3-pending" as const;
  return "local" as const;
};

export const UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR ?? ".uploads";

export function storageWarning() {
  const mode = STORAGE_MODE();
  const isProd = process.env.NODE_ENV === "production";
  if (mode === "local")
    return isProd
      ? "NOT PRODUCTION-READY: no object storage is configured, so uploads are written to the local disk (.uploads) and served through /api/media/[id]. Local storage is for development/testing only — files are lost on ephemeral/redeployed hosts and are not backed up. Configure CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET, or STORAGE_UPLOAD_URL + STORAGE_ACCESS_KEY, before going live."
      : "Storage provider not configured: uploads are written to local disk (.uploads) and served through /api/media/[id]. Configure CLOUDINARY_* or STORAGE_UPLOAD_URL + STORAGE_ACCESS_KEY for production object storage.";
  if (mode === "s3-pending")
    return isProd
      ? "NOT PRODUCTION-READY: S3 credentials were detected but the direct S3 signing helper is not enabled, so uploads still fall back to local disk. Wire an S3 SDK, or use CLOUDINARY_* / STORAGE_UPLOAD_URL, before going live."
      : "S3 credentials detected but the direct S3 signing helper is not enabled. Use CLOUDINARY_* or STORAGE_UPLOAD_URL, or wire an S3 SDK (see report).";
  return null;
}

/* --------------------------- Upload validation --------------------------- */

/** Extensions accepted for each MIME type the store allows. */
const EXTENSIONS_FOR_MIME: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/avif": ["avif"],
  "image/gif": ["gif"],
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
};

/** Reads the file signature so a renamed/lying payload cannot be stored as an image. */
function sniffMimeType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  )
    return "image/png";
  if (buf.length >= 6 && buf.subarray(0, 3).toString("latin1") === "GIF") return "image/gif";
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "image/webp";
  if (buf.length >= 12 && buf.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("latin1");
    if (brand === "avif" || brand === "avis" || brand === "mif1" || brand === "msf1") return "image/avif";
  }
  return null;
}

/** Keeps a display filename free of paths, control characters and header breakers. */
function sanitizeFilename(name: string): string {
  const base = String(name ?? "").replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/["'`;<>|&$]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  if (!cleaned || cleaned === "." || cleaned === "..") return `upload-${Date.now().toString(36)}`;
  return cleaned;
}

function allowedTypeList(allowed: string) {
  const list = allowed.split(",").map((t) => t.trim()).filter(Boolean);
  return list.length ? list : Object.keys(EXTENSIONS_FOR_MIME);
}

/** Reads intrinsic pixel size when the format exposes one; {0,0} when it does not. */
function readDimensions(buffer: Buffer): { width: number; height: number } {
  try {
    const d = imageSize(buffer);
    return { width: d.width ?? 0, height: d.height ?? 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}

export async function storeFile(
  file: File,
  folder: string,
  maxMb = 8,
  allowed = "image/jpeg,image/png,image/webp,image/avif",
): Promise<StoredFile> {
  const allowedList = allowedTypeList(allowed);
  const filename = sanitizeFilename(file.name);
  const ext = (filename.split(".").pop() ?? "").toLowerCase();

  const allowedExtensions = allowedList.flatMap((t) => EXTENSIONS_FOR_MIME[t] ?? []);

  // 1. Empty file — cheapest check first, before the payload is read into memory.
  if (file.size === 0) throw new Error("The uploaded file is empty");

  // 2. Extension must belong to an allowed image type.
  const mimeForExt = MIME_BY_EXTENSION[ext];
  if (!mimeForExt || !allowedList.includes(mimeForExt)) {
    throw new Error(`Unsupported file extension${ext ? ` ".${ext}"` : ""}. Allowed: ${allowedExtensions.join(", ")}`);
  }

  // 3. Declared MIME must be allowed too (browsers fall back to a generic type, which we accept).
  const GENERIC_TYPES = ["", "application/octet-stream", "binary/octet-stream"];
  if (file.type && !GENERIC_TYPES.includes(file.type) && !allowedList.includes(file.type)) {
    throw new Error(`Unsupported image type: ${file.type}. Allowed: ${allowedList.join(", ")}`);
  }

  // 4. Size limit.
  if (file.size > maxMb * 1024 * 1024) throw new Error(`Image is too large (max ${maxMb} MB)`);

  const buffer = Buffer.from(await file.arrayBuffer());

  // 5. Content must really be the image it claims to be — a renamed payload is refused.
  const sniffed = sniffMimeType(buffer);
  if (!sniffed) throw new Error("File is not a readable image (JPG, PNG, WEBP or AVIF)");
  if (!allowedList.includes(sniffed)) {
    throw new Error(`Unsupported image type: ${sniffed}. Allowed: ${allowedList.join(", ")}`);
  }
  if (sniffed !== mimeForExt) {
    throw new Error(`File content is ${sniffed} but the extension says "${ext}" — rename it and try again`);
  }

  const safeExt = ext;
  const { width, height } = readDimensions(buffer);

  const safeFolder = folder.replace(/[^a-z0-9_-]/gi, "") || "other";
  const key = `${safeFolder}/${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.${safeExt}`;
  const mode = STORAGE_MODE();

  if (mode === "cloudinary") {
    const cloud = process.env.CLOUDINARY_CLOUD_NAME as string;
    const timestamp = Math.floor(Date.now() / 1000);
    const folderName = `sunvera/${safeFolder}`;
    const toSign = `folder=${folderName}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`;
    const signature = createHash("sha1").update(toSign).digest("hex");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)], { type: sniffed }), filename);
    form.append("api_key", process.env.CLOUDINARY_API_KEY as string);
    form.append("timestamp", String(timestamp));
    form.append("folder", folderName);
    form.append("signature", signature);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Cloudinary upload failed (${res.status})`);
    const d = (await res.json()) as { secure_url: string; public_id: string; width?: number; height?: number };
    return {
      url: d.secure_url,
      storageKey: d.public_id,
      provider: "cloudinary",
      filename,
      mimeType: sniffed,
      size: buffer.byteLength,
      // Prefer the provider's own reading, fall back to the local header parse.
      width: d.width || width,
      height: d.height || height,
    };
  }

  if (mode === "remote") {
    const endpoint = process.env.STORAGE_UPLOAD_URL as string;
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)], { type: sniffed }), filename);
    form.append("folder", safeFolder);
    form.append("key", key);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.STORAGE_ACCESS_KEY}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Remote storage upload failed (${res.status})`);
    const d = (await res.json()) as { url: string; key?: string };
    return {
      url: d.url,
      storageKey: d.key ?? key,
      provider: "remote",
      filename,
      mimeType: sniffed,
      size: buffer.byteLength,
      width,
      height,
    };
  }

  const abs = safeLocalFilePath(key);
  if (!abs) throw new Error("Could not resolve a safe upload path");
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
  return {
    url: "",
    storageKey: key,
    provider: "local",
    filename,
    mimeType: sniffed,
    size: buffer.byteLength,
    width,
    height,
  };
}

/**
 * Absolute path of a local asset, or null when the key would escape the upload directory.
 * Keys are generated by storeFile(); this is defence in depth for anything read back from the DB.
 */
export function safeLocalFilePath(storageKey: string): string | null {
  if (!storageKey || path.isAbsolute(storageKey) || storageKey.split(/[\\/]/).includes("..")) return null;
  return path.join(/*turbopackIgnore: true*/ process.cwd(), UPLOAD_DIR, storageKey);
}

/**
 * Public URL of a media row.
 *
 * Local files are served by /api/media/[id] with an `immutable` cache header, so the
 * URL carries a version token derived from the storage key. Replacing a file changes
 * the storage key, which changes the token, which busts every browser/CDN cache —
 * without ever creating a second media row.
 */
export function mediaPublicUrl(row: { id: number; provider: string; url: string; storageKey: string }): string {
  if (row.provider !== "local") return row.url;
  const base = row.storageKey.split("/").pop() ?? "";
  const version = base.replace(/\.[a-z0-9]+$/i, "");
  return `/api/media/${row.id}${version ? `?v=${version}` : ""}`;
}

/**
 * Best-effort removal of an orphaned physical file.
 *
 * Only the local provider is cleaned up: after a replace, the media row points at a new
 * storage key, so no URL can reach the old file any more. Cloudinary/remote assets are
 * intentionally left in place — their absolute URLs may still be referenced as plain text
 * by homepage sections, banners or settings, so deleting them could break a live page.
 */
export async function deleteStoredFile(ref: StoredRef): Promise<{ deleted: boolean; kept: string | null }> {
  if (ref.provider !== "local" || !ref.storageKey) return { deleted: false, kept: null };
  const abs = safeLocalFilePath(ref.storageKey);
  if (!abs) return { deleted: false, kept: "Old local file was outside the upload directory and was left untouched." };
  try {
    await unlink(abs);
    return { deleted: true, kept: null };
  } catch {
    return { deleted: false, kept: "Old local file could not be removed (already gone or in use)." };
  }
}
