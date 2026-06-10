import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  agendarFocusBlock,
  removerFocusBlock,
  FocusBlockError,
} from "@/lib/painel-do-dia/focus-blocks";

/**
 * POST /api/painel-do-dia/prioridades/[id]/focus-block
 * Agenda um bloco de deep work no Google Calendar do usuário para esta
 * prioridade (janela livre nas golden windows, duração = tempoEstimadoMin).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existente = await prisma.painelPrioridade.findFirst({
    where: { id, userId: session.userId },
  });
  if (!existente) {
    return NextResponse.json({ error: "nao encontrada" }, { status: 404 });
  }

  if (existente.focusBlockEventId) {
    return NextResponse.json(
      { error: "Esta prioridade já tem um bloco de foco. Remova-o antes de agendar outro." },
      { status: 409 },
    );
  }
  if (!existente.tempoEstimadoMin || existente.tempoEstimadoMin <= 0) {
    return NextResponse.json(
      { error: "Defina o tempo estimado (min) da prioridade antes de bloquear foco." },
      { status: 400 },
    );
  }

  try {
    const resultado = await agendarFocusBlock({
      userId: session.userId,
      prioridadeId: existente.id,
      titulo: existente.texto,
      duracaoMin: existente.tempoEstimadoMin,
      data: existente.data,
    });
    return NextResponse.json(resultado);
  } catch (error) {
    if (error instanceof FocusBlockError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[focus-block] Erro ao agendar:", error);
    return NextResponse.json(
      { error: "Falha ao agendar bloco de foco no Google Calendar." },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/painel-do-dia/prioridades/[id]/focus-block
 * Remove o evento do Google Calendar e limpa os campos focusBlock*.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existente = await prisma.painelPrioridade.findFirst({
    where: { id, userId: session.userId },
  });
  if (!existente) {
    return NextResponse.json({ error: "nao encontrada" }, { status: 404 });
  }

  if (!existente.focusBlockEventId) {
    // Idempotente: nada a remover
    return NextResponse.json({ ok: true });
  }

  try {
    await removerFocusBlock({
      userId: session.userId,
      prioridadeId: existente.id,
      provider: existente.focusBlockProvider,
      eventoId: existente.focusBlockEventId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof FocusBlockError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[focus-block] Erro ao remover:", error);
    return NextResponse.json(
      { error: "Falha ao remover o bloco de foco do Google Calendar." },
      { status: 500 },
    );
  }
}
