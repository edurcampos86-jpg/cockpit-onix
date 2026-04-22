import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { agendarFocusBlock, removerFocusBlock } from "@/lib/painel-do-dia/focus-blocks";

/**
 * Sug 2 — Deep Work blocks.
 *
 * POST: cria um bloco de foco no calendário externo (Google se OAuth
 * ativo, senão enfileira cowork request para Outlook). Escolhe a
 * próxima janela livre de tempoEstimadoMin dentro da golden window.
 *
 * DELETE: remove o bloco criado.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const prioridade = await prisma.painelPrioridade.findFirst({
    where: { id, userId: session.userId },
  });
  if (!prioridade) {
    return NextResponse.json({ error: "nao encontrada" }, { status: 404 });
  }
  if (!prioridade.tempoEstimadoMin) {
    return NextResponse.json(
      { error: "defina o tempo estimado antes de bloquear foco" },
      { status: 400 }
    );
  }
  if (prioridade.focusBlockEventId) {
    return NextResponse.json(
      { error: "ja existe um bloco de foco para essa prioridade" },
      { status: 409 }
    );
  }

  try {
    const resultado = await agendarFocusBlock({
      userId: session.userId,
      prioridadeId: id,
      titulo: `🎯 Foco — ${prioridade.texto}`,
      duracaoMin: prioridade.tempoEstimadoMin,
      data: prioridade.data,
    });
    return NextResponse.json(resultado, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "falha ao agendar foco" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const prioridade = await prisma.painelPrioridade.findFirst({
    where: { id, userId: session.userId },
  });
  if (!prioridade) {
    return NextResponse.json({ error: "nao encontrada" }, { status: 404 });
  }
  if (!prioridade.focusBlockEventId) {
    return NextResponse.json({ ok: true, nada: true });
  }

  await removerFocusBlock({
    userId: session.userId,
    prioridadeId: id,
    provider: prioridade.focusBlockProvider as "google" | "ms-calendar" | "pending-cowork",
    eventoId: prioridade.focusBlockEventId,
  });

  return NextResponse.json({ ok: true });
}
