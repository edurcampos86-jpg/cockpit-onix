import "server-only";
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

/**
 * OAuth per-user Microsoft (Graph) — espelha google-user-oauth.ts.
 *
 * Por que sem SDK: o @microsoft/microsoft-graph-client + @azure/identity
 * pesam ~MB e fazem mais do que precisamos. Usamos fetch direto contra
 * login.microsoftonline.com (token endpoint) e graph.microsoft.com/v1.0
 * (chamadas REST).
 *
 * Refresh tokens MS:
 *  - validos 90 dias para confidential clients (web app);
 *  - ROTACIONAM a cada refresh (vem refresh_token novo no response) —
 *    diferente do Google. Precisamos persistir o novo RT senao perde
 *    acesso na proxima rotacao.
 */

const MS_LOGIN = "https://login.microsoftonline.com";
const MS_GRAPH = "https://graph.microsoft.com/v1.0";

export const MS_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access", // requerido pra receber refresh_token
  "User.Read", // /me + perfil basico
  "Calendars.Read",
  "Mail.Read",
];

const STATE_TTL_SECONDS = 60 * 10;

function loadStateKey(): Uint8Array {
  const secret = process.env.MICROSOFT_OAUTH_STATE_SECRET;
  if (!secret) {
    throw new Error(
      "MICROSOFT_OAUTH_STATE_SECRET ausente. Gere com: node -e 'console.log(require(\"crypto\").randomBytes(32).toString(\"base64\"))'",
    );
  }
  return new TextEncoder().encode(secret);
}

function loadClientCreds(): {
  clientId: string;
  clientSecret: string;
  tenant: string;
} {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "MICROSOFT_CLIENT_ID/MICROSOFT_CLIENT_SECRET ausentes nas variáveis de ambiente.",
    );
  }
  // "common" = consumer + work/school. "organizations" = só work/school.
  // Tenant ID específico = lock numa única org.
  const tenant = process.env.MICROSOFT_TENANT || "common";
  return { clientId, clientSecret, tenant };
}

export const MICROSOFT_OAUTH_NONCE_COOKIE = "ms_oauth_nonce";
export const MICROSOFT_OAUTH_NONCE_TTL_SECONDS = STATE_TTL_SECONDS;

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
    const { payload } = await jwtVerify(state, loadStateKey(), {
      algorithms: ["HS256"],
    });
    if (typeof payload.userId !== "string") return null;
    if (typeof payload.nonce !== "string") return null;
    if (!expectedNonce) return null;
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

export function getMicrosoftAuthUrlForUser(
  state: string,
  redirectUri: string,
): string {
  const { clientId, tenant } = loadClientCreds();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MS_SCOPES.join(" "),
    state,
    prompt: "consent", // garante refresh_token novo a cada conexao
  });
  return `${MS_LOGIN}/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
}

interface TokenResponse {
  token_type: string;
  scope: string;
  expires_in: number;
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function callTokenEndpoint(body: URLSearchParams): Promise<TokenResponse> {
  const { tenant } = loadClientCreds();
  const res = await fetch(`${MS_LOGIN}/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || data.error) {
    throw new Error(
      `Microsoft token endpoint ${res.status}: ${data.error ?? "?"} — ${data.error_description ?? ""}`.slice(
        0,
        500,
      ),
    );
  }
  return data;
}

/**
 * Troca o code pelo refresh+access token, descobre o e-mail (Graph /me) e
 * faz upsert cifrado em UserMicrosoftAuth.
 */
