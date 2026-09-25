import { NextResponse } from "next/server";
import { publicMediaError } from "@/lib/api-errors";
import { db } from "@/db";
import { media, productImages } from "@/db/schema";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import { deleteStoredFile, mediaPublicUrl, storeFile, storageWarning, STORAGE_MODE } from "@/lib/storage";
import { getSettingsMap } from "@/lib/settings";
import {
  findMediaReferences,
  productImageReferencePredicate,
  productsWithoutImages,
  referencedProducts,
  repairPrimaryImages,
  summarizeTextReferences,
} from "@/lib/media-references";

export const dynamic = "force-dynamic";

export const FOLDERS = ["products", "homepage", "banners", "categories", "brand", "ai", "marketing", "content", "other"];

type MediaRow = typeof media.$inferSelect;
type MediaWithMeta = MediaRow & { usage: number };

/** Fails closed with a JSON body and no stack trace. */
function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

function errorMessage(e: unknown) {
  return publicMediaError(e);
}

function clampFocal(v: unknown, fallback: number) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback;
}

function normalizeFolder(v: unknown): string | null {
  const f = String(v ?? "");
  return FOLDERS.includes(f) ? f : null;
}

/** Number of product_images rows pointing at each media id. */
async function usageByMediaId(ids: number[]): Promise<Map<number, number>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ mediaId: productImages.mediaId, n: sql<number>`count(*)::int` })
    .from(productImages)
    .where(inArray(productImages.mediaId, ids))
    .groupBy(productImages.mediaId);
  return new Map(rows.filter((r) => r.mediaId !== null).map((r) => [r.mediaId as number, r.n]));
}

async function decorate(rows: MediaRow[]): Promise<MediaWithMeta[]> {
  const usage = await usageByMediaId(rows.map((r) => r.id));
  return rows.map((row) => ({ ...row, url: mediaPublicUrl(row), usage: usage.get(row.id) ?? 0 }));
}

function storageInfo() {
  return { warning: storageWarning(), mode: STORAGE_MODE() };
}

async function cleanupStoredOnFailure(stored: { provider: string; storageKey: string }) {
  if (stored.provider !== "local" || !stored.storageKey) return;
  await deleteStoredFile({ provider: stored.provider, storageKey: stored.storageKey }).catch(() => {});
}

