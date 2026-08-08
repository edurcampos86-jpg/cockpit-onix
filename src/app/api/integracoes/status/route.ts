import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/integrations/config";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { chavesNaoReconhecidas } from "@/lib/flags/estado";

/**
 * GET /api/integracoes/status
 * Retorna o status de configuração de cada integração
 */
export async function GET() {
  const [
    manychat,
    claudeAi,
    zapierSecret,
    googleClient,
    googleSecret,
    msClient,
    msSecret,
    metaToken,
    btgId,
    btgSecret,
    metaAdAccount,
  ] = await Promise.all([
    isConfigured("MANYCHAT_API_TOKEN"),
    isConfigured("ANTHROPIC_API_KEY"),
    isConfigured("ZAPIER_WEBHOOK_SECRET"),
    isConfigured("GOOGLE_CLIENT_ID"),
    isConfigured("GOOGLE_CLIENT_SECRET"),
    Promise.resolve(!!process.env.MICROSOFT_CLIENT_ID),
    Promise.resolve(!!process.env.MICROSOFT_CLIENT_SECRET),
    isConfigured("META_ACCESS_TOKEN"),
    isConfigured("BTG_CLIENT_ID"),
    isConfigured("BTG_CLIENT_SECRET"),
    isConfigured("META_AD_ACCOUNT_ID"),
  ]);

  const session = await getSession();
  const [userGoogle, userMicrosoft] = session
    ? await Promise.all([
        prisma.userGoogleAuth.findUnique({
          where: { userId: session.userId },
          select: { googleEmail: true },
        }),
        prisma.userMicrosoftAuth.findUnique({
          where: { userId: session.userId },
          select: { microsoftEmail: true },
        }),
      ])
    : [null, null];

  /* Flags com valor que o dialeto delas não reconhece — configuração INERTE.
   *
   * Entra aqui porque esta é a tela do "está tudo conectado?", e uma flag que
   * ficou desligada parecendo ligada é da mesma família de uma integração
   * caída: o sistema responde, e a coisa não acontece. O smoke pós-deploy já
   * reprova por isso, mas ele roda a cada deploy e no cron de 15min; quem abre
   * esta tela está perguntando AGORA.
   *
   * CONTAGEM, não a lista. Mesma decisão do `/api/health`: nomes de flag
   * revelam quais funcionalidades existem antes de anunciadas e quais gates
   * estão ligados. Um número não conta nada disso — só diz que há o que
   * investigar, e a investigação exige `/configuracoes/flags`, que é admin.
   *
   * O `if (session)` é redundante HOJE: MEDIDO, `/api/integracoes/status`
   * devolve 401 `{"error":"Not authenticated"}` para anônimo, barrada no
   * `proxy.ts` antes de chegar aqui (`path.startsWith("/api/")`). Fica assim
   * mesmo: `getSession()` já era chamado logo acima e o resto do corpo trata
   * `session === null` como caso possível — se este arquivo confiasse só no
   * proxy, seria o único ponto do arquivo a fazê-lo, e uma mudança na lista de
   * rotas públicas passaria a vazar o número sem ninguém notar aqui.
   *
   * `null` = não perguntei (sem sessão, ou a leitura falhou), que é diferente
   * de `0` = perguntei e está tudo certo. Um try/catch porque este é endpoint
   * de diagnóstico: derrubá-lo por causa de uma query de flag transformaria um
   * aviso em incidente. */
  let flagsValorInvalido: number | null = null;
  if (session) {
    try {
      flagsValorInvalido = (await chavesNaoReconhecidas()).length;
    } catch (erro) {
      console.warn(
        `[integracoes] falha ao contar flags com valor inválido: ` +
          `${erro instanceof Error ? erro.message : String(erro)}`,
      );
    }
  }

  // Refactor Fase 2: status do Google so reflete UserGoogleAuth.
  // Fase 4: idem para Microsoft. CLIENT_ID/SECRET configurados sem
  // conexao do usuario => "pending_auth" (clicar Conectar em /integracoes).
  const googleStatus = userGoogle
    ? "connected"
    : googleClient && googleSecret
      ? "pending_auth"
      : "disconnected";

  const microsoftStatus = userMicrosoft
    ? "connected"
    : msClient && msSecret
      ? "pending_auth"
      : "disconnected";

  return NextResponse.json({
    manychat: {
      configured: manychat,
      status: manychat ? "connected" : "disconnected",
    },
    claude_ai: {
      configured: claudeAi,
      status: claudeAi ? "connected" : "disconnected",
    },
    zapier_plaud: {
      configured: zapierSecret,
      status: zapierSecret ? "connected" : "disconnected",
    },
    google_calendar: {
      configured: googleClient && googleSecret,
      authenticated: !!userGoogle,
      userConnected: !!userGoogle,
      userEmail: userGoogle?.googleEmail,
      status: googleStatus,
    },
    microsoft_graph: {
      configured: msClient && msSecret,
      authenticated: !!userMicrosoft,
      userConnected: !!userMicrosoft,
      userEmail: userMicrosoft?.microsoftEmail,
      status: microsoftStatus,
    },
    meta: {
      configured: metaToken,
      status: metaToken ? "connected" : "disconnected",
    },
    meta_ads: {
      // Meta Ads (F5): precisa do token + ad account pra sincronizar
      configured: metaToken && metaAdAccount,
      status: metaToken && metaAdAccount ? "connected" : "disconnected",
    },
    btg_pactual: {
      configured: btgId && btgSecret,
      status: btgId && btgSecret ? "connected" : "disconnected",
    },
    manus: {
      configured: false,
      status: "coming_soon",
    },
    /* Fora do mapa de integrações de propósito: não é uma integração, é a
     * configuração do próprio app. Fica no topo do payload como número solto
     * para o consumidor não ter de saber o que significa "connected" numa
     * coisa que não conecta em lugar nenhum. */
    config: { flagsValorInvalido },
  });
}
