import "server-only";
import { sendSlackMessage } from "@/lib/integrations/slack";
import { sendWhatsappMessage } from "@/lib/integrations/datacrazy-send";

type Severity = "info" | "warn" | "crit";

const PREFIX: Record<Severity, string> = {
  info: "ℹ️",
  warn: "⚠️",
  crit: "🚨",
};

/**
 * Despacha uma notificação para Slack + WhatsApp em paralelo.
 *
 * - Slack: usa o webhook configurado (canal fixo).
 * - WhatsApp: usa o número configurado em `DATACRAZY_ALERTS_PHONE`.
 *
 * Retorna o status de cada canal, sem nunca lançar. Quem chama decide
 * se um sucesso parcial é aceitável.
 */
export async function notify(args: {
  title: string;
  body: string;
  severity?: Severity;
}): Promise<{ slack: boolean; whatsapp: boolean }> {
  const severity = args.severity ?? "info";
  const formatted = `${PREFIX[severity]} *${args.title}*\n${args.body}`;

  const [slack, whatsapp] = await Promise.all([
    sendSlackMessage(formatted),
    sendWhatsappMessage(formatted),
  ]);

  return { slack, whatsapp };
}
