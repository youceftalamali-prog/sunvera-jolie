import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { db } from "@/db";
import { media } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isAdmin } from "@/lib/auth";
import { safeLocalFilePath } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isInteger(numeric) || numeric <= 0) return new NextResponse("Not found", { status: 404 });

  const [row] = await db.select().from(media).where(eq(media.id, numeric)).limit(1);
  if (!row) return new NextResponse("Not found", { status: 404 });

  if (row.provider === "local") {
    const abs = safeLocalFilePath(row.storageKey);
    if (!abs) return new NextResponse("Not found", { status: 404 });
    try {
      const file = await readFile(abs);
      return new NextResponse(new Uint8Array(file), {
        headers: {
          "Content-Type": row.mimeType,
          "Content-Disposition": `attachment; filename="${row.filename.replace(/[^a-z0-9._-]/gi, "_")}"`,
          "Cache-Control": "no-store",
        },
      });
    } catch {
      return new NextResponse("File missing on disk", { status: 404 });
    }
  }

  if (!row.url) return new NextResponse("Media URL missing", { status: 404 });
  const upstream = await fetch(row.url, { cache: "no-store" });
  if (!upstream.ok) return new NextResponse("Could not fetch media asset", { status: 502 });
  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Disposition": `attachment; filename="${row.filename.replace(/[^a-z0-9._-]/gi, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
