const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT_COLETIVO = `Voce e um especialista em desenvolvimento comercial e lideranca de equipes de vendas. Sua funcao e analisar os relatorios individuais de coaching de uma equipe e gerar um relatorio consolidado de PADROES COLETIVOS.

REGRAS FUNDAMENTAIS:
- Este relatorio e para o gestor (Eduardo Campos) usar na reuniao coletiva de terca-feira
- NUNCA cite nomes individuais nos blocos de padroes positivos e padroes de risco. Use "um assessor", "o time", "ambos" etc.
- Nos blocos de score individual e cumprimento, pode citar nomes pois sao dados objetivos
- Nunca use travessoes (—) nem emojis
- Analise apenas os relatorios de Thiago Vergal e Rose Oliveira (Eduardo Campos e o gestor, nao e analisado)
- Foque em PADROES que se repetem entre os assessores, nao em casos isolados

Gere a resposta EXATAMENTE neste formato de 7 blocos, sem adicionar texto antes ou depois:

=== METRICAS_CONSOLIDADAS ===
conversas_analisadas: [soma total]
sem_resposta: [soma total]
reunioes_agendadas: [soma total]
leads_perdidos: [soma total]
variacao_conversas: [+X ou -X vs semana anterior, ou "primeiro relatorio"]
variacao_sem_resposta: [+X ou -X vs semana anterior]
variacao_reunioes: [+X ou -X vs semana anterior]
variacao_leads: [+X ou -X vs semana anterior]

=== SCORE_INDIVIDUAL ===
[Para cada assessor, uma linha:]
Thiago Vergal: [score numerico 0-100] | variacao: [+X ou -X vs anterior, ou "primeiro"]
Rose Oliveira: [score numerico 0-100] | variacao: [+X ou -X vs anterior, ou "primeiro"]

=== TERMOMETRO_TIME ===
Abertura e primeiro contato: [proporcao verde/amarelo/vermelho entre os 2] | [resultado final: verde/amarelo/vermelho]
Escuta e resposta as objecoes: [proporcao] | [resultado final]
Follow-up e retomada: [proporcao] | [resultado final]
Clareza na apresentacao do produto: [proporcao] | [resultado final]
Conducao ao fechamento: [proporcao] | [resultado final]

=== OBJECOES_RECORRENTES ===
[Liste de 2 a 4 objecoes que apareceram nos relatorios de ambos (ou que sao tao relevantes que merecem destaque mesmo aparecendo em apenas um). Para cada uma:]

OBJECAO 1: [titulo da objecao entre aspas]
Frequencia: [em quantos relatorios apareceu, ex: "nos 2 relatorios" ou "em 1 de 2 relatorios"]
Analise: [2 a 3 linhas explicando o padrao e sugerindo resposta coletiva]

OBJECAO 2: [titulo]
Frequencia: [frequencia]
Analise: [analise]

[etc.]

=== PADROES_POSITIVOS ===
[3 praticas positivas identificadas nos relatorios que merecem ser replicadas. SEM citar nomes.]

POSITIVO 1: [titulo]
Descricao: [2 a 3 linhas explicando a pratica e por que funciona]

POSITIVO 2: [titulo]
Descricao: [descricao]

POSITIVO 3: [titulo]
Descricao: [descricao]

=== PADROES_RISCO ===
[2 a 3 padroes de risco identificados — pontos de melhoria que aparecem em ambos os relatorios. SEM citar nomes.]

RISCO 1: [titulo]
Frequencia: [em quantos assessores apareceu]
Descricao: [2 a 3 linhas explicando o risco e o impacto]

RISCO 2: [titulo]
Frequencia: [frequencia]
Descricao: [descricao]

=== SCRIPT_COLETIVO ===
Objecao alvo: [a objecao mais recorrente ou critica da semana]
Script: [frase exata para o time usar, adaptavel aos dois perfis]
Por que funciona para o time: [2 a 3 linhas explicando por que funciona para os perfis de Rose (PAT 118) e Thiago (PAT 22)]

=== PLANO_COLETIVO ===
ACAO 1: [titulo]
O que fazer: [descricao]
Como fazer: [passos praticos]
Meta: [resultado mensuravel]

ACAO 2: [titulo]
O que fazer: [descricao]
Como fazer: [passos praticos]
Meta: [resultado mensuravel]

ACAO 3: [titulo]
O que fazer: [descricao]
Como fazer: [passos praticos]
Meta: [resultado mensuravel]`;

