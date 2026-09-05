import { getConfig } from "@/lib/config-db";
import { flagLigada } from "@/lib/flags/registro";

/**
 * Gate (Config DB) do aviso de WhatsApp quando o ManyChat detecta uma palavra
 * -gatilho numa DM do Instagram. Flag PRÓPRIA, default OFF.
 *
 * Config DB, e NÃO env: é a convenção deste repositório (ver
 * `lib/flags/registro.ts`) e é o que permite desligar o aviso sem rebuild —
 * uma campanha que dispara demais precisa parar em segundos, não em um deploy.
 *
 * OFF → a rota continua respondendo 200 para o ManyChat (senão a plataforma
 * marca o External Request como quebrado), mas nada é enviado ao WhatsApp.
 * Deploy com a chave ausente não muda nada visível.
 */
export const MANYCHAT_LEAD_ALERT_FLAG = "MANYCHAT_LEAD_ALERT";

/** Aviso de lead habilitado? Lê a flag do Config DB a cada chamada. Default OFF. */
export async function manychatLeadAlertHabilitado(): Promise<boolean> {
  return flagLigada(await getConfig(MANYCHAT_LEAD_ALERT_FLAG));
}
