import "server-only";

export const MIN_PASSWORD_LENGTH = 12;
export const BCRYPT_ROUNDS = 12;

/**
 * Política de senha mínima:
 *  - 12+ caracteres
 *  - pelo menos 1 letra
 *  - pelo menos 1 dígito
 *  - não pode estar em uma lista curta de senhas óbvias
 */
const COMMON_PASSWORDS = new Set([
  "123456789012", "password1234", "qwertyuiop12", "112233445566",
  "abcdef123456", "senha12345678", "administrador",
]);

export function validatePassword(password: string): { ok: true } | { ok: false; error: string } {
  if (typeof password !== "string") {
    return { ok: false, error: "Senha inválida." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (password.length > 128) {
    return { ok: false, error: "A senha é longa demais (máximo 128 caracteres)." };
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { ok: false, error: "A senha deve conter letras e números." };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, error: "Senha muito comum. Escolha outra." };
  }
  return { ok: true };
}
