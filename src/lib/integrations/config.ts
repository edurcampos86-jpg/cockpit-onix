import fs from "fs";
import path from "path";

const CONFIG_PATH = path.resolve(process.cwd(), ".integrations.json");

export async function getIntegrationConfig(): Promise<Record<string, string>> {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

export async function setIntegrationConfig(key: string, value: string): Promise<void> {
  const config = await getIntegrationConfig();
  config[key] = value;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function isConfigured(key: string): Promise<boolean> {
  const config = await getIntegrationConfig();
  return !!config[key];
}
