/**
 * ManyChat API Client
 * Docs: https://api.manychat.com/swagger
 */

import { getIntegrationConfig } from "./config";

const BASE_URL = "https://api.manychat.com";

async function getToken(): Promise<string> {
  const config = await getIntegrationConfig();
  const token = config.MANYCHAT_API_TOKEN;
  if (!token) throw new Error("MANYCHAT_API_TOKEN não configurado. Vá em Integrações para configurar.");
  return token;
}

async function request(method: string, path: string, body?: unknown) {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ManyChat API error (${res.status}): ${text}`);
  }

  return res.json();
}

// ============================================
// SUBSCRIBERS (Leads)
// ============================================

export interface ManyChatSubscriber {
  id: string;
  page_id: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string | null;
  phone: string | null;
  gender: string;
  profile_pic: string;
  locale: string;
  opted_in: boolean;
  last_interaction: string;
  tags: { id: number; name: string }[];
  custom_fields: { id: number; name: string; value: string | null }[];
}

export async function getSubscribers(): Promise<{ data: ManyChatSubscriber[] }> {
  return request("GET", "/fb/subscriber/getSubscribers");
}

export async function getSubscriberInfo(subscriberId: string): Promise<{ data: ManyChatSubscriber }> {
  return request("GET", `/fb/subscriber/getInfo?subscriber_id=${subscriberId}`);
}

export async function findByEmail(email: string): Promise<{ data: ManyChatSubscriber[] }> {
  return request("GET", `/fb/subscriber/findByEmail?email=${encodeURIComponent(email)}`);
}

export async function findByPhone(phone: string): Promise<{ data: ManyChatSubscriber[] }> {
  return request("GET", `/fb/subscriber/findByPhone?phone=${encodeURIComponent(phone)}`);
}

// ============================================
// TAGS
// ============================================

export interface ManyChatTag {
  id: number;
  name: string;
}

export async function getTags(): Promise<{ data: ManyChatTag[] }> {
  return request("GET", "/fb/tag/getTags");
}

export async function addTag(subscriberId: string, tagId: number) {
  return request("POST", "/fb/subscriber/addTag", { subscriber_id: subscriberId, tag_id: tagId });
}

export async function addTagByName(subscriberId: string, tagName: string) {
  return request("POST", "/fb/subscriber/addTagByName", { subscriber_id: subscriberId, tag_name: tagName });
}

export async function removeTag(subscriberId: string, tagId: number) {
  return request("POST", "/fb/subscriber/removeTag", { subscriber_id: subscriberId, tag_id: tagId });
}

// ============================================
// FLOWS
// ============================================

export interface ManyChatFlow {
  id: string;
  name: string;
  type: string;
}

export async function getFlows(): Promise<{ data: ManyChatFlow[] }> {
  return request("GET", "/fb/flow/getFlows");
}

export async function sendFlow(subscriberId: string, flowId: string) {
  return request("POST", "/fb/sending/sendFlow", {
    subscriber_id: subscriberId,
    flow_ns: flowId,
  });
}

// ============================================
// CUSTOM FIELDS
// ============================================

export async function setCustomField(subscriberId: string, fieldId: number, value: string) {
  return request("POST", "/fb/subscriber/setCustomField", {
    subscriber_id: subscriberId,
    field_id: fieldId,
    field_value: value,
  });
}

export async function setCustomFieldByName(subscriberId: string, fieldName: string, value: string) {
  return request("POST", "/fb/subscriber/setCustomFieldByName", {
    subscriber_id: subscriberId,
    field_name: fieldName,
    field_value: value,
  });
}

// ============================================
// HELPER: Mapear subscriber para Lead do Cockpit
// ============================================

const KEYWORD_PRODUCT_MAP: Record<string, string> = {
  BLINDAGEM: "investimentos",
  INVESTIMENTO: "investimentos",
  INVESTIMENTOS: "investimentos",
  SEGURO: "seguro_vida",
  SEGUROVIDA: "seguro_vida",
  IMÓVEL: "imoveis",
  IMOVEL: "imoveis",
  IMÓVEIS: "imoveis",
  PREVIDÊNCIA: "investimentos",
  PREVIDENCIA: "investimentos",
  CONSÓRCIO: "consorcio_saude",
  CONSORCIO: "consorcio_saude",
  SAÚDE: "consorcio_saude",
  SAUDE: "consorcio_saude",
};

export function classifyProductInterest(tags: { name: string }[]): string | null {
  for (const tag of tags) {
    const upper = tag.name.toUpperCase().trim();
    if (KEYWORD_PRODUCT_MAP[upper]) return KEYWORD_PRODUCT_MAP[upper];
  }
  return null;
}

export function classifyTemperature(tags: { name: string }[]): string {
  const tagNames = tags.map((t) => t.name.toUpperCase());
  if (tagNames.some((t) => t.includes("QUENTE") || t.includes("HOT"))) return "quente";
  if (tagNames.some((t) => t.includes("FRIO") || t.includes("COLD"))) return "frio";
  return "morno";
}

export function subscriberToLead(sub: ManyChatSubscriber) {
  return {
    name: sub.name || `${sub.first_name} ${sub.last_name}`.trim(),
    email: sub.email || null,
    phone: sub.phone || null,
    origin: "manychat" as const,
    temperature: classifyTemperature(sub.tags),
    productInterest: classifyProductInterest(sub.tags),
    notes: `ManyChat ID: ${sub.id}`,
    externalId: sub.id,
  };
}

// ============================================
// TESTAR CONEXÃO
// ============================================

export async function testConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const result = await getTags();
    return { success: true, message: `Conectado! ${result.data.length} tags encontradas.` };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Erro desconhecido" };
  }
}
