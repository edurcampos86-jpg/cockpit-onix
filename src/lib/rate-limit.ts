import "server-only";

/**
 * Rate limit in-memory por processo. Suficiente para Railway com 1 container
 * por serviço. Se um dia escalar pra múltiplos workers/replicas, trocar por
 * Redis/Postgres. (anotado como débito técnico)
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number; // epoch ms
  limit: number;
};

export function checkRateLimit(
  userId: string,
  route: string,
  limit = 60,
  windowMs = 60 * 60 * 1000,
): RateLimitResult {
  const key = `${userId}:${route}`;
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt, limit };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt, limit };
  }

  existing.count += 1;
  return {
    ok: true,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
    limit,
  };
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
  };
}
