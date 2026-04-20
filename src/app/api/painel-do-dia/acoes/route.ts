import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { CriarAcaoInput } from "@/lib/painel-do-dia/types";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as CriarAcaoInput;
  if (!body.titulo?.trim()) {
    return NextResponse.json({ error: "titulo obrigatorio" }, { status: 400 });
  }
  if (!["cockpit", "ms-todo", "priority-matrix"].includes(body.origem)) {
    return NextResponse.json({ error: "origem invalida" }, { status: 400 });
  }

  // Origens externas criadas pelo painel entram com pendingSync=true:
  // o cowork (Chrome MCP) aplica na fonte na proxima sincronia e preenche externoId.
  const precisaSync = body.origem !== "cockpit";

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
