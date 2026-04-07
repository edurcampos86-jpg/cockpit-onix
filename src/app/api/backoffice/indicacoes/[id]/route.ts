import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    for (const k of [
      "nomeIndicado",
      "emailIndicado",
      "telefoneIndicado",
      "status",
      "notas",
      "agradecimentoEnviado",
    ] as const) {
      if (k in body) data[k] = body[k];
    }
    if ("valorEstimado" in body) {
      data.valorEstimado = body.valorEstimado != null ? Number(body.valorEstimado) : null;
    }
    const indicacao = await prisma.indicacao.update({ where: { id }, data });
    return NextResponse.json(indicacao);
  } catch (error) {
    console.error("Erro atualizar indicação:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.indicacao.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro remover indicação:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
