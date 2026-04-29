import { NextRequest, NextResponse } from "next/server";
import { getIntegrationConfig, setIntegrationConfig } from "@/lib/integrations/config";

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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { key, value } = (body ?? {}) as { key?: unknown; value?: unknown };
  if (typeof key !== "string" || typeof value !== "string" || !key || !value) {
    return NextResponse.json({ error: "Key and value required" }, { status: 400 });
  }

  try {
    await setIntegrationConfig(key, value);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao salvar" },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true, key, masked: "••••••" + value.slice(-4) });
}
