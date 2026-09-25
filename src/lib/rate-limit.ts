// In-memory fixed-window rate limiter.
// NOTE: state is per-process. In a multi-instance/production deployment this must be
// backed by a shared store (e.g. Redis) so limits are enforced across all instances.
type Bucket = { count: number; resetAt: number };

const stores = new Map<string, Map<string, Bucket>>();

export type RateLimitResult = { ok: boolean; remaining: number; resetAt: number };

export function rateLimit(
  namespace: string,
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  let store = stores.get(namespace);
  if (!store) {
    store = new Map();
    stores.set(namespace, store);
  }
  const now = Date.now();
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }
  bucket.count += 1;
  const ok = bucket.count <= limit;
  return { ok, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

// Periodically drop expired buckets so the map does not grow unbounded.
export function sweepExpired(now = Date.now()): void {
  for (const [ns, store] of stores) {
    for (const [key, bucket] of store) {
      if (bucket.resetAt <= now) store.delete(key);
    }
    if (store.size === 0) stores.delete(ns);
  }
}
setInterval(() => sweepExpired(), 60_000).unref?.();

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
