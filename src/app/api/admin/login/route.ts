import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";
import { ADMIN_COOKIE, getAdminPassword, sign } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function passwordMatches(input: string, expected: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const { password, logout } = (await req.json()) as { password?: string; logout?: boolean };
  const jar = await cookies();
  if (logout) {
    jar.delete(ADMIN_COOKIE);
    return NextResponse.json({ ok: true });
  }
  const rl = rateLimit("admin-login", clientIp(req), 8, 15 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }
  if (typeof password !== "string" || !passwordMatches(password, getAdminPassword())) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  jar.set(ADMIN_COOKIE, sign("admin"), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
  });
  return NextResponse.json({ ok: true });
}
