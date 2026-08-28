import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SENHA_CURTA_ERRO,
  SENHA_MINIMO,
  SENHA_MINIMO_LABEL,
  senhaAtendeAoMinimo,
} from "./senha";

test("o mínimo é 8 — o que as telas já prometiam", () => {
  assert.equal(SENHA_MINIMO, 8);
  assert.match(SENHA_MINIMO_LABEL, /8/);
  assert.match(SENHA_CURTA_ERRO, /8/);
});

test("aceita a partir do mínimo, recusa abaixo", () => {
  assert.equal(senhaAtendeAoMinimo("a".repeat(SENHA_MINIMO)), true);
  assert.equal(senhaAtendeAoMinimo("a".repeat(SENHA_MINIMO - 1)), false);
});

test("a senha de 6 que passava antes agora é recusada", () => {
  // O caso concreto: `settings.ts` e `auth.ts` aceitavam 6 enquanto a tela
  // prometia 8. Este é o comportamento que muda.
  assert.equal(senhaAtendeAoMinimo("123456"), false);
});

test("valor que não é string reprova em vez de estourar", () => {
  // Os chamadores tiram o valor de FormData, onde vem `null` ou `File`.
  for (const v of [null, undefined, 12345678, {}, ["12345678"]]) {
    assert.doesNotThrow(() => senhaAtendeAoMinimo(v));
    assert.equal(senhaAtendeAoMinimo(v), false);
  }
});

// ── A guarda que impede a divergência de voltar ─────────────────────────
//
// A regra estava em quatro lugares e já tinha divergido (6, 6, 6 e 8). Não
// adianta unificar hoje se amanhã alguém escreve `length < 6` de novo: este
// teste quebra se qualquer caminho de senha voltar a ter número próprio.

const CAMINHOS_DE_SENHA = [
  "src/app/actions/settings.ts",
  "src/app/actions/auth.ts",
  "src/app/actions/convite.ts",
  "src/app/recriar-senha/page.tsx",
  "prisma/seed.ts",
];

test("nenhum caminho de senha tem mínimo próprio escrito à mão", () => {
  const proibido = /(?:senha|password|novaSenha|newPassword)[^\n]{0,40}\.length\s*[<>]=?\s*\d|minLength=\{\d+\}/i;
  for (const caminho of CAMINHOS_DE_SENHA) {
    const src = readFileSync(caminho, "utf8");
    const linhas = src.split("\n");
    const culpadas = linhas
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => proibido.test(l));
    assert.deepEqual(
      culpadas,
      [],
      `${caminho}: mínimo de senha escrito à mão — use senhaAtendeAoMinimo/SENHA_MINIMO`,
    );
  }
});

test("o seed não embute senha literal", () => {
  // O defeito que esta PR fecha: `bcrypt.hashSync("<senha>")` no seed fazia
  // todo banco criado por ele nascer com uma senha publicada no repositório.
  const src = readFileSync("prisma/seed.ts", "utf8");
  assert.equal(
    /bcrypt\.hash(Sync)?\(\s*["'`]/.test(src),
    false,
    "prisma/seed.ts voltou a fazer hash de uma senha literal",
  );
  assert.match(src, /SEED_ADMIN_PASSWORD/);
  assert.match(src, /SEED_SUPPORT_PASSWORD/);
});

test("o TUTORIAL não traz credencial em texto legível", () => {
  // Ele trouxe CPF e senha de admin em claro de maio a agosto de 2026.
  const src = readFileSync("TUTORIAL.md", "utf8");
  assert.equal(
    /Senha\s*[`:]/i.test(src),
    false,
    "TUTORIAL.md voltou a citar uma senha",
  );
  assert.equal(
    /\d{3}\.\d{3}\.\d{3}-\d{2}/.test(src),
    false,
    "TUTORIAL.md voltou a citar um CPF",
  );
});
