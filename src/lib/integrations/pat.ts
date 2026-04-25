/**
 * Parser de PAT (Perfil de Adequação de Trabalho) da Criativa Humana via Claude AI.
 *
 * O PDF tem layout próprio com seções: Estrutural, Ícone Estrutural com Intensidade,
 * Tendências Estruturais, Risco, Ambiente, Competências Estratégicas, blocos narrativos
 * (Resumido, Detalhado, Sugestões, Gerencial).
 *
 * Esta lib chama Claude com PDF nativo + system prompt específico e retorna um JSON
 * estruturado pra alimentar o model `Pat` do Prisma.
 */

import { getIntegrationConfig } from "./config";
import { getConfig } from "@/lib/config-db";

const API_URL = "https://api.anthropic.com/v1/messages";

async function getApiKey(): Promise<string> {
  const dbKey = await getConfig("ANTHROPIC_API_KEY");
  if (dbKey) return dbKey;
  const config = await getIntegrationConfig();
  const key = config.ANTHROPIC_API_KEY;
  if (key) return key;
  throw new Error("ANTHROPIC_API_KEY não configurada.");
}

/* ──────────────────────────────────────────────────────────────────────────
   Tipos do JSON estruturado retornado
   ────────────────────────────────────────────────────────────────────────── */

export type PatExtraction = {
  dataPat: string | null; // ISO YYYY-MM-DD

  // Campos resumo
  perspectiva: "Baixa" | "Média" | "Alta" | null;
  ambienteCelula: number | null;
  ambienteNome: string | null;
  orientacao: "Social" | "Técnico" | null;
  aproveitamento: "Subaproveitado" | "Bem Aproveitado" | "Sobreaproveitado" | null;

  principaisCompetencias: string[];
  caracteristicas: string[];

  // Estruturais
  estrutural: {
    spread: number | null;
    spreadNivel: string | null;
    suporteEstrutural: number | null;
    suporteNivel: string | null;
    perspectivaValor: number | null;
    aproveitamento: string | null;
    cicloAlertaHoras: number | null;
  } | null;

  iconeEstrutural: {
    analiseAprendizagem: { tipo: string; valor: number; intensidade: string } | null;
    fonteMotivadora: { tipo: string; valor: number; intensidade: string } | null;
    estrategiaTempo: { tipo: string; valor: number; intensidade: string } | null;
    confortoAmbiente: { tipo: string; valor: number; intensidade: string } | null;
    orientacao: { tipo: string; valor: number; intensidade: string } | null;
    ponderacao: { tipo: string; valor: number; intensidade: string } | null;
  } | null;

  tendencias: {
    foco: number | null; // 0-100 (% pra Especialista)
    orientacao: number | null; // 0-100 (% pra Social)
    acao: number | null; // 0-100 (% pra Promovedor)
    conexao: number | null; // 0-100 (% pra Ponderada)
    relacionamento: number | null; // 0-100 (% pra Informal)
    regras: number | null; // 0-100 (% pra Cuidadoso)
    suportePressao: number | null; // 0-100
  } | null;

  risco: {
    estrutural: number | null;
    interno: number | null;
    atual: number | null;
    competencias: Array<{
      nome: string;
      potencial: number;
      esforco: number;
      comportamento: number;
    }>;
  } | null;

  competenciasEstrategicas: Array<{
    nome: string;
    potencial: number;
    esforco: number;
    comportamento: number;
  }>;

  ambiente: {
    celula: number | null;
    nome: string | null;
    desafios: number | null; // %
    habilidades: number | null; // %
    percepcaoPredominante: string | null;
    caracteristicas: string[]; // bullets
    orientacoes: string[]; // como falar com a pessoa
    recomendacoes: string[]; // o que pedir
  } | null;

  // Blocos narrativos (texto markdown)
  resumido: string | null;
  detalhado: string | null;
  sugestoes: string | null;
  gerencial: string | null;

  confianca: "alta" | "media" | "baixa";
  observacoes: string;
};

/* ──────────────────────────────────────────────────────────────────────────
   System prompt — instrui o Claude a extrair o PAT no formato esperado
   ────────────────────────────────────────────────────────────────────────── */

