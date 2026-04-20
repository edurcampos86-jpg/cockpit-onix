import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { SyncRequestSources } from "@/lib/painel-do-dia/types";

/**
 * Fila de pedidos de sync do usuario -> cowork (Chrome MCP).
 *
 * POST: usuario aperta "Sincronizar" no painel, cria uma SyncRequest pending.
 * GET:  cowork lista pendentes pra processar.
 *
 * O update de status (pending -> in-progress -> done/error) fica em [id]/route.ts.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    sources?: SyncRequestSources;
  };
  const sources: SyncRequestSources = body.sources ?? "all";
  if (!["all", "microsoft", "priority-matrix"].includes(sources)) {
    return NextResponse.json({ error: "sources invalido" }, { status: 400 });
  }

  // Idempotencia: se ja existe um pending/in-progress pras mesmas fontes,
  // devolve o existente em vez de empilhar requests duplicadas.
  const existente = await prisma.syncRequest.findFirst({
    where: {
      userId: session.userId,
      sources,
      status: { in: ["pending", "in-progress"] },
    },
    orderBy: { requestedAt: "desc" },
  });

  if (existente) {
    return NextResponse.json(existente, { status: 200 });
  }

  const criada = await prisma.syncRequest.create({
    data: { userId: session.userId, sources, status: "pending" },
  });

  return NextResponse.json(criada, { status: 201 });
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pendentes = await prisma.syncRequest.findMany({
    where: {
      userId: session.userId,
      status: { in: ["pending", "in-progress"] },
    },
    orderBy: { requestedAt: "asc" },
  });

  return NextResponse.json({ pendentes });
}
