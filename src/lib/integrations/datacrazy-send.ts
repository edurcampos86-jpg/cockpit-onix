import "server-only";
import { getConfig } from "@/lib/config-db";
import { normalizarTelefoneZapi } from "@/lib/integrations/telefone";
import {
  chavesFaltantes,
  limparSegredos,
  mascararTelefone,
  truncarCorpo,
} from "@/lib/integrations/zapi-diagnostico";

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
 *
 * ── Diagnóstico (setembro/2026) ──
 * O `false` continua sendo o MESMO para todas as causas — assinatura e retorno
 * não mudaram, nenhum chamador precisou mudar. O que mudou é que agora o
 * motivo aparece no log, com o prefixo `[zapi]`:
 *
 *   • config ausente  → nomes das chaves que resolveram vazias
 *   • HTTP não-ok     → status, statusText e corpo (cortado em 500)
 *   • exceção de rede → mensagem da exceção
 *
 * Antes disso, `return r.ok` descartava status e corpo e o `catch` descartava a
 * exceção: falha de credencial, de instância caída e de rede chegavam ao
 * operador com a mesma cara de "o alerta não funciona".
 *
 * Nada de segredo entra no log. Isso NÃO é automático: a URL leva instância e
 * token no caminho, e tanto o corpo de erro quanto a mensagem de exceção do
 * `fetch` podem devolvê-la. Todo texto passa por `limparSegredos` antes de
 * chegar ao `console`, e o telefone sai mascarado — ver `zapi-diagnostico.ts`.
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
  if (!token || !instance || !phone) {
    const faltando = chavesFaltantes({
      temToken: !!token,
      temInstancia: !!instance,
      temTelefone: !!phone,
      usouOverride: phoneOverride !== undefined,
    });
    console.error(`[zapi] envio abortado, nada foi enviado — falta: ${faltando.join(", ")}`);
    return false;
  }

  // Tudo que for para o log passa por aqui. A lista é a mesma nos três pontos
  // de saída de propósito: esquecer um deles é o vazamento.
  const segredos = [token, instance, clientToken];

  const url = `https://api.z-api.io/instances/${instance}/token/${token}/send-text`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone, message: text }),
    });

    if (!r.ok) {
      // `r.text()` pode falhar por conta própria (corpo já consumido, stream
      // cortado). Se falhar, o status ainda vale o log — perder o status por
      // causa do corpo seria trocar um diagnóstico por nenhum.
      let corpo: string;
      try {
        corpo = truncarCorpo(await r.text());
      } catch {
        corpo = "<corpo ilegível>";
      }
      console.error(
        `[zapi] HTTP ${r.status} ${r.statusText} ao enviar para ${mascararTelefone(phone)} — ` +
          limparSegredos(corpo, segredos),
      );
    }

    return r.ok;
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.error(
      `[zapi] falha de rede ao enviar para ${mascararTelefone(phone)}: ` +
        limparSegredos(motivo, segredos),
    );
    return false;
  }
}
