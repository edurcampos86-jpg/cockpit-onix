import "server-only";
import { getSecret, setSecret, listSecretKeys } from "@/lib/security/secrets-store";

/**
 * Lista das chaves de integração que aceitamos persistir/expor.
 * Mantemos uma allowlist para evitar que clientes da API armazenem
 * qualquer string arbitrária no storage cifrado.
 */
const INTEGRATION_KEYS = [
  "MANYCHAT_API_TOKEN",
  "ANTHROPIC_API_KEY",
  "ZAPIER_WEBHOOK_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "META_ACCESS_TOKEN",
  "BTG_CLIENT_ID",
  "BTG_CLIENT_SECRET",
  "INSTAGRAM_MCP_PROXY_TOKEN",
  "INSTAGRAM_MCP_PROXY_URL",
  "DASHBOARD_API_SECRET",
] as const;

export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

export function isIntegrationKey(key: string): key is IntegrationKey {
  return (INTEGRATION_KEYS as readonly string[]).includes(key);
}

/**
 * Retorna a configuração mesclando env vars + storage cifrado em disco.
 * Prioridade: storage cifrado sobrescreve env (permite atualizar via UI
 * sem redeploy). Tokens só são persistidos cifrados (AES-256-GCM).
 */
export async function getIntegrationConfig(): Promise<Record<string, string>> {
  const config: Record<string, string> = {};

  for (const key of INTEGRATION_KEYS) {
    const fromEnv = process.env[key];
    if (fromEnv) config[key] = fromEnv;
  }

  for (const key of listSecretKeys()) {
    if (!isIntegrationKey(key)) continue;
    const v = getSecret(key);
    if (v) config[key] = v;
  }

  return config;
}

export async function setIntegrationConfig(key: string, value: string): Promise<void> {
  if (!isIntegrationKey(key)) {
    throw new Error(`Chave de integração não permitida: ${key}`);
  }
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) {
    throw new Error("Valor de integração inválido.");
  }
  setSecret(key, value);
}

export async function isConfigured(key: string): Promise<boolean> {
  const config = await getIntegrationConfig();
  return !!config[key];
}
