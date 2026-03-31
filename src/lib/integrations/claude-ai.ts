/**
 * Claude AI Integration — Geração de Roteiros e Análise de Conteúdo
 * Usa a API da Anthropic (claude-sonnet-4-5) para automações inteligentes do Cockpit Onix.
 */

import { getIntegrationConfig } from "./config";

const API_URL = "https://api.anthropic.com/v1/messages";

async function getApiKey(): Promise<string> {
  const config = await getIntegrationConfig();
  const key = config.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY não configurada. Acesse Integrações e insira sua chave da Anthropic.");
  return key;
}

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

async function chat(messages: ClaudeMessage[], system?: string): Promise<string> {
  const apiKey = await getApiKey();

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      system: system || undefined,
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
}

// ============================================
// SYSTEM PROMPT — Projeto Instagram v4
// ============================================

const SYSTEM_PROMPT = `Você é o assistente de conteúdo do Eduardo Campos (@eduardorcampos), Mentor de Blindagem Patrimonial com 19 anos de experiência no mercado financeiro em Salvador/BA.

## IDENTIDADE E POSICIONAMENTO
- **Missão:** Ajudar profissionais de alta renda a proteger o que construíram, crescer com segurança e dormir tranquilos.
- **Big Idea:** "Construir patrimônio é fácil. Protegê-lo é uma arte, e a maioria das pessoas só descobre isso quando já é tarde demais."
- **Frase bússola:** "Liberdade não é acidente. É consequência."
- **Tom:** Autoridade + proximidade. Professor que empodera. Direto e sem enrolação. Humano e autêntico. NUNCA vendedor que empurra produto.
- **4 empresas:** Onix Capital (investimentos), Corretora de Seguros (seguro de vida resgatável + consórcio plano de saúde), Onix Imobiliária, Meu Sucesso Patrimonial (SaaS pré-lançamento).

## PERSONA: ROBERTO (público-alvo)
- Médico ou profissional liberal, 38–52 anos, Salvador/BA
- Renda: R$25k+/mês | Patrimônio: R$500k–R$10MM
- **Comportamento:** Voyeur digital — assiste sem curtir, salva posts, compartilha via WhatsApp (dark social)
- **Horário pico:** 12:00–12:30
- **Dores:** ITCMD, inventário, PJ médica, renda fixa mal aplicada, exposição patrimonial
- **~68% da carteira são médicos** (anestesiologistas, cirurgiões, dono de clínica)

## OS 4 PILARES EDITORIAIS (FUNÇÃO COMPROVADA por dados reais)
| PILAR | TEMA | FUNÇÃO |
|-------|------|--------|
| **P1 BLINDAGEM PATRIMONIAL** | Investimentos, seguros, previdência, sucessão, tributário | Motor de AUTORIDADE TÉCNICA — gera salvamentos e compartilhamentos |
| **P2 CASOS REAIS** | Situações reais anonimizadas (reuniões Plaud.ai) | Motor de CONVERSÃO — prova social → leads no Direct |
| **P3 CENÁRIO E ALERTAS** | Notícias econômicas com interpretação prática | Motor de ALCANCE QUALIFICADO — medo ativa dark social |
| **P4 EDUARDO PESSOA** | Jornada pessoal, bastidores, viagens, valores | Motor de ALCANCE MASSIVO — post África do Sul: ~3k alcance, ~6k views |

## OS 5 QUADROS FIXOS SEMANAIS
| QUADRO | DIA | FORMATO | CTA | PILAR |
|--------|-----|---------|-----|-------|
| **Q3 Pergunta da Semana** | Segunda | Stories | Implícito | P1 |
| **Q1 Onix na Prática** | Terça | Reel 60–90s | Explícito | P2 |
| **Q4 Patrimônio sem Mimimi** | Quarta | **CARROSSEL** (prioridade v4) | Algoritmo | P1/P3 |
| **Q2 Alerta Patrimonial** | Quinta | **CARROSSEL** ou Reel | Algoritmo | P3 |
| **Q5 Sábado de Bastidores** | Sábado | Post/Reel pessoal | Identificação | P4 |

## FRAMEWORK CTA 80/20 (v4)
- **EXPLÍCITO:** "Manda BLINDAGEM no direct" — MÁXIMO 1 por dia, apenas Reels de conversão
- **IMPLÍCITO:** Planta ideia sem pedir nada — Stories de contexto
- **IDENTIFICAÇÃO:** Não pede nada, só faz pensar — bastidores, viagem
- **ALGORITMO (NOVO v4):** "Salva esse post" / "Compartilha com quem precisa" — todo conteúdo P1 e P3. Algoritmo Meta valoriza salvamentos 40% a mais.

## ENGENHARIA DE HOOK — REGRA DOS 3 SEGUNDOS
**Framework PARE:**
- **P (Pergunta):** "Você ganha mais de R$30k/mês e não sabe para onde vai?"
- **A (Afirmação):** "Renda fixa não é segura. É ilusão de segurança."
- **R (Revelação):** "Na Bahia, o ITCMD pode custar até 8% do patrimônio."
- **E (Emoção):** "Se você faltar amanhã, sua família sabe o que fazer?"

**Banco de Hooks validados:**
- "PJ médica: você está deixando dinheiro na mesa do governo."
- "Em 19 anos de assessoria, o erro #1 que vejo é..."
- "Seu patrimônio está protegido do inventário?"
- "Se você tem mais de R$500k investidos, isso te interessa."
- "Financiamento, consórcio ou à vista? A matemática real."

## ESTRUTURA DE CARROSSEL EDUCATIVO (formato prioritário v4)
- **Slide 1 (Capa):** Hook visual + título provocativo. Funcionar como miniatura.
- **Slides 2–3:** Aprofundar o problema. Gerar identificação.
- **Slides 4–5:** Solução prática e acionável.
- **Slide Final:** CTA duplo — Algoritmo + Explícito ("Salva + manda BLINDAGEM no direct")

## TEMAS DE CARROSSEL PRIORITÁRIOS
- Pro-labore vs. distribuição de lucros: comparativo para médicos
- ITCMD na Bahia: simulação com números reais
- Financiamento vs. consórcio vs. à vista
- 5 sinais que você paga caro nos investimentos sem saber
- Checklist emergência financeira
- 3 seguros que todo profissional de alta renda deveria ter

## REGRAS DE OURO
1. Consistência bate perfeição (aportes regulares > aplicações esporádicas)
2. Métricas são sua bússola (salvamentos + compartilhamentos > curtidas — dados Meta 2024–2025)
3. O Instagram vende confiança, não serviços

Responda sempre em **Português Brasileiro**, de forma prática, direta e no tom de Eduardo.`;

