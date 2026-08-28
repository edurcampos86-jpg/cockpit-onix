import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Decisão de acesso do webhook do Zapier — módulo PURO.
 *
 * Separado de `zapier.ts` de propósito: aquele arquivo importa `./config`, que
 * puxa `config-db` → `prisma`, e o cliente Prisma é construído no import a
 * partir de `DATABASE_URL`. Regra que decide QUEM entra não pode depender de
 * banco para ser testada — foi assim que a falha aberta abaixo viveu meses sem
 * um teste que a nomeasse.
 *
 * ── O QUE MUDOU, E POR QUE ──────────────────────────────────────────────
 * A versão anterior (`validateWebhookSecret`) devolvia `true` quando o segredo
 * não estava configurado: "dev mode". Só que esta rota está na allowlist do
 * proxy (`src/lib/proxy-rotas.ts`) — ela responde sem sessão, à internet
 * inteira —, e o segredo pode ser gravado pela UI no `.integrations.json`, que
 * é EFÊMERO no Railway. Um redeploy apagava o arquivo e a rota reabria sozinha,
 * sem log, sem alarme, aceitando qualquer POST que criasse `Meeting` com
 * transcrição arbitrária.
 *
 * Agora falha FECHADA, no padrão de `meta/ingest` e `onix-corretora/ingest`:
 * segredo ausente é 503 (integração desativada), não porta aberta.
 *
 * Três estados, e não um booleano, porque os erros são de naturezas
 * diferentes e o conserto de cada um também: `sem-segredo` é problema DO
 * SERVIDOR (alguém precisa configurar), `invalido` é problema DE QUEM CHAMOU.
 * Responder 401 nos dois casos mandaria o Eduardo procurar o erro no Zapier
 * quando o erro está no Railway.
 */
export type AcessoWebhook = "ok" | "sem-segredo" | "invalido";

/**
 * `esperado` vem da config (env do Railway, `.integrations.json` ou Config DB);
 * `recebido` vem do header `x-webhook-secret`.
 *
 * Comparação timing-safe pelo hash dos dois lados: `timingSafeEqual` exige
 * buffers do mesmo tamanho, e o SHA-256 iguala isso sem vazar o comprimento do
 * segredo — mesmo padrão de `src/app/api/integracoes/meta/ingest/route.ts`.
 */
export function decidirAcessoWebhook(
  esperado: string | undefined | null,
  recebido: string | undefined | null,
): AcessoWebhook {
  const alvo = esperado?.trim();
  if (!alvo) return "sem-segredo";

  const enviado = recebido?.trim();
  if (!enviado) return "invalido";

  const a = createHash("sha256").update(enviado).digest();
  const b = createHash("sha256").update(alvo).digest();
  return timingSafeEqual(a, b) ? "ok" : "invalido";
}
