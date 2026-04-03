import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vendedor = searchParams.get("vendedor");
  const relatorioId = searchParams.get("relatorioId");

  const acoes = await prisma.acao.findMany({
    where: {
      ...(vendedor ? { vendedor } : {}),
      ...(relatorioId ? { relatorioId } : {}),
    },
    orderBy: [{ relatorioId: "desc" }, { numero: "asc" }],
    include: {
      relatorio: { select: { periodo: true, periodoInicio: true } },
    },
  });

  return NextResponse.json(acoes);
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, concluida } = await req.json();

    if (!id) {
      return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
    }

    const acao = await prisma.acao.update({
      where: { id },
      data: {
        concluida: Boolean(concluida),
        concluidaEm: concluida ? new Date() : null,
      },
    });

    return NextResponse.json(acao);
  } catch (err) {
    console.error("[acoes PATCH]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
