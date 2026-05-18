import "server-only";
import { getConfig } from "@/lib/config-db";

/**
 * Envia mensagem de texto via Z-API (Datacrazy WhatsApp).
 *
 * Pré-requisitos em `Config`:
 *   - DATACRAZY_TOKEN           (token da instância)
 *   - DATACRAZY_ALERTS_INSTANCE (ID da instância)
 *   - DATACRAZY_ALERTS_PHONE    (destinatário no formato 5571999999999)
 *
 * Opcional:
 *   - DATACRAZY_CLIENT_TOKEN    (token de segurança Z-API; se setado, vai no
 *     header `Client-Token`)
 *
 * `phone` aceita override; se omitido, usa `DATACRAZY_ALERTS_PHONE`.
 *
 * Retorna `true` em sucesso, `false` caso ausência de config ou erro de rede.
 * Nunca lança.
 */
export async function sendWhatsappMessage(
  text: string,
  phoneOverride?: string,
): Promise<boolean> {
  const [token, instance, defaultPhone, clientToken] = await Promise.all([
    getConfig("DATACRAZY_TOKEN"),
    getConfig("DATACRAZY_ALERTS_INSTANCE"),
    getConfig("DATACRAZY_ALERTS_PHONE"),
    getConfig("DATACRAZY_CLIENT_TOKEN"),
  ]);

  const phone = phoneOverride ?? defaultPhone;
  if (!token || !instance || !phone) return false;

  const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone, message: text }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
