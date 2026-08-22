/**
 * Testes do catálogo de produtos e da normalização de vocabulário — sem banco.
 *
 * Mesmo padrão dos vizinhos (`empresas/catalogo.test.ts`): `node:test` +
 * `node:assert/strict`, rodados por `npm test`.
 *
 * O que estes testes protegem, em ordem de importância:
 *
 *   1. que `tipoProduto` NÃO possa ser gravado sem validação — o erro concreto
 *      de `Implementacao.empresaId`, que aceita qualquer string;
 *   2. que "Seguro de Vida" e "Vida Individual" caiam na MESMA família, porque
 *      é disso que depende o relatório consolidado por produto;
 *   3. que rótulo desconhecido devolva `null` em vez de chutar — classificar
 *      por proximidade inventaria dado de cliente.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CATALOGO_PRODUTOS,
  ehTipoProdutoValido,
  exigirTipoProduto,
  familiaPorId,
  normalizarRotulo,
  resolverFamilia,
  tiposProdutoValidos,
} from "./catalogo-produtos.ts";

// ── O catálogo em si ─────────────────────────────────────────────────────

test("as seis famílias combinadas estão declaradas", () => {
  assert.deepEqual(tiposProdutoValidos(), [
    "vida",
    "auto_residencial",
    "saude_odonto",
    "consorcio",
    "fianca_rc_profissional",
    "dit",
  ]);
});

test("nenhum id repetido", () => {
  const ids = CATALOGO_PRODUTOS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("nenhum alias aponta para duas famílias", () => {
  // O caso que quebraria a resolução em silêncio: "residencial" listado em
  // `auto_residencial` E em `fianca_rc_profissional` faria o resultado
  // depender da ORDEM do catálogo. O índice é um Map — o último venceria, e
  // ninguém veria.
  const visto = new Map<string, string>();
  for (const familia of CATALOGO_PRODUTOS) {
    for (const alias of familia.aliases) {
      const chave = normalizarRotulo(alias);
      const dono = visto.get(chave);
      assert.equal(
        dono,
        undefined,
        `alias ${JSON.stringify(alias)} está em "${dono}" e em "${familia.id}"`,
      );
      visto.set(chave, familia.id);
    }
  }
});

test("todo alias já está na forma normalizada", () => {
  // Não é preciosismo: alias com acento funcionaria (o índice normaliza os
  // dois lados), mas esconderia o fato de que a comparação é normalizada — e
  // a próxima pessoa acrescentaria um regex para "resolver" acento.
  for (const familia of CATALOGO_PRODUTOS) {
    for (const alias of familia.aliases) {
      assert.equal(alias, normalizarRotulo(alias), `alias fora da forma normalizada: ${alias}`);
    }
  }
});

test("toda família tem nome e descrição não vazios", () => {
  for (const f of CATALOGO_PRODUTOS) {
    assert.ok(f.nome.trim().length > 0, `${f.id} sem nome`);
    assert.ok(f.descricao.trim().length > 0, `${f.id} sem descrição`);
  }
});

// ── Validação na escrita ─────────────────────────────────────────────────

test("ehTipoProdutoValido aceita o canônico e recusa o resto", () => {
  assert.equal(ehTipoProdutoValido("vida"), true);
  assert.equal(ehTipoProdutoValido("Vida"), false, "comparação é exata, não normalizada");
  assert.equal(ehTipoProdutoValido("seguro de vida"), false, "alias não é valor de banco");
  assert.equal(ehTipoProdutoValido(""), false);
  assert.equal(ehTipoProdutoValido("seguro viagem"), false);
});

test("exigirTipoProduto devolve o id válido e lança no inválido", () => {
  assert.equal(exigirTipoProduto("consorcio"), "consorcio");
  assert.throws(() => exigirTipoProduto("seguro viagem"), /tipoProduto inválido/);
  // A mensagem tem de listar os válidos: quem a lê está no meio de um import.
  assert.throws(() => exigirTipoProduto("xpto"), /vida, auto_residencial/);
});

test("familiaPorId devolve a família ou null", () => {
  assert.equal(familiaPorId("dit")?.nome, "DIT");
  assert.equal(familiaPorId("nao_existe"), null);
});

// ── Normalização ─────────────────────────────────────────────────────────

test("normalizarRotulo tira acento, caixa, pontuação e espaço extra", () => {
  assert.equal(normalizarRotulo("Consórcio"), "consorcio");
  assert.equal(normalizarRotulo("  SEGURO   DE   VIDA  "), "seguro de vida");
  assert.equal(normalizarRotulo("Saúde/Odonto"), "saude odonto");
  assert.equal(normalizarRotulo("E&O"), "e o");
  assert.equal(normalizarRotulo("Fiança Locatícia"), "fianca locaticia");
  assert.equal(normalizarRotulo("---"), "");
  assert.equal(normalizarRotulo(""), "");
});

// ── Resolução de sinônimo: o ponto da normalização de vocabulário ────────

test("rótulos diferentes de parceiros diferentes caem na mesma família", () => {
  // O caso literal do enunciado: Porto e Bradesco, mesmo produto.
  assert.equal(resolverFamilia("Seguro de Vida"), "vida");
  assert.equal(resolverFamilia("Vida Individual"), "vida");
  assert.equal(resolverFamilia("VIDA EM GRUPO"), "vida");
});

test("resolve com variação de caixa, acento e espaço", () => {
  for (const cru of ["Consórcio", "CONSORCIO", "  consórcio  ", "consórcio"]) {
    assert.equal(resolverFamilia(cru), "consorcio", `falhou em ${JSON.stringify(cru)}`);
  }
  assert.equal(resolverFamilia("Carta de Crédito"), "consorcio");
  assert.equal(resolverFamilia("Responsabilidade Civil Profissional"), "fianca_rc_profissional");
  assert.equal(resolverFamilia("D&O"), "fianca_rc_profissional");
});

test("o próprio id canônico e o nome de exibição resolvem", () => {
  assert.equal(resolverFamilia("auto_residencial"), "auto_residencial");
  assert.equal(resolverFamilia("Auto e Residencial"), "auto_residencial");
});

test("rótulo desconhecido devolve null, não chuta", () => {
  // Deliberado: o import tem de PARAR a linha e reportar. Classificar por
  // proximidade inventaria dado de cliente.
  assert.equal(resolverFamilia("Seguro Viagem"), null);
  assert.equal(resolverFamilia("previdência privada"), null);
  assert.equal(resolverFamilia(""), null);
  assert.equal(resolverFamilia("   "), null);
});

// ── O dicionário do PerfilImportacao vence o catálogo ────────────────────

test("dicionário do perfil resolve rótulo que o catálogo não conhece", () => {
  // É o caminho normal: rótulo interno de um parceiro, que não é vocabulário
  // de mercado e não deve poluir os aliases genéricos.
  const dicionario = { "VIDA PREMIADA PLUS": "vida", "AUTO FÁCIL 3.0": "auto_residencial" };
  assert.equal(resolverFamilia("Vida Premiada Plus", dicionario), "vida");
  assert.equal(resolverFamilia("auto facil 3 0", dicionario), "auto_residencial");
});

test("dicionário do perfil tem precedência sobre o alias genérico", () => {
  // Um parceiro que chama de "Prestamista" o que vende como consórcio: quem
  // conhece o vocabulário da fonte é o perfil dela, não o catálogo.
  assert.equal(resolverFamilia("prestamista"), "vida", "sem perfil, vale o alias de mercado");
  assert.equal(resolverFamilia("prestamista", { prestamista: "consorcio" }), "consorcio");
});

test("as chaves do dicionário também são normalizadas", () => {
  // O perfil é digitado à mão por quem está olhando a planilha; exigir acento
  // e caixa exatos faria o mapeamento falhar sem dizer por quê.
  const dicionario = { "Seguro Résidencial": "auto_residencial" };
  assert.equal(resolverFamilia("SEGURO RESIDENCIAL", dicionario), "auto_residencial");
});

test("dicionário apontando para id inválido devolve null, não cai no catálogo", () => {
  // Perfil quebrado tem de aparecer. Se caísse no alias genérico, um destino
  // digitado errado no perfil continuaria "funcionando" — e o erro só
  // apareceria no dia em que o alias genérico deixasse de existir.
  assert.equal(resolverFamilia("Seguro de Vida", { "Seguro de Vida": "vidas" }), null);
});
