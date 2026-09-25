import { NextResponse } from "next/server";
import { db } from "@/db";
import { newsletterSubscribers } from "@/db/schema";

export async function POST(req: Request) {
  const { email } = (await req.json()) as { email?: string };
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  await db
    .insert(newsletterSubscribers)
    .values({ email: email.toLowerCase() })
    .onConflictDoNothing();
  return NextResponse.json({ ok: true, coupon: "WELCOME10" });
}
