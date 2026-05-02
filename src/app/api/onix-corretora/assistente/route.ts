import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale/pt-BR";

export const maxDuration = 120;

const SYSTEM_PROMPT_BASE = `Voce e o Assistente de Analise Comercial da Onix Corretora, especialista em desenvolvimento de equipes de vendas com profundo conhecimento do perfil PAT de cada membro.

EQUIPE:
- Eduardo Campos (PAT 76 — Promocional de Acao Livre): Entusiasmante, focado em pessoas e relacionamentos, lideranca natural. Sugestoes devem ser praticas e imediatas.
- Rose Oliveira (PAT 118 — Intro-Diligente Livre): Cuidadosa, estruturada, precisa de reconhecimento antes de feedback. NUNCA usar urgencia ou comparar com colegas.
- Thiago Vergal (PAT 22 — Projetista Criativo): Objetivo, tecnico, orientado a resultados e metricas. Linguagem direta com dados.

SISTEMA DE RELATORIOS:
Pipeline semanal: busca conversas CRM Datacrazy, analise Claude AI, PDF, Slack.
Relatorio tem 10 blocos: METRICAS, RETOMADA, TERMOMETRO, SECAO 0 (Lente PAT), SECAO 1-5, SCRIPT_SEMANA.
O ecossistema web exibe historico, comparativos, checklist de acoes e pagina de impressao.

[CONTEXT_HERE]

Voce pode:
- Analisar tendencias e padroes nos dados do time
- Interpretar metricas e comparar entre semanas
- Sugerir melhorias nos prompts de analise (formato blocos ===)
- Calibrar abordagem por perfil PAT
- Propor ajustes no sistema de acompanhamento

Responda em portugues, de forma direta. Use markdown para estruturar respostas longas. Para sugestoes de prompt, use blocos de codigo.`;

export async function POST(req: NextRequest) {
  const apiKey = await getConfig("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response("ANTHROPIC_API_KEY nao configurada.", { status: 500 });
  }

  const body = await req.json();
  const messages: Array<{ role: "user" | "assistant"; content: string }> =
    body.messages ?? [];

  // Build context from DB
  let contextSummary = "";
  try {
    const relatorios = await prisma.relatorio.findMany({
      orderBy: { periodoInicio: "desc" },
      take: 6,
      include: {
        acoes: { select: { id: true, concluida: true } },
        metricas: true,
      },
    });

    const totalPendentes = await prisma.acao.count({
      where: { concluida: false },
    });

    if (relatorios.length > 0) {
      const linhas = relatorios.map((r) => {
        const acoesConcluidas = r.acoes.filter((a) => a.concluida).length;
        const acoesTotal = r.acoes.length;
        const score = r.metricas?.score ?? 0;
        const periodoFmt = format(r.periodoInicio, "dd/MM", { locale: ptBR }) +
          " a " +
          format(r.periodoFim, "dd/MM/yyyy", { locale: ptBR });
        return `${r.vendedor} (${periodoFmt}): ${r.conversasAnalisadas} conversas, score ${score}, ${acoesConcluidas}/${acoesTotal} acoes concluidas`;
      });

      contextSummary = `DADOS RECENTES:\n${linhas.join("\n")}\nTOTAL ACOES PENDENTES: ${totalPendentes}`;
    } else {
      contextSummary = "DADOS RECENTES: Nenhum relatorio gerado ainda.";
    }
  } catch {
    contextSummary = "DADOS RECENTES: Nao foi possivel carregar dados do banco.";
  }

  const systemPrompt = SYSTEM_PROMPT_BASE.replace("[CONTEXT_HERE]", contextSummary);

  const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      stream: true,
    }),
  });

  if (!claudeResponse.ok) {
    const errorText = await claudeResponse.text();
    return new Response(`Claude API error: ${claudeResponse.status} — ${errorText}`, {
      status: 500,
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = claudeResponse.body!.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            if (!data) continue;

            try {
              const parsed = JSON.parse(data);
              if (
                parsed.type === "content_block_delta" &&
                parsed.delta?.type === "text_delta" &&
                parsed.delta?.text
              ) {
                controller.enqueue(
                  new TextEncoder().encode(parsed.delta.text)
                );
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
