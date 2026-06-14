import "server-only";
import { getConfig, setConfig } from "@/lib/config-db";

/**
 * Envia uma mensagem para o canal Slack via Incoming Webhook.
 *
 * Pré-requisito: `SLACK_ALERTS_WEBHOOK_URL` cadastrado em `Config` (ou env).
 * O webhook já tem o canal embutido — não é possível redirecionar.
 *
 * Retorna `true` em sucesso, `false` caso o webhook não esteja configurado
 * ou a chamada falhe. Nunca lança — alertar não pode quebrar fluxo principal.
 */
export async function sendSlackMessage(text: string): Promise<boolean> {
  const url = await getConfig("SLACK_ALERTS_WEBHOOK_URL");
  if (!url) return false;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Cooldown default (min) entre alertas repetidos da MESMA `key`. Sobrescrevível
 *  em Config DB via SLACK_ALERT_COOLDOWN_MIN (sem deploy). */
export const DEFAULT_SLACK_ALERT_COOLDOWN_MIN = 60;

/**
 * Alerta no Slack COM cooldown por `key`, persistido em Config DB na chave
 * `SLACK_ALERT_LAST_SENT_<key>` (ISO da última emissão). Envia na hora se a
 * última emissão dessa key foi há mais de `cooldownMin`; caso contrário SUPRIME.
 *
 * Existe porque a checagem de freshness passou a rodar com alta frequência
 * (tick in-process a cada 30min) — sem dedup, um episódio stale viraria spam no
 * Slack. O cooldown é AGNÓSTICO DE ORIGEM: GHA e tick in-process compartilham a
 * mesma key, então quem detectar primeiro alerta e o resto da janela fica
 * suprimido. Na cadência do GHA isolado (1x/dia útil >> cooldown) é INERTE — não
 * muda o comportamento atual.
 *
 * O carimbo só é gravado quando a mensagem REALMENTE sai (sent === true), pra um
 * webhook ausente/falho não consumir a janela sem nunca ter alertado.
 *
 * NÃO altera `sendSlackMessage` (usada por outros alertas, sem throttle).
 * Retorna `true` se enviou agora; `false` se suprimido pelo cooldown ou se o
 * envio falhou.
 */
export async function sendSlackAlertThrottled(
  key: string,
  text: string,
  cooldownMin?: number,
): Promise<boolean> {
  const stampKey = `SLACK_ALERT_LAST_SENT_${key}`;

  let cooldown = cooldownMin ?? DEFAULT_SLACK_ALERT_COOLDOWN_MIN;
  if (cooldownMin === undefined) {
    const overrideRaw = await getConfig("SLACK_ALERT_COOLDOWN_MIN");
    const n = overrideRaw ? Number(overrideRaw) : NaN;
    if (Number.isFinite(n) && n > 0) cooldown = n;
  }

  const lastRaw = await getConfig(stampKey);
  const lastMs = lastRaw ? Date.parse(lastRaw) : NaN;
  const now = Date.now();
  if (Number.isFinite(lastMs) && now - lastMs < cooldown * 60_000) {
    return false; // dentro do cooldown — suprime a repetição
  }

  const sent = await sendSlackMessage(text);
  if (sent) await setConfig(stampKey, new Date(now).toISOString());
  return sent;
}
