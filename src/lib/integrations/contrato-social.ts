/**
 * Parser de Contrato Social via Claude AI.
 *
 * Recebe um PDF (base64) de contrato social e extrai os dados necessários para
 * o cálculo da numerologia da pessoa: nome completo, CPF, data de nascimento.
 *
 * Usa o endpoint /v1/messages da Anthropic com `document` content (PDF nativo).
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

export type ContratoSocialExtraction = {
  nomeCompleto: string | null;
  cpf: string | null;          // só dígitos (11 chars) ou null
  dataNascimento: string | null; // ISO YYYY-MM-DD ou null
  confianca: "alta" | "media" | "baixa";
  observacoes: string;
};

const SYSTEM_PROMPT = `Você é um extrator de dados de contratos sociais brasileiros.

Sua tarefa é localizar, no documento PDF anexado, os dados pessoais de UMA pessoa específica que será informada no prompt do usuário (geralmente o nome ou apelido). Em contratos sociais costumam aparecer múltiplas pessoas (sócios, administradores, testemunhas) — você precisa identificar a CORRETA.

Regras:
- Se o usuário mencionar um nome/apelido para localizar, encontre EXATAMENTE essa pessoa.
- Se não houver indicação, extraia o sócio principal / administrador.
- Sempre responda em JSON estruturado conforme schema fornecido.
- Datas: formato ISO YYYY-MM-DD.
- CPF: apenas 11 dígitos (sem pontos, traços ou espaços). Se houver máscara, normalize.
- Nome: completo, em maiúsculas e minúsculas conforme aparece no documento (preservando acentos).
- Se algum campo não puder ser determinado com segurança, retorne null.
- "confianca": "alta" se todos os 3 campos foram extraídos sem ambiguidade; "media" se algum campo precisou de inferência; "baixa" se houver dúvida real.
- "observacoes": frase curta explicando qualquer ambiguidade ou problema (em português).

Responda APENAS com o JSON, sem comentários ou texto adicional. Sem markdown, sem code fence.`;

const SCHEMA_HINT = `{
  "nomeCompleto": "string ou null",
  "cpf": "11 dígitos numéricos ou null",
  "dataNascimento": "YYYY-MM-DD ou null",
  "confianca": "alta | media | baixa",
  "observacoes": "string curta"
}`;

/**
 * Extrai os dados pessoais de UM sócio do PDF do contrato social.
 *
 * @param pdfBase64  PDF em base64 (sem prefixo `data:`)
 * @param dicaPessoa  Nome ou apelido para Claude buscar — opcional. Se não vier, extrai o principal.
 */
export async function extrairDadosContratoSocial(
  pdfBase64: string,
  dicaPessoa?: string,
): Promise<ContratoSocialExtraction> {
  const apiKey = await getApiKey();

  const userText = dicaPessoa
    ? `Localize no contrato social anexado os dados pessoais de "${dicaPessoa}". Responda APENAS com o JSON no schema:\n\n${SCHEMA_HINT}`
    : `Extraia os dados pessoais do sócio/administrador principal do contrato social anexado. Responda APENAS com o JSON no schema:\n\n${SCHEMA_HINT}`;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
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
    throw new Error(`Claude API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const raw: string = data.content?.[0]?.text || "";

  // Robustez: extrair o primeiro objeto JSON da resposta
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`Resposta do Claude não contém JSON: ${raw.slice(0, 200)}`);
  }

  let parsed: ContratoSocialExtraction;
  try {
    parsed = JSON.parse(match[0]) as ContratoSocialExtraction;
  } catch (e) {
    throw new Error(`JSON inválido do Claude: ${(e as Error).message}\nRaw: ${match[0].slice(0, 200)}`);
  }

  // Sanitização
  if (parsed.cpf) {
    const digits = parsed.cpf.replace(/\D/g, "");
    parsed.cpf = digits.length === 11 ? digits : null;
  }

  if (parsed.dataNascimento) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed.dataNascimento)) {
      // tentar normalizar formatos comuns (DD/MM/YYYY)
      const m = parsed.dataNascimento.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) {
        parsed.dataNascimento = `${m[3]}-${m[2]}-${m[1]}`;
      } else {
        parsed.dataNascimento = null;
      }
    }
  }

  return parsed;
}
