import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

export const CUSTOMER_COOKIE = "svj_session";
export const ADMIN_COOKIE = "svj_admin";

const isProduction = process.env.NODE_ENV === "production";

// No fallback secret or password is ever embedded. Missing/weak values fail loudly.
export function resolveSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Refusing to sign session cookies without a secret.",
    );
  }
  if (isProduction && secret.length < 32) {
    throw new Error(
      "AUTH_SECRET must be at least 32 characters in production. Refusing to start.",
    );
  }
  return secret;
}

export function getAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("ADMIN_PASSWORD is not set. Refusing to run admin authentication.");
  }
  if (isProduction && (password.length < 12 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))) {
    throw new Error(
      "ADMIN_PASSWORD must be at least 12 characters and include letters and digits in production. Refusing to start.",
    );
  }
  return password;
}

// Fail-fast boot check. Throws if required secrets are missing or too weak for the environment.
export function assertProductionSecrets(): void {
  resolveSecret();
  getAdminPassword();
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return check.length === expected.length && timingSafeEqual(check, expected);
}

export function sign(value: string) {
  const mac = createHmac("sha256", resolveSecret()).update(value).digest("hex");
  return `${value}.${mac}`;
}

export function unsign(token: string | undefined): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const value = token.slice(0, idx);
  const mac = token.slice(idx + 1);
  const expected = createHmac("sha256", resolveSecret()).update(value).digest("hex");
  if (mac.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) ? value : null;
}

export async function getCustomerId(): Promise<number | null> {
  const jar = await cookies();
  const raw = unsign(jar.get(CUSTOMER_COOKIE)?.value);
  const id = raw ? Number(raw) : NaN;
  return Number.isFinite(id) ? id : null;
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return unsign(jar.get(ADMIN_COOKIE)?.value) === "admin";
}
