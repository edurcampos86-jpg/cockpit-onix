import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    data?: string;
    posicao?: number;
    texto?: string;
    tempoEstimadoMin?: number | null;
  };

  if (!body.data || !body.posicao || !body.texto?.trim()) {
    return NextResponse.json(
      { error: "data, posicao e texto sao obrigatorios" },
      { status: 400 }
    );
  }
  if (![1, 2, 3].includes(body.posicao)) {
    return NextResponse.json({ error: "posicao deve ser 1, 2 ou 3" }, { status: 400 });
  }

  // Se o usuario edita o texto da sugestao, ela deixa de ser sugestao.
  const tempo = body.tempoEstimadoMin ?? null;

  const prioridade = await prisma.painelPrioridade.upsert({
    where: {
      userId_data_posicao: {
        userId: session.userId,
        data: body.data,
        posicao: body.posicao,
      },
    },
    update: {
      texto: body.texto.trim(),
      tempoEstimadoMin: tempo,
      sugeridaPorBoot: false,
      bootMotivo: null,
    },
    create: {
      userId: session.userId,
      data: body.data,
      posicao: body.posicao,
      texto: body.texto.trim(),
      tempoEstimadoMin: tempo,
    },
  });

  return NextResponse.json(prioridade, { status: 201 });
}