export async function GET(req: Request) {
  if (!(await isAdmin())) return fail(401, "Unauthorized");
  const params = new URL(req.url).searchParams;
  const q = params.get("q")?.trim();
  const folder = normalizeFolder(params.get("folder"));
  const requestedPage = Number.parseInt(params.get("page") ?? "1", 10);
  const requestedPageSize = Number.parseInt(params.get("pageSize") ?? "50", 10);
  const page = Number.isInteger(requestedPage) ? Math.max(1, requestedPage) : 1;
  const pageSize = Number.isInteger(requestedPageSize) ? Math.min(100, Math.max(12, requestedPageSize)) : 50;
  const offset = (page - 1) * pageSize;

  // Search and folder filter combine (AND) instead of one shadowing the other.
  const conditions = [];
  if (q) {
    const like = `%${q}%`;
    conditions.push(or(ilike(media.filename, like), ilike(media.alt, like), ilike(media.title, like), ilike(media.caption, like)));
  }
  if (folder) conditions.push(eq(media.folder, folder));

  const rows = await db
    .select()
    .from(media)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(media.id))
    .limit(pageSize + 1)
    .offset(offset);

  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const settings = await getSettingsMap();
  return NextResponse.json({
    media: await decorate(pageRows),
    folders: FOLDERS,
    limits: {
      maxUploadMb: settings.security.maxUploadMb,
      allowedTypes: settings.security.allowedTypes,
    },
    storage: storageInfo(),
    pagination: { page, pageSize, hasMore, hasPrevious: page > 1 },
  });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return fail(401, "Unauthorized");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "Expected a multipart/form-data upload");
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return fail(400, "No files received");

  const settings = await getSettingsMap();
  const folder = normalizeFolder(form.get("folder")) ?? "other";
  const { maxUploadMb, allowedTypes } = settings.security;

  // Real replace: store the new file FIRST, then update the EXISTING row in place so its
  // id (and every productImages reference + the /api/media/[id] URL) keeps working and now
  // serves the new image. alt/title/caption/focal points/createdAt are preserved; only the
  // file-derived fields change. No orphan temp row is created and the old asset is never
  // destroyed before the new upload succeeds.
  const replaceId = Number(form.get("replaceId")) || 0;
  if (replaceId) {
    const file = files[0];
    let stored: Awaited<ReturnType<typeof storeFile>> | null = null;
    try {
      stored = await storeFile(file, folder, maxUploadMb, allowedTypes);

      const [existing] = await db.select().from(media).where(eq(media.id, replaceId)).limit(1);
      if (!existing) {
        await cleanupStoredOnFailure(stored);
        return fail(404, "Media row not found");
      }

      const url = stored.url || mediaPublicUrl({ id: replaceId, provider: stored.provider, url: "", storageKey: stored.storageKey });
      const [row] = await db
        .update(media)
        .set({
          url,
          storageKey: stored.storageKey,
          provider: stored.provider,
          filename: stored.filename,
          mimeType: stored.mimeType,
          size: stored.size,
          width: stored.width,
          height: stored.height,
          folder,
        })
        .where(eq(media.id, replaceId))
        .returning();

      if (!row) {
        await cleanupStoredOnFailure(stored);
        return fail(404, "Media row not found");
      }

      // Keep product image URLs pointing at the (new) asset so nothing breaks on the storefront.
      const refs = await db
        .update(productImages)
        .set({ url })
        .where(eq(productImages.mediaId, replaceId))
        .returning({ id: productImages.productId });

      // Safe cleanup: only the orphaned local file, which is now unreachable by any URL.
      const cleanup =
        existing.provider === "local" && existing.storageKey && existing.storageKey !== stored.storageKey
          ? await deleteStoredFile({ provider: existing.provider, storageKey: existing.storageKey })
          : { deleted: false, kept: null as string | null };

      const [decorated] = await decorate([row]);
      return NextResponse.json({
        replaced: decorated,
        updatedReferences: refs.length,
        cleanup,
        storage: storageInfo(),
      });
    } catch (e) {
      if (stored) await cleanupStoredOnFailure(stored);
      return fail(400, errorMessage(e), { storage: storageInfo() });
    }
  }

  const created: MediaRow[] = [];
  const errors: string[] = [];
  for (const file of files) {
    let stored: Awaited<ReturnType<typeof storeFile>> | null = null;
    try {
      stored = await storeFile(file, folder, maxUploadMb, allowedTypes);
      const [row] = await db
        .insert(media)
        .values({
          ...stored,
          alt: file.name,
          title: file.name.replace(/\.[a-z0-9]+$/i, ""),
          folder,
        })
        .returning();
      // Local files are addressed through /api/media/[id]; persist that URL so the row is
      // directly usable (and cache-bustable) by every consumer.
      if (!stored.url) {
        const publicUrl = mediaPublicUrl(row);
        const [updated] = await db.update(media).set({ url: publicUrl }).where(eq(media.id, row.id)).returning();
        created.push(updated);
      } else {
        created.push(row);
      }
    } catch (e) {
      if (stored) await cleanupStoredOnFailure(stored);
      errors.push(`${file.name}: ${errorMessage(e)}`);
    }
  }

  return NextResponse.json(
    { created: await decorate(created), errors, storage: storageInfo() },
    { status: created.length ? 201 : 400 },
  );
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) return fail(401, "Unauthorized");
  const body = (await req.json()) as {
    id?: number;
    alt?: string;
    folder?: string;
    url?: string;
    title?: string;
    caption?: string;
    focalX?: number;
    focalY?: number;
  };
  const id = Number(body.id);
  if (!id) return fail(400, "id required");
  if (body.folder !== undefined && !normalizeFolder(body.folder)) {
    return fail(400, `Unknown folder. Allowed: ${FOLDERS.join(", ")}`);
  }

  const [row] = await db
    .update(media)
    .set({
      ...(body.alt !== undefined ? { alt: body.alt } : {}),
      ...(body.folder ? { folder: body.folder } : {}),
      ...(body.url ? { url: body.url } : {}),
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.caption !== undefined ? { caption: body.caption } : {}),
      ...(body.focalX !== undefined ? { focalX: clampFocal(body.focalX, 50) } : {}),
      ...(body.focalY !== undefined ? { focalY: clampFocal(body.focalY, 50) } : {}),
    })
    .where(eq(media.id, id))
    .returning();
  if (!row) return fail(404, "Media row not found");
  const [decorated] = await decorate([row]);
  return NextResponse.json({ media: decorated });
}

