import "server-only";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";
import { testGoogleConnection } from "@/lib/integrations/google-calendar";
import { recordGoogleAuthError } from "@/lib/integrations/google-user-oauth";
import {
  getMicrosoftAccessTokenForUser,
  recordMicrosoftAuthError,
} from "@/lib/integrations/microsoft-user-oauth";
import { testConnection as testBtgConnection } from "@/lib/integrations/btg";
import { VENDEDORES_CONFIG } from "@/lib/datacrazy";
import { testDatacrazyConnection } from "@/lib/integrations/datacrazy-probe";
import { testZapiConnection } from "@/lib/integrations/datacrazy-send";
import { testB2BackupsConnection } from "@/lib/b2/client";
import {
  avaliarProbe,
  type ProbeResultado,
  type StatusIntegracao,
} from "@/lib/integrations/audit-integracoes-core";

/**
 * Auditor de Integrações — roda um teste leve em cada integração com token,
 * auto-cura o que der (renova access token via refresh válido) e classifica.
 *
 * REALIDADE (não burlar): refresh token em invalid_grant/expired NÃO renova
 * por código — exige re-consentimento humano no navegador. Logo:
 * - access vencido + refresh VÁLIDO → renova (refresh_recuperado, auto-curado)
 * - invalid_grant / expired / escopo → precisa_reconectar (ALERTA, não simula)
 * - rede / rate limit → transitorio
 */

export type ResultadoAuditoria = {
  integracao: "google" | "microsoft" | "btg" | "datacrazy" | "zapi" | "b2";
  userId: string | null;
  chave: string; // "google:<userId>" | "microsoft:<userId>" | "btg" | "datacrazy" | "zapi" | "b2"
  email: string | null;
  status: StatusIntegracao;
  mensagem: string | null; // motivo do erro, quando houver
};

async function aplicarEfeitos(
  status: StatusIntegracao,
  curar: () => Promise<void>,
  registrar: (msg: string) => Promise<void>,
  mensagem: string | null,
): Promise<void> {
  // ok / refresh_recuperado → limpa lastError (auto-curado).
  // precisa_reconectar → persiste lastError pra UI mostrar selo vermelho.
  // transitorio → não mexe (não apaga um erro real nem grava ruído).
  if (status === "ok" || status === "refresh_recuperado") {
    await curar();
  } else if (status === "precisa_reconectar" && mensagem) {
    await registrar(mensagem);
  }
}

export async function auditarGoogle(userId: string): Promise<ResultadoAuditoria | null> {
  const row = await prisma.userGoogleAuth.findUnique({
    where: { userId },
    select: { googleEmail: true, accessTokenExpiresAt: true, lastError: true },
  });
  if (!row) return null;

  const estavaVencido = row.accessTokenExpiresAt
    ? row.accessTokenExpiresAt.getTime() <= Date.now()
    : false;

  // testGoogleConnection faz uma chamada leve ao Calendar — se o access token
  // estiver vencido, o SDK googleapis renova via refresh token e persiste.
  const r = await testGoogleConnection(userId);
  const probe: ProbeResultado = r.success
    ? estavaVencido
      ? { tipo: "refreshed" }
      : { tipo: "ok" }
    : { tipo: "erro", mensagem: r.message };

  const status = avaliarProbe(probe);

  await aplicarEfeitos(
    status,
    async () => {
      if (row.lastError) {
        await prisma.userGoogleAuth.updateMany({
          where: { userId },
          data: { lastError: null, lastErrorAt: null, lastUsedAt: new Date() },
        });
      }
    },
    (msg) => recordGoogleAuthError(userId, msg),
    r.success ? null : r.message,
  );

  return {
    integracao: "google",
    userId,
    chave: `google:${userId}`,
    email: row.googleEmail,
    status,
    mensagem: r.success ? null : r.message,
  };
}

export async function auditarMicrosoft(userId: string): Promise<ResultadoAuditoria | null> {
  const row = await prisma.userMicrosoftAuth.findUnique({
    where: { userId },
    select: {
      microsoftEmail: true,
      accessTokenEnc: true,
      accessTokenExpiresAt: true,
      lastError: true,
    },
  });
  if (!row) return null;

  const tokenValido =
    !!row.accessTokenEnc &&
    !!row.accessTokenExpiresAt &&
    row.accessTokenExpiresAt.getTime() - Date.now() > 60_000;
  const estavaVencido = !tokenValido;

  let probe: ProbeResultado;
  let mensagemErro: string | null = null;
  try {
    // Renova via refresh token se vencido; lança em invalid_grant.
    await getMicrosoftAccessTokenForUser(userId);
    probe = estavaVencido ? { tipo: "refreshed" } : { tipo: "ok" };
  } catch (e) {
    mensagemErro = e instanceof Error ? e.message : String(e);
    probe = { tipo: "erro", mensagem: mensagemErro };
  }

  const status = avaliarProbe(probe);

  await aplicarEfeitos(
    status,
    async () => {
      if (row.lastError) {
        await prisma.userMicrosoftAuth.updateMany({
          where: { userId },
          data: { lastError: null, lastErrorAt: null, lastUsedAt: new Date() },
        });
      }
    },
    (msg) => recordMicrosoftAuthError(userId, msg),
    mensagemErro,
  );

  return {
    integracao: "microsoft",
    userId,
    chave: `microsoft:${userId}`,
    email: row.microsoftEmail,
    status,
    mensagem: mensagemErro,
  };
}

