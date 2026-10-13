import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

function safeDbError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    message: rawMessage.replace(/postgres(?:ql)?:\/\/[^\s"'\x60]+/gi, "[redacted database URL]"),
  };
}

export async function GET() {
  console.info("[api/health] handler entered");
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (error) {
    // Emit sanitized diagnostics to server logs only; do not expose database details to clients.
    console.error("[api/health] database probe failed", safeDbError(error));
    return Response.json({ ok: false }, { status: 500 });
  }
}
