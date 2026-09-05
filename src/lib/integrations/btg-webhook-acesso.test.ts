import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidatosDoWebhookBtg,
  decidirAcessoWebhookBtg,
} from "./btg-webhook-acesso";

/** Monta o `ler` que o handler passa, a partir de um objeto de headers. */
function headers(h: Record<string, string>) {
  const m = new Map(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
  return (nome: string) => m.get(nome.toLowerCase()) ?? null;
}

// ── A REGRESSÃO QUE ESTES TESTES IMPEDEM ────────────────────────────────
// `BTG_WEBHOOK_SECRET` ausente devolvia acesso liberado numa rota que responde
// à internet sem sessão E que escreve em MovimentacaoBtg. É o primeiro teste
// abaixo, e é o único que precisa existir para a falha aberta não voltar.

test("sem segredo configurado NÃO libera — nem com header, nem sem", () => {
  assert.equal(decidirAcessoWebhookBtg(undefined, ["qualquer-coisa"]), "sem-segredo");
  assert.equal(decidirAcessoWebhookBtg(null, []), "sem-segredo");
  assert.equal(decidirAcessoWebhookBtg("", ["qualquer-coisa"]), "sem-segredo");
  // Espaço em branco é "não configurado": variável criada e deixada vazia no
  // painel do Railway é o jeito mais fácil de achar que configurou sem ter
  // configurado.
  assert.equal(decidirAcessoWebhookBtg("   ", ["qualquer-coisa"]), "sem-segredo");
});

test("sem segredo NÃO é 'invalido' — os dois mandam olhar lugares diferentes", () => {
  // 'sem-segredo' manda olhar o Railway (503, integração desativada).
  // 'invalido' manda olhar o cadastro no portal BTG (401).
  assert.notEqual(decidirAcessoWebhookBtg("", ["x"]), "invalido");
});

test("segredo configurado e igual libera", () => {
  assert.equal(decidirAcessoWebhookBtg("s3cr3t", ["s3cr3t"]), "ok");
});

test("basta UM dos formatos de header casar", () => {
  assert.equal(
    decidirAcessoWebhookBtg("s3cr3t", ["lixo", "outro-lixo", "s3cr3t"]),
    "ok",
  );
});

test("espaço em volta não muda a decisão dos dois lados", () => {
  assert.equal(decidirAcessoWebhookBtg("  s3cr3t  ", ["s3cr3t"]), "ok");
  assert.equal(decidirAcessoWebhookBtg("s3cr3t", ["  s3cr3t  "]), "ok");
});

test("segredo configurado e diferente é 'invalido'", () => {
  assert.equal(decidirAcessoWebhookBtg("s3cr3t", ["outro"]), "invalido");
  assert.equal(decidirAcessoWebhookBtg("s3cr3t", [""]), "invalido");
  assert.equal(decidirAcessoWebhookBtg("s3cr3t", [undefined, null]), "invalido");
  assert.equal(decidirAcessoWebhookBtg("s3cr3t", []), "invalido");
});

test("prefixo do segredo não passa", () => {
  // Comparação por hash: tamanho diferente não é "igual até onde deu". É a
  // propriedade que o `===` antigo também tinha, e que a troca para
  // timingSafeEqual precisava preservar.
  assert.equal(decidirAcessoWebhookBtg("s3cr3t", ["s3cr"]), "invalido");
  assert.equal(decidirAcessoWebhookBtg("s3cr3t", ["s3cr3t-e-mais"]), "invalido");
});

test("comparação é sensível a maiúscula/minúscula", () => {
  assert.equal(decidirAcessoWebhookBtg("s3cr3t", ["S3CR3T"]), "invalido");
});

// ── Extração dos candidatos ─────────────────────────────────────────────

test("aceita o segredo nos sete formatos que o portal BTG pode emitir", () => {
  const s = "s3cr3t";
  const casos: Record<string, string>[] = [
    { authorization: `Bearer ${s}` },
    { authorization: `ApiKey ${s}` },
    { authorization: s },
    { "x-api-key": s },
    { apikey: s },
    { "x-webhook-secret": s },
    { "x-btg-signature": s },
  ];
  for (const h of casos) {
    const cands = candidatosDoWebhookBtg(headers(h));
    assert.equal(
      decidirAcessoWebhookBtg(s, cands),
      "ok",
      `formato não aceito: ${JSON.stringify(h)}`,
    );
  }
});

test("o prefixo Bearer é case-insensitive, como era antes", () => {
  const cands = candidatosDoWebhookBtg(headers({ authorization: "bearer s3cr3t" }));
  assert.equal(decidirAcessoWebhookBtg("s3cr3t", cands), "ok");
});

test("sem header nenhum, não há candidato", () => {
  assert.deepEqual(candidatosDoWebhookBtg(headers({})), []);
});

test("candidatos vêm sem vazio e sem repetição", () => {
  // `authorization: "s3cr3t"` gera três entradas iguais (cru, sem Bearer, sem
  // ApiKey). Sem o dedupe, a rota faria três hashes idênticos por requisição.
  const cands = candidatosDoWebhookBtg(headers({ authorization: "s3cr3t" }));
  assert.deepEqual(cands, ["s3cr3t"]);
});

test("candidato não é o header inteiro quando há prefixo", () => {
  const cands = candidatosDoWebhookBtg(headers({ authorization: "Bearer s3cr3t" }));
  assert.ok(cands.includes("s3cr3t"), "o valor sem prefixo precisa estar na lista");
});
