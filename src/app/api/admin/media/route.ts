import { NextResponse } from "next/server";
import { db } from "@/db";
import { media } from "@/db/schema";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import { storeFile, storageWarning } from "@/lib/storage";
import { getSettingsMap } from "@/lib/settings";

export const dynamic = "force-dynamic";

const FOLDERS = ["products", "homepage", "banners", "categories", "content", "brand", "ai", "marketing", "other"];

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const q = params.get("q");
  const folder = params.get("folder");
  const rows = await db
    .select()
    .from(media)
    .where(
      q ? or(ilike(media.filename, `%${q}%`), ilike(media.alt, `%${q}%`)) : folder && folder !== "all" ? eq(media.folder, folder) : undefined,
    )
    .orderBy(desc(media.id))
    .limit(200);
  return NextResponse.json({ media: rows, storage: { warning: storageWarning() } });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await getSettingsMap();
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const folder = FOLDERS.includes(String(form.get("folder"))) ? String(form.get("folder")) : "other";
  if (files.length === 0) return NextResponse.json({ error: "No files received" }, { status: 400 });

  // Real replace: store the new file, then update the EXISTING row in place so its
  // id (and every productImages reference + the /api/media/[id] URL) keeps working
  // and now serves the new image. alt/folder/createdAt are preserved; only the
  // file-derived fields change. No orphan temp row is created.
  const replaceId = Number(form.get("replaceId")) || 0;
  if (replaceId) {
    const file = files[0];
    try {
      const stored = await storeFile(file, folder, settings.security.maxUploadMb, settings.security.allowedTypes);
      const [row] = await db
        .update(media)
        .set({
          url: stored.url || `/api/media/${replaceId}`,
          storageKey: stored.storageKey,
          provider: stored.provider,
          filename: stored.filename,
          mimeType: stored.mimeType,
          size: stored.size,
        })
        .where(eq(media.id, replaceId))
        .returning();
      if (!row) return NextResponse.json({ error: "Media row not found" }, { status: 404 });
      return NextResponse.json({ replaced: row, storage: { warning: storageWarning() } });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message, storage: { warning: storageWarning() } }, { status: 400 });
    }
  }

  const created = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      const stored = await storeFile(file, folder, settings.security.maxUploadMb, settings.security.allowedTypes);
      const [row] = await db.insert(media).values({ ...stored, alt: file.name, folder }).returning();
      created.push(row);
    } catch (e) {
      errors.push(`${file.name}: ${(e as Error).message}`);
    }
  }
  return NextResponse.json({ created, errors, storage: { warning: storageWarning() } }, { status: created.length ? 201 : 400 });
}

export async function PATCH(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const [row] = await db
    .update(media)
    .set({
      ...(body.alt !== undefined ? { alt: body.alt } : {}),
      ...(body.folder ? { folder: body.folder } : {}),
      ...(body.url ? { url: body.url } : {}),
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.caption !== undefined ? { caption: body.caption } : {}),
      ...(body.focalX !== undefined ? { focalX: body.focalX } : {}),
      ...(body.focalY !== undefined ? { focalY: body.focalY } : {}),
    })
    .where(eq(media.id, body.id))
    .returning();
  return NextResponse.json({ media: row });
}

export async function DELETE(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const [usage] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(media)
    .where(eq(media.id, id));
  await db.delete(media).where(eq(media.id, id));
  return NextResponse.json({ ok: true, existed: Boolean(usage) });
}
