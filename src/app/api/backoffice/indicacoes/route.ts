import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const indicacoes = await prisma.indicacao.findMany({
      orderBy: { criadoEm: "desc" },
      include: { indicador: { select: { id: true, nome: true, classificacao: true } } },
    });
    return NextResponse.json({ indicacoes });
  } catch (error) {
    console.error("Erro listar indicações:", error);
    return NextResponse.json({ indicacoes: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.nomeIndicado) {
      return NextResponse.json({ error: "Nome do indicado é obrigatório" }, { status: 400 });
    }
    const indicacao = await prisma.indicacao.create({
      data: {
        indicadorId: body.indicadorId || null,
        nomeIndicado: String(body.nomeIndicado),
        emailIndicado: body.emailIndicado || null,
        telefoneIndicado: body.telefoneIndicado || null,
        valorEstimado: body.valorEstimado != null ? Number(body.valorEstimado) : null,
        notas: body.notas || null,
        status: body.status || "recebida",
      },
    });
    return NextResponse.json(indicacao);
  } catch (error) {
    console.error("Erro criar indicação:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
