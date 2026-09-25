import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { db } from "@/db";
import { media } from "@/db/schema";
import { eq } from "drizzle-orm";
import { safeLocalFilePath } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isFinite(numeric)) return new NextResponse("Not found", { status: 404 });
  const [row] = await db.select().from(media).where(eq(media.id, numeric)).limit(1);
  if (!row) return new NextResponse("Not found", { status: 404 });
  if (row.provider !== "local") return NextResponse.redirect(row.url);
  const abs = safeLocalFilePath(row.storageKey);
  if (!abs) return new NextResponse("Not found", { status: 404 });
  try {
    const file = await readFile(abs);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": row.mimeType,
        // Safe to cache forever: the URL carries a version token derived from the storage
        // key, so replacing the asset behind this media row produces a different URL.
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": `inline; filename="${row.filename.replace(/[^a-z0-9._-]/gi, "_")}"`,
      },
    });
  } catch {
    return new NextResponse("File missing on disk", { status: 404 });
  }
}
