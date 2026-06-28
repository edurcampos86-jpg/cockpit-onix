import { NextRequest, NextResponse } from "next/server";
import { getIntegrationConfig, setIntegrationConfig } from "@/lib/integrations/config";
import { setConfig } from "@/lib/config-db";

export async function GET() {
  const config = await getIntegrationConfig();
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

  // ANTHROPIC_API_KEY: store unificado no Config DB — é o que getConfig/extrair
  // leem e sobrevive a redeploy (o .integrations.json é efêmero no Railway). As
  // demais chaves seguem no arquivo via setIntegrationConfig.
  if (key === "ANTHROPIC_API_KEY") {
    await setConfig(key, value);
  } else {
    await setIntegrationConfig(key, value);
  }

  return NextResponse.json({ success: true, key, masked: "••••••" + value.slice(-4) });
}
