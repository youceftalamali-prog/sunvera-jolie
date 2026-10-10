import { db } from "@/db";
import { sql } from "drizzle-orm";

// PostgreSQL-backed fixed-window limiter.
// RATE_LIMIT_TRUST_PROXY must be enabled when the app sits behind a trusted proxy/load balancer.
// When disabled, forwarded headers are ignored so clients cannot spoof their identity.
export type RateLimitResult = { ok: boolean; remaining: number; resetAt: number };

function trustProxyHeaders() {
  return process.env.RATE_LIMIT_TRUST_PROXY === "1" || process.env.RATE_LIMIT_TRUST_PROXY === "true";
}

function normalizeIp(value: string | null) {
  const raw = value?.trim() ?? "";
  return raw ? raw.slice(0, 128) : "unknown";
}

export function clientIp(req: Request): string {
  if (!trustProxyHeaders()) return "untrusted";
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return normalizeIp(realIp);
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return normalizeIp(xff.split(",")[0]);
  return "unknown";
}

export async function rateLimit(
  namespace: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const safeLimit = Math.max(1, Math.floor(limit));
  const safeWindowMs = Math.max(1, Math.floor(windowMs));

  const result = await db.execute(sql<{
    count: number;
    reset_at: Date;
  }>`
    INSERT INTO rate_limit_buckets (namespace, key, count, reset_at)
    VALUES (${namespace}, ${key}, 1, CURRENT_TIMESTAMP + (${safeWindowMs} * INTERVAL '1 millisecond'))
    ON CONFLICT (namespace, key)
    DO UPDATE SET
      count = CASE
        WHEN rate_limit_buckets.reset_at <= CURRENT_TIMESTAMP THEN 1
        ELSE rate_limit_buckets.count + 1
      END,
      reset_at = CASE
        WHEN rate_limit_buckets.reset_at <= CURRENT_TIMESTAMP
          THEN CURRENT_TIMESTAMP + (${safeWindowMs} * INTERVAL '1 millisecond')
        ELSE rate_limit_buckets.reset_at
      END
    RETURNING count, reset_at
  `);

  const row = result.rows[0];
  const count = Number(row?.count ?? safeLimit + 1);
  const resetAt = row?.reset_at ? new Date(String(row.reset_at)).getTime() : Date.now() + safeWindowMs;

  if (count === 1) {
    await db.execute(
      sql`DELETE FROM rate_limit_buckets WHERE reset_at <= CURRENT_TIMESTAMP AND NOT (namespace = ${namespace} AND key = ${key})`,
    );
  }

  return {
    ok: count <= safeLimit,
    remaining: Math.max(0, safeLimit - count),
    resetAt,
  };
}