/** Raised inside the delete transaction when the row disappeared under us. */
class MediaRowGone extends Error {
  constructor() {
    super("Media row not found");
    this.name = "MediaRowGone";
  }
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return fail(401, "Unauthorized");
  const params = new URL(req.url).searchParams;
  const id = Number(params.get("id"));
  if (!Number.isInteger(id) || id <= 0) return fail(400, "id required");
  const force = params.get("force") === "1";

  const [row] = await db.select().from(media).where(eq(media.id, id)).limit(1);
  if (!row) return fail(404, "Media row not found");

  // Never silently break a page: look at product image slots (FK *and* stored URL) plus every
  // text column that still addresses this asset (banners, sections, logos, rich text, …).
  const references = await findMediaReferences(row);
  const productRefs = references.productImages;
  const textRefs = references.textReferences;
  const affectedProducts = referencedProducts(productRefs);

  if (!force && (productRefs.length || textRefs.length)) {
    const reasons = [
      productRefs.length
        ? `${productRefs.length} product image slot(s) on ${affectedProducts.length} product(s)`
        : "",
      textRefs.length
        ? `${textRefs.length} stored reference(s) in ${summarizeTextReferences(textRefs).join(", ")}`
        : "",
    ].filter(Boolean);

    return fail(
      409,
      `This asset is still in use (${reasons.join(" and ")}). Replace the file instead, or delete it with force=1 to remove those references as well.`,
      {
        usage: productRefs.length,
        forceRequired: true,
        products: affectedProducts,
        productImages: productRefs.map((r) => ({
          imageId: r.imageId,
          productId: r.productId,
          productName: r.productName,
          url: r.url,
          imageType: r.imageType,
          isPrimary: r.isPrimary,
          matchedBy: r.matchedBy,
        })),
        textReferences: textRefs,
      },
    );
  }

  // Forced delete is explicit *and* clean: the referencing product image slots are removed in
  // the same transaction as the media row, so nothing is ever left pointing at a missing asset,
  // and every product keeps exactly one main image.
  let outcome: {
    removedReferences: number;
    productsWithoutImages: number[];
    repairedPrimaryFor: number[];
  };
  try {
    outcome = await db.transaction(async (tx) => {
      // Re-read under a row lock: an attach that raced this request is seen here, not missed.
      const locked = await tx
        .select({ imageId: productImages.id, productId: productImages.productId })
        .from(productImages)
        .where(productImageReferencePredicate(row))
        .for("update");

      if (locked.length) {
        await tx.delete(productImages).where(inArray(productImages.id, locked.map((r) => r.imageId)));
      }

      const removed = await tx.delete(media).where(eq(media.id, id)).returning({ id: media.id });
      if (!removed.length) throw new MediaRowGone();

      const affectedProductIds = [...new Set(locked.map((r) => r.productId))].sort((a, b) => a - b);
      const emptied = await productsWithoutImages(tx, affectedProductIds);
      const repairedPrimaryFor = await repairPrimaryImages(
        tx,
        affectedProductIds.filter((productId) => !emptied.includes(productId)),
      );

      return { removedReferences: locked.length, productsWithoutImages: emptied, repairedPrimaryFor };
    });
  } catch (e) {
    if (e instanceof MediaRowGone) return fail(404, "Media row not found");
    // Nothing was committed and no file was touched: report a safe message only.
    return fail(500, publicMediaError(e, "Could not delete this asset. Please try again."));
  }

  // Only after the transaction committed: the physical file is now unreachable by any URL.
  const cleanup = await deleteStoredFile({ provider: row.provider, storageKey: row.storageKey });

  return NextResponse.json({
    ok: true,
    existed: true,
    forced: force,
    removedReferences: outcome.removedReferences,
    products: affectedProducts,
    productsWithoutImages: outcome.productsWithoutImages,
    repairedPrimaryFor: outcome.repairedPrimaryFor,
    textReferences: textRefs,
    cleanup,
  });
}
