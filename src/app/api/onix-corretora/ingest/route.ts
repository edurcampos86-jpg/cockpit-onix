import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function calcScore(conversas: number, semResposta: number, reunioes: number, perdidos: number): number {
  if (conversas === 0) return 0;
  const taxaResposta = (conversas - semResposta) / conversas;
  const taxaReuniao = Math.min((reunioes / conversas) * 5, 1);
  const taxaPerdidos = Math.min((perdidos / conversas) * 5, 1);
  return Math.max(0, Math.min(100, Math.round(
    taxaResposta * 50 + taxaReuniao * 30 + (1 - taxaPerdidos) * 20
  )));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const apiSecret = body.api_secret;
    if (!apiSecret || apiSecret !== process.env.DASHBOARD_API_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      vendedor, periodo, periodoInicio, periodoFim, dataExecucao,
      conversasAnalisadas, pdfPath, secao0, secao1, secao2, secao3, secao4, secao5,
      scriptSemana, termometro, retomada, acoes, metricas,
    } = body;

    if (!vendedor || !periodo || !secao1) {
      return NextResponse.json({ error: "Campos obrigatorios ausentes" }, { status: 400 });
    }

    const conv = Number(conversasAnalisadas);
    const semResp = Number(metricas?.conversasSemResposta ?? 0);
    const reun = Number(metricas?.reunioesAgendadas ?? 0);
    const perd = Number(metricas?.leadsPerdidos ?? 0);
    const score = calcScore(conv, semResp, reun, perd);

    const relatorio = await prisma.relatorio.create({
      data: {
        vendedor, periodo,
        periodoInicio: new Date(periodoInicio),
        periodoFim: new Date(periodoFim),
        dataExecucao: new Date(dataExecucao || Date.now()),
        conversasAnalisadas: conv,
        pdfPath: pdfPath || null,
        secao0: secao0 || null,
        scriptSemana: scriptSemana || null,
        termometro: termometro || null,
        retomada: retomada || null,
        secao1, secao2, secao3, secao4, secao5,
        acoes: acoes?.length
          ? { create: acoes.map((a: { numero: number; titulo: string; descricao: string }) => ({
              vendedor, numero: a.numero, titulo: a.titulo, descricao: a.descricao,
            })) }
          : undefined,
        metricas: metricas
          ? { create: { vendedor, periodo, conversasAnalisadas: conv,
              conversasSemResposta: semResp, reunioesAgendadas: reun, leadsPerdidos: perd, score } }
          : undefined,
      },
      include: { acoes: true, metricas: true },
    });

    return NextResponse.json({ ok: true, id: relatorio.id, score }, { status: 201 });
  } catch (err) {
    console.error("[ingest] Erro:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
