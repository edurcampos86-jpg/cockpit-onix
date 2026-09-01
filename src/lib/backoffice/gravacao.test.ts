import assert from "node:assert/strict";
import { test } from "node:test";

import { apagar, gravar, gravarJson, mensagemDeFalha } from "./gravacao.ts";

// ── Contrato de redação ────────────────────────────────────────────────
//
// Estes testes não conferem texto bonito; conferem as duas promessas que a
// ficha passa a fazer a quem digita nela:
//   1. toda falha diz o que fazer em seguida;
//   2. onde o texto continua na tela, a mensagem afirma isso.
//
// Sem 2, quem lê "Erro ao salvar" fecha a aba achando que perdeu o que
// escreveu — que é exatamente o comportamento que estamos consertando.

const TODOS_OS_STATUS = [0, 400, 401, 403, 404, 409, 413, 422, 500, 502, 599];

test("nenhuma mensagem de falha é vazia ou genérica demais", () => {
  for (const status of TODOS_OS_STATUS) {
    const m = mensagemDeFalha(status);
    assert.ok(m.length > 20, `status ${status} devolveu mensagem curta demais: ${m}`);
    assert.ok(!/^erro\.?$/i.test(m), `status ${status} devolveu mensagem genérica: ${m}`);
  }
});

test("falha recuperável avisa que o texto continua na tela", () => {
  // Rede caída, sessão expirada e erro de servidor têm em comum que o
  // formulário não foi desmontado — o texto está lá. É o que a pessoa precisa
  // saber, e é o que impede que ela feche a aba.
  for (const status of [0, 401, 500, 502]) {
    assert.match(
      mensagemDeFalha(status),
      /continua na tela/,
      `status ${status} não tranquiliza sobre o texto digitado`,
    );
  }
});

test("falha que não gravou nada afirma que nada mudou", () => {
  // 403 e 404 são o oposto: a gravação não aconteceu e não vai acontecer
  // tentando de novo. Dizer "tente de novo" aqui seria mentir.
  for (const status of [403, 404]) {
    assert.match(
      mensagemDeFalha(status),
      /[Nn]ada foi (alterado|gravado)/,
      `status ${status} não deixa claro que nada foi gravado`,
    );
    assert.doesNotMatch(mensagemDeFalha(status), /tente de novo/i);
  }
});

test("sem conexão é tratado como status 0, não confundido com sucesso", () => {
  assert.match(mensagemDeFalha(0), /[Ss]em conexão/);
});

// ── Motivo vindo do servidor ───────────────────────────────────────────

test("validação do servidor (400) vence a frase genérica", () => {
  assert.equal(mensagemDeFalha(400, "Título obrigatório"), "Título obrigatório");
  assert.equal(mensagemDeFalha(422, "Data inválida"), "Data inválida");
});

test('o "Erro" literal do 500 das rotas da ficha é descartado, não repetido', () => {
  // Todas as rotas da ficha devolvem `{ error: "Erro" }` no catch. Repetir
  // isso na tela informa zero — a mensagem por status é melhor.
  assert.doesNotMatch(mensagemDeFalha(500, "Erro"), /^Erro$/);
  assert.doesNotMatch(mensagemDeFalha(400, "Erro"), /^Erro$/);
  assert.match(mensagemDeFalha(400, "Erro"), /campos obrigatórios/);
});

test("motivo em branco não vira mensagem em branco", () => {
  assert.ok(mensagemDeFalha(400, "   ").length > 20);
});

// ── gravar(): nunca lança ──────────────────────────────────────────────

const fetchOriginal = globalThis.fetch;

function comFetch(falso: typeof globalThis.fetch, corpo: () => Promise<void>) {
  globalThis.fetch = falso;
  return corpo().finally(() => {
    globalThis.fetch = fetchOriginal;
  });
}

test("rede caída vira recibo de falha, nunca exceção", async () => {
  await comFetch(
    () => Promise.reject(new TypeError("Failed to fetch")),
    async () => {
      const r = await gravar("/api/qualquer");
      assert.equal(r.ok, false);
      assert.match(r.ok === false ? r.motivo : "", /[Ss]em conexão/);
    },
  );
});

test("resposta 403 vira recibo de falha com o motivo traduzido", async () => {
  await comFetch(
    async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
    async () => {
      const r = await gravar("/api/qualquer");
      assert.equal(r.ok, false);
      // "forbidden" cru nunca chega à tela: 403 tem frase própria.
      assert.doesNotMatch(r.ok === false ? r.motivo : "", /forbidden/);
      assert.match(r.ok === false ? r.motivo : "", /permissão/);
    },
  );
});

test("corpo de erro que não é JSON não derruba a leitura", async () => {
  await comFetch(
    async () => new Response("<html>502 Bad Gateway</html>", { status: 502 }),
    async () => {
      const r = await gravar("/api/qualquer");
      assert.equal(r.ok, false);
      assert.ok((r.ok === false ? r.motivo : "").length > 20);
    },
  );
});

test("sucesso devolve os dados já em JSON", async () => {
  await comFetch(
    async () => new Response(JSON.stringify({ id: "m1", titulo: "Casa na praia" }), { status: 200 }),
    async () => {
      const r = await gravarJson<{ id: string }>("/api/qualquer", "PUT", { titulo: "x" });
      assert.equal(r.ok, true);
      assert.equal(r.ok === true ? r.dados.id : null, "m1");
    },
  );
});

test("DELETE sem corpo é sucesso, não falha de parsing", async () => {
  // Os dois DELETE da ficha (metas e eventos) respondem sem JSON. Antes de
  // existir este ramo, ler o corpo lançaria e o apagar pareceria ter falhado.
  await comFetch(
    async () => new Response(null, { status: 204 }),
    async () => {
      const r = await apagar("/api/backoffice/metas/m1");
      assert.equal(r.ok, true);
    },
  );
});

test("gravarJson envia o cabeçalho e o método declarados", async () => {
  let visto: { url: string; init?: RequestInit } | null = null;
  await comFetch(
    async (url, init) => {
      visto = { url: String(url), init: init as RequestInit };
      return new Response(JSON.stringify({}), { status: 200 });
    },
    async () => {
      await gravarJson("/api/x", "PATCH", { a: 1 });
      const capturado = visto as { url: string; init?: RequestInit } | null;
      assert.equal(capturado?.init?.method, "PATCH");
      assert.equal(capturado?.init?.body, JSON.stringify({ a: 1 }));
    },
  );
});
