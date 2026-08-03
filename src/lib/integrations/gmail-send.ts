import "server-only";
import { google } from "googleapis";
import { getGoogleClientForUser } from "./google-user-oauth";

/**
 * Envio de e-mail pela API do Gmail, com a conta Google já conectada.
 *
 * Por que não um provedor novo (Resend, SendGrid, SES): o OAuth do Google que o
 * Cockpit já usa para Calendar e para a ingestão do jurídico pede
 * `gmail.compose` (google-user-oauth.ts, GOOGLE_SCOPES) — escopo que autoriza
 * ENVIAR, não só rascunhar. Ou seja, a capacidade já estava concedida e sem uso.
 * Adicionar provedor significaria conta nova, chave nova, domínio a verificar e
 * mais um segredo no Railway, para fazer o que o token existente já faz.
 *
 * Consequência a saber: o e-mail sai DA CONTA conectada, com o remetente dela.
 * Para lembrete interno ao time isso é vantagem — chega como mensagem de uma
 * pessoa, não de um robô, e ninguém marca como spam.
 *
 * Limite honesto: se a conta Google não estiver conectada (ou o refresh token
 * expirar), o envio falha. Por isso `enviarEmail` devolve boolean em vez de
 * lançar — quem chama decide se e-mail é obrigatório ou um canal a mais.
 */

/**
 * Monta a mensagem em RFC 2822 e codifica em base64url, que é o formato que
 * `users.messages.send` espera.
 *
 * O assunto vai em MIME encoded-word (RFC 2047) porque cabeçalho de e-mail é
 * ASCII: sem isso, "Cadastro pendente" com acento chega corrompido.
 */
export function montarMensagemRaw(params: {
  para: string;
  assunto: string;
  corpo: string;
}): string {
  const assuntoCodificado = `=?UTF-8?B?${Buffer.from(params.assunto, "utf8").toString("base64")}?=`;
  const linhas = [
    `To: ${params.para}`,
    `Subject: ${assuntoCodificado}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(params.corpo, "utf8").toString("base64"),
  ];
  return Buffer.from(linhas.join("\r\n"), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Envia um e-mail. Devolve `false` em vez de lançar: num disparo multicanal, um
 * canal indisponível não pode derrubar os outros dois.
 */
export async function enviarEmail(params: {
  userId: string;
  para: string;
  assunto: string;
  corpo: string;
}): Promise<boolean> {
  try {
    const auth = await getGoogleClientForUser(params.userId);
    const gmail = google.gmail({ version: "v1", auth });
    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: montarMensagemRaw(params) },
    });
    return true;
  } catch (e) {
    console.error(
      `[gmail-send] falha ao enviar para ${params.para}:`,
      e instanceof Error ? e.message : e,
    );
    return false;
  }
}
