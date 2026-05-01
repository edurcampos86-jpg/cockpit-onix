import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { logSecurityEvent, SecurityEventType } from "@/lib/security/audit";

export const dynamic = "force-dynamic";

/**
 * Política de retenção da auditoria de segurança.
 *
 * Padrão: apaga eventos com mais de SECURITY_AUDIT_RETENTION_DAYS dias
 * (default 90). Variável de ambiente permite tunar por deploy.
 *
 * Disparado diariamente às 04:00 America/Bahia via Railway cron.
 *
 * Eventos mantidos sempre:
 *  - account.locked  (incidentes graves — não purga automaticamente)
 *
 * Limite máximo de retenção (90d) é um trade-off entre forense e LGPD.
 */

function getRetentionDays(): number {
  const raw = process.env.SECURITY_AUDIT_RETENTION_DAYS;
  if (!raw) return 90;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 7 || n > 365) return 90;
  return Math.floor(n);
}

export async function POST(request: Request) {
  const forbidden = guardCron(request);
  if (forbidden) return forbidden;

  const days = getRetentionDays();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const result = await prisma.securityEvent.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      type: { not: SecurityEventType.ACCOUNT_LOCKED },
    },
  });

  // Registra a própria purga (com count) para fechar o ciclo de auditoria.
  await logSecurityEvent({
    type: SecurityEventType.AUDIT_PURGE,
    success: true,
    metadata: { deleted: result.count, retentionDays: days, cutoff: cutoff.toISOString() },
  });

  return NextResponse.json({
    ok: true,
    deleted: result.count,
    retentionDays: days,
    cutoff: cutoff.toISOString(),
  });
}

export async function GET(request: Request) {
  return POST(request);
}