const SYSTEM_PROMPT = `Você é um extrator estruturado de relatórios PAT (Perfil de Adequação de Trabalho) da Criativa Humana.

O PDF anexado é um relatório PAT Executive de UMA pessoa. Você deve extrair os dados em JSON estruturado.

Regras:
- Datas: ISO YYYY-MM-DD.
- Números: numéricos puros (não strings).
- Se um campo não for encontrado com confiança razoável, retorne null (ou array vazio para arrays).
- Responda APENAS com o JSON, sem markdown, sem code fence, sem comentários.
- Para os blocos narrativos (resumido, detalhado, sugestoes, gerencial), preserve o texto em markdown:
  - Use ## para subseções (ex: "## Comunicação", "## Estratégia através do tempo")
  - Use - para bullets
  - Junte parágrafos com quebras de linha duplas
- "principaisCompetencias" são as 3 competências de topo do bloco "PRINCIPAIS COMPETÊNCIAS ESTRATÉGICAS".
- "caracteristicas" são as palavras-chave do bloco "CARACTERÍSTICAS EM PALAVRAS".
- "tendencias.foco" = % no lado Especialista (0 = generalista total, 100 = especialista total).
- "tendencias.orientacao" = % no lado Social (0 = técnico total, 100 = social total).
- "tendencias.acao" = % no lado Promovedor de Ações.
- "tendencias.conexao" = % no lado Ponderada (oposto a Rápida).
- "tendencias.relacionamento" = % no lado Informal.
- "tendencias.regras" = % no lado Cuidadoso (oposto a Casual).
- "tendencias.suportePressao" = % de Suporte à Pressão.
- "risco.competencias" = lista do gráfico "Competência: Competências de Risco" com os 3 valores (Potencial Estrutural azul, Esforço vermelho, Comportamento Expresso amarelo).
- "competenciasEstrategicas" = idem do gráfico "Competência: Competências Estratégicas" (17 itens em geral).
- "ambiente.celula" é o número de 1 a 25 (ex.: "07 - Crescimento" → 7).
- "confianca" = "alta" se todos os blocos críticos foram extraídos, "media" se algum precisou de inferência, "baixa" se houver dúvida real.
- "observacoes" = frase curta em português explicando ambiguidades, se houver.`;

const SCHEMA_HINT = `{
  "dataPat": "YYYY-MM-DD ou null",
  "perspectiva": "Baixa|Média|Alta|null",
  "ambienteCelula": "número 1-25 ou null",
  "ambienteNome": "ex: Crescimento|null",
  "orientacao": "Social|Técnico|null",
  "aproveitamento": "Subaproveitado|Bem Aproveitado|Sobreaproveitado|null",
  "principaisCompetencias": ["..."],
  "caracteristicas": ["..."],
  "estrutural": { "spread": 0, "spreadNivel": "Médio", "suporteEstrutural": 0, "suporteNivel": "Alto", "perspectivaValor": 0, "aproveitamento": "...", "cicloAlertaHoras": 0 },
  "iconeEstrutural": { "analiseAprendizagem": { "tipo": "...", "valor": 0, "intensidade": "..." }, "fonteMotivadora": {...}, "estrategiaTempo": {...}, "confortoAmbiente": {...}, "orientacao": {...}, "ponderacao": {...} },
  "tendencias": { "foco": 0, "orientacao": 0, "acao": 0, "conexao": 0, "relacionamento": 0, "regras": 0, "suportePressao": 0 },
  "risco": { "estrutural": 0, "interno": 0, "atual": 0, "competencias": [{"nome":"...","potencial":0,"esforco":0,"comportamento":0}] },
  "competenciasEstrategicas": [{"nome":"...","potencial":0,"esforco":0,"comportamento":0}],
  "ambiente": { "celula": 0, "nome": "...", "desafios": 0, "habilidades": 0, "percepcaoPredominante": "...", "caracteristicas": ["..."], "orientacoes": ["..."], "recomendacoes": ["..."] },
  "resumido": "...",
  "detalhado": "...",
  "sugestoes": "...",
  "gerencial": "...",
  "confianca": "alta|media|baixa",
  "observacoes": "..."
}`;

/* ──────────────────────────────────────────────────────────────────────────
   Função principal
   ────────────────────────────────────────────────────────────────────────── */

export async function extrairPat(pdfBase64: string): Promise<PatExtraction> {
  const apiKey = await getApiKey();

  const userText = `Extraia o PAT do PDF anexado e responda APENAS com o JSON no schema:\n\n${SCHEMA_HINT}`;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            { type: "text", text: userText },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error (${res.status}): ${text.slice(0, 400)}`);
  }

  const data = await res.json();
  const raw: string = data.content?.[0]?.text || "";

  // Robustez: extrair o primeiro objeto JSON da resposta (caso Claude prefixe algo)
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(
      `Resposta do Claude não contém JSON parseável: ${raw.slice(0, 200)}`,
    );
  }

  let parsed: PatExtraction;
  try {
    parsed = JSON.parse(match[0]) as PatExtraction;
  } catch (e) {
    throw new Error(
      `JSON do Claude inválido: ${(e as Error).message}\nRaw: ${match[0].slice(0, 300)}`,
    );
  }

  // Sanitização leve: garantir arrays
  parsed.principaisCompetencias = Array.isArray(parsed.principaisCompetencias)
    ? parsed.principaisCompetencias
    : [];
  parsed.caracteristicas = Array.isArray(parsed.caracteristicas)
    ? parsed.caracteristicas
    : [];
  parsed.competenciasEstrategicas = Array.isArray(parsed.competenciasEstrategicas)
    ? parsed.competenciasEstrategicas
    : [];

  // Normalizar dataPat se vier em DD/MM/YYYY
  if (parsed.dataPat && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.dataPat)) {
    const m = parsed.dataPat.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) parsed.dataPat = `${m[3]}-${m[2]}-${m[1]}`;
    else parsed.dataPat = null;
  }

  return parsed;
}
