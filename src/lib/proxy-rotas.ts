/**
 * Regras de path do middleware (`src/proxy.ts`) — módulo PURO.
 *
 * `proxy.ts` importa `jose` e `next/server`, então a regra que decide QUEM
 * pula a autenticação não tinha como ser testada. Foi exatamente ali que o
 * furo morou sem ninguém notar: `path.includes(".")` valia para toda rota,
 * inclusive as de API, e rodava ANTES da leitura do cookie de sessão.
 */

/** Rotas que respondem sem sessão — cada uma com autenticação própria. */
export const ROTAS_PUBLICAS = [
  "/login",
  "/recriar-senha", // Reset de senha — protegido por PASSWORD_RESET_SECRET
  "/onboarding/", // Onboarding por token (Fase 2C — gestão do time)
  "/api/cron/", // Crons do Painel do Dia — Bearer CRON_SECRET
  "/api/health", // Health check do smoke pós-deploy — sem dados sensíveis
  "/api/integracoes/zapier/webhook", // x-webhook-secret (timing-safe; ausente = 503)
  "/api/onix-corretora/ingest",
  "/api/webhooks/btg", // Webhook BTG — x-webhook-secret se configurado
  "/api/integracoes/meta/ingest", // Bearer META_INGEST_TOKEN (timing-safe; ausente = 503)
  "/api/manychat/lead", // X-Onix-Secret (timing-safe; ausente OU não configurado = 401)
] as const;

/**
 * NOTA DE SEGURANÇA — o `zapier/webhook` FOI CORRIGIDO; o `webhooks/btg` NÃO.
 *
 * O `zapier/webhook` falhava aberta: `validateWebhookSecret` devolvia `true`
 * quando `ZAPIER_WEBHOOK_SECRET` não estava configurado. Como o segredo pode
 * ser gravado pela UI no `.integrations.json` (efêmero no Railway), um redeploy
 * o apagava e a rota reabria para a internet sem nenhum sinal. Agora responde
 * 503 quando não há segredo — ver `src/lib/integrations/zapier-acesso.ts`.
 *
 * `/api/webhooks/btg` continua com o padrão antigo: sem `BTG_WEBHOOK_SECRET`
 * ele registra um `console.warn` e ACEITA a requisição
 * (`src/app/api/webhooks/btg/route.ts`). Segredo vem só do env, então não some
 * em redeploy como o do Zapier — mas nunca configurá-lo deixa a rota aberta do
 * mesmo jeito. Correção fora do escopo daquela PR, registrada aqui para não se
 * perder.
 *
 * `/api/manychat/lead` nasceu FECHADA, no padrão do Zapier e não no do BTG:
 * `MANYCHAT_WEBHOOK_SECRET` ausente responde 401, em vez de aceitar
 * (`src/app/api/manychat/lead/route.ts`). A rota dispara WhatsApp para o
 * celular do Eduardo, então falhar aberta a transformaria em gerador de spam
 * no minuto em que a URL aparecesse num print do painel do ManyChat.
 */

export function ehRotaPublica(path: string): boolean {
  return ROTAS_PUBLICAS.some((rota) => path.startsWith(rota));
}

/**
 * O path é um estático/interno que dispensa sessão?
 *
 * O `includes(".")` existe para servir arquivo da raiz (logo.png, robots.txt)
 * sem login. O recorte por `/api/` é o conserto: nenhuma rota de API é arquivo
 * estático, e sem ele bastava um ponto no path para pular a autenticação —
 * `/api/integracoes/btg/positions/1234.5` casava a regra e chegava ao handler
 * sem sessão nenhuma, porque segmento dinâmico aceita ponto.
 */
export function ehEstaticoSemAuth(path: string): boolean {
  if (path.startsWith("/_next") || path.startsWith("/favicon")) return true;
  if (path.startsWith("/api/")) return false;
  return path.includes(".");
}
