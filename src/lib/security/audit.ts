import "server-only";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * Tipos de evento auditados. Mantenha como constantes para evitar typos e
 * permitir filtro/agrupamento na UI.
 */
export const SecurityEventType = {
  LOGIN_OK: "login.ok",
  LOGIN_FAIL: "login.fail",
  LOGIN_RATE_LIMITED: "login.rate_limited",
  LOGIN_TOTP_OK: "login.totp_ok",
  LOGIN_TOTP_FAIL: "login.totp_fail",
  LOGOUT: "logout",
  PASSWORD_CHANGE: "password.change",
  TOTP_SETUP_START: "totp.setup_start",
  TOTP_ENABLE: "totp.enable",
  TOTP_DISABLE: "totp.disable",
  INTEGRATION_SECRET_SET: "integration.secret_set",
  ACCOUNT_LOCKED: "account.locked",
  AUDIT_PURGE: "audit.purge",
} as const;

export type SecurityEventType =
  (typeof SecurityEventType)[keyof typeof SecurityEventType];

export type LogEventInput = {
  type: SecurityEventType;
  userId?: string | null;
  cpf?: string | null; // será hasheado, nunca persistido em claro
  success?: boolean;
  metadata?: Record<string, unknown>;
};

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

async function captureRequestContext(): Promise<{ ip: string | null; ua: string | null }> {
  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null;
    const ua = h.get("user-agent") || null;
    return { ip, ua: ua ? ua.slice(0, 500) : null };
  } catch {
    // Fora de request scope (cron, boot) — ainda assim conseguimos logar.
    return { ip: null, ua: null };
  }
}

/**
 * Registra um evento de segurança. Falhas no log NUNCA quebram a operação
 * principal (try/catch no fim). Logs ficam só no DB; não emitimos console
 * para não vazar dados nos logs do Railway/Vercel.
 */
export async function logSecurityEvent(input: LogEventInput): Promise<void> {
  try {
    const ctx = await captureRequestContext();
    await prisma.securityEvent.create({
      data: {
        type: input.type,
        userId: input.userId ?? null,
        cpfHash: input.cpf ? sha256(input.cpf.replace(/\D/g, "")) : null,
        ip: ctx.ip,
        userAgent: ctx.ua,
        success: input.success ?? true,
        metadata: input.metadata as never,
      },
    });
  } catch (err) {
    console.error("[audit] falha ao registrar evento:", err);
  }
}

export type SecurityEventRow = {
  id: string;
  type: string;
  userId: string | null;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  metadata: unknown;
  createdAt: Date;
  user: { name: string; email: string } | null;
};

/** Lista os últimos eventos. Apenas para uso em telas admin. */
export async function listRecentEvents(limit = 200): Promise<SecurityEventRow[]> {
  const rows = await prisma.securityEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit, 1), 1000),
    include: { user: { select: { name: true, email: true } } },
  });
  return rows;
}
