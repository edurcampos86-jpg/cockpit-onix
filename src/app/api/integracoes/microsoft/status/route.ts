import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

type ErrorCode =
  | "expired"
  | "insufficient_scope"
  | "network"
  | "rate_limit"
  | "unknown";
function classifyLastError(msg: string | null): ErrorCode | null {
  if (!msg) return null;
  if (/invalid_grant|AADSTS70008|AADSTS50173|sess[aã]o expirada/i.test(msg)) {
    return "expired";
  }
  if (
    /escopo insuficiente|insufficient[\s_]*(permission|scope)|ErrorAccessDenied/i.test(
      msg,
    )
  ) {
    return "insufficient_scope";
  }
  if (/ENOTFOUND|ECONN|fetch failed|network/i.test(msg)) return "network";
  if (/throttl|quota|rate|AADSTS900864/i.test(msg)) return "rate_limit";
  return "unknown";
}

/**
 * GET /api/integracoes/microsoft/status
 * Estado da conexão Microsoft (Graph: Calendar + Mail) do usuário logado.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const row = await prisma.userMicrosoftAuth.findUnique({
    where: { userId: session.userId },
    select: {
      microsoftEmail: true,
      microsoftTenantId: true,
      scopes: true,
      connectedAt: true,
      lastUsedAt: true,
      lastError: true,
      lastErrorAt: true,
    },
  });

  if (!row) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected: true,
    email: row.microsoftEmail,
    tenantId: row.microsoftTenantId,
    scopes: row.scopes.split(",").filter(Boolean),
    connectedAt: row.connectedAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    lastError: classifyLastError(row.lastError),
    lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
  });
}