export async function auditarBtg(): Promise<ResultadoAuditoria | null> {
  // Só audita se as credenciais BTG estão configuradas (senão não é "caída",
  // é "não configurada" — não faz sentido alertar reconexão).
  const clientId = await getConfig("BTG_CLIENT_ID");
  if (!clientId) return null;

  const r = await testBtgConnection();
  const probe: ProbeResultado = r.success
    ? { tipo: "ok" }
    : { tipo: "erro", mensagem: r.message };
  const status = avaliarProbe(probe);

  // BTG não tem modelo de auth próprio (client_credentials stateless) — o
  // estado vive só em IntegracaoAuditoria; nada a limpar/registrar aqui.
  return {
    integracao: "btg",
    userId: null,
    chave: "btg",
    email: null,
    status,
    mensagem: r.success ? null : r.message,
  };
}

/**
 * Datacrazy — a mais crítica das três novas.
 *
 * É ela que mantém `ultimoContatoAt` vivo (o poll roda de 30 em 30 min e já
 * acumulou milhares de execuções). Quando a Datacrazy cai, nada fica vermelho:
 * a ficha do cliente simplesmente para de envelhecer, e "sem contato novo"
 * parece silêncio do cliente quando é silêncio do cano.
 *
 * Probe roda contra a primeira instância configurada em `VENDEDORES_CONFIG` —
 * o token é o mesmo para todas, então uma instância basta pra separar
 * "credencial morreu / API fora" de "não teve conversa".
 */
export async function auditarDatacrazy(): Promise<ResultadoAuditoria | null> {
  const token = await getConfig("DATACRAZY_TOKEN");
  if (!token) return null;

  const instanceId = Object.values(VENDEDORES_CONFIG).flatMap((v) => v.instanceIds)[0];
  if (!instanceId) return null;

  const r = await testDatacrazyConnection(token, instanceId);
  const status = avaliarProbe(
    r.success ? { tipo: "ok" } : { tipo: "erro", mensagem: r.message },
  );

  return {
    integracao: "datacrazy",
    userId: null,
    chave: "datacrazy",
    email: null,
    status,
    mensagem: r.success ? null : r.message,
  };
}

/**
 * Z-API — o canal por onde o alerta de WhatsApp sai.
 *
 * Auditar o próprio canal de alarme não é redundância: se a instância
 * desconecta, o alerta some justamente quando ele mais faria falta. O aviso
 * dessa integração sai pelo Slack, que é o outro canal — de propósito.
 */
export async function auditarZapi(): Promise<ResultadoAuditoria | null> {
  const r = await testZapiConnection();
  if (!r) return null; // não configurada ≠ caída

  const status = avaliarProbe(
    r.success ? { tipo: "ok" } : { tipo: "erro", mensagem: r.message },
  );

  return {
    integracao: "zapi",
    userId: null,
    chave: "zapi",
    email: null,
    status,
    mensagem: r.success ? null : r.message,
  };
}

/**
 * Backblaze B2 (bucket de backups).
 *
 * Credencial de backup expira em silêncio absoluto: o backup para de subir e
 * o sistema segue perfeitamente normal — até o dia em que se vai restaurar.
 * Só o bucket de backups entra aqui; o de contratos tem key própria e outro
 * ciclo de rotação, e vira uma linha separada quando fizer falta.
 */
export async function auditarB2(): Promise<ResultadoAuditoria | null> {
  const r = await testB2BackupsConnection();
  if (!r) return null; // não configurada ≠ caída

  const status = avaliarProbe(
    r.success ? { tipo: "ok" } : { tipo: "erro", mensagem: r.message },
  );

  return {
    integracao: "b2",
    userId: null,
    chave: "b2",
    email: null,
    status,
    mensagem: r.success ? null : r.message,
  };
}

/** Roda a auditoria de TODAS as integrações conectadas. */
export async function auditarTodas(): Promise<ResultadoAuditoria[]> {
  const [googles, microsofts] = await Promise.all([
    prisma.userGoogleAuth.findMany({ select: { userId: true } }),
    prisma.userMicrosoftAuth.findMany({ select: { userId: true } }),
  ]);

  /*
   * Cada tarefa carrega a própria identidade porque o `catch` precisa dela:
   * a versão anterior rotulava QUALQUER probe que estourasse como
   * `integracao: "google"`, chave "erro". Com três integrações isso passava
   * quase despercebido; com seis, um erro no probe do B2 apareceria como
   * "Google quebrado" no /api/health — alarme apontando pro lugar errado é
   * pior que alarme nenhum, porque manda consertar o que está são.
   */
  const tarefas: Array<{
    integracao: ResultadoAuditoria["integracao"];
    chave: string;
    userId: string | null;
    executar: () => Promise<ResultadoAuditoria | null>;
  }> = [
    ...googles.map((g) => ({
      integracao: "google" as const,
      chave: `google:${g.userId}`,
      userId: g.userId,
      executar: () => auditarGoogle(g.userId),
    })),
    ...microsofts.map((m) => ({
      integracao: "microsoft" as const,
      chave: `microsoft:${m.userId}`,
      userId: m.userId,
      executar: () => auditarMicrosoft(m.userId),
    })),
    { integracao: "btg" as const, chave: "btg", userId: null, executar: auditarBtg },
    {
      integracao: "datacrazy" as const,
      chave: "datacrazy",
      userId: null,
      executar: auditarDatacrazy,
    },
    { integracao: "zapi" as const, chave: "zapi", userId: null, executar: auditarZapi },
    { integracao: "b2" as const, chave: "b2", userId: null, executar: auditarB2 },
  ];

  const resultados = await Promise.all(
    tarefas.map((t) =>
      t.executar().catch(
        (e): ResultadoAuditoria => ({
          integracao: t.integracao,
          userId: t.userId,
          chave: t.chave,
          email: null,
          status: "transitorio",
          mensagem: e instanceof Error ? e.message : String(e),
        }),
      ),
    ),
  );

  return resultados.filter((r): r is ResultadoAuditoria => r !== null);
}
