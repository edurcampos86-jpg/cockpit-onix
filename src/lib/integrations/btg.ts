import { getIntegrationConfig } from "./config";

const TOKEN_URL = "https://api.btgpactual.com/iaas-auth/api/v1/authorization/oauth2/accesstoken";

export interface BtgToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

let cached: { token: BtgToken; obtainedAt: number } | null = null;

export async function getAccessToken(scope = ""): Promise<BtgToken> {
  if (cached && Date.now() - cached.obtainedAt < (cached.token.expires_in - 60) * 1000) {
    return cached.token;
  }
  const config = await getIntegrationConfig();
  const clientId = config.BTG_CLIENT_ID;
  const clientSecret = config.BTG_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("BTG credentials not configured");

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
      "x-id-partner-request": crypto.randomUUID(),
    },
    body: `grant_type=client_credentials${scope ? `&scope=${encodeURIComponent(scope)}` : ""}`,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`BTG token error ${res.status}: ${text || res.statusText}`);
  }
  // BTG IaaS retorna access_token no header, não no body
  const headerToken = res.headers.get("access_token") || res.headers.get("Access_token");
  let token: BtgToken;
  if (text) {
    try {
      token = JSON.parse(text) as BtgToken;
    } catch {
      token = { access_token: headerToken || text, token_type: "Bearer", expires_in: 900, scope };
    }
  } else if (headerToken) {
    token = { access_token: headerToken, token_type: "Bearer", expires_in: 900, scope };
  } else {
    throw new Error("BTG token: resposta vazia sem header access_token");
  }
  cached = { token, obtainedAt: Date.now() };
  return token;
}

const POSITION_BASE = "https://api.btgpactual.com/iaas-api-position";

async function authedGet(path: string): Promise<{ status: number; body: unknown; raw: string }> {
  const token = await getAccessToken();
  const res = await fetch(`${POSITION_BASE}${path}`, {
    method: "GET",
    headers: {
      "x-id-partner-request": crypto.randomUUID(),
      access_token: token.access_token,
    },
  });
  const raw = await res.text();
  let body: unknown = raw;
  try { body = raw ? JSON.parse(raw) : null; } catch { /* keep raw */ }
  return { status: res.status, body, raw };
}

/** Busca posição de uma conta específica do parceiro */
export async function getPositionByAccount(accountNumber: string) {
  return authedGet(`/api/v1/position/${encodeURIComponent(accountNumber)}`);
}

/** Solicita o arquivo de posições consolidadas do parceiro (todas as contas) */
export async function getPartnerPositions() {
  return authedGet(`/api/v1/position/partner`);
}

export async function testConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const token = await getAccessToken();
    return {
      success: true,
      message: `Conectado ao BTG Partner API. Token Bearer obtido (válido ~15 min, cache automático).`,
    };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}
