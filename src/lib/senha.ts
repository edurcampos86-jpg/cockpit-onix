/**
 * A regra de senha — módulo PURO, um lugar só.
 *
 * ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────
 * A mesma validação estava escrita em QUATRO lugares, e já tinha divergido:
 *
 *   src/app/actions/settings.ts   mínimo 6   (trocar a própria senha)
 *   src/app/actions/auth.ts       mínimo 6   (recriar senha por código)
 *   src/app/recriar-senha/page.tsx  minLength 6 no input
 *   src/app/actions/convite.ts    mínimo 8   (onboarding)
 *
 * E as TELAS prometiam outra coisa: `/configuracoes` diz "pelo menos 8
 * caracteres misturando letras, números e símbolos" e o servidor aceitava 6.
 * A promessa da tela e a regra do código discordavam em silêncio — o usuário
 * lia 8, digitava 6, e o sistema aceitava.
 *
 * Aqui a regra passa a ser UMA. Mudar o mínimo passa a ser mudar uma linha,
 * e nenhuma das telas pode divergir sem quebrar o teste.
 *
 * ── POR QUE 8, E NÃO 6 ──────────────────────────────────────────────────
 * Porque 8 é o que as telas já prometiam. Alinhar o código ao texto, e não o
 * texto ao código: o texto foi escrito pensando em quem usa, a validação foi
 * escrita pensando em passar.
 *
 * ── O QUE ESTE MÓDULO NÃO FAZ ───────────────────────────────────────────
 * Não exige mistura de letras, números e símbolos, embora a tela sugira.
 * Exigir composição sem medir o que já existe reprovaria senhas em uso hoje,
 * e isso é mudança de comportamento para todo mundo — decisão do Eduardo,
 * numa PR própria. Este módulo entrega o piso de comprimento, que é o que a
 * tela promete como MÍNIMO.
 */

/** O piso de comprimento. Um número, um lugar. */
export const SENHA_MINIMO = 8;

/** Como o mínimo é escrito para gente ler. Sempre junto de `SENHA_MINIMO`. */
export const SENHA_MINIMO_LABEL = `pelo menos ${SENHA_MINIMO} caracteres`;

/**
 * A mensagem exata que o usuário vê quando a senha é curta demais.
 * Fica aqui para que as quatro telas digam a MESMA coisa.
 */
export const SENHA_CURTA_ERRO = `A senha deve ter ${SENHA_MINIMO_LABEL}.`;

/**
 * A senha atende ao mínimo?
 *
 * Recebe `unknown` de propósito: os chamadores tiram o valor de `FormData`,
 * onde ele pode vir `null` ou `File`. Qualquer coisa que não seja string
 * reprova, em vez de estourar.
 */
export function senhaAtendeAoMinimo(senha: unknown): boolean {
  return typeof senha === "string" && senha.length >= SENHA_MINIMO;
}
