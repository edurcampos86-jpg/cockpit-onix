import "server-only";
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

// IMPORTANTE: ao adicionar/remover escopos, usuários já conectados precisam
// reconectar a conta Google (Integrações → Desconectar e Conectar). O Google
// só concede os escopos pedidos no consentimento — o refresh_token existente
// não ganha novas permissões automaticamente.
//
// `gmail.compose` é necessário para o fluxo "Responder com Claude" do Painel
// do Dia (criação de drafts via gmail.users.drafts.create).
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];

const STATE_TTL_SECONDS = 60 * 10; // 10min para concluir o consentimento

function loadStateKey(): Uint8Array {
  const secret = process.env.GOOGLE_OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error(
      "GOOGLE_OAUTH_STATE_SECRET ausente. Gere com: node -e 'console.log(require(\"crypto\").randomBytes(32).toString(\"base64\"))'"
    );
  }
  return new TextEncoder().encode(secret);
}

function loadClientCreds(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET ausentes nas variáveis de ambiente."
    );
  }
  return { clientId, clientSecret };
}

export const GOOGLE_OAUTH_NONCE_COOKIE = "g_oauth_nonce";
export const GOOGLE_OAUTH_NONCE_TTL_SECONDS = STATE_TTL_SECONDS;

/**
 * Cria o `state` que carrega `userId` + `nonce`. O nonce também vai em cookie
 * `httpOnly` (double-submit) — o callback exige que o nonce dentro do state
 * bata com o cookie, evitando replay com state capturado.
 */
