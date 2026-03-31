/**
 * Microsoft Graph API Client — Outlook Calendar
 * Docs: https://learn.microsoft.com/en-us/graph/api/resources/calendar-api-overview
 */

import { ConfidentialClientApplication } from "@azure/msal-node";
import { getIntegrationConfig, setIntegrationConfig } from "./config";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SCOPES = ["https://graph.microsoft.com/.default"];

// ============================================
// AUTH — OAuth2 com MSAL
// ============================================

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getMsalApp(): Promise<ConfidentialClientApplication> {
  const config = await getIntegrationConfig();
  const clientId = config.MICROSOFT_CLIENT_ID;
  const clientSecret = config.MICROSOFT_CLIENT_SECRET;
  const tenantId = config.MICROSOFT_TENANT_ID || "common";

  if (!clientId || !clientSecret) {
    throw new Error("Microsoft Graph não configurado. Configure MICROSOFT_CLIENT_ID e MICROSOFT_CLIENT_SECRET em Integrações.");
  }

  return new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  });
}

async function getAccessToken(): Promise<string> {
  // Verificar cache
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.accessToken;
  }

  // Verificar se temos refresh token
  const config = await getIntegrationConfig();

  if (config.MICROSOFT_REFRESH_TOKEN) {
    return refreshAccessToken(config.MICROSOFT_REFRESH_TOKEN);
  }

  // Fallback: client credentials (app-only, sem contexto de usuário)
  const app = await getMsalApp();
  const result = await app.acquireTokenByClientCredential({
    scopes: SCOPES,
  });

  if (!result?.accessToken) {
    throw new Error("Falha ao obter token do Microsoft Graph");
  }

  tokenCache = {
    accessToken: result.accessToken,
    expiresAt: Date.now() + (result.expiresOn ? result.expiresOn.getTime() - Date.now() : 3600 * 1000),
  };

  return result.accessToken;
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const config = await getIntegrationConfig();
  const params = new URLSearchParams({
    client_id: config.MICROSOFT_CLIENT_ID,
    client_secret: config.MICROSOFT_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: "https://graph.microsoft.com/Calendars.ReadWrite offline_access",
  });

  const tenantId = config.MICROSOFT_TENANT_ID || "common";
  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error("Falha ao renovar token. Reconecte o Outlook em Integrações.");
  }

  const data = await res.json();
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  // Salvar novo refresh token
  if (data.refresh_token) {
    await setIntegrationConfig("MICROSOFT_REFRESH_TOKEN", data.refresh_token);
  }

  return data.access_token;
}

async function graphRequest(method: string, path: string, body?: unknown) {
  const token = await getAccessToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: 'outlook.body-content-type="text"',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft Graph error (${res.status}): ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ============================================
// OAUTH2 AUTHORIZATION CODE FLOW
// ============================================

export function getAuthUrl(redirectUri: string, clientId: string, tenantId = "common"): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "https://graph.microsoft.com/Calendars.ReadWrite offline_access User.Read",
    response_mode: "query",
  });
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const config = await getIntegrationConfig();
  const tenantId = config.MICROSOFT_TENANT_ID || "common";

  const params = new URLSearchParams({
    client_id: config.MICROSOFT_CLIENT_ID,
    client_secret: config.MICROSOFT_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    scope: "https://graph.microsoft.com/Calendars.ReadWrite offline_access User.Read",
  });

  const res = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${text}`);
  }

  const data = await res.json();

  // Salvar tokens
  await setIntegrationConfig("MICROSOFT_ACCESS_TOKEN", data.access_token);
  if (data.refresh_token) {
    await setIntegrationConfig("MICROSOFT_REFRESH_TOKEN", data.refresh_token);
  }

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data;
}

// ============================================
// CALENDAR OPERATIONS
// ============================================

export interface OutlookEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName: string };
  body?: { contentType: string; content: string };
  attendees?: { emailAddress: { address: string; name: string }; type: string }[];
  isAllDay?: boolean;
  webLink?: string;
}

export async function listCalendars() {
  return graphRequest("GET", "/me/calendars");
}

export async function listEvents(startDate: string, endDate: string): Promise<{ value: OutlookEvent[] }> {
  const start = encodeURIComponent(startDate);
  const end = encodeURIComponent(endDate);
  return graphRequest("GET", `/me/calendarView?startDateTime=${start}&endDateTime=${end}&$orderby=start/dateTime&$top=50`);
}

export async function createEvent(event: {
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName: string };
  body?: { contentType: string; content: string };
  attendees?: { emailAddress: { address: string; name: string }; type: string }[];
}): Promise<OutlookEvent> {
  return graphRequest("POST", "/me/events", event);
}

export async function updateEvent(eventId: string, updates: Partial<OutlookEvent>): Promise<OutlookEvent> {
  return graphRequest("PATCH", `/me/events/${eventId}`, updates);
}

export async function deleteEvent(eventId: string): Promise<void> {
  await graphRequest("DELETE", `/me/events/${eventId}`);
}

export async function getMyProfile() {
  return graphRequest("GET", "/me");
}

// ============================================
// HELPERS
// ============================================

export function createPostPublicationEvent(postTitle: string, scheduledDate: string, scheduledTime: string) {
  const startDateTime = `${scheduledDate}T${scheduledTime || "12:00"}:00`;
  const endDate = new Date(`${scheduledDate}T${scheduledTime || "12:00"}:00`);
  endDate.setMinutes(endDate.getMinutes() + 30);
  const endDateTime = endDate.toISOString().replace("Z", "");

  return {
    subject: `📱 Publicar: ${postTitle}`,
    start: { dateTime: startDateTime, timeZone: "America/Bahia" },
    end: { dateTime: endDateTime, timeZone: "America/Bahia" },
    body: {
      contentType: "text",
      content: `Post agendado no Cockpit Onix: ${postTitle}\nPublicar no horário indicado.`,
    },
  };
}

export function createRecordingEvent(postTitle: string, recordDate: string) {
  return {
    subject: `🎬 Gravar: ${postTitle}`,
    start: { dateTime: `${recordDate}T09:00:00`, timeZone: "America/Bahia" },
    end: { dateTime: `${recordDate}T10:00:00`, timeZone: "America/Bahia" },
    body: {
      contentType: "text",
      content: `Gravação agendada automaticamente pelo Cockpit Onix para o post: ${postTitle}`,
    },
  };
}

// ============================================
// TESTAR CONEXÃO
// ============================================

export async function testConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const profile = await getMyProfile();
    return { success: true, message: `Conectado como ${profile.displayName} (${profile.mail})` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}
