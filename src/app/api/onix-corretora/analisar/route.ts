import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  VENDEDORES_CONFIG,
  fetchConversas,
  fetchMensagens,
  filtrarConversasPorPeriodo,
  buildTranscricao,
} from "@/lib/datacrazy";
import {
  analisarVendedor,
  parseBlocos,
  parseMetricas,
  extrairAcoes,
} from "@/lib/claude-analisar";
import {
  buscarTranscricoesDoPeriodo,
  formatarTranscricaoParaAnalise,
} from "@/lib/plaud";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for Railway

export async function GET() {
  return NextResponse.json({
    status: "ok",
    hasDatacrazyToken: !!process.env.DATACRAZY_TOKEN,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasPlaudToken: !!process.env.PLAUD_TOKEN,
    plaudTokenLen: (process.env.PLAUD_TOKEN ?? "").length,
    plaudTokenV2: (process.env.PLAUD_TOKEN_V2 ?? "").length,
    plaudApiDomain: process.env.PLAUD_API_DOMAIN ?? "api.plaud.ai (padrão)",
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    vendedores,
    periodoInicio,
    periodoFim,
    periodo,
  }: {
    vendedores: string[];
    periodoInicio: string;
    periodoFim: string;
    periodo: string;
  } = body;

  const token = process.env.DATACRAZY_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "DATACRAZY_TOKEN nao configurado no ambiente." },
      { status: 500 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "ANTHROPIC_API_KEY nao configurada no ambiente." },
      { status: 500 }
    );
  }

  const inicio = new Date(periodoInicio);
  const fim = new Date(periodoFim);

  const relatoriosGerados: Array<{
    vendedor: string;
    id: string;
    periodo: string;
  }> = [];
  const errors: string[] = [];

  for (const vendedor of vendedores) {
    try {
      const config = VENDEDORES_CONFIG[vendedor];
      if (!config) {
        errors.push(`${vendedor}: configuracao nao encontrada`);
        continue;
      }

      // 1. Fetch conversations from all instances for this vendedor
      let todasConversas: any[] = [];
      for (const instanceId of config.instanceIds) {
        try {
          const conversas = await fetchConversas(instanceId, token);
          todasConversas = todasConversas.concat(conversas);
        } catch (err: any) {
          errors.push(
            `${vendedor} (instance ${instanceId}): ${err.message}`
          );
        }
      }

      // 2. Filter by excluded contacts
      if (config.excludeContacts.length > 0) {
        todasConversas = todasConversas.filter((c) => {
          const nomeContato =
            c.contact?.name ?? c.contact?.pushName ?? c.contactName ?? "";
          return !config.excludeContacts.some((excl) =>
            nomeContato.toLowerCase().includes(excl.toLowerCase())
          );
        });
      }

      // 3. Filter by period
      const conversasPeriodo = filtrarConversasPorPeriodo(
        todasConversas,
        inicio,
        fim
      );

      // 4. Get most recent 30 conversations
      const conversasRecentes = conversasPeriodo
        .sort((a, b) => {
          const da = new Date(
            a.lastMessageDate ?? a.updatedAt ?? 0
          ).getTime();
          const db = new Date(
            b.lastMessageDate ?? b.updatedAt ?? 0
          ).getTime();
          return db - da;
        })
        .slice(0, 30);

      // 5. Fetch messages for each conversation and build transcriptions
      const transcricoes: string[] = [];
      for (const conversa of conversasRecentes) {
        try {
          const mensagens = await fetchMensagens(conversa.id, token);

          // Skip conversations with fewer than 3 messages
          if (mensagens.length < 3) continue;

          const nomeContato =
            conversa.contact?.name ??
            conversa.contact?.pushName ??
            conversa.contactName ??
            "Contato";
          const transcricao = buildTranscricao(mensagens, nomeContato);
          transcricoes.push(transcricao);
        } catch (err: any) {
          // Log but continue with other conversations
          errors.push(
            `${vendedor} (conversa ${conversa.id}): ${err.message}`
          );
        }
      }

      if (transcricoes.length === 0) {
        errors.push(
          `${vendedor}: nenhuma conversa com mensagens suficientes no periodo`
        );
        continue;
      }

      // 6. Buscar transcrições do Plaud para o período (opcional — continua sem erro se token ausente)
      let transcricoesPlaud: string[] = [];
      const plaudToken = process.env.PLAUD_TOKEN;
      if (plaudToken) {
        try {
          const { transcricoes: plaudFiles, totalArquivos } = await buscarTranscricoesDoPeriodo({
            vendedor,
            inicio,
            fim,
            token: plaudToken,
          });
          transcricoesPlaud = plaudFiles.map(formatarTranscricaoParaAnalise);
          if (totalArquivos > 0) {
            console.log(`[Plaud] ${vendedor}: ${totalArquivos} arquivo(s) encontrado(s) no período`);
          }
        } catch (err: any) {
          // Plaud é opcional — apenas loga, não interrompe
          console.warn(`[Plaud] Falha ao buscar transcrições para ${vendedor}: ${err.message}`);
        }
      }

      // 7. Get last report's secao5 for retomada
      const ultimoRelatorio = await prisma.relatorio.findFirst({
        where: { vendedor },
        orderBy: { periodoInicio: "desc" },
        select: { secao5: true },
      });

      // 8. Call Claude for analysis (CRM + Plaud integrados)
      const textoAnalise = await analisarVendedor({
        vendedor,
        periodo,
        transcricoes,
        transcricoesPlaud,
        relatorioAnteriorSecao5: ultimoRelatorio?.secao5 ?? undefined,
      });

      // 9. Parse the response
      const blocos = parseBlocos(textoAnalise);
      const metricasRaw = blocos["METRICAS"] ?? "";
      const metricas = parseMetricas(metricasRaw);
      const secao5 = blocos["SECAO 5"] ?? blocos["SECAO5"] ?? "";
      const acoes = extrairAcoes(secao5);

      // Compute score from termometro
      const termometro = blocos["TERMOMETRO"] ?? "";
      const score = computeScore(termometro);

      // 10. Create Relatorio + Acoes + Metrica in DB
      const relatorio = await prisma.relatorio.create({
        data: {
          vendedor,
          periodo,
          periodoInicio: inicio,
          periodoFim: fim,
          dataExecucao: new Date(),
          conversasAnalisadas: metricas.conversasAnalisadas || transcricoes.length,
          secao0: blocos["SECAO 0"] ?? "",
          secao1: blocos["SECAO 1"] ?? "",
          secao2: blocos["SECAO 2"] ?? "",
          secao3: blocos["SECAO 3"] ?? "",
          secao4: blocos["SECAO 4"] ?? "",
          secao5: secao5,
          scriptSemana: blocos["SCRIPT_SEMANA"] ?? "",
          termometro: termometro,
          retomada: blocos["RETOMADA"] ?? "",
          acoes: {
            create: acoes.map((acao) => ({
              vendedor,
              numero: acao.numero,
              titulo: acao.titulo,
              descricao: acao.descricao,
            })),
          },
          metricas: {
            create: {
              vendedor,
              periodo,
              conversasAnalisadas:
                metricas.conversasAnalisadas || transcricoes.length,
              conversasSemResposta: metricas.mensagensSemResposta,
              reunioesAgendadas: metricas.reunioesAgendadas,
              score,
            },
          },
        },
      });

      relatoriosGerados.push({ vendedor, id: relatorio.id, periodo });
    } catch (err: any) {
      errors.push(`${vendedor}: ${err.message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    relatorios: relatoriosGerados,
    errors,
  });
}

function computeScore(termometro: string): number {
  if (!termometro) return 0;

  const linhas = termometro.split("\n").filter((l) => l.includes(":"));
  if (linhas.length === 0) return 0;

  let total = 0;
  let count = 0;

  for (const linha of linhas) {
    const lower = linha.toLowerCase();
    if (lower.includes("verde")) {
      total += 100;
      count++;
    } else if (lower.includes("amarelo")) {
      total += 60;
      count++;
    } else if (lower.includes("vermelho")) {
      total += 20;
      count++;
    }
  }

  return count > 0 ? Math.round(total / count) : 0;
}
