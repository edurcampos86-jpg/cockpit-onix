/**
 * Zapier Webhook Integration
 * Recebe dados do Plaud.ai via Zapier e processa com Claude AI
 */

import { getIntegrationConfig } from "./config";
import { safeEqual } from "@/lib/security/timing-safe";

/**
 * Valida o webhook secret para autenticar requests do Zapier.
 * Default-deny: sem secret configurado, recusa todas as requests
 * (em dev, permite via FLAG explícita ZAPIER_WEBHOOK_DEV_OPEN=true).
 */
export async function validateWebhookSecret(secret: string): Promise<boolean> {
  const config = await getIntegrationConfig();
  const expectedSecret = config.ZAPIER_WEBHOOK_SECRET;
  if (!expectedSecret) {
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.ZAPIER_WEBHOOK_DEV_OPEN === "true"
    ) {
      return true;
    }
    return false;
  }
  return safeEqual(secret, expectedSecret);
}

/**
 * Interface padrão para dados recebidos do Plaud via Zapier
 * O Zapier pode enviar diferentes formatos dependendo da configuração
 */
export interface PlaudWebhookPayload {
  // Dados do Plaud
  title?: string;
  date?: string;
  duration?: number; // minutos
  participants?: string[];
  vendedor?: string;  // vendedor da equipe: "Eduardo Campos" | "Thiago Vergal" | "Rose Oliveira"
  transcription?: string;
  summary?: string;
  action_items?: string[];
  audio_url?: string;
  external_id?: string;
  // Metadados do Zapier
  zap_id?: string;
  timestamp?: string;
}

// Mapeamento de keywords para identificar o vendedor pelo título/participantes
const VENDEDOR_KEYWORDS: Record<string, string[]> = {
  "Eduardo Campos": ["eduardo"],
  "Rose Oliveira":  ["rose"],
  "Thiago Vergal":  ["thiago"],
};

/**
 * Tenta identificar o vendedor a partir do título e/ou participantes
 */
export function identificarVendedorDoPayload(
  title?: string,
  participants?: string[]
): string | null {
  const texto = [title ?? "", ...(participants ?? [])].join(" ").toLowerCase();
  for (const [vendedor, keywords] of Object.entries(VENDEDOR_KEYWORDS)) {
    if (keywords.some((kw) => texto.includes(kw))) return vendedor;
  }
  return null;
}

/**
 * Normaliza payload do Zapier (pode vir em formatos diferentes)
 */
export function normalizePayload(raw: Record<string, unknown>): PlaudWebhookPayload {
  const title = (raw.title || raw.meeting_title || raw.subject || raw.name || "Reunião sem título") as string;
  const participants: string[] | undefined = Array.isArray(raw.participants)
    ? raw.participants as string[]
    : typeof raw.participants === "string"
      ? (raw.participants as string).split(",").map((s: string) => s.trim())
      : undefined;

  // Vendedor: usa o campo explícito ou tenta detectar pelo título/participantes
  const vendedorExplicito = (raw.vendedor || raw.salesperson || raw.seller) as string | undefined;
  const vendedor = vendedorExplicito || identificarVendedorDoPayload(title, participants) || undefined;

  return {
    title,
    date: (raw.date || raw.meeting_date || raw.created_at || new Date().toISOString()) as string,
    duration: raw.duration ? Number(raw.duration) : undefined,
    participants,
    vendedor,
    transcription: (raw.transcription || raw.transcript || raw.text || raw.content) as string | undefined,
    summary: (raw.summary || raw.ai_summary || raw.description) as string | undefined,
    action_items: Array.isArray(raw.action_items)
      ? raw.action_items as string[]
      : typeof raw.action_items === "string"
        ? (raw.action_items as string).split("\n").filter(Boolean)
        : undefined,
    audio_url: (raw.audio_url || raw.recording_url || raw.file_url) as string | undefined,
    external_id: (raw.external_id || raw.id || raw.plaud_id || raw.recording_id) as string | undefined,
    zap_id: raw.zap_id as string | undefined,
    timestamp: raw.timestamp as string | undefined,
  };
}
