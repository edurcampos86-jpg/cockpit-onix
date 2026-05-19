import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * Devolve um código fixo (não a mensagem crua) para o client não receber
 * trechos de stacktrace ou URL de upstream.
 */
type ErrorCode = "expired" | "network" | "rate_limit" | "unknown";
function classifyLastError(msg: string | null): ErrorCode | null {
  if (!msg) return null;
  if (/invalid_grant/i.test(msg)) return "expired";
  if (/ENOTFOUND|ECONN|fetch failed|network/i.test(msg)) return "network";
  if (/quota|rate/i.test(msg)) return "rate_limit";
  return "unknown";
}

/**
 * GET /api/integracoes/google/status
 * Estado da conexão Google (Calendar + Gmail) do usuário logado.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const row = await prisma.userGoogleAuth.findUnique({
    where: { userId: session.userId },
    select: {
      googleEmail: true,
      scopes: true,
      connectedAt: true,
      lastUsedAt: true,
      lastError: true,
      lastErrorAt: true,
    },
  });

  if (!row) {
    return NextResponse.json({ connected: false });
  }

  return NextResponse.json({
    connected: true,
    email: row.googleEmail,
    scopes: row.scopes.split(",").filter(Boolean),
    connectedAt: row.connectedAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    lastError: classifyLastError(row.lastError),
    lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
  });
}
