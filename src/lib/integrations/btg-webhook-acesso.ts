import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Decisão de acesso do webhook do BTG — módulo PURO.
 *
 * ── O QUE MUDOU, E POR QUE ──────────────────────────────────────────────
 * A rota `/api/webhooks/btg` está na allowlist do proxy
 * (`src/lib/proxy-rotas.ts`): responde sem sessão, à internet inteira. A
 * versão anterior validava o segredo dentro de um `if (secret)` e, no `else`,
 * apenas registrava um `console.warn` e SEGUIA — ou seja, `BTG_WEBHOOK_SECRET`
 * ausente ou vazio não desligava a rota, abria.
 *
 * O que passava por essa porta não era leitura: a rota cria `BtgSyncLog` com o
 * payload inteiro do chamador e, para evento de movimento, insere linhas em
 * `MovimentacaoBtg` casadas ao `clienteId` real pelo número da conta — com
 * data, tipo, descrição, ativo e valor escolhidos por quem enviou. E o alerta
 * diário (`src/lib/alertas-cliente.ts`) varre exatamente essa tabela atrás de
 * movimento cujo tipo contenha "APLICA"/"APORTE": um aporte forjado vira
 * notificação sobre um cliente real.
 *
 * Agora falha FECHADA, no padrão já adotado em `zapier-acesso.ts`,
 * `meta/ingest` e `manychat/lead`: segredo ausente é 503 (integração
 * desativada), não porta aberta.
 *
 * ── POR QUE MÓDULO SEPARADO, E PURO ─────────────────────────────────────
 * Mesmo motivo registrado em `zapier-acesso.ts`: a regra que decide QUEM entra
 * não pode depender de banco nem de `NextRequest` para ser testada. Foi assim
 * que a falha aberta do Zapier viveu meses sem um teste que a nomeasse, e foi
 * assim que esta aqui sobreviveu à PR que corrigiu a irmã — a nota em
 * `proxy-rotas.ts` registrava o furo por escrito e ninguém tinha um teste
 * capaz de quebrar por causa dele.
 *
 * ── TRÊS ESTADOS, NÃO UM BOOLEANO ───────────────────────────────────────
 * `sem-segredo` é problema DO SERVIDOR (falta configurar no Railway);
 * `invalido` é problema DE QUEM CHAMOU (cadastro errado no portal BTG).
 * Responder 401 nos dois casos mandaria procurar o erro no BTG quando o erro
 * está no Railway.
 */
export type AcessoWebhookBtg = "ok" | "sem-segredo" | "invalido";

/**
 * O BTG não documenta um único formato de header, e o cadastro no portal de
 * parceiros pode sair em qualquer um deles. A lista existe desde a primeira
 * versão da rota; o que mudou é que agora ela é PURA e testável, em vez de
 * montada dentro do handler junto com a decisão.
 *
 * `ler` recebe o nome do header em minúsculas e devolve o valor — em produção
 * é `(n) => req.headers.get(n)`; no teste, um Map.
 */
export function candidatosDoWebhookBtg(
  ler: (nome: string) => string | null | undefined,
): string[] {
  const auth = ler("authorization") || "";
  const brutos = [
    auth,
    auth.replace(/^Bearer\s+/i, ""),
    auth.replace(/^ApiKey\s+/i, ""),
    ler("x-api-key"),
    ler("apikey"),
    ler("x-webhook-secret"),
    ler("x-btg-signature"),
  ];

  const vistos = new Set<string>();
  for (const b of brutos) {
    const v = b?.trim();
    if (v) vistos.add(v);
  }
  return Array.from(vistos);
}

/**
 * `esperado` vem de `process.env.BTG_WEBHOOK_SECRET`; `recebidos` vem de
 * `candidatosDoWebhookBtg`.
 *
 * Comparação timing-safe pelo hash dos dois lados: `timingSafeEqual` exige
 * buffers do mesmo tamanho, e o SHA-256 iguala isso sem vazar o comprimento do
 * segredo — mesmo padrão de `zapier-acesso.ts` e de `meta/ingest`. A versão
 * anterior usava `===`, que sai na primeira letra diferente.
 *
 * O laço NÃO faz curto-circuito: acumula em `alguma` em vez de retornar no
 * primeiro acerto. Não é paranoia de timing (quem chama escolhe os headers, e
 * portanto já sabe quantos mandou) — é para que o custo da checagem não
 * dependa de QUAL header casou, mantendo a promessa do timing-safe válida de
 * ponta a ponta em vez de só dentro de cada comparação.
 */
export function decidirAcessoWebhookBtg(
  esperado: string | undefined | null,
  recebidos: readonly (string | null | undefined)[],
): AcessoWebhookBtg {
  const alvo = esperado?.trim();
  if (!alvo) return "sem-segredo";

  const enviados = recebidos
    .map((r) => r?.trim())
    .filter((r): r is string => Boolean(r));
  if (enviados.length === 0) return "invalido";

  const b = createHash("sha256").update(alvo).digest();
  let alguma = false;
  for (const enviado of enviados) {
    const a = createHash("sha256").update(enviado).digest();
    if (timingSafeEqual(a, b)) alguma = true;
  }
  return alguma ? "ok" : "invalido";
}