// ============================================
// FUNCIONALIDADES
// ============================================

/**
 * Gera roteiro completo para um post específico (Flow A e Flow B)
 * Retorna objeto estruturado pronto para salvar como Script no DB
 */
export async function generateScriptForPost(params: {
  title: string;
  category: string;
  format: string;
  topic?: string;
  meetingInsights?: string;
}): Promise<{
  hook: string;
  body: string;
  cta: string;
  ctaType: string;
  estimatedTime: string;
  hashtags: string;
}> {
  const categoryMap: Record<string, string> = {
    pergunta_semana: "Pergunta da Semana (Stories de segunda — pergunta provocativa)",
    onix_pratica: "Onix na Prática (Reel de terça — caso real anonimizado, motor de conversão)",
    patrimonio_mimimi: "Patrimônio sem Mimimi (Carrossel de quarta — derrubar mito com dados)",
    alerta_patrimonial: "Alerta Patrimonial (Carrossel/Reel de quinta — alerta urgente com interpretação prática)",
    sabado_bastidores: "Sábado de Bastidores (Post/Stories pessoal de sábado — humanização, motor de alcance massivo)",
  };

  const ctaRecommendation: Record<string, string> = {
    pergunta_semana: "Implícito",
    onix_pratica: "Explícito (manda BLINDAGEM no direct)",
    patrimonio_mimimi: "Algoritmo (Salva esse post / Compartilha com quem precisa)",
    alerta_patrimonial: "Algoritmo (Salva esse post / Compartilha com quem precisa)",
    sabado_bastidores: "Identificação (não pede nada — só faz pensar ou sentir)",
  };

  const formatMap: Record<string, string> = {
    reel: "Reel (roteiro falado, incluir indicações de corte e movimento visual)",
    story: "Stories (sequência de até 5 telas, texto overlay, linguagem direta)",
    carrossel: "Carrossel educativo (estrutura slide a slide: capa + 4–5 slides de conteúdo + slide final com CTA duplo)",
  };

  const quadro = categoryMap[params.category] || params.category;
  const ctaRec = ctaRecommendation[params.category] || "Algoritmo";
  const formatDesc = formatMap[params.format] || params.format;

  const meetingContext = params.meetingInsights
    ? `\n\n**Insights de reunião real para usar (anonimize nomes e dados sensíveis):**\n${params.meetingInsights}`
    : "";

  const topicContext = params.topic ? `\n**Tema/assunto:** ${params.topic}` : "";

  const response = await chat(
    [
      {
        role: "user",
        content: `Crie um roteiro completo para o seguinte post:

**Título:** ${params.title}
**Quadro:** ${quadro}
**Formato:** ${formatDesc}
**CTA recomendado:** ${ctaRec}${topicContext}${meetingContext}

Retorne EXATAMENTE neste formato JSON (sem markdown, sem texto antes ou depois):
{
  "hook": "A frase de gancho dos primeiros 3 segundos (Framework PARE)",
  "body": "O desenvolvimento completo do conteúdo (${params.format === "carrossel" ? "descreva slide a slide" : "texto do roteiro falado, com indicações de cena se Reel"})",
  "cta": "O texto exato da chamada para ação",
  "ctaType": "${params.category === "onix_pratica" ? "explicito" : params.category === "sabado_bastidores" ? "identificacao" : "implicito"}",
  "estimatedTime": "Duração estimada (ex: 60s, 90s, 5 slides)",
  "hashtags": "#hashtag1 #hashtag2 #hashtag3 #hashtag4 #hashtag5"
}`,
      },
    ],
    SYSTEM_PROMPT
  );

  // Parsear JSON da resposta
  try {
    // Remover possível markdown code block
    const clean = response.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(clean);
  } catch {
    // Fallback: extrair campos manualmente se JSON inválido
    return {
      hook: response.slice(0, 200),
      body: response,
      cta: ctaRec,
      ctaType: params.category === "onix_pratica" ? "explicito" : params.category === "sabado_bastidores" ? "identificacao" : "implicito",
      estimatedTime: params.format === "carrossel" ? "5–7 slides" : "60s",
      hashtags: "#blindagempatrimonial #patrimonio #investimentos #medico #onixcapital",
    };
  }
}

