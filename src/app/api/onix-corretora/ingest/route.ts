import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const apiSecret = body.api_secret;
    if (!apiSecret || apiSecret !== process.env.DASHBOARD_API_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      vendedor,
      periodo,
      periodoInicio,
      periodoFim,
      dataExecucao,
      conversasAnalisadas,
      pdfPath,
      secao1,
      secao2,
      secao3,
      secao4,
      secao5,
      acoes,
      metricas,
    } = body;

    if (!vendedor || !periodo || !secao1) {
      return NextResponse.json({ error: "Campos obrigatorios ausentes" }, { status: 400 });
    }

    const relatorio = await prisma.relatorio.create({
      data: {
        vendedor,
        periodo,
        periodoInicio: new Date(periodoInicio),
        periodoFim: new Date(periodoFim),
        dataExecucao: new Date(dataExecucao || Date.now()),
        conversasAnalisadas: Number(conversasAnalisadas),
        pdfPath: pdfPath || null,
        secao1,
        secao2,
        secao3,
        secao4,
        secao5,
        acoes: acoes?.length
          ? {
              create: acoes.map((a: { numero: number; titulo: string; descricao: string }) => ({
                vendedor,
                numero: a.numero,
                titulo: a.titulo,
                descricao: a.descricao,
              })),
            }
          : undefined,
        metricas: metricas
          ? {
              create: {
                vendedor,
                periodo,
                conversasAnalisadas: Number(conversasAnalisadas),
                conversasSemResposta: Number(metricas.conversasSemResposta ?? 0),
                reunioesAgendadas: Number(metricas.reunioesAgendadas ?? 0),
                leadsPerdidos: Number(metricas.leadsPerdidos ?? 0),
              },
            }
          : undefined,
      },
      include: { acoes: true, metricas: true },
    });

    return NextResponse.json({ ok: true, id: relatorio.id }, { status: 201 });
  } catch (err) {
    console.error("[ingest] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
