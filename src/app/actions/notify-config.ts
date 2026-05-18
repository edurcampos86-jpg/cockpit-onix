"use server";

import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { getConfig, setConfig } from "@/lib/config-db";
import { notify } from "@/lib/notify";

const KEYS = [
  "SLACK_ALERTS_WEBHOOK_URL",
  "DATACRAZY_ALERTS_PHONE",
  "DATACRAZY_ALERTS_INSTANCE",
  "DATACRAZY_CLIENT_TOKEN",
] as const;

type Key = (typeof KEYS)[number];

export type NotifyConfigStatus = {
  [K in Key]: { saved: boolean; masked: string | null };
};

function mask(value: string): string {
  if (value.length <= 8) return "***";
  return value.slice(0, 4) + "..." + value.slice(-4);
}

/**
 * Retorna o status de cada chave: se está salva e uma versão mascarada do valor
 * (4 primeiros + 4 últimos). Nunca devolve o valor inteiro.
 */
export async function getNotifyConfigStatus(): Promise<NotifyConfigStatus | { error: string }> {
  const ctx = await getAuthContext();
  if (!isAdmin(ctx)) return { error: "Apenas administradores podem ler essas configurações." };
  return readStatus();
}

export type SaveNotifyConfigState =
  | undefined
  | { success: true; status: NotifyConfigStatus; error?: never }
  | { error: string; success?: never; status?: never };

async function readStatus(): Promise<NotifyConfigStatus> {
  const entries = await Promise.all(
    KEYS.map(async (k) => {
      const v = await getConfig(k);
      return [k, v ? { saved: true, masked: mask(v) } : { saved: false, masked: null }] as const;
    }),
  );
  return Object.fromEntries(entries) as NotifyConfigStatus;
}

/**
 * Salva as chaves de notificação. Aceita preencher só as que estiverem
 * não-vazias — preservar valores anteriores se o input vier vazio.
 */
export async function saveNotifyConfig(
  _state: SaveNotifyConfigState | undefined,
  formData: FormData,
): Promise<SaveNotifyConfigState> {
  const ctx = await getAuthContext();
  if (!isAdmin(ctx)) return { error: "Apenas administradores podem alterar essas configurações." };

  const provided: Partial<Record<Key, string>> = {};
  for (const k of KEYS) {
    const raw = formData.get(k);
    if (typeof raw === "string" && raw.trim().length > 0) {
      provided[k] = raw.trim();
    }
  }

  if (Object.keys(provided).length === 0) {
    return { error: "Nenhum valor preenchido." };
  }

  // Validações leves
  if (provided.SLACK_ALERTS_WEBHOOK_URL && !provided.SLACK_ALERTS_WEBHOOK_URL.startsWith("https://hooks.slack.com/")) {
    return { error: "SLACK_ALERTS_WEBHOOK_URL deve começar com https://hooks.slack.com/" };
  }
  if (provided.DATACRAZY_ALERTS_PHONE && !/^\d{12,13}$/.test(provided.DATACRAZY_ALERTS_PHONE)) {
    return { error: "DATACRAZY_ALERTS_PHONE deve ser só dígitos no formato 5571XXXXXXXXX (12 ou 13 dígitos)." };
  }
  if (provided.DATACRAZY_ALERTS_INSTANCE && !/^[A-Z0-9]{20,40}$/.test(provided.DATACRAZY_ALERTS_INSTANCE)) {
    return { error: "DATACRAZY_ALERTS_INSTANCE parece inválido (esperado ID alfanumérico maiúsculo)." };
  }

  for (const [k, v] of Object.entries(provided)) {
    await setConfig(k, v);
  }

  return { success: true, status: await readStatus() };
}

/**
 * Dispara uma notificação de teste pelos dois canais e devolve o status.
 */
export async function testNotify(): Promise<{ slack: boolean; whatsapp: boolean } | { error: string }> {
  const ctx = await getAuthContext();
  if (!isAdmin(ctx)) return { error: "Apenas administradores podem testar." };

  const result = await notify({
    title: "Cockpit Onix — Teste de notificação",
    body: `Disparado por ${ctx.name} às ${new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia" })}.\nSe você está lendo isso, a integração funciona.`,
    severity: "info",
  });
  return result;
}
