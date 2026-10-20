import { NextResponse } from "next/server";
import { db } from "@/db";
import { newsletterSubscribers } from "@/db/schema";

export async function POST(req: Request) {
  let emailInput: unknown;

  try {
    const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("application/json")) {
      const parsed: unknown = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
      }
      emailInput = (parsed as { email?: unknown }).email;
    } else if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const form = await req.formData();
      emailInput = form.get("email");
    } else {
      return NextResponse.json(
        { error: "Unsupported request format. Send JSON or a form with an email field." },
        { status: 415 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof emailInput === "string" ? emailInput.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  try {
    await db.insert(newsletterSubscribers).values({ email }).onConflictDoNothing();
    return NextResponse.json({ ok: true, coupon: "WELCOME10" });
  } catch {
    return NextResponse.json({ error: "Could not subscribe right now" }, { status: 503 });
  }
}
