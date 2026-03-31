/**
 * Zapier Webhook Integration
 * Recebe dados do Plaud.ai via Zapier e processa com Claude AI
 */

import { getIntegrationConfig } from "./config";

/**
 * Valida o webhook secret para autenticar requests do Zapier
 */
export async function validateWebhookSecret(secret: string): Promise<boolean> {
  const config = await getIntegrationConfig();
  const expectedSecret = config.ZAPIER_WEBHOOK_SECRET;
  // Se não configurou secret, aceita qualquer request (dev mode)
  if (!expectedSecret) return true;
  return secret === expectedSecret;
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
  transcription?: string;
  summary?: string;
  action_items?: string[];
  audio_url?: string;
  external_id?: string;
  // Metadados do Zapier
  zap_id?: string;
  timestamp?: string;
}

/**
 * Normaliza payload do Zapier (pode vir em formatos diferentes)
 */
export function normalizePayload(raw: Record<string, unknown>): PlaudWebhookPayload {
  return {
    title: (raw.title || raw.meeting_title || raw.subject || raw.name || "Reunião sem título") as string,
    date: (raw.date || raw.meeting_date || raw.created_at || new Date().toISOString()) as string,
    duration: raw.duration ? Number(raw.duration) : undefined,
    participants: Array.isArray(raw.participants)
      ? raw.participants
      : typeof raw.participants === "string"
        ? (raw.participants as string).split(",").map((s: string) => s.trim())
        : undefined,
    transcription: (raw.transcription || raw.transcript || raw.text || raw.content) as string | undefined,
    summary: (raw.summary || raw.ai_summary || raw.description) as string | undefined,
    action_items: Array.isArray(raw.action_items)
      ? raw.action_items
      : typeof raw.action_items === "string"
        ? (raw.action_items as string).split("\n").filter(Boolean)
        : undefined,
    audio_url: (raw.audio_url || raw.recording_url || raw.file_url) as string | undefined,
    external_id: (raw.external_id || raw.id || raw.plaud_id || raw.recording_id) as string | undefined,
    zap_id: raw.zap_id as string | undefined,
    timestamp: raw.timestamp as string | undefined,
  };
}
