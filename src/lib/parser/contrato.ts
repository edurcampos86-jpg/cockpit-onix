import "server-only";
import { PARSER_CONTRATO_PROMPT_V1 } from "./prompts";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-opus-4-7";

/**
 * Extrai dados estruturados de um PDF de contrato usando Claude com o bloco
 * `document` (PDF nativo). Mantém o padrão do projeto: fetch direto na API,
 * sem SDK.
 *
 * Retorno:
 *  - sucesso → { dadosExtraidos, confianca, promptVersion, modelo }
 *  - falha   → { erro }  (caller registra em ContratoExtracao.erroExtracao)
 *
 * Custos: 1 chamada por contrato. Opus 4.7 a $15/MTok input + $75/MTok output.
 * Contrato AAI típico (8-15 páginas) ≈ $0.05 por extração.
 */

export type DadosContrato = Record<string, unknown> & {
  qualidade_extracao?: { confianca?: number };
};

export type ParseSuccess = {
  ok: true;
  dadosExtraidos: DadosContrato;
  confianca: number;
  promptVersion: string;
  modelo: string;
};

export type ParseFailure = {
  ok: false;
  erro: string;
  rawResponse?: string;
};

export type ParseResult = ParseSuccess | ParseFailure;

export async function extrairDadosContrato(pdfBuffer: Buffer): Promise<ParseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, erro: "ANTHROPIC_API_KEY não configurada" };
  }

  const modelo = process.env.CLAUDE_MODEL_PARSER || DEFAULT_MODEL;
  const pdfBase64 = pdfBuffer.toString("base64");

  const payload = {
    model: modelo,
    max_tokens: 4096,
    messages: [
      {
        role: "user" as const,
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          },
          { type: "text", text: PARSER_CONTRATO_PROMPT_V1 },
        ],
      },
    ],
  };

  let response: Response;
  try {
    response = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    return { ok: false, erro: `Falha de rede ao chamar Claude: ${(e as Error).message}` };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      erro: `Claude API HTTP ${response.status}: ${text.slice(0, 500)}`,
    };
  }

  const json = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
    model?: string;
  };

  const textBlock = json.content?.find((c) => c.type === "text");
  const rawText = textBlock?.text;

  if (!rawText) {
    return { ok: false, erro: "Claude não retornou bloco de texto" };
  }

  const cleanJson = rawText
    .replace(/^```json\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let dados: DadosContrato;
  try {
    dados = JSON.parse(cleanJson);
  } catch {
    return {
      ok: false,
      erro: "Resposta do Claude não é JSON válido",
      rawResponse: cleanJson.slice(0, 1000),
    };
  }

  const confianca = Number(dados.qualidade_extracao?.confianca ?? 0);

  return {
    ok: true,
    dadosExtraidos: dados,
    confianca: Number.isFinite(confianca) ? confianca : 0,
    promptVersion: "v1",
    modelo: json.model || modelo,
  };
}