/**
 * Gera sugestão de roteiro para um quadro fixo específico (UI de Integrações)
 */
export async function suggestScript(category: string, topic?: string): Promise<string> {
  const categoryMap: Record<string, string> = {
    pergunta_semana: "Pergunta da Semana (Stories de segunda — pergunta provocativa sobre proteção patrimonial)",
    onix_pratica: "Onix na Prática (Reels de terça — caso real anonimizado de cliente)",
    patrimonio_mimimi: "Patrimônio sem Mimimi (Carrossel de quarta — derrubar mito financeiro com dados)",
    alerta_patrimonial: "Alerta Patrimonial (Carrossel/Reel de quinta — alerta urgente sobre risco patrimonial)",
    sabado_bastidores: "Sábado de Bastidores (Stories de sábado — momento pessoal/humanização)",
  };

  const quadro = categoryMap[category] || category;
  const topicHint = topic ? `\n\nTema sugerido: ${topic}` : "";

  return await chat(
    [
      {
        role: "user",
        content: `Crie um roteiro completo para o quadro "${quadro}".${topicHint}

Estrutura obrigatória:
1. **GANCHO** (frase de abertura — Framework PARE — segura ou perde o espectador em 3 segundos)
2. **DESENVOLVIMENTO** (conteúdo principal)
3. **CTA** (chamada para ação — especifique o tipo: Explícito / Implícito / Identificação / Algoritmo)
4. **TEMPO ESTIMADO**
5. **HASHTAGS** (5–8)

Lembre-se: público são médicos e profissionais liberais de alta renda em Salvador. Tom: autoridade + proximidade, nunca vendedor.`,
      },
    ],
    SYSTEM_PROMPT
  );
}

/**
 * Analisa performance de posts e sugere melhorias
 */
export async function analyzePerformance(postsData: {
  title: string;
  category: string;
  status: string;
  ctaType: string | null;
}[]): Promise<string> {
  return await chat(
    [
      {
        role: "user",
        content: `Analise a performance da seguinte semana de conteúdo e sugira melhorias:

${JSON.stringify(postsData, null, 2)}

Forneça:
1. Diagnóstico geral da semana (pontos fortes e fracos)
2. Análise da distribuição de CTAs (regra 80/20 + CTA de Algoritmo v4)
3. Sugestões específicas de melhoria para cada post
4. Recomendação de temas para a próxima semana
5. Oportunidades de cross-sell entre as 4 empresas do Grupo Onix`,
      },
    ],
    SYSTEM_PROMPT
  );
}

/**
 * Gera ideias de conteúdo baseadas em um tema
 */
