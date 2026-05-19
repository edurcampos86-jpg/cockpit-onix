import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

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
    lastError: row.lastError,
    lastErrorAt: row.lastErrorAt?.toISOString() ?? null,
  });
}
