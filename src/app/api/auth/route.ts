import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { CUSTOMER_COOKIE, hashPassword, sign, verifyPassword } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json()) as {
    action?: "register" | "login" | "logout";
    fullName?: string;
    phone?: string;
    email?: string;
    password?: string;
  };
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

  const phone = (b.phone ?? "").replace(/\s/g, "");
  if (!phone || !b.password) {
    return NextResponse.json({ error: "Phone and password are required" }, { status: 400 });
  }

  if (b.action === "register") {
    if (!b.fullName) return NextResponse.json({ error: "Full name is required" }, { status: 400 });
    if (b.password.length < 6)
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    const [exists] = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
    if (exists) return NextResponse.json({ error: "An account already uses this phone" }, { status: 409 });
    const [created] = await db
      .insert(customers)
      .values({
        fullName: b.fullName,
        phone,
        email: b.email ?? "",
        passwordHash: hashPassword(b.password),
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
  if (!user || !verifyPassword(b.password, user.passwordHash)) {
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
