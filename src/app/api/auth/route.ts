import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { CUSTOMER_COOKIE, hashPassword, sign, verifyPassword } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let b: { action?: unknown; fullName?: unknown; phone?: unknown; email?: unknown; password?: unknown };
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }
    b = parsed as typeof b;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!["register", "login", "logout"].includes(String(b.action))) {
    return NextResponse.json({ error: "Invalid authentication action" }, { status: 400 });
  }
  const jar = await cookies();

  if (b.action === "logout") {
    jar.delete(CUSTOMER_COOKIE);
    return NextResponse.json({ ok: true });
  }

  const rl = await rateLimit("auth", clientIp(req), 10, 10 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const phone = typeof b.phone === "string" ? b.phone.replace(/[\s()-]/g, "") : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!phone || phone.length > 32 || !password || password.length > 256) {
    return NextResponse.json({ error: "Phone and password are required" }, { status: 400 });
  }

  if (b.action === "register") {
    const fullName = typeof b.fullName === "string" ? b.fullName.trim() : "";
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    if (!fullName || fullName.length > 120) return NextResponse.json({ error: "Full name is required (up to 120 characters)" }, { status: 400 });
    if (email.length > 254 || (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    if (password.length < 6)
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    const [exists] = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
    if (exists) return NextResponse.json({ error: "An account already uses this phone" }, { status: 409 });
    const [created] = await db
      .insert(customers)
      .values({
        fullName,
        phone,
        email,
        passwordHash: hashPassword(password),
      })
      .returning();
    jar.set(CUSTOMER_COOKIE, sign(String(created.id)), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
    });
    return NextResponse.json({ ok: true, customer: { id: created.id, fullName: created.fullName } });
  }

  const [user] = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Invalid phone or password" }, { status: 401 });
  }
  jar.set(CUSTOMER_COOKIE, sign(String(user.id)), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  return NextResponse.json({ ok: true, customer: { id: user.id, fullName: user.fullName } });
}