export async function gerarRelatorioColetivo(params: {
  periodo: string;
  relatorios: Array<{
    vendedor: string;
    secao1: string;
    secao2: string;
    secao3: string;
    secao4: string;
    secao5: string;
    termometro: string | null;
    scriptSemana: string | null;
    metricas: {
      conversasAnalisadas: number;
      conversasSemResposta: number;
      reunioesAgendadas: number;
      leadsPerdidos: number;
      score: number;
    } | null;
  }>;
  relatoriosAnteriores?: Array<{
    vendedor: string;
    metricas: {
      conversasAnalisadas: number;
      conversasSemResposta: number;
      reunioesAgendadas: number;
      leadsPerdidos: number;
      score: number;
    } | null;
  }>;
  cumprimentoAcoes?: Array<{
    vendedor: string;
    total: number;
    concluidas: number;
  }>;
}): Promise<string> {
  const { periodo, relatorios, relatoriosAnteriores = [], cumprimentoAcoes = [] } = params;

  const { getConfig } = await import("@/lib/config-db");
  const apiKey = await getConfig("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY nao configurada");
  }

  // Build individual report summaries
  const relatoriosTexto = relatorios
    .filter(r => r.vendedor !== "Eduardo Campos")
    .map(r => {
      const metricas = r.metricas
        ? `Conversas: ${r.metricas.conversasAnalisadas}, Sem resposta: ${r.metricas.conversasSemResposta}, Reunioes: ${r.metricas.reunioesAgendadas}, Leads perdidos: ${r.metricas.leadsPerdidos}, Score: ${r.metricas.score}`
        : "Metricas nao disponiveis";

      return `--- RELATORIO: ${r.vendedor} ---
METRICAS: ${metricas}
TERMOMETRO: ${r.termometro || "Nao disponivel"}
SECAO 1 (Positivos): ${r.secao1}
SECAO 2 (Melhorias): ${r.secao2}
SECAO 3 (Objecoes): ${r.secao3}
SECAO 4 (Voz do Cliente): ${r.secao4}
SECAO 5 (Plano de Acao): ${r.secao5}
SCRIPT DA SEMANA: ${r.scriptSemana || "Nao disponivel"}`;
    })
    .join("\n\n");

  // Build previous period comparison
  const anteriorTexto = relatoriosAnteriores.length > 0
    ? "\n\nRELATORIOS DA SEMANA ANTERIOR (para comparativo):\n" +
      relatoriosAnteriores
        .filter(r => r.vendedor !== "Eduardo Campos")
        .map(r => {
          const m = r.metricas;
          return m
            ? `${r.vendedor}: Conversas ${m.conversasAnalisadas}, Sem resposta ${m.conversasSemResposta}, Reunioes ${m.reunioesAgendadas}, Leads ${m.leadsPerdidos}, Score ${m.score}`
            : `${r.vendedor}: Metricas nao disponiveis`;
        })
        .join("\n")
    : "\n\n(Primeiro relatorio coletivo — sem comparativo anterior)";

  // Build action compliance
  const cumprimentoTexto = cumprimentoAcoes.length > 0
    ? "\n\nCUMPRIMENTO DAS ACOES DA SEMANA ANTERIOR:\n" +
      cumprimentoAcoes
        .filter(c => c.vendedor !== "Eduardo Campos")
        .map(c => `${c.vendedor}: ${c.concluidas}/${c.total} acoes concluidas`)
        .join("\n")
    : "";

  const userMessage = `PERIODO: ${periodo}
ASSESSORES ANALISADOS: Thiago Vergal e Rose Oliveira (Eduardo Campos e o gestor, nao incluir na analise)
${anteriorTexto}${cumprimentoTexto}

RELATORIOS INDIVIDUAIS DA SEMANA:

${relatoriosTexto}

Analise os relatorios acima e gere o relatorio de PADROES COLETIVOS no formato especificado. Lembre-se: este relatorio e para o gestor usar na reuniao de equipe, entao NAO cite nomes nos padroes positivos e de risco.`;

  const res = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 6000,
      system: SYSTEM_PROMPT_COLETIVO,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Claude API error: ${res.status} ${res.statusText} — ${errorText}`);
  }

  const data = await res.json();
  const content = data.content?.[0];

  if (!content || content.type !== "text") {
    throw new Error("Claude API retornou resposta inesperada");
  }

  return content.text as string;
}

// Parse blocos (same pattern as claude-analisar.ts)
export function parseBlocosColetivo(texto: string): Record<string, string> {
  const blocos: Record<string, string> = {};
  const regex = /===\s*([A-Z0-9_ ]+?)\s*===\s*\n([\s\S]*?)(?====\s*[A-Z0-9_ ]+?\s*===|$)/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(texto)) !== null) {
    const chave = match[1].trim();
    const valor = match[2].trim();
    blocos[chave] = valor;
  }

  return blocos;
}
