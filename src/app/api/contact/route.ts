import { NextResponse } from "next/server";
import { db } from "@/db";
import { contactMessages } from "@/db/schema";

export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }
    b = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const message = typeof b.message === "string" ? b.message.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim().slice(0, 254) : "";
  const phone = typeof b.phone === "string" ? b.phone.trim().slice(0, 40) : "";
  const subject = typeof b.subject === "string" ? b.subject.trim().slice(0, 200) : "";
  if (!name || !message || name.length > 120 || message.length > 5000 ||
      (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) {
    return NextResponse.json({ error: "Provide a valid name, message, and email (if supplied)" }, { status: 400 });
  }
  try {
    await db.insert(contactMessages).values({ name, email, phone, subject, message });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not submit your message right now" }, { status: 503 });
  }
}