export async function exchangeCodeForUser(
  userId: string,
  code: string,
  redirectUri: string,
): Promise<{ email: string }> {
  const { clientId, clientSecret } = loadClientCreds();

  const tokenBody = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: MS_SCOPES.join(" "),
  });
  const tokens = await callTokenEndpoint(tokenBody);

  if (!tokens.refresh_token) {
    throw new Error(
      "Microsoft não devolveu refresh_token — confirme que o escopo offline_access está sendo solicitado.",
    );
  }

  // /me devolve userPrincipalName, mail, displayName, id (tenant id sai do id_token).
  const meRes = await fetch(`${MS_GRAPH}/me`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!meRes.ok) {
    throw new Error(
      `Microsoft Graph /me ${meRes.status} ao buscar perfil do usuario.`,
    );
  }
  type GraphMe = {
    id?: string;
    userPrincipalName?: string;
    mail?: string;
    displayName?: string;
  };
  const me = (await meRes.json()) as GraphMe;
  const email = me.mail ?? me.userPrincipalName ?? "";
  if (!email) {
    throw new Error("Não foi possível obter o e-mail da conta Microsoft conectada.");
  }

  // tenant_id sai do id_token (claim 'tid') se presente. Best-effort.
  let tenantId: string | null = null;
  if (tokens.id_token) {
    try {
      const parts = tokens.id_token.split(".");
      if (parts.length === 3) {
        const claims = JSON.parse(
          Buffer.from(parts[1], "base64url").toString("utf8"),
        ) as { tid?: string };
        tenantId = claims.tid ?? null;
      }
    } catch {
      /* ignora */
    }
  }

  const refreshTokenEnc = encryptSecret(tokens.refresh_token);
  const accessTokenEnc = encryptSecret(tokens.access_token);
  const accessTokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const scopes = (tokens.scope ?? MS_SCOPES.join(" "))
    .split(/\s+/)
    .filter(Boolean)
    .join(",");

  await prisma.userMicrosoftAuth.upsert({
    where: { userId },
    create: {
      userId,
      microsoftEmail: email,
      microsoftTenantId: tenantId,
      refreshTokenEnc,
      accessTokenEnc,
      accessTokenExpiresAt,
      scopes,
    },
    update: {
      microsoftEmail: email,
      microsoftTenantId: tenantId,
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
 * Devolve um access_token valido pra `userId`. Faz refresh automatico se o
 * cache expirou (60s de margem). Persiste o NOVO refresh_token (rotacao MS).
 *
 * Lanca MicrosoftNotConnectedError se nao houver registro.
 */
export async function getMicrosoftAccessTokenForUser(
  userId: string,
): Promise<string> {
  const row = await prisma.userMicrosoftAuth.findUnique({ where: { userId } });
  if (!row) {
    throw new MicrosoftNotConnectedError(
      "Conta Microsoft não conectada para este usuário.",
    );
  }

  // Cache hit: ainda valido com 60s de margem.
  if (
    row.accessTokenEnc &&
    row.accessTokenExpiresAt &&
    row.accessTokenExpiresAt.getTime() - Date.now() > 60_000
  ) {
    return decryptSecret(row.accessTokenEnc);
  }

  // Refresh.
  const { clientId, clientSecret } = loadClientCreds();
  const refreshToken = decryptSecret(row.refreshTokenEnc);
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: MS_SCOPES.join(" "),
  });
  const tokens = await callTokenEndpoint(body);

  const accessTokenEnc = encryptSecret(tokens.access_token);
  const accessTokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  // MS rotaciona refresh_token a cada uso — persiste o novo se vier.
  const refreshTokenEnc = tokens.refresh_token
    ? encryptSecret(tokens.refresh_token)
    : row.refreshTokenEnc;

  await prisma.userMicrosoftAuth.update({
    where: { userId },
    data: {
      refreshTokenEnc,
      accessTokenEnc,
      accessTokenExpiresAt,
      lastUsedAt: new Date(),
    },
  });

  return tokens.access_token;
}

export async function recordMicrosoftAuthError(
  userId: string,
  message: string,
): Promise<void> {
  await prisma.userMicrosoftAuth.updateMany({
    where: { userId },
    data: {
      lastError: message.slice(0, 500),
      lastErrorAt: new Date(),
    },
  });
}

export async function touchMicrosoftAuthUsage(userId: string): Promise<void> {
  await prisma.userMicrosoftAuth.updateMany({
    where: { userId },
    data: { lastUsedAt: new Date() },
  });
}

/**
 * Revoga o token no Microsoft (endpoint Logout) e apaga o registro local.
 * Microsoft nao tem endpoint REST direto de revoke (precisa abrir browser
 * pra logout interativo). Apaga o registro local — proximo uso do token
 * vai falhar e o usuario re-conecta.
 */
export async function disconnectMicrosoftForUser(userId: string): Promise<void> {
  const row = await prisma.userMicrosoftAuth.findUnique({ where: { userId } });
  if (!row) return;
  await prisma.userMicrosoftAuth.delete({ where: { userId } });
}

export class MicrosoftNotConnectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MicrosoftNotConnectedError";
  }
}

export function isMicrosoftInvalidGrantError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { message?: string };
  const msg = anyErr.message ?? "";
  return /invalid_grant|AADSTS70008|AADSTS50173/i.test(msg);
}

export function isMicrosoftInsufficientPermissionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { message?: string; status?: number };
  if (anyErr.status === 403) return true;
  const msg = anyErr.message ?? "";
  return /403|insufficient|ErrorAccessDenied/i.test(msg);
}

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
  return `${resolveOrigin(request)}/api/integracoes/microsoft/connect-callback`;
}
