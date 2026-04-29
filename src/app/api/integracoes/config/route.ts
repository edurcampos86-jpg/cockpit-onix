import { NextRequest, NextResponse } from "next/server";
import { getIntegrationConfig, setIntegrationConfig } from "@/lib/integrations/config";
import { integrationConfigSchema } from "@/lib/security/schemas";

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
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = integrationConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "payload inválido", issues: parsed.error.issues.slice(0, 5) },
      { status: 400 },
    );
  }
  const { key, value } = parsed.data;

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
