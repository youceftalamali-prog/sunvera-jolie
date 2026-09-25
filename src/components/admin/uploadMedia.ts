/**
 * Shared client-side media upload helpers.
 *
 * One uploader for the whole admin (product images, media library, media picker and
 * brand assets) so validation, progress and error handling behave identically
 * everywhere and always target the existing POST /api/admin/media endpoint.
 */

export type MediaAsset = {
  id: number;
  url: string;
  storageKey: string;
  provider: string;
  filename: string;
  alt: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  folder: string;
  title: string;
  caption: string;
  focalX: number;
  focalY: number;
  source: string;
  createdAt: string;
  usage: number;
};

export type UploadLimits = { maxUploadMb: number; allowedTypes: string[] };

/** Mirrors DEFAULTS.security so the UI can validate before the server is ever reached. */
export const DEFAULT_UPLOAD_LIMITS: UploadLimits = {
  maxUploadMb: 8,
  allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
};

const EXTENSIONS_BY_MIME: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/avif": ["avif"],
  "image/gif": ["gif"],
};

/** Value for an <input type="file" accept=""> attribute. */
export function acceptAttribute(limits: UploadLimits = DEFAULT_UPLOAD_LIMITS) {
  return limits.allowedTypes.join(",");
}

export function humanSize(bytes: number) {
  if (!bytes) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function extensionLabel(filename: string) {
  const ext = filename.split(".").pop() ?? "";
  return ext === filename ? "—" : ext.toUpperCase();
}

export type UploadIssue = { name: string; reason: string };

/** Cheap, synchronous pre-flight checks so bad files never hit the network. */
export function validateFiles(files: File[], limits: UploadLimits = DEFAULT_UPLOAD_LIMITS) {
  const allowed = limits.allowedTypes.map((t) => t.trim()).filter(Boolean);
  const extensions = allowed.flatMap((t) => EXTENSIONS_BY_MIME[t] ?? []);
  const ok: File[] = [];
  const issues: UploadIssue[] = [];

  for (const file of files) {
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (file.size === 0) {
      issues.push({ name: file.name, reason: "File is empty (0 bytes)" });
    } else if (!extensions.includes(ext)) {
      issues.push({ name: file.name, reason: `Unsupported type "${ext || "none"}" — allowed: ${extensions.join(", ")}` });
    } else if (file.type && !["application/octet-stream", "binary/octet-stream"].includes(file.type) && !allowed.includes(file.type)) {
      issues.push({ name: file.name, reason: `Unsupported MIME type ${file.type}` });
    } else if (file.size > limits.maxUploadMb * 1024 * 1024) {
      issues.push({ name: file.name, reason: `Too large (${humanSize(file.size)} — max ${limits.maxUploadMb} MB)` });
    } else {
      ok.push(file);
    }
  }
  return { ok, issues };
}

export type UploadResponse = {
  status: number;
  created?: MediaAsset[];
  replaced?: MediaAsset;
  updatedReferences?: number;
  /** Set on replace: whether the orphaned old file could be removed safely. */
  cleanup?: { deleted: boolean; kept: string | null };
  errors?: string[];
  error?: string;
  usage?: number;
  products?: { id: number; name: string; slug: string }[];
  storage?: { warning: string | null; mode: string };
};

/**
 * Uploads through XMLHttpRequest so a real percentage can be reported
 * (fetch() exposes no upload progress).
 */
export function uploadMediaFiles(options: {
  files: File[];
  folder: string;
  replaceId?: number;
  onProgress?: (percent: number) => void;
}): Promise<UploadResponse> {
  const { files, folder, replaceId, onProgress } = options;
  return new Promise((resolve, reject) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    form.append("folder", folder);
    if (replaceId) form.append("replaceId", String(replaceId));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/media");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: UploadResponse = { status: xhr.status };
      try {
        data = { status: xhr.status, ...(JSON.parse(xhr.responseText) as Omit<UploadResponse, "status">) };
      } catch {
        /* non-JSON response — keep the status only */
      }
      if (xhr.status === 401) {
        reject(new Error("Your admin session expired — please sign in again"));
        return;
      }
      resolve(data);
    };
    xhr.onerror = () => reject(new Error("Network error during upload — check your connection and try again"));
    xhr.send(form);
  });
}

export type MediaListResponse = {
  media: MediaAsset[];
  folders: string[];
  limits: UploadLimits;
  storage: { warning: string | null; mode: string };
  pagination: { page: number; pageSize: number; hasMore: boolean; hasPrevious: boolean };
};

export async function fetchMediaLibrary(
  params: { q?: string; folder?: string; page?: number; pageSize?: number } = {},
): Promise<MediaListResponse> {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.folder && params.folder !== "all") query.set("folder", params.folder);
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const res = await fetch(`/api/admin/media?${query}`, { cache: "no-store" });
  if (!res.ok) throw new Error(res.status === 401 ? "Your admin session expired" : `Could not load media (${res.status})`);
  return (await res.json()) as MediaListResponse;
}

export type MediaMetadataPatch = {
  alt?: string;
  title?: string;
  caption?: string;
  folder?: string;
  focalX?: number;
  focalY?: number;
};

export async function patchMedia(id: number, patch: MediaMetadataPatch): Promise<MediaAsset> {
  const res = await fetch("/api/admin/media", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...patch }),
  });
  const data = (await res.json()) as { media?: MediaAsset; error?: string };
  if (!res.ok || !data.media) throw new Error(data.error ?? `Could not save metadata (${res.status})`);
  return data.media;
}

/** A product that still renders this asset. */
export type MediaUsageProduct = { id: number; name: string; slug: string; images: number };

/** A product image slot pointing at this asset (found by media_id or by its stored URL). */
export type MediaProductImageRef = {
  imageId: number;
  productId: number;
  productName: string;
  url: string;
  imageType: string;
  isPrimary: boolean;
  matchedBy: "mediaId" | "url";
};

/** Any other stored value (banner, section, logo, rich text, …) that still addresses the asset. */
export type MediaTextReference = { table: string; column: string; rowId: string; label: string };

export type DeleteMediaResult = {
  ok?: boolean;
  error?: string;
  /** Number of product image slots using this asset. */
  usage?: number;
  /** Set on the 409 guard: the caller must retry with force=1 to delete anyway. */
  forceRequired?: boolean;
  products?: MediaUsageProduct[];
  productImages?: MediaProductImageRef[];
  textReferences?: MediaTextReference[];
  /** Product image slots removed together with the asset on a forced delete. */
  removedReferences?: number;
  /** Products left without any image by a forced delete. */
  productsWithoutImages?: number[];
  /** Products whose main image had to be re-assigned after the delete. */
  repairedPrimaryFor?: number[];
  cleanup?: { deleted: boolean; kept: string | null };
};

export async function deleteMedia(id: number, force = false): Promise<DeleteMediaResult> {
  const res = await fetch(`/api/admin/media?id=${id}${force ? "&force=1" : ""}`, { method: "DELETE" });
  return (await res.json()) as DeleteMediaResult;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
