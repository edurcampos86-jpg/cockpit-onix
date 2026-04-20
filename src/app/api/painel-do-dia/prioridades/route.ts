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

  // Upsert respeita o unique (userId, data, posicao): substitui o texto se ja existir.
  const prioridade = await prisma.painelPrioridade.upsert({
    where: {
      userId_data_posicao: {
        userId: session.userId,
        data: body.data,
        posicao: body.posicao,
      },
    },
    update: { texto: body.texto.trim() },
    create: {
      userId: session.userId,
      data: body.data,
      posicao: body.posicao,
      texto: body.texto.trim(),
    },
  });

  return NextResponse.json(prioridade, { status: 201 });
}
