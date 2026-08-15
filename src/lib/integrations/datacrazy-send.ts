import "server-only";
import { getConfig } from "@/lib/config-db";
import { normalizarTelefoneZapi } from "@/lib/integrations/telefone";

/**
 * Envia mensagem de texto via Z-API (Datacrazy WhatsApp).
 *
 * Pré-requisitos em `Config`:
 *   - DATACRAZY_INSTANCE_TOKEN  (Token da instância Z-API — visível em
 *     Datacrazy → Conexões → Atualizar conexão → "Token da instância")
 *   - DATACRAZY_ALERTS_INSTANCE (ID da instância)
 *   - DATACRAZY_ALERTS_PHONE    (destinatário no formato 5571999999999)
 *
 * Opcional:
 *   - DATACRAZY_CLIENT_TOKEN    (Token de segurança Z-API; se setado, vai no
 *     header `Client-Token`)
 *
 * ⚠️ Atenção: NÃO confundir com `DATACRAZY_TOKEN` — esse é o JWT da API
 * Datacrazy proprietária (usado pra polling de mensagens), não serve pra Z-API.
 *
 * `phone` aceita override; se omitido, usa `DATACRAZY_ALERTS_PHONE`. Em ambos
 * os casos o número é normalizado — ver normalizarTelefoneZapi.
 *
 * Retorna `true` em sucesso, `false` caso ausência de config ou erro de rede.
 * Nunca lança.
 */
export async function sendWhatsappMessage(
  text: string,
  phoneOverride?: string,
): Promise<boolean> {
  const [token, instance, defaultPhone, clientToken] = await Promise.all([
    getConfig("DATACRAZY_INSTANCE_TOKEN"),
    getConfig("DATACRAZY_ALERTS_INSTANCE"),
    getConfig("DATACRAZY_ALERTS_PHONE"),
    getConfig("DATACRAZY_CLIENT_TOKEN"),
  ]);

  const phone = normalizarTelefoneZapi(phoneOverride ?? defaultPhone);
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

/**
 * Probe da instância Z-API — `GET /status`, que devolve se o WhatsApp está
 * conectado.
 *
 * NÃO usa `/send-text`: probe que envia mensagem cobra o preço de uma
 * mensagem real (e chega no celular de alguém) a cada 30 minutos. O canal de
 * alerta é justamente por onde o alarme sai; testá-lo mandando alarme falso
 * é o caminho mais rápido pra ninguém mais olhar o alarme.
 *
 * Retorna `null` quando não configurado — "não configurado" não é "caído".
 */
export async function testZapiConnection(): Promise<
  { success: boolean; message: string } | null
> {
  const [token, instance, clientToken] = await Promise.all([
    getConfig("DATACRAZY_INSTANCE_TOKEN"),
    getConfig("DATACRAZY_ALERTS_INSTANCE"),
    getConfig("DATACRAZY_CLIENT_TOKEN"),
  ]);
  if (!token || !instance) return null;

  const headers: Record<string, string> = {};
  if (clientToken) headers["Client-Token"] = clientToken;

  try {
    const r = await fetch(
      `https://api.z-api.io/instances/${instance}/token/${token}/status`,
      { headers },
    );
    if (!r.ok) {
      return { success: false, message: `Z-API respondeu HTTP ${r.status} em /status` };
    }
    const corpo = (await r.json()) as { connected?: boolean; error?: string };
    if (corpo?.connected === false) {
      return {
        success: false,
        message: `Instância Z-API desconectada${corpo.error ? `: ${corpo.error}` : ""}`,
      };
    }
    return { success: true, message: "Instância Z-API conectada" };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}
