import "server-only";
import { getConfig } from "@/lib/config-db";
import { getIntegrationConfig } from "@/lib/integrations/config";

const API_URL = "https://api.anthropic.com/v1/messages";

async function getApiKey(): Promise<string> {
  const dbKey = await getConfig("ANTHROPIC_API_KEY");
  if (dbKey) return dbKey;
  const config = await getIntegrationConfig();
  const key = config.ANTHROPIC_API_KEY;
  if (key) return key;
  throw new Error("ANTHROPIC_API_KEY nao configurada.");
}

/**
 * Chat genérico com retorno de texto livre.
 */
export async function claudeChat(params: {
  system?: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
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
      max_tokens: params.maxTokens ?? 2048,
      system: params.system,
      messages: [{ role: "user", content: params.user }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

/**
 * Chat que espera retorno JSON estruturado. Faz fallback com regex se
 * a resposta vier com texto em volta.
 */
export async function claudeJson<T>(params: {
  system?: string;
  user: string;
  maxTokens?: number;
}): Promise<T | null> {
  const txt = await claudeChat(params);
  const clean = txt
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(clean) as T;
  } catch {
    const m = clean.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
