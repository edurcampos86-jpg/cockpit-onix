import fs from "fs";
import path from "path";

const CONFIG_PATH = path.resolve(process.cwd(), ".integrations.json");

/**
 * Retorna config mesclando: variáveis de ambiente (Railway) + .integrations.json (local/UI)
 * Prioridade: .integrations.json sobrescreve env vars (permite atualizar via UI)
 */
export async function getIntegrationConfig(): Promise<Record<string, string>> {
  // Base: variáveis de ambiente relevantes (Railway, Vercel, etc.)
  const envKeys = [
    "MANYCHAT_API_TOKEN",
    "ANTHROPIC_API_KEY",
    "ZAPIER_WEBHOOK_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REFRESH_TOKEN",
    "META_ACCESS_TOKEN",
    "BTG_CLIENT_ID",
    "BTG_CLIENT_SECRET",
  ];
  const config: Record<string, string> = {};
  for (const key of envKeys) {
    if (process.env[key]) {
      config[key] = process.env[key]!;
    }
  }

  // Sobrescrever com valores do .integrations.json (salvos via UI)
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      Object.assign(config, fileConfig);
    }
  } catch { /* ignore */ }

  return config;
}

export async function setIntegrationConfig(key: string, value: string): Promise<void> {
  // Ler apenas o arquivo (não mesclar com env, para não persistir env vars no arquivo)
  let fileConfig: Record<string, string> = {};
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch { /* ignore */ }
  fileConfig[key] = value;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(fileConfig, null, 2));
}

export async function isConfigured(key: string): Promise<boolean> {
  const config = await getIntegrationConfig();
  return !!config[key];
}