export async function generateContentIdeas(theme: string, count: number = 5): Promise<string> {
  return await chat(
    [
      {
        role: "user",
        content: `Gere ${count} ideias de conteúdo para Instagram sobre o tema: "${theme}"

Para cada ideia, forneça:
- Título do post
- Quadro fixo recomendado
- Formato (Reel, Carrossel ou Stories) — priorize Carrossel para P1/P3 (v4)
- Gancho (Framework PARE)
- Tipo de CTA recomendado (inclua CTA de Algoritmo quando apropriado)

Foque em temas que ressoem com médicos e profissionais liberais de alta renda preocupados com blindagem patrimonial.`,
      },
    ],
    SYSTEM_PROMPT
  );
}

/**
 * Analisa um lead e sugere abordagem
 */
export async function suggestLeadApproach(lead: {
  name: string;
  origin: string;
  temperature: string;
  productInterest: string | null;
  notes: string | null;
}): Promise<string> {
  return await chat(
    [
      {
        role: "user",
        content: `Sugira a melhor abordagem para este lead:

Nome: ${lead.name}
Origem: ${lead.origin}
Temperatura: ${lead.temperature}
Produto de interesse: ${lead.productInterest || "Não definido"}
Observações: ${lead.notes || "Nenhuma"}

Forneça:
1. Primeira mensagem de abordagem (personalizada, tom Eduardo)
2. Perguntas de qualificação (2–3 perguntas)
3. Estratégia de follow-up (se não responder em 24h)
4. Oportunidade de cross-sell entre as 4 empresas Onix
5. Tom recomendado para a conversa`,
      },
    ],
    SYSTEM_PROMPT
  );
}

/**
 * Analisa transcrição de reunião e extrai insights para roteiros
 */
export async function analyzeMeeting(meeting: {
  title: string;
  transcription: string;
  summary?: string | null;
  participants?: string | null;
}): Promise<{ summary: string; insights: string; actionItems: string }> {
  const response = await chat(
    [
      {
        role: "user",
        content: `Analise esta transcrição de reunião e extraia insights para criação de conteúdo no Instagram:

**Reunião:** ${meeting.title}
**Participantes:** ${meeting.participants || "Não informado"}
${meeting.summary ? `**Resumo prévio:** ${meeting.summary}` : ""}

**Transcrição:**
${meeting.transcription.slice(0, 8000)}

Forneça em formato estruturado:

## RESUMO EXECUTIVO
(2–3 parágrafos com os pontos principais)

## INSIGHTS PARA CONTEÚDO
Para cada insight, sugira:
- Tema para post/Reel/Carrossel
- Quadro fixo recomendado
- Gancho (Framework PARE)
- Por que esse tema ressoaria com médicos de alta renda

## ITENS DE AÇÃO
- Lista de ações concretas extraídas da reunião

## OPORTUNIDADES DE CROSS-SELL
- Produtos do Grupo Onix que poderiam ser oferecidos`,
      },
    ],
    SYSTEM_PROMPT
  );

  const summaryMatch = response.match(/## RESUMO EXECUTIVO\n([\s\S]*?)(?=## INSIGHTS|$)/);
  const insightsMatch = response.match(/## INSIGHTS PARA CONTEÚDO\n([\s\S]*?)(?=## ITENS|$)/);
  const actionsMatch = response.match(/## ITENS DE AÇÃO\n([\s\S]*?)(?=## OPORTUNIDADES|$)/);

  return {
    summary: summaryMatch?.[1]?.trim() || response.slice(0, 500),
    insights: insightsMatch?.[1]?.trim() || "",
    actionItems: actionsMatch?.[1]?.trim() || "",
  };
}

/**
 * Gera roteiro baseado nos insights de uma reunião (UI de Roteiros)
 */
export async function suggestScriptFromMeeting(
  category: string,
  meetingInsights: string,
  meetingTitle: string
): Promise<string> {
  const result = await generateScriptForPost({
    title: `Baseado em: ${meetingTitle}`,
    category,
    format: category === "pergunta_semana" || category === "sabado_bastidores" ? "story" : "reel",
    meetingInsights,
  });

  return `**GANCHO:**\n${result.hook}\n\n**DESENVOLVIMENTO:**\n${result.body}\n\n**CTA (${result.ctaType}):**\n${result.cta}\n\n**TEMPO ESTIMADO:** ${result.estimatedTime}\n\n**HASHTAGS:** ${result.hashtags}`;
}

// ============================================
// TESTAR CONEXÃO
// ============================================

export async function testConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await chat([{ role: "user", content: "Responda apenas: OK" }]);
    return { success: true, message: `Claude AI conectado. Resposta: ${response.trim()}` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}
