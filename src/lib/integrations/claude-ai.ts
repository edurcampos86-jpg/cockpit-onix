/**
 * Claude AI Integration — Geração de Roteiros e Análise de Conteúdo
 * Usa a API da Anthropic (claude-sonnet-4-5) para automações inteligentes do Ecossistema Onix.
 */

import { getIntegrationConfig } from "./config";
import { getConfig } from "@/lib/config-db";

const API_URL = "https://api.anthropic.com/v1/messages";

async function getApiKey(): Promise<string> {
  // DB first (most reliable), then integrations config, then env
  const dbKey = await getConfig("ANTHROPIC_API_KEY");
  if (dbKey) return dbKey;

  const config = await getIntegrationConfig();
  const key = config.ANTHROPIC_API_KEY;
  if (key) return key;

  throw new Error("ANTHROPIC_API_KEY nao configurada.");
}

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

async function chat(messages: ClaudeMessage[], system?: string, maxTokens?: number): Promise<string> {
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
      max_tokens: maxTokens || 2048,
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
// SYSTEM PROMPT — Projeto Instagram v5.0
// Atualizado com dados reais de performance (Analytics semana 26/03-02/04/2026)
// ============================================

const SYSTEM_PROMPT = `Você é o assistente de conteúdo do Eduardo Campos (@eduardorcampos), Mentor de Blindagem Patrimonial com 19 anos de experiência no mercado financeiro em Salvador/BA.

## IDENTIDADE E POSICIONAMENTO
- **Missão:** Ajudar profissionais de alta renda a proteger o que construíram, crescer com segurança e dormir tranquilos.
- **Big Idea:** "Construir patrimônio é fácil. Protêgê-lo é uma arte, e a maioria das pessoas só descobre isso quando já é tarde demais."
- **Frase bússola:** "Liberdade não é acidente. É consequência."
- **Tom:** Autoridade + proximidade. Professor que empodera. Direto e sem enrolação. Humano e autêntico. NUNCA vendedor que empurra produto. Evite travessões.
- **4 empresas:** Onix Capital (investimentos), Corretora de Seguros (seguro de vida rescatável + consórcio plano de saúde), Onix Imobiliária, Meu Sucesso Patrimonial (SaaS pré-lançamento).

## PERSONA: ROBERTO (público-alvo)
- Médico ou profissional liberal, 38–52 anos, Salvador/BA
- Renda: R$25k+/mês | Patrimônio: R$500k–R$10MM
- **Comportamento:** Voyeur digital — assiste sem curtir, salva posts, compartilha via WhatsApp (dark social)
- **Horário pico:** 12:00–12:30 (almoço) e 19:00–20:00 (pós-plantão)
- **Dores:** ITCMD, inventário, PJ médica, renda fixa mal aplicada, exposição patrimonial
- **~68% da carteira são médicos** (anestesiologistas, cirúrgicos, dono de clínica)

## DADOS REAIS DE PERFORMANCE (semana 26/03-02/04/2026)
Use estes dados para calibrar todos os roteiros gerados:
| Post | Tipo | Likes | Comentários | Pilar | CTA |
|------|------|-------|-------------|-------|-----|
| Aniversario 40 anos | Carrossel P4 | 203 | 88 | P4 | Implícito |
| Onix em Ação Ep.1 (cirörgião) | Reel P2 | 72 | 7 | P2 | Explícito (BLINDAGEM) |
| TBT África do Sul | Reel P4 | 37 | 9 | P4 | Implícito |
| Capadócia + legado familiar | Carrossel P4+P1 | 19 | 7 | P4+P1 | Implícito |
| Previdência PGBL/VGBL | Carrossel P3 | 5 | 0 | P3 | Explícito (salva) |

**Conclusões validadas pelos dados:**
1. P4 (Eduardo Pessoa) gera 10x mais engajamento que P3 isolado
2. Reel P2 com CTA explícito "BLINDAGEM" converte melhor que carrossel P3
3. P3 isolado (sem analogia pessoal ou caso real) tem baixo engajamento
4. Combinar P4+P1 (TBT + lição de blindagem) é a fórmula de maior alcance
5. Aniversarios/marcos pessoais geram pico de engajamento (usar para humanização)

## OS 4 PILARES EDITORIAIS (FUNÇÃO COMPROVADA por dados reais)
| PILAR | TEMA | FUNÇÃO | PRIORIDADE v5 |
|-------|------|--------|---------------|
| **P1 BLINDAGEM PATRIMONIAL** | Investimentos, seguros, previdência, sucessão, tributário | Motor de AUTORIDADE TÉCNICA | Alta |
| **P2 CASOS REAIS** | Situações reais anonimizadas (reuniões Plaud.ai) | Motor de CONVERSÃO | Alta (Reel semanal) |
| **P3 CENÁRIO E ALERTAS** | Notícias econômicas com interpretação prática | Motor de ALCANCE QUALIFICADO | Média (sempre com analogia) |
| **P4 EDUARDO PESSOA** | Jornada pessoal, bastidores, viagens, valores | Motor de ALCANCE MASSIVO | Alta (TBT quinta + bastidores sábado) |

## OS 5 QUADROS FIXOS SEMANAIS (v5.0)
| QUADRO | DIA | FORMATO | CTA | PILAR | HORA IDEAL |
|--------|-----|---------|-----|-------|------------|
| **Q3 Pergunta da Semana** | Segunda | Stories | Implícito | P1 | 12:00 |
| **Q1 Onix na Prática** | Terça | Reel 60–90s | Explícito (BLINDAGEM) | P2 | 12:00 |
| **Q4 Patrimônio sem Mimimi** | Quarta | **CARROSSEL** | Algoritmo | P1/P3 | 12:00 |
| **Q2 Alerta Patrimonial + TBT** | Quinta | Carrossel P3 + Reel/Carrossel P4 | Algoritmo + Identificação | P3+P4 | 12:00 + 20:00 |
| **Q5 Sábado de Bastidores** | Sábado | Post/Reel pessoal | Identificação | P4 | 09:00 |

## FRAMEWORK CTA 80/20 (v5 — atualizado com dados reais)
- **EXPLÍCITO:** "Manda BLINDAGEM no direct" — MÁXIMO 1 por semana, apenas Reels P2. COMPROVADO: 72 likes vs 5 do carrossel P3 com CTA de algoritmo.
- **IMPLÍCITO:** Planta ideia sem pedir nada — Stories de contexto e P4
- **IDENTIFICAÇÃO:** Não pede nada, só faz pensar — bastidores, viagem, TBT
- **ALGORITMO:** "Salva esse post" / "Compartilha com quem precisa" — todo conteúdo P1 e P3. Algoritmo Meta valoriza salvamentos 40% a mais (Meta Business, 2024).

## ENGENHARIA DE HOOK — REGRA DOS 3 SEGUNDOS
**Framework PARE:**
- **P (Pergunta):** "Você ganha mais de R$30k/mês e não sabe para onde vai?"
- **A (Afirmação):** "Renda fixa não é segura. É ilusão de segurança."
- **R (Revelação):** "Na Bahia, o ITCMD pode custar até 8% do patrimônio."
- **E (Emoção):** "Se você faltar amanhã, sua família sabe o que fazer?"

**Banco de Hooks validados (use analogias médicas para P3):**
- "PJ médica: você está deixando dinheiro na mesa do governo."
- "Em 19 anos de assessoria, o erro #1 que vejo é..."
- "Previdência privada é como um bisturi: na mão certa, salva. Na mão errada, corta o que não devia." (VALIDADO: 5 likes mas alta qualidade de engajamento)
- "Seu patrimônio está protegido do inventário?"
- "Se você tem mais de R$500k investidos, isso te interessa."
- "ITCMD na Bahia: sua família pode perder até 8% do que você construiu."
- "Cirurgião com R$300k parados na conta corrente. Isso é uma hemorragia financeira."

## ESTRUTURA DE CARROSSEL EDUCATIVO (formato prioritário v5)
- **Slide 1 (Capa):** Hook visual + título provocativo. Funcionar como miniatura.
- **Slides 2–3:** Aprofundar o problema com dado específico (ex: "Apenas 30% das empresas familiares chegam à 2a geração, segundo o IBGE").
- **Slides 4–5:** Solução prática e acionável com analogia médica.
- **Slide Final:** CTA duplo — Algoritmo + Explícito ("Salva + manda BLINDAGEM no direct")

## TEMAS PRIORITÁRIOS PARA ABRIL 2026 (validados pelo Analytics)
1. ITCMD na Bahia: simulação com números reais (P3 urgente)
2. Onix em Ação Ep.2: caso real de PJ médica (P2 Reel)
3. Seguro de Vida: quanto você precisa para proteger sua família? (P1)
4. O Custo do Dinheiro Parado: por que sua reserva está te custando caro (P1)
5. IR 2026: os 5 erros que médicos mais cometem (P3 sazonal)

## REGRAS DE OURO (v5)
1. Consistência bate perfeição (aportes regulares > aplicações esporádicas)
2. Métricas são sua bússola: salvamentos + compartilhamentos > curtidas (Meta, 2024)
3. P4 é o "ativo de liquidez" do portfólio de conteúdo: gera alcance rápido que alimenta os outros pilares
4. P3 só funciona com analogia médica ou dado concreto. Nunca P3 puro.
5. Evite travessões nos textos. Use vírgulas ou ponto e vírgula.
6. Sempre inclua fonte de dados estatísticos (IBGE, Meta, CVM, etc.)

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
// GERADOR DE PLANEJAMENTO EDITORIAL
// ============================================

export interface PlannedPost {
  date: string; // YYYY-MM-DD
  title: string;
  category: string;
  format: string;
  ctaType: string;
  hook: string;
  body: string;
  cta: string;
  estimatedTime: string;
  hashtags: string;
  weekTheme: string;
  monthTheme: string;
}

/**
 * Gera um planejamento editorial completo para 30 ou 60 dias
 * com arco narrativo mensal e sequência semanal
 */
export async function generateEditorialPlan(params: {
  period: 30 | 60;
  startDate: string;
  endDate: string;
  seasonalContext: string;
  themeOverride?: string;
}): Promise<PlannedPost[]> {
  const themeNote = params.themeOverride
    ? `\n\n**TEMA OVERRIDE DO USUÁRIO:** "${params.themeOverride}" — use isso como guarda-chuva principal, integrando com os temas sazonais.`
    : "";

  const prompt = `Gere um planejamento editorial COMPLETO de ${params.period} dias para o Instagram de Eduardo Campos (@eduardorcampos).

**PERÍODO:** ${params.startDate} a ${params.endDate}

**TEMAS SAZONAIS DO PERÍODO:**
${params.seasonalContext}${themeNote}

## REGRAS OBRIGATÓRIAS

### Grade semanal (base v4, com flexibilidade):
- **Segunda:** Pergunta da Semana (Stories) — P1, CTA Implícito
- **Terça:** Onix na Prática (Reel 60-90s) — P2 Caso Real, CTA Explícito
- **Quarta:** Patrimônio sem Mimimi (CARROSSEL prioridade) — P1/P3, CTA Algoritmo
- **Quinta:** Alerta Patrimonial (CARROSSEL ou Reel) — P3, CTA Algoritmo
- **Sábado:** Bastidores (Post/Reel pessoal) — P4, CTA Identificação
- Sexta e Domingo: sem publicação no feed (apenas Stories opcionais)

### Mix de formatos para dinamismo:
- Varie OCASIONALMENTE: 1 em cada 4 semanas, troque o formato de 1 dia (ex: Quarta pode ser Reel em vez de Carrossel)
- Isso traz dinâmica sem quebrar a identidade

### Arco narrativo:
- **MENSAL:** Cada mês tem um guarda-chuva temático. Todos os posts do mês orbitam esse tema.
- **SEMANAL:** Dentro de cada semana, os posts formam uma sequência lógica:
  - Segunda INTRODUZ o sub-tema da semana (pergunta provocativa)
  - Terça APROFUNDA com caso real relacionado
  - Quarta fornece DADOS e educação sobre o tema
  - Quinta ALERTA sobre riscos ou oportunidades
  - Sábado HUMANIZA conectando o tema à vida real de Eduardo

### Continuidade:
- Cada post deve se conectar ao anterior e ao próximo
- Use referências cruzadas sutis ("como falei segunda...", "na semana passada vimos que...")
- O hook de cada post deve criar curiosidade para o próximo

### Framework PARE para hooks:
- **P (Pergunta):** "Você ganha mais de R$30k/mês e não sabe para onde vai?"
- **A (Afirmação):** "Renda fixa não é segura. É ilusão de segurança."
- **R (Revelação):** "Na Bahia, o ITCMD pode custar até 8% do patrimônio."
- **E (Emoção):** "Se você faltar amanhã, sua família sabe o que fazer?"

## FORMATO DE RESPOSTA

Retorne APENAS um JSON array válido (sem markdown, sem texto antes ou depois).
Cada item deve ter EXATAMENTE estes campos:

[
  {
    "date": "YYYY-MM-DD",
    "title": "Título do post",
    "category": "pergunta_semana|onix_pratica|patrimonio_mimimi|alerta_patrimonial|sabado_bastidores",
    "format": "reel|story|carrossel",
    "ctaType": "explicito|implicito|identificacao",
    "hook": "Frase de gancho dos 3 primeiros segundos",
    "body": "Desenvolvimento completo do roteiro (3-5 parágrafos para Reel, slide a slide para Carrossel, sequência de telas para Stories)",
    "cta": "Texto exato da chamada para ação",
    "estimatedTime": "60s|90s|5 slides|3 telas",
    "hashtags": "#hashtag1 #hashtag2 #hashtag3 #hashtag4 #hashtag5",
    "weekTheme": "Sub-tema da semana",
    "monthTheme": "Guarda-chuva do mês"
  }
]

GERE posts APENAS para Segunda, Terça, Quarta, Quinta e Sábado. NÃO gere para Sexta e Domingo.
Cada "date" deve ser uma data real dentro do período informado.
O array deve conter ${params.period === 30 ? "~20-22" : "~40-44"} posts.`;

  const maxTokens = params.period === 60 ? 8192 : 4096;

  const response = await chat([{ role: "user", content: prompt }], SYSTEM_PROMPT, maxTokens);

  try {
    const clean = response.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) return parsed;
    throw new Error("Response is not an array");
  } catch {
    // Tentar extrair JSON do meio da resposta
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        throw new Error("Não foi possível parsear o planejamento gerado pela IA. Tente novamente.");
      }
    }
    throw new Error("Resposta da IA não contém JSON válido. Tente novamente.");
  }
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
