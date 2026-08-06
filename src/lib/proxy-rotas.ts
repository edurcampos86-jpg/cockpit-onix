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
  "/api/integracoes/zapier/webhook", // x-webhook-secret (ver nota abaixo)
  "/api/onix-corretora/ingest",
  "/api/webhooks/btg", // Webhook BTG — x-webhook-secret se configurado
  "/api/integracoes/meta/ingest", // Bearer META_INGEST_TOKEN (timing-safe; ausente = 503)
] as const;

/**
 * NOTA DE SEGURANÇA (fora do escopo desta correção, registrada aqui para não
 * se perder): `/api/integracoes/zapier/webhook` autentica por
 * `validateWebhookSecret`, que FALHA ABERTA — `src/lib/integrations/zapier.ts`
 * retorna `true` quando `ZAPIER_WEBHOOK_SECRET` não está configurado. Como o
 * segredo é gravado pela UI no `.integrations.json` (efêmero no Railway), ele
 * pode sumir num redeploy e reabrir a rota para a internet sem nenhum sinal.
 * O padrão correto está em `meta/ingest`, que responde 503 quando o token não
 * existe. Trocar para falha fechada exige confirmar antes que o segredo está
 * como env var no Railway — senão a integração do Zapier para de funcionar.
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
