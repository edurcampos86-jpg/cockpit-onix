import { NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-admin-guard";
import { getAuthContext } from "@/lib/auth-helpers";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { resolverEstadoDasFlags, ultimasMudancas } from "@/lib/flags/estado";
import { gravarFlagComAuditoria } from "@/lib/flags/auditoria";
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

  const [flags, historico] = await Promise.all([resolverEstadoDasFlags(), ultimasMudancas()]);

  return NextResponse.json({
    flags,
    historico,
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
 * Toda escrita bem-sucedida vira uma linha em `ConfigAudit` (key, de, para,
 * quem, quando), na MESMA transação da mudança — ver `lib/flags/auditoria.ts`.
 * O `console.info` continua, como sinal imediato no log do Railway; a tabela é
 * o que sobrevive à rotação do log.
 *
 * CSRF — herda a proteção do projeto, sem mecanismo novo:
 *   • o cookie de sessão é `sameSite: "lax"` (`lib/session.ts`), e Lax NÃO
 *     acompanha POST cross-site — nem de `<form>`, nem de `fetch`. Sem cookie,
 *     `guardAdminApi` recusa antes de qualquer leitura de corpo;
 *   • a rota exige corpo JSON, que um `<form>` cross-origin não consegue
 *     emitir (só urlencoded/multipart/text-plain) sem virar requisição
 *     pré-verificada, barrada pela ausência de CORS.
 * É a mesma dupla que protege as demais rotas POST autenticadas do Cockpit —
 * nenhuma delas usa token de CSRF, e inventar um só aqui criaria um segundo
 * padrão para manter.
 *
 * Rate limit por usuário (`lib/rate-limit.ts`), como nas outras rotas de
 * mutação: 30/hora é folgado para um humano virar chave e estreito o bastante
 * para que uma sessão de admin sequestrada não vire uma metralhadora de
 * `RBAC_ENFORCEMENT` on/off.
 */
export async function POST(request: Request) {
  const negado = await guardAdminApi("POST /api/configuracoes/flags");
  if (negado) return negado;

  // Depois do gate: só quem passou tem userId para servir de chave do balde.
  const ctx = await getAuthContext().catch(() => null);
  const limite = checkRateLimit(ctx?.userId ?? "desconhecido", "configuracoes.flags.mutate", 30);
  if (!limite.ok) {
    return NextResponse.json(
      { error: "rate_limit", resetAt: limite.resetAt },
      { status: 429, headers: rateLimitHeaders(limite) },
    );
  }
  const headers = rateLimitHeaders(limite);

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "json_invalido" }, { status: 400, headers });
  }

  const { key, ligada } = (corpo ?? {}) as { key?: unknown; ligada?: unknown };
  if (typeof key !== "string" || typeof ligada !== "boolean") {
    return NextResponse.json(
      { error: "corpo_invalido", esperado: "{ key: string, ligada: boolean }" },
      { status: 400, headers },
    );
  }

  const flag = flagAlternavel(key);
  if (!flag) {
    // Log porque uma chave fora do registro só chega aqui por engano de código
    // ou por tentativa deliberada — nos dois casos vale saber.
    console.warn(`[flags] POST recusado · chave fora do registro: ${key}`);
    return NextResponse.json({ error: "flag_desconhecida", key }, { status: 400, headers });
  }

  const valor = valorParaGravar(ligada);
  const { de } = await gravarFlagComAuditoria({
    key,
    valor,
    quemId: ctx?.userId ?? null,
    quemEmail: ctx?.email ?? null,
  });

  console.info(
    `[flags] ${key}: ${flagLigada(de ?? undefined, flag.dialeto) ? "ON" : "OFF"} → ` +
      `${ligada ? "ON" : "OFF"} (valor "${de ?? "<ausente>"}" → "${valor}")` +
      ` · por ${ctx?.email ?? "?"} · ${new Date().toISOString()}`,
  );

  // Devolve o estado recalculado, não o que foi pedido: se algo divergir (env
  // com precedência inesperada, escrita que não pegou), a tela mostra a
  // verdade em vez do otimismo.
  const [flags, historico] = await Promise.all([resolverEstadoDasFlags(), ultimasMudancas()]);
  return NextResponse.json(
    {
      ok: true,
      flag: flags.find((f) => f.key === key) ?? null,
      flags,
      // Vai junto para o painel de histórico da tela não envelhecer enquanto o
      // resto atualiza — a mudança que o usuário acabou de fazer é a primeira
      // linha que ele espera ver.
      historico,
    },
    { headers },
  );
}
