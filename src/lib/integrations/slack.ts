import "server-only";
import { getConfig } from "@/lib/config-db";

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
