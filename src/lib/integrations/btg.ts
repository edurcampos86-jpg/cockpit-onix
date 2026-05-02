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

// Hosts das APIs IaaS BTG (descobertos via portal developer-partner)
const HOSTS = {
  position: "https://api.btgpactual.com/iaas-api-position",
  accountManagement: "https://api.btgpactual.com/iaas-account-management",
  accountBase: "https://api.btgpactual.com/api-account-base",
  accountBalance: "https://api.btgpactual.com/api-account-balance",
  suitability: "https://api.btgpactual.com/iaas-suitability",
  accountAdvisor: "https://api.btgpactual.com/iaas-account-advisor",
  operation: "https://api.btgpactual.com/iaas-api-operation",
  rmReports: "https://api.btgpactual.com/api-rm-reports",
  partnerReportHub: "https://api.btgpactual.com/api-partner-report-hub",
} as const;

export type ApiHostKey = keyof typeof HOSTS;

export interface BtgResponse {
  status: number;
  body: unknown;
  raw: string;
}

async function authedRequest(
  host: ApiHostKey,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<BtgResponse> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "x-id-partner-request": crypto.randomUUID(),
    access_token: token.access_token,
  };
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${HOSTS[host]}${path}`, {
    method: init.method || "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const raw = await res.text();
  let body: unknown = raw;
  try { body = raw ? JSON.parse(raw) : null; } catch { /* keep raw */ }
  return { status: res.status, body, raw };
}

// Helper legado mantido pra compatibilidade com código antigo
async function authedGet(path: string) {
  return authedRequest("position", path);
}

// ===== POSIÇÃO (iaas-api-position) =====

export async function getPositionByAccount(accountNumber: string) {
  return authedRequest("position", `/api/v1/position/${encodeURIComponent(accountNumber)}`);
}

export async function getPartnerPositions() {
  return authedRequest("position", `/api/v1/position/partner`);
}

/** Dispara geração de posições por parceiro — resposta vem via webhook */
export async function refreshPartnerPositions() {
  return authedRequest("position", `/api/v1/position/refresh`);
}

// ===== BASE DE CONTAS (api-account-base) =====
// Lista canônica de contas do parceiro — fonte da verdade pra "quem é cliente Onix"

export async function listAllAccounts() {
  return authedRequest("accountBase", `/api/v1/account-base/accounts`);
}

export async function listSensitiveAccounts() {
  return authedRequest("accountBase", `/api/v1/sensitive-account/accounts`);
}

// ===== DADOS CADASTRAIS (iaas-account-management) =====
// Síncrono · 60 req/min — usar com rate limit

export async function getAccountInformation(accountNumber: string) {
  return authedRequest(
    "accountManagement",
    `/api/v1/account-management/account/${encodeURIComponent(accountNumber)}/information`,
  );
}

// ===== SALDO DE CONTAS (api-account-balance) =====
// Saldo de TODAS as contas em UMA chamada

export async function listAllBalances() {
  return authedRequest("accountBalance", `/api/v1/account-balance/list`);
}

// ===== SUITABILITY (iaas-suitability) =====

export async function getSuitability(accountNumber: string) {
  return authedRequest(
    "suitability",
    `/api/v1/suitability/account/${encodeURIComponent(accountNumber)}`,
  );
}

export async function getSuitabilityInfo(accountNumber: string) {
  return authedRequest(
    "suitability",
    `/api/v1/suitability/account/${encodeURIComponent(accountNumber)}/info`,
  );
}

// ===== RELACIONAMENTO CONTA × ASSESSOR (iaas-account-advisor) =====

/** Lista todas contas do parceiro com seus assessores responsáveis */
export async function getAccountsByAdvisor() {
  return authedRequest("accountAdvisor", `/api/v1/advisor/link/account`);
}

export async function getAccountsByCge(cge: string) {
  return authedRequest("accountAdvisor", `/api/v1/advisor/accounts?cge=${encodeURIComponent(cge)}`);
}

export async function getOfficeInformations() {
  return authedRequest("accountAdvisor", `/api/v1/advisor/office-informations`);
}

// ===== MOVIMENTAÇÕES (iaas-api-operation) =====

export async function getMovementsByAccountFull(accountNumber: string) {
  return authedRequest("operation", `/api/v1/operation-history/full/${encodeURIComponent(accountNumber)}`);
}

export async function getMovementsByAccountMonthly(accountNumber: string) {
  return authedRequest("operation", `/api/v1/operation-history/monthly/${encodeURIComponent(accountNumber)}`);
}

export async function getMovementsByAccountWeekly(accountNumber: string) {
  return authedRequest("operation", `/api/v1/operation-history/weekly/${encodeURIComponent(accountNumber)}`);
}

export async function getMovementsByPartnerMonthly() {
  return authedRequest("operation", `/api/v1/operation-history/monthly`);
}

export async function getMovementsByPartnerWeekly() {
  return authedRequest("operation", `/api/v1/operation-history/weekly`);
}

export async function postMovementsByPartnerPeriod(startDate: string, endDate: string) {
  return authedRequest("operation", `/api/v1/operation-history/period`, {
    method: "POST",
    body: { startDate, endDate },
  });
}

// ===== RELATÓRIOS GERENCIAIS — COMISSÕES (api-rm-reports) =====
// Resposta tipicamente vem via webhook (assíncrono)

export async function getCommissionReport() {
  return authedRequest("rmReports", `/api/v1/rm-reports/commission`);
}

export async function getMonthlyCommissionReport(refDate: string) {
  return authedRequest("rmReports", `/api/v1/rm-reports/monthly-commission`, {
    method: "POST",
    body: { refDate },
  });
}

// ===== STVM / NET NEW MONEY (api-partner-report-hub) =====

export async function getStvmReport(startDate: string, endDate: string) {
  return authedRequest("partnerReportHub", `/api/v1/report/stvm`, {
    method: "POST",
    body: { startDate, endDate },
  });
}

// ===== RATE LIMITER (pra Dados Cadastrais — 60 req/min) =====

export async function rateLimitedSequential<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  opts: { maxPerMinute: number; onProgress?: (done: number, total: number) => void } = { maxPerMinute: 55 },
): Promise<R[]> {
  const results: R[] = [];
  const minIntervalMs = Math.ceil(60_000 / opts.maxPerMinute);
  for (let i = 0; i < items.length; i++) {
    const start = Date.now();
    results.push(await fn(items[i], i));
    if (opts.onProgress) opts.onProgress(i + 1, items.length);
    const elapsed = Date.now() - start;
    if (elapsed < minIntervalMs && i < items.length - 1) {
      await new Promise((r) => setTimeout(r, minIntervalMs - elapsed));
    }
  }
  return results;
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
