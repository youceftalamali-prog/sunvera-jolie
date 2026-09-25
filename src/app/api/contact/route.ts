import { NextResponse } from "next/server";
import { db } from "@/db";
import { contactMessages } from "@/db/schema";

export async function POST(req: Request) {
  const b = (await req.json()) as Record<string, string>;
  if (!b.name || !b.message) {
    return NextResponse.json({ error: "Name and message are required" }, { status: 400 });
  }
  await db.insert(contactMessages).values({
    name: b.name,
    email: b.email ?? "",
    phone: b.phone ?? "",
    subject: b.subject ?? "",
    message: b.message,
  });
  return NextResponse.json({ ok: true });
}
