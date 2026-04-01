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

/**
 * A API do ManyChat não possui endpoint de listagem em massa de subscribers.
 * Esta função busca subscribers via múltiplos critérios (custom fields, tags por nome)
 * e deduplica os resultados por ID.
 */
export async function getSubscribers(): Promise<{ data: ManyChatSubscriber[] }> {
  const allSubs = new Map<string, ManyChatSubscriber>();

  // Buscar por custom fields preenchidos (leads que passaram pelos fluxos de qualificação)
  const customFieldIds = [14218991, 14219014, 14219021, 14219029, 14294422, 14294428, 14294431, 14294433];
  const fieldValues = [
    "Já tem plano", "Não tem plano", "Individual", "Familiar", "Empresarial",
    "CLT", "MEI ou PJ", "Servidor Público", "Autônomo",
    "Já investe", "Ainda não investe",
    "10 mil", "50 mil", "100 mil", "500 mil", "1 milhão",
  ];

  // Buscar por todos os custom fields relevantes
  const searchPromises: Promise<void>[] = [];
  for (const fieldId of customFieldIds) {
    for (const value of fieldValues) {
      searchPromises.push(
        findByCustomField(fieldId, value)
          .then((result) => {
            for (const sub of result.data || []) {
              allSubs.set(sub.id, sub);
            }
          })
          .catch(() => {})
      );
    }
  }

  // Buscar também por nomes comuns (fallback para pegar leads sem custom fields)
  const nameSearches = ["Dr", "Maria", "Jo", "Ana", "Carlos", "Paulo", "Lu", "Fa", "Da", "Al", "Fe", "Ro"];
  for (const name of nameSearches) {
    searchPromises.push(
      findByName(name)
        .then((result) => {
          for (const sub of result.data || []) {
            allSubs.set(sub.id, sub);
          }
        })
        .catch(() => {})
    );
  }

  await Promise.all(searchPromises);

  return { data: Array.from(allSubs.values()) };
}

export async function findByName(name: string): Promise<{ data: ManyChatSubscriber[] }> {
  return request("GET", `/fb/subscriber/findByName?name=${encodeURIComponent(name)}`);
}

export async function findByCustomField(fieldId: number, fieldValue: string): Promise<{ data: ManyChatSubscriber[] }> {
  return request("GET", `/fb/subscriber/findByCustomField?field_id=${fieldId}&field_value=${encodeURIComponent(fieldValue)}`);
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
  return request("GET", "/fb/page/getTags");
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

export async function getFlows(): Promise<{ data: { flows: ManyChatFlow[] } }> {
  return request("GET", "/fb/page/getFlows");
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

export function classifyProductInterest(tags: { name: string }[], customFields?: { name: string; value: string | null }[]): string | null {
  // Primeiro: classificar por tags
  for (const tag of tags) {
    const upper = tag.name.toUpperCase().trim();
    if (KEYWORD_PRODUCT_MAP[upper]) return KEYWORD_PRODUCT_MAP[upper];
  }
  // Segundo: inferir por custom fields
  if (customFields) {
    const fields = Object.fromEntries(customFields.filter(f => f.value).map(f => [f.name, f.value!]));
    if (fields.status_investidor || fields.valor_investido || fields.banco_que_investe) return "investimentos";
    if (fields.status_plano || fields.tipo_plano) return "consorcio_saude";
  }
  return null;
}

export function classifyTemperature(tags: { name: string }[], customFields?: { name: string; value: string | null }[]): string {
  const tagNames = tags.map((t) => t.name.toUpperCase());
  if (tagNames.some((t) => t.includes("QUENTE") || t.includes("HOT"))) return "quente";
  if (tagNames.some((t) => t.includes("FRIO") || t.includes("COLD"))) return "frio";

  // Inferir temperatura por completude dos custom fields (mais dados = mais quente)
  if (customFields) {
    const filledFields = customFields.filter(f => f.value).length;
    if (filledFields >= 4) return "quente";
    if (filledFields >= 2) return "morno";
  }

  return "morno";
}

export function subscriberToLead(sub: ManyChatSubscriber) {
  const customFields = sub.custom_fields || [];
  const fields = Object.fromEntries(customFields.filter(f => f.value).map(f => [f.name, f.value!]));

  // Montar notas com contexto rico dos custom fields
  const notesParts = [`ManyChat ID: ${sub.id}`];
  if (fields.status_plano) notesParts.push(`Plano: ${fields.status_plano}`);
  if (fields.vinculo_plano) notesParts.push(`Vínculo: ${fields.vinculo_plano}`);
  if (fields.tipo_plano) notesParts.push(`Tipo: ${fields.tipo_plano}`);
  if (fields.status_investidor) notesParts.push(`Investidor: ${fields.status_investidor}`);
  if (fields.valor_investido) notesParts.push(`Valor: R$${fields.valor_investido}`);
  if (fields.banco_que_investe) notesParts.push(`Banco: ${fields.banco_que_investe}`);

  return {
    name: sub.name || `${sub.first_name} ${sub.last_name}`.trim(),
    email: sub.email || null,
    phone: sub.phone || null,
    origin: "manychat" as const,
    temperature: classifyTemperature(sub.tags, customFields),
    productInterest: classifyProductInterest(sub.tags, customFields),
    notes: notesParts.join(" | "),
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
