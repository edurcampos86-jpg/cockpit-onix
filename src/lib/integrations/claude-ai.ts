/**
 * Claude AI Integration — Substituto do Manus
 * Usa a API da Anthropic para sugestão de roteiros, análise de performance e automações inteligentes.
 */

import { getIntegrationConfig } from "./config";

const API_URL = "https://api.anthropic.com/v1/messages";

async function getApiKey(): Promise<string> {
  const config = await getIntegrationConfig();
  const key = config.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY não configurada.");
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
      model: "claude-sonnet-4-20250514",
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
// FUNCIONALIDADES
// ============================================

const SYSTEM_PROMPT = `Você é um assistente especializado em marketing digital para Eduardo Campos, Mentor de Blindagem Patrimonial com 19 anos de experiência no mercado financeiro.

Contexto:
- Opera 4 empresas: Onix Capital (investimentos), Corretora de Seguros (seguro de vida resgatável e consórcio de plano de saúde), Onix Imobiliária e Meu Sucesso Patrimonial (SaaS em pré-lançamento).
- Público-alvo: "Roberto", 38-52 anos, alta renda, médico ou profissional liberal em Salvador/BA.
- Comportamento: voyeur no Instagram — assiste sem curtir, salva posts, dark social (WhatsApp).
- Big Idea: "Construir patrimônio é fácil. Protegê-lo é uma arte."
- 5 quadros fixos semanais: Pergunta da Semana (Seg/Stories), Onix na Prática (Ter/Reels), Patrimônio sem Mimimi (Qua/Reels), Alerta Patrimonial (Qui/Reels), Sábado de Bastidores (Sáb/Stories).
- Framework CTA v3: Explícito (máx 1/dia), Implícito, Por Identificação.

Responda sempre em Português Brasileiro, de forma prática e direta.`;

/**
 * Gera sugestão de roteiro para um quadro fixo específico
 */
export async function suggestScript(category: string, topic?: string): Promise<string> {
  const categoryMap: Record<string, string> = {
    pergunta_semana: "Pergunta da Semana (Stories de segunda — pergunta provocativa sobre proteção patrimonial)",
    onix_pratica: "Onix na Prática (Reels de terça — caso real anonimizado de cliente)",
    patrimonio_mimimi: "Patrimônio sem Mimimi (Reels de quarta — derrubar mito financeiro com dados)",
    alerta_patrimonial: "Alerta Patrimonial (Reels de quinta — alerta urgente sobre risco patrimonial)",
    sabado_bastidores: "Sábado de Bastidores (Stories de sábado — momento pessoal/humanização)",
  };

  const quadro = categoryMap[category] || category;
  const topicHint = topic ? `\n\nTema sugerido: ${topic}` : "";

  const response = await chat(
    [
      {
        role: "user",
        content: `Crie um roteiro completo para o quadro "${quadro}".${topicHint}

Estrutura obrigatória:
1. **GANCHO** (frase de abertura — segura ou perde o espectador em 3 segundos)
2. **DESENVOLVIMENTO** (conteúdo principal, 2-3 parágrafos)
3. **CTA** (chamada para ação — sugira o tipo: Explícito, Implícito ou Por Identificação)
4. **TEMPO ESTIMADO** do vídeo
5. **HASHTAGS** sugeridas (5-8)

Lembre-se: o público são médicos e profissionais liberais de alta renda em Salvador. Tom: autoridade + proximidade, sem ser vendedor.`,
      },
    ],
    SYSTEM_PROMPT
  );

  return response;
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
  const response = await chat(
    [
      {
        role: "user",
        content: `Analise a performance da seguinte semana de conteúdo e sugira melhorias:

${JSON.stringify(postsData, null, 2)}

Forneça:
1. Diagnóstico geral da semana (pontos fortes e fracos)
2. Análise da distribuição de CTAs (regra 80/20)
3. Sugestões específicas de melhoria para cada post
4. Recomendação de temas para a próxima semana
5. Oportunidades de cross-sell baseadas no conteúdo`,
      },
    ],
    SYSTEM_PROMPT
  );

  return response;
}

/**
 * Gera ideias de conteúdo baseadas em um tema
 */
export async function generateContentIdeas(theme: string, count: number = 5): Promise<string> {
  const response = await chat(
    [
      {
        role: "user",
        content: `Gere ${count} ideias de conteúdo para Instagram sobre o tema: "${theme}"

Para cada ideia, forneça:
- Título do post
- Quadro fixo recomendado (Pergunta da Semana, Onix na Prática, Patrimônio sem Mimimi, Alerta Patrimonial ou Sábado de Bastidores)
- Formato (Reels ou Stories)
- Gancho (frase de abertura)
- Tipo de CTA recomendado

Foque em temas que ressoem com médicos e profissionais liberais de alta renda preocupados com proteção patrimonial.`,
      },
    ],
    SYSTEM_PROMPT
  );

  return response;
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
  const response = await chat(
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
1. Primeira mensagem de abordagem (personalizada)
2. Perguntas de qualificação (2-3 perguntas)
3. Estratégia de follow-up (se não responder)
4. Oportunidade de cross-sell
5. Tom recomendado para a conversa`,
      },
    ],
    SYSTEM_PROMPT
  );

  return response;
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
(2-3 parágrafos com os pontos principais da reunião)

## INSIGHTS PARA CONTEÚDO
Para cada insight, sugira:
- Tema para post/Reels
- Quadro fixo recomendado
- Gancho (frase de abertura)
- Por que esse tema ressoaria com médicos e profissionais liberais

## ITENS DE AÇÃO
- Lista de ações concretas extraídas da reunião

## OPORTUNIDADES DE CROSS-SELL
- Produtos que poderiam ser oferecidos com base no contexto da reunião`,
      },
    ],
    SYSTEM_PROMPT
  );

  // Extrair seções
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
 * Gera roteiro personalizado baseado nos insights de uma reunião
 */
export async function suggestScriptFromMeeting(
  category: string,
  meetingInsights: string,
  meetingTitle: string
): Promise<string> {
  const categoryMap: Record<string, string> = {
    pergunta_semana: "Pergunta da Semana (Stories de segunda)",
    onix_pratica: "Onix na Prática (Reels de terça — caso real)",
    patrimonio_mimimi: "Patrimônio sem Mimimi (Reels de quarta)",
    alerta_patrimonial: "Alerta Patrimonial (Reels de quinta)",
    sabado_bastidores: "Sábado de Bastidores (Stories de sábado)",
  };

  const response = await chat(
    [
      {
        role: "user",
        content: `Com base nos insights da reunião "${meetingTitle}", crie um roteiro para o quadro "${categoryMap[category] || category}".

**Insights da reunião:**
${meetingInsights}

Crie o roteiro usando as dores reais e situações discutidas na reunião (anonimizando nomes e dados sensíveis).

Estrutura:
1. **GANCHO** — frase de abertura baseada em uma dor/situação real discutida na reunião
2. **DESENVOLVIMENTO** — conteúdo educativo usando o caso como exemplo
3. **CTA** — com tipo (Explícito/Implícito/Identificação)
4. **TEMPO ESTIMADO**
5. **HASHTAGS** (5-8)
6. **REFERÊNCIA** — qual parte da reunião inspirou este roteiro`,
      },
    ],
    SYSTEM_PROMPT
  );

  return response;
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
