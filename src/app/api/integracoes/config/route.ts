import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CONFIG_PATH = path.resolve(process.cwd(), ".integrations.json");

function readConfig(): Record<string, string> {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch { /* ignore */ }
  return {};
}

function writeConfig(config: Record<string, string>) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function GET() {
  const config = readConfig();
  // Retornar apenas quais keys existem, não os valores
  const keys = Object.keys(config).reduce((acc, key) => {
    acc[key] = config[key] ? "••••••" + config[key].slice(-4) : "";
    return acc;
  }, {} as Record<string, string>);
  return NextResponse.json(keys);
}

export async function POST(request: NextRequest) {
  const { key, value } = await request.json();
  if (!key || !value) {
    return NextResponse.json({ error: "Key and value required" }, { status: 400 });
  }

  const config = readConfig();
  config[key] = value;
  writeConfig(config);

  return NextResponse.json({ success: true, key, masked: "••••••" + value.slice(-4) });
}
