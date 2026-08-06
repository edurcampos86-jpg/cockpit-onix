import { NextRequest, NextResponse } from "next/server";
import {
  CHAVES_CONFIG_DB,
  getIntegrationConfig,
  setIntegrationConfig,
} from "@/lib/integrations/config";
import { setConfig } from "@/lib/config-db";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import {
  decidirEscritaConfig,
  projetarConfig,
} from "@/lib/integrations/config-acesso";

/**
 * Configuração das integrações — leitura de status e gravação de chaves.
 *
 * O middleware (`src/proxy.ts`) só garante que existe SESSÃO; ele nunca checou
 * role. Sem as checagens abaixo, qualquer usuário logado — inclusive
 * `role: "support"` — sobrescrevia ANTHROPIC_API_KEY / GITHUB_TOKEN e lia os
 * 4 últimos caracteres reais de todos os tokens do sistema.
 *
 * A decisão de acesso vive em `config-acesso.ts` (função pura, testada); aqui
 * é só a casca que traduz veredito em resposta HTTP.
 */

/**
 * GET — status das chaves.
 *
 * Admin recebe a máscara com os 4 últimos caracteres (necessária para
 * confirmar QUAL chave está instalada ao rotacionar); não-admin recebe apenas
 * `configurada: true/false`. Ver `projetarConfig` para o racional completo.
 */
export async function GET() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 403 });
  }

  const config = await getIntegrationConfig();
  return NextResponse.json({
    admin: isAdmin(ctx),
    chaves: projetarConfig(config, { admin: isAdmin(ctx) }),
  });
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext().catch(() => null);

  const { key, value } = await request.json();

  const veredito = decidirEscritaConfig(ctx, key);
  if (!veredito.permitido) {
    // Log da tentativa: quem, quando, qual chave. Escrita negada em chave de
    // integração é sinal de conta comprometida ou de permissão mal atribuída —
    // sem registro, o primeiro sintoma seria a chave já trocada.
    console.warn(
      `[integracoes/config] escrita NEGADA · usuario=${ctx?.userId ?? "sem-sessao"}` +
        ` (${ctx?.email ?? "?"}, role=${ctx?.role ?? "?"}) · chave=${
          typeof key === "string" ? key : "(inválida)"
        } · motivo=${veredito.erro} · ${new Date().toISOString()}`,
    );
    return NextResponse.json({ error: veredito.erro }, { status: veredito.status });
  }

  // Valor só é validado DEPOIS da autorização: responder 400 "value required"
  // a quem não pode gravar já confirmaria que a chave existe e é gravável.
  if (typeof value !== "string" || !value.trim()) {
    return NextResponse.json({ error: "Value required" }, { status: 400 });
  }

  // CHAVES_CONFIG_DB: store unificado no Config DB — é o que getConfig lê e o
  // único que sobrevive a redeploy (o .integrations.json é efêmero no Railway).
  // As demais chaves seguem no arquivo via setIntegrationConfig, por
  // compatibilidade com o que já estava salvo lá.
  if (CHAVES_CONFIG_DB.has(key)) {
    await setConfig(key, value);
  } else {
    await setIntegrationConfig(key, value);
  }

  console.info(
    `[integracoes/config] chave ALTERADA · usuario=${ctx!.userId} (${ctx!.email})` +
      ` · chave=${key} · ${new Date().toISOString()}`,
  );

  return NextResponse.json({
    success: true,
    key,
    masked: "••••••" + value.slice(-4),
  });
}
