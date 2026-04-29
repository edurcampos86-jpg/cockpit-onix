import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeEqual } from "@/lib/security/timing-safe";
import { ingestRelatorioSchema } from "@/lib/security/schemas";

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
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const expected = process.env.DASHBOARD_API_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "ingest desabilitado" }, { status: 503 });
  }
  const candidate =
    typeof (raw as { api_secret?: unknown })?.api_secret === "string"
      ? (raw as { api_secret: string }).api_secret
      : "";
  if (!safeEqual(candidate, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = ingestRelatorioSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "payload inválido", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const data = parsed.data;

  try {
    const conv = data.conversasAnalisadas;
    const semResp = data.metricas?.conversasSemResposta ?? 0;
    const reun = data.metricas?.reunioesAgendadas ?? 0;
    const perd = data.metricas?.leadsPerdidos ?? 0;
    const score = calcScore(conv, semResp, reun, perd);

    const relatorio = await prisma.relatorio.create({
      data: {
        vendedor: data.vendedor,
        periodo: data.periodo,
        periodoInicio: new Date(data.periodoInicio),
        periodoFim: new Date(data.periodoFim),
        dataExecucao: new Date(data.dataExecucao || Date.now()),
        conversasAnalisadas: conv,
        pdfPath: data.pdfPath ?? null,
        secao0: data.secao0 ?? null,
        scriptSemana: data.scriptSemana ?? null,
        termometro: data.termometro ?? null,
        retomada: data.retomada ?? null,
        secao1: data.secao1,
        secao2: data.secao2,
        secao3: data.secao3,
        secao4: data.secao4,
        secao5: data.secao5,
        acoes: data.acoes?.length
          ? {
              create: data.acoes.map((a) => ({
                vendedor: data.vendedor,
                numero: a.numero,
                titulo: a.titulo,
                descricao: a.descricao,
              })),
            }
          : undefined,
        metricas: data.metricas
          ? {
              create: {
                vendedor: data.vendedor,
                periodo: data.periodo,
                conversasAnalisadas: conv,
                conversasSemResposta: semResp,
                reunioesAgendadas: reun,
                leadsPerdidos: perd,
                score,
              },
            }
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
