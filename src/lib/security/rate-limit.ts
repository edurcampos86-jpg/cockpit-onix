import "server-only";

type Bucket = { count: number; resetAt: number; blockedUntil?: number };

const buckets = new Map<string, Bucket>();

const SWEEP_EVERY = 60_000;
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < SWEEP_EVERY) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if ((b.blockedUntil ?? 0) < now && b.resetAt < now) buckets.delete(key);
  }
}

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number };

/**
 * Limitador in-memory por chave (ex.: "login:<ip>:<cpf>").
 *  - Permite até `limit` requests dentro de `windowMs`.
 *  - Excedido: bloqueia por `blockMs` (default = windowMs * 4).
 *
 * Limitação conhecida: não é compartilhado entre instâncias. Para deploy
 * multi-replica (Railway com >1 réplica) trocar por Upstash Redis.
 */
export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number; blockMs?: number },
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const blockMs = opts.blockMs ?? opts.windowMs * 4;
  const b = buckets.get(key);

  if (b?.blockedUntil && b.blockedUntil > now) {
    return { allowed: false, retryAfterMs: b.blockedUntil - now };
  }

  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { allowed: true, remaining: opts.limit - 1 };
  }

  b.count += 1;
  if (b.count > opts.limit) {
    b.blockedUntil = now + blockMs;
    return { allowed: false, retryAfterMs: blockMs };
  }
  return { allowed: true, remaining: opts.limit - b.count };
}

/** Reset manual após sucesso (ex.: login bem-sucedido limpa o contador). */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}
