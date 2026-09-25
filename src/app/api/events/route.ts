import { NextResponse } from "next/server";
import { db } from "@/db";
import { events } from "@/db/schema";

export const dynamic = "force-dynamic";

function sourceFrom(ref: string | null) {
  const r = (ref ?? "").toLowerCase();
  if (r.includes("tiktok")) return "tiktok";
  if (r.includes("facebook") || r.includes("fb.")) return "facebook";
  if (r.includes("instagram")) return "instagram";
  if (r.includes("google")) return "google";
  return r ? "referral" : "direct";
}

export async function POST(req: Request) {
  try {
    const { name, payload } = (await req.json()) as { name?: string; payload?: unknown };
    if (!name) return NextResponse.json({ ok: false }, { status: 400 });
    await db.insert(events).values({
      name,
      payload: (payload ?? {}) as object,
      source: sourceFrom(req.headers.get("referer")),
    });
  } catch {
    /* analytics must never break the store */
  }
  return NextResponse.json({ ok: true });
}