export async function createOAuthState(
  userId: string,
): Promise<{ state: string; nonce: string }> {
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = await new SignJWT({ userId, nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SECONDS}s`)
    .sign(loadStateKey());
  return { state, nonce };
}

export async function verifyOAuthState(
  state: string,
  expectedNonce: string | null,
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(state, loadStateKey(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string") return null;
    if (typeof payload.nonce !== "string") return null;
    if (!expectedNonce) return null;
    // Comparação constante para evitar timing
    if (payload.nonce.length !== expectedNonce.length) return null;
    let diff = 0;
    for (let i = 0; i < payload.nonce.length; i++) {
      diff |= payload.nonce.charCodeAt(i) ^ expectedNonce.charCodeAt(i);
    }
    if (diff !== 0) return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}

export function getGoogleAuthUrlForUser(state: string, redirectUri: string): string {
  const { clientId, clientSecret } = loadClientCreds();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: GOOGLE_SCOPES,
    state,
  });
}

/**
 * Troca o code pelo refresh+access token, descobre o e-mail da conta
 * conectada (via OIDC userinfo) e faz upsert do registro cifrado.
 *
 * Nunca logamos tokens — só `googleEmail` (público) em mensagens de erro.
 */
export async function exchangeCodeForUser(
  userId: string,
  code: string,
  redirectUri: string,
): Promise<{ email: string }> {
  const { clientId, clientSecret } = loadClientCreds();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google não devolveu refresh_token — revogue o acesso em https://myaccount.google.com/permissions e tente conectar de novo (prompt=consent é obrigatório)."
    );
  }

  oauth2.setCredentials(tokens);

  const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
  const { data: userinfo } = await oauth2Api.userinfo.get();
  const email = userinfo.email ?? "";
  if (!email) {
    throw new Error("Não foi possível obter o e-mail da conta Google conectada.");
  }

  const refreshTokenEnc = encryptSecret(tokens.refresh_token);
  const accessTokenEnc = tokens.access_token ? encryptSecret(tokens.access_token) : null;
  const accessTokenExpiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
  const scopes = (tokens.scope ?? GOOGLE_SCOPES.join(" "))
    .split(/\s+/)
    .filter(Boolean)
    .join(",");

  await prisma.userGoogleAuth.upsert({
    where: { userId },
    create: {
      userId,
      googleEmail: email,
      refreshTokenEnc,
      accessTokenEnc,
      accessTokenExpiresAt,
      scopes,
    },
    update: {
      googleEmail: email,
      refreshTokenEnc,
      accessTokenEnc,
      accessTokenExpiresAt,
      scopes,
      lastError: null,
      lastErrorAt: null,
    },
  });

  return { email };
}

/**
 * Devolve um OAuth2Client pronto para chamar APIs como o usuário.
 * Lança erro se não houver token — chamador trata como "desconectado".
 *
 * O googleapis cuida do refresh automaticamente quando o accessToken vence;
 * a gente escuta o evento 'tokens' para persistir o novo access (e refresh,
 * caso o Google decida rotacionar).
 */
export async function getGoogleClientForUser(userId: string): Promise<OAuth2Client> {
  const row = await prisma.userGoogleAuth.findUnique({ where: { userId } });
  if (!row) {
    throw new GoogleNotConnectedError("Conta Google não conectada para este usuário.");
  }

  const { clientId, clientSecret } = loadClientCreds();
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);

  const refreshToken = decryptSecret(row.refreshTokenEnc);
  const accessToken = row.accessTokenEnc ? decryptSecret(row.accessTokenEnc) : undefined;
  const expiryDate = row.accessTokenExpiresAt?.getTime();

  oauth2.setCredentials({
    refresh_token: refreshToken,
    access_token: accessToken,
    expiry_date: expiryDate,
  });

  oauth2.on("tokens", (newTokens) => {
    // Persistência best-effort; erro aqui não bloqueia a request principal.
    // Loga só o nome do erro — NUNCA o conteúdo (tokens).
    void (async () => {
      try {
        const data: {
          accessTokenEnc?: string;
          accessTokenExpiresAt?: Date | null;
          refreshTokenEnc?: string;
        } = {};
        if (newTokens.access_token) {
          data.accessTokenEnc = encryptSecret(newTokens.access_token);
        }
        if (newTokens.expiry_date) {
          data.accessTokenExpiresAt = new Date(newTokens.expiry_date);
        }
        if (newTokens.refresh_token) {
          data.refreshTokenEnc = encryptSecret(newTokens.refresh_token);
        }
        if (Object.keys(data).length > 0) {
          await prisma.userGoogleAuth.update({ where: { userId }, data });
        }
      } catch (err) {
        const name = err instanceof Error ? err.name : "UnknownError";
        // user é referenciado por id; sem PII no log
        console.warn(`[google-oauth] falha ao persistir rotação de token (${name})`);
      }
    })();
  });

  return oauth2;
}

/**
 * Marca erro persistente no registro (ex.: invalid_grant após revogação).
 */
export async function recordGoogleAuthError(userId: string, message: string): Promise<void> {
  await prisma.userGoogleAuth.updateMany({
    where: { userId },
    data: {
      lastError: message.slice(0, 500),
      lastErrorAt: new Date(),
    },
  });
}

export async function touchGoogleAuthUsage(userId: string): Promise<void> {
  await prisma.userGoogleAuth.updateMany({
    where: { userId },
    data: { lastUsedAt: new Date() },
  });
}

/**
 * Revoga o token no Google e apaga o registro.
 * Se a revogação falhar (token já inválido), só apaga local.
 */
export async function disconnectGoogleForUser(userId: string): Promise<void> {
  const row = await prisma.userGoogleAuth.findUnique({ where: { userId } });
  if (!row) return;
  try {
    const { clientId, clientSecret } = loadClientCreds();
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    const refreshToken = decryptSecret(row.refreshTokenEnc);
    await oauth2.revokeToken(refreshToken);
  } catch {
    // ignora — vamos deletar mesmo assim
  }
  await prisma.userGoogleAuth.delete({ where: { userId } });
}

export class GoogleNotConnectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleNotConnectedError";
  }
}

export function isInvalidGrantError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { message?: string; response?: { data?: { error?: string } } };
  const msg = anyErr.message ?? "";
  const respErr = anyErr.response?.data?.error;
  return /invalid_grant/i.test(msg) || respErr === "invalid_grant";
}

/**
 * Calcula o origin real, respeitando o proxy do Railway.
 * Usar como base do `redirectUri` em /connect e /connect-callback.
 */
export function resolveOrigin(request: Request): string {
  const headers = request.headers;
  const forwardedHost = headers.get("x-forwarded-host");
  const forwardedProto = headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  return new URL(request.url).origin;
}

export function getRedirectUri(request: Request): string {
  return `${resolveOrigin(request)}/api/integracoes/google/connect-callback`;
}
