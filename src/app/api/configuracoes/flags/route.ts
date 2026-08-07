import { NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-admin-guard";
import { getAuthContext } from "@/lib/auth-helpers";
import { getConfig, setConfig } from "@/lib/config-db";
import { resolverEstadoDasFlags } from "@/lib/flags/estado";
import { flagAlternavel, flagLigada, valorParaGravar } from "@/lib/flags/registro";

export const dynamic = "force-dynamic";

/**
 * GET /api/configuracoes/flags — estado de todas as flags do Config DB.
 *
 * Existe porque não havia como perguntar ao app qual é a sua configuração: as
 * flags só se liam abrindo `psql` no banco do ambiente. Agora um curl responde
 * o que está ligado, de onde veio o valor (banco ou env) e quando mudou.
 *
 * ADMIN, não só sessão: a lista revela quais funcionalidades existem antes de
 * serem anunciadas e quais gates de segurança estão ligados — `RBAC_ENFORCEMENT`
 * desligado é informação útil para quem quer abusar do escopo. Mesma régua do
 * resto de /api/configuracoes.
 *
 * Só devolve chaves da allowlist em `lib/flags/registro.ts`. A tabela `Config`
 * guarda segredos (DATACRAZY_TOKEN, ANTHROPIC_API_KEY) na mesma estrutura, e
 * esta rota nunca a varre — busca chave por chave conhecida.
 */
export async function GET() {
  const negado = await guardAdminApi("/api/configuracoes/flags");
  if (negado) return negado;

  const flags = await resolverEstadoDasFlags();

  return NextResponse.json({
    flags,
    // Atalhos para leitura rápida no terminal, sem jq.
    ligadas: flags.filter((f) => f.ligada === true).map((f) => f.key).sort(),
    total: flags.length,
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/configuracoes/flags — liga/desliga UMA flag booleana.
 *
 * Corpo: `{ "key": "HUB_ECOSSISTEMA", "ligada": true }`.
 *
 * A validação contra o registro (`flagAlternavel`) é a fronteira de segurança
 * inteira desta rota, não uma cortesia de UX: `Config` é a mesma tabela dos
 * segredos, então sem ela um POST com `key: "DATACRAZY_TOKEN"` sobrescreveria
 * o token com "1" e derrubaria a integração — com sessão de admin legítima e
 * nenhum erro aparente.
 *
 * Grava sempre "1"/"0" (`valorParaGravar`), aceitos pelos DOIS dialetos.
 *
 * Sem tabela de auditoria ainda: o registro do que mudou vai para o log do
 * Railway, com quem, qual chave e o valor anterior. É o suficiente para
 * responder "quem ligou isso?" numa investigação, e não custa migration.
 */
export async function POST(request: Request) {
  const negado = await guardAdminApi("POST /api/configuracoes/flags");
  if (negado) return negado;

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "json_invalido" }, { status: 400 });
  }

  const { key, ligada } = (corpo ?? {}) as { key?: unknown; ligada?: unknown };
  if (typeof key !== "string" || typeof ligada !== "boolean") {
    return NextResponse.json(
      { error: "corpo_invalido", esperado: '{ key: string, ligada: boolean }' },
      { status: 400 },
    );
  }

  const flag = flagAlternavel(key);
  if (!flag) {
    // Log porque uma chave fora do registro só chega aqui por engano de código
    // ou por tentativa deliberada — nos dois casos vale saber.
    console.warn(`[flags] POST recusado · chave fora do registro: ${key}`);
    return NextResponse.json({ error: "flag_desconhecida", key }, { status: 400 });
  }

  const anterior = await getConfig(key);
  const valor = valorParaGravar(ligada);
  await setConfig(key, valor);

  const ctx = await getAuthContext().catch(() => null);
  console.info(
    `[flags] ${key}: ${flagLigada(anterior, flag.dialeto) ? "ON" : "OFF"} → ` +
      `${ligada ? "ON" : "OFF"} (valor "${anterior ?? "<ausente>"}" → "${valor}")` +
      ` · por ${ctx?.email ?? "?"} · ${new Date().toISOString()}`,
  );

  // Devolve o estado recalculado, não o que foi pedido: se algo divergir (env
  // com precedência inesperada, escrita que não pegou), a tela mostra a
  // verdade em vez do otimismo.
  const flags = await resolverEstadoDasFlags();
  return NextResponse.json({
    ok: true,
    flag: flags.find((f) => f.key === key) ?? null,
    flags,
  });
}
