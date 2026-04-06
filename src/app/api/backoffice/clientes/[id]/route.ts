import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cliente = await prisma.clienteBackoffice.findUnique({
      where: { id },
      include: {
        interacoes: { orderBy: { data: "desc" }, take: 50 },
        metas: { orderBy: { criadoEm: "desc" } },
        eventosVida: { orderBy: { data: "asc" } },
      },
    });
    if (!cliente) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(cliente);
  } catch (error) {
    console.error("Erro ao buscar cliente:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    // Campos permitidos para atualização
    const data: Record<string, unknown> = {};
    const allowed = [
      "nome",
      "email",
      "telefone",
      "aniversario",
      "profissao",
      "nicho",
      "perfilEmocional",
      "observacoes",
      "classificacao",
      "classificacaoManual",
      "receitaAnual",
      "ultimoContatoAt",
      "proximoContatoAt",
    ];
    for (const key of allowed) {
      if (key in body) {
        if (
          (key === "aniversario" || key === "ultimoContatoAt" || key === "proximoContatoAt") &&
          body[key]
        ) {
          data[key] = new Date(body[key]);
        } else {
          data[key] = body[key];
        }
      }
    }

    // Se mudou classificação manualmente, trava recálculo automático
    if ("classificacao" in body && !("classificacaoManual" in body)) {
      data.classificacaoManual = true;
    }

    const cliente = await prisma.clienteBackoffice.update({ where: { id }, data });
    return NextResponse.json(cliente);
  } catch (error) {
    console.error("Erro ao atualizar cliente:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.clienteBackoffice.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao remover cliente:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
