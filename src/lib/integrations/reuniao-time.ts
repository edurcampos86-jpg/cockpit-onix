/**
 * Parser de ata de reunião 1:1 / equipe via Claude AI.
 *
 * Recebe um PDF (geralmente uma transcrição de Otter, Fathom, Google Meet, Teams)
 * e retorna um JSON estruturado com resumo + próximos passos extraídos.
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

export type ReuniaoExtracao = {
  resumo: string | null;
  proximosPassos: Array<{ texto: string; responsavel?: string | null }>;
  participantesDetectados: string[]; // nomes mencionados na ata
  pontosChave: string[]; // bullets curtos do que foi tratado
  observacoes: string;
  confianca: "alta" | "media" | "baixa";
};

const SYSTEM_PROMPT = `Você é um extrator de atas de reunião do tipo 1:1 / coaching / equipe.

A entrada é um PDF que pode conter: transcrição de gravação (Otter, Fathom, Google Meet), resumo bruto, ou uma ata semi-estruturada.

Sua tarefa: extrair os dados em JSON estruturado.

Regras:
- "resumo": parágrafo curto (3-6 linhas) destacando o que foi tratado, decisões importantes e contexto. Em português.
- "proximosPassos": lista de ações combinadas (verbo no infinitivo ou imperativo). Se houver responsável claro na ata, inclua em "responsavel". Senão, deixe null.
- "participantesDetectados": nomes próprios mencionados como interlocutores (não inclua "eu", "você").
- "pontosChave": 3-7 bullets curtos do que foi discutido. Cada bullet com no máx 12 palavras.
- "observacoes": frase curta com contexto extra (tom da conversa, riscos sinalizados, etc.). Pode ficar vazio.
- "confianca": "alta" se a ata for clara; "media" se houver inferência; "baixa" se o conteúdo for confuso ou parcial.
- Responda APENAS com JSON, sem markdown, sem code fence.`;

const SCHEMA_HINT = `{
  "resumo": "...",
  "proximosPassos": [{ "texto": "...", "responsavel": "Nome ou null" }],
  "participantesDetectados": ["..."],
  "pontosChave": ["..."],
  "observacoes": "...",
  "confianca": "alta|media|baixa"
}`;

export async function extrairReuniao(pdfBase64: string): Promise<ReuniaoExtracao> {
  const apiKey = await getApiKey();

  const userText = `Extraia o conteúdo desta ata de reunião e responda APENAS com o JSON no schema:\n\n${SCHEMA_HINT}`;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
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

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`Resposta do Claude não contém JSON: ${raw.slice(0, 200)}`);
  }

  let parsed: ReuniaoExtracao;
  try {
    parsed = JSON.parse(match[0]) as ReuniaoExtracao;
  } catch (e) {
    throw new Error(
      `JSON inválido do Claude: ${(e as Error).message}\nRaw: ${match[0].slice(0, 300)}`,
    );
  }

  // Sanitização
  parsed.proximosPassos = Array.isArray(parsed.proximosPassos)
    ? parsed.proximosPassos.filter((p) => p && typeof p.texto === "string")
    : [];
  parsed.participantesDetectados = Array.isArray(parsed.participantesDetectados)
    ? parsed.participantesDetectados.filter((s) => typeof s === "string")
    : [];
  parsed.pontosChave = Array.isArray(parsed.pontosChave)
    ? parsed.pontosChave.filter((s) => typeof s === "string")
    : [];

  return parsed;
}
