import fs from "fs";
import path from "path";
import { getConfig } from "@/lib/config-db";
import { CHAVES_CONFIG_DB } from "./config-acesso";

const CONFIG_PATH = path.resolve(process.cwd(), ".integrations.json");

/**
 * `CHAVES_CONFIG_DB` mudou de casa: agora mora em `config-acesso.ts`, ao lado
 * de `CHAVES_GRAVAVEIS`. As duas listas descrevem a MESMA superfície de chaves
 * — uma diz o que a tela pode gravar, a outra onde o valor fica — e separadas
 * elas divergiam sem nada acusar. Juntas, num módulo puro, um teste garante que
 * toda chave do Config DB é gravável pela tela.
 *
 * Reexportado aqui porque o resto do código importa daqui desde antes.
 */
export { CHAVES_CONFIG_DB };

/**
 * Retorna config mesclando: variáveis de ambiente (Railway) + .integrations.json (local/UI)
 * Prioridade: .integrations.json sobrescreve env vars (permite atualizar via UI)
 */
export async function getIntegrationConfig(): Promise<Record<string, string>> {
  // Base: variáveis de ambiente relevantes (Railway, Vercel, etc.)
  // GOOGLE_REFRESH_TOKEN removido na Fase 2 (per-user OAuth via UserGoogleAuth).
  const envKeys = [
    "MANYCHAT_API_TOKEN",
    "ANTHROPIC_API_KEY",
    "ZAPIER_WEBHOOK_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
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

  // As chaves do Config DB têm PRIORIDADE sobre env e arquivo: é lá que a UI
  // grava e de lá que getConfig lê, e é o único store que sobrevive a redeploy.
  // O .integrations.json segue como fallback legado pra chave salva antes desta
  // unificação. Mantém display "Chave configurada" e testConnection coerentes.
  for (const chave of CHAVES_CONFIG_DB) {
    const doBanco = await getConfig(chave);
    if (doBanco) config[chave] = doBanco;
  }

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
