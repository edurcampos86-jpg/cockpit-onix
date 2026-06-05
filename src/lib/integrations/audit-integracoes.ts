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
  integracao: "google" | "microsoft" | "btg";
  userId: string | null;
  chave: string; // "google:<userId>" | "microsoft:<userId>" | "btg"
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

/** Roda a auditoria de TODAS as integrações conectadas. */
export async function auditarTodas(): Promise<ResultadoAuditoria[]> {
  const [googles, microsofts] = await Promise.all([
    prisma.userGoogleAuth.findMany({ select: { userId: true } }),
    prisma.userMicrosoftAuth.findMany({ select: { userId: true } }),
  ]);

  const tarefas: Array<Promise<ResultadoAuditoria | null>> = [
    ...googles.map((g) => auditarGoogle(g.userId)),
    ...microsofts.map((m) => auditarMicrosoft(m.userId)),
    auditarBtg(),
  ];

  const resultados = await Promise.all(
    tarefas.map((p) =>
      p.catch(
        (e): ResultadoAuditoria => ({
          integracao: "google",
          userId: null,
          chave: "erro",
          email: null,
          status: "transitorio",
          mensagem: e instanceof Error ? e.message : String(e),
        }),
      ),
    ),
  );

  return resultados.filter((r): r is ResultadoAuditoria => r !== null);
}
