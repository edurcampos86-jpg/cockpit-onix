import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirAcessoWebhook } from "./zapier-acesso";

/**
 * O teste que faltava. A regressão que ele impede é exatamente a que existia:
 * "sem segredo configurado" devolvia acesso liberado numa rota que responde à
 * internet sem sessão.
 */

test("sem segredo configurado NÃO libera — nem com header, nem sem", () => {
  assert.equal(decidirAcessoWebhook(undefined, "qualquer-coisa"), "sem-segredo");
  assert.equal(decidirAcessoWebhook(null, ""), "sem-segredo");
  assert.equal(decidirAcessoWebhook("", "qualquer-coisa"), "sem-segredo");
  // Espaço em branco é "não configurado": variável criada e deixada vazia no
  // painel é o jeito mais fácil de achar que configurou sem ter configurado.
  assert.equal(decidirAcessoWebhook("   ", "qualquer-coisa"), "sem-segredo");
});

test("segredo configurado e igual libera", () => {
  assert.equal(decidirAcessoWebhook("s3cr3t", "s3cr3t"), "ok");
});

test("espaço em volta não muda a decisão dos dois lados", () => {
  assert.equal(decidirAcessoWebhook("  s3cr3t  ", "s3cr3t"), "ok");
  assert.equal(decidirAcessoWebhook("s3cr3t", "  s3cr3t  "), "ok");
});

test("segredo configurado e diferente é 'invalido', não 'sem-segredo'", () => {
  // A distinção é o ponto: 'invalido' manda olhar o Zapier, 'sem-segredo'
  // manda olhar o Railway.
  assert.equal(decidirAcessoWebhook("s3cr3t", "outro"), "invalido");
  assert.equal(decidirAcessoWebhook("s3cr3t", ""), "invalido");
  assert.equal(decidirAcessoWebhook("s3cr3t", undefined), "invalido");
});

test("prefixo do segredo não passa", () => {
  // Comparação por hash: tamanhos diferentes não são 'iguais até onde deu'.
  assert.equal(decidirAcessoWebhook("s3cr3t", "s3cr"), "invalido");
  assert.equal(decidirAcessoWebhook("s3cr3t", "s3cr3t-e-mais"), "invalido");
});

test("diferença de caixa não passa", () => {
  assert.equal(decidirAcessoWebhook("S3cr3T", "s3cr3t"), "invalido");
});
