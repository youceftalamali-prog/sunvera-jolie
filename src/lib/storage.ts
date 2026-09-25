import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export type StoredFile = {
  url: string;
  storageKey: string;
  provider: string;
  filename: string;
  mimeType: string;
  size: number;
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

export async function storeFile(file: File, folder: string, maxMb = 8, allowed = "image/jpeg,image/png,image/webp,image/avif"): Promise<StoredFile> {
  const allowedList = allowed.split(",").map((t) => t.trim());
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const safeExt = ["jpg", "jpeg", "png", "webp", "avif"].includes(ext) ? ext : "";
  if (!allowedList.includes(file.type))
    throw new Error(`Unsupported image type: ${file.type || "unknown"}. Allowed: ${allowedList.join(", ")}`);
  if (!safeExt) throw new Error("Unsupported file extension. Allowed: jpg, jpeg, png, webp, avif");
  if (file.size > maxMb * 1024 * 1024) throw new Error(`Image is too large (max ${maxMb} MB)`);
  if (file.size === 0) throw new Error("The uploaded file is empty");

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `${folder}/${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.${safeExt}`;
  const mode = STORAGE_MODE();

  if (mode === "cloudinary") {
    const cloud = process.env.CLOUDINARY_CLOUD_NAME as string;
    const timestamp = Math.floor(Date.now() / 1000);
    const folderName = `sunvera/${folder}`;
    const toSign = `folder=${folderName}&timestamp=${timestamp}${process.env.CLOUDINARY_API_SECRET}`;
    const signature = createHash("sha1").update(toSign).digest("hex");
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)], { type: file.type }), file.name);
    form.append("api_key", process.env.CLOUDINARY_API_KEY as string);
    form.append("timestamp", String(timestamp));
    form.append("folder", folderName);
    form.append("signature", signature);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Cloudinary upload failed (${res.status})`);
    const d = (await res.json()) as { secure_url: string; public_id: string; width?: number; height?: number };
    return { url: d.secure_url, storageKey: d.public_id, provider: "cloudinary", filename: file.name, mimeType: file.type, size: file.size };
  }

  if (mode === "remote") {
    const endpoint = process.env.STORAGE_UPLOAD_URL as string;
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)], { type: file.type }), file.name);
    form.append("folder", folder);
    form.append("key", key);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.STORAGE_ACCESS_KEY}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Remote storage upload failed (${res.status})`);
    const d = (await res.json()) as { url: string; key?: string };
    return { url: d.url, storageKey: d.key ?? key, provider: "remote", filename: file.name, mimeType: file.type, size: file.size };
  }

  const abs = path.join(/*turbopackIgnore: true*/ process.cwd(), UPLOAD_DIR, key);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buffer);
  return { url: "", storageKey: key, provider: "local", filename: file.name, mimeType: file.type, size: file.size };
}

export function localFilePath(storageKey: string) {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), UPLOAD_DIR, storageKey);
}
