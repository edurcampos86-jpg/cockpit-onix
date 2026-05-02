import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { CriarAcaoInput } from "@/lib/painel-do-dia/types";

/**
 * GET /api/painel-do-dia/acoes
 *
 * Lista todas as AcaoPainel do usuario autenticado, sem filtro de camada.
 * Inclui itens invisiveis no painel (noMeuDia=false e sem vence) — util pra
 * debug, cleanup e para a Central de Sync (Sugestao 5).
 *
 * Query params opcionais:
 *  - q: filtra por substring no titulo (case insensitive)
 *  - concluida: "true" | "false"
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const concluidaParam = searchParams.get("concluida");

  const acoes = await prisma.acaoPainel.findMany({
    where: {
      userId: session.userId,
      ...(q ? { titulo: { contains: q, mode: "insensitive" } } : {}),
      ...(concluidaParam === "true"
        ? { concluida: true }
        : concluidaParam === "false"
        ? { concluida: false }
        : {}),
    },
    orderBy: [{ concluida: "asc" }, { createdAt: "desc" }],
    include: { clienteVinculado: { select: { id: true, nome: true } } },
  });

  return NextResponse.json({ acoes, total: acoes.length });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as CriarAcaoInput;
  if (!body.titulo?.trim()) {
    return NextResponse.json({ error: "titulo obrigatorio" }, { status: 400 });
  }
  if (!["local", "ms-todo", "priority-matrix"].includes(body.origem)) {
    return NextResponse.json({ error: "origem invalida" }, { status: 400 });
  }

  // Origens externas criadas pelo painel entram com pendingSync=true:
  // o cowork (Chrome MCP) aplica na fonte na proxima sincronia e preenche externoId.
  const precisaSync = body.origem !== "local";

  const acao = await prisma.acaoPainel.create({
    data: {
      userId: session.userId,
      titulo: body.titulo.trim(),
      origem: body.origem,
      vence: body.vence ? new Date(body.vence) : null,
      importante: body.importante ?? false,
      noMeuDia: body.noMeuDia ?? false,
      quadrante: body.quadrante ?? null,
      projetoPm: body.projetoPm ?? null,
      pendingSync: precisaSync,
      syncOp: precisaSync ? "create" : null,
    },
  });

  return NextResponse.json(acao, { status: 201 });
}
