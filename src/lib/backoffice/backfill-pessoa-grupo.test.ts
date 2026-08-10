/**
 * Testes das funções PURAS do backfill de `PessoaGrupo` — sem banco.
 *
 * Padrão de `empresas/pessoa-grupo.test.ts`: `node:test` + `node:assert/strict`.
 *
 * O que está travado aqui são as regras de negócio que o Eduardo fixou, e que
 * um refactor bem-intencionado quebraria em silêncio:
 *
 *   1. une SÓ por documento normalizado idêntico
 *   2. CPF ↔ CNPJ nunca une, mesmo com dígitos "parecidos"
 *   3. documento ausente fica sem link — não vira grupo do vazio
 *   4. duplicata é a MESMA pessoa para todas as contas (desejado, não bug)
 *   5. reexecutar não cria nem religa nada
 *   6. nada de dado pessoal atravessa `resumirPlano`
 *
 * Documentos sintéticos, nunca de pessoa real.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TAMANHO_DA_AMOSTRA,
  TAMANHO_DO_LOTE,
  dividirEmLotes,
  planejarBackfill,
  planejarEscrita,
  resumirPlano,
  somarLotes,
  type LinhaCliente,
} from "./backfill-pessoa-grupo.ts";

const CPF = "52998224725";
const CPF_ZERO = "01234567890";
const CPF_OUTRO = "12345678909";
const CNPJ = "11222333000181";
const CNPJ_OUTRO = "11444777000161";

/** Cliente sem vínculo, o estado de todas as linhas antes do backfill. */
function conta(id: string, cpfCnpj: string | null): LinhaCliente {
  return { id, cpfCnpj, pessoaGrupoId: null };
}

/** Atalho: planeja e cruza com um banco vazio (primeira execução). */
function primeiraExecucao(linhas: LinhaCliente[]) {
  const plano = planejarBackfill(linhas);
  const escrita = planejarEscrita(plano, linhas, new Map());
  return { plano, escrita, resumo: resumirPlano(plano, escrita) };
}

// ── Agrupamento ────────────────────────────────────────────────────────────

test("máscara não cria pessoa a mais: mesmo documento, mesmo grupo", () => {
  // O caso que a UNIQUE de PessoaGrupo.cpfCnpj sozinha não pegaria, porque
  // "529.982.247-25" e "52998224725" são strings diferentes.
  const { plano } = primeiraExecucao([
    conta("a", "529.982.247-25"),
    conta("b", CPF),
    conta("c", " 529 982 247 25 "),
  ]);
  assert.equal(plano.grupos.length, 1);
  assert.deepEqual(plano.grupos[0].clienteIds, ["a", "b", "c"]);
  assert.equal(plano.grupos[0].documento, CPF);
});

test("CPF e CNPJ nunca caem no mesmo grupo", () => {
  const { plano } = primeiraExecucao([conta("a", CPF), conta("b", CNPJ)]);
  assert.equal(plano.grupos.length, 2);
  assert.deepEqual(
    plano.grupos.map((g) => g.tipo).sort(),
    ["CNPJ", "CPF"],
  );
});

test("zero à esquerda é identidade — não colapsa com o documento sem ele", () => {
  const { plano } = primeiraExecucao([conta("a", CPF_ZERO), conta("b", CPF_OUTRO)]);
  assert.equal(plano.grupos.length, 2);
});

test("documento ausente, vazio ou malformado fica SEM link", () => {
  // Os ~84 do levantamento. Não é erro: é a ausência preservada. Se virassem
  // um grupo, todo cadastro incompleto seria "a mesma pessoa".
  const { plano, resumo } = primeiraExecucao([
    conta("nulo", null),
    conta("vazio", ""),
    conta("espaco", "   "),
    conta("curto", "123"),
    conta("letras", "abc.def.ghi-jk"),
    conta("doze", "123456789012"),
    conta("bom", CPF),
  ]);
  assert.deepEqual(plano.semDocumento, ["curto", "doze", "espaco", "letras", "nulo", "vazio"]);
  assert.equal(plano.grupos.length, 1);
  assert.equal(resumo.semLink, 6);
});

test("a ordem é determinística — é o que torna o lote reexecutável", () => {
  // Backfill interrompido no lote 7 tem de recomeçar no mesmo ponto; isso só
  // vale se duas execuções produzirem a mesma sequência.
  const linhas = [conta("z", CNPJ), conta("m", CPF), conta("a", CPF_OUTRO)];
  const um = planejarBackfill(linhas).grupos.map((g) => g.documento);
  const dois = planejarBackfill([...linhas].reverse()).grupos.map((g) => g.documento);
  assert.deepEqual(um, dois);
  assert.deepEqual(um, [...um].sort());
});

// ── Duplicatas: comportamento DESEJADO ─────────────────────────────────────

test("duplicata de documento = uma PessoaGrupo para todas as contas", () => {
  // Os 117 documentos / 254 linhas do levantamento. É o ponto do backfill,
  // não um efeito colateral: três contas do mesmo CPF são um titular só.
  const { escrita, resumo } = primeiraExecucao([
    conta("c1", CPF),
    conta("c2", "529.982.247-25"),
    conta("c3", CPF),
    conta("solo", CPF_OUTRO),
  ]);
  assert.equal(resumo.documentosDistintos, 2);
  assert.equal(resumo.pessoasACriar, 2);
  assert.equal(resumo.linksAGravar, 4);
  assert.equal(resumo.duplicatas.documentos, 1);
  assert.equal(resumo.duplicatas.linhas, 3);
  assert.equal(resumo.duplicatas.maiorAgrupamento, 3);
  // Uma ação por documento: as 3 contas recebem o MESMO pessoaGrupoId.
  const doCpf = escrita.acoes.find((a) => a.documento === CPF);
  assert.deepEqual(doCpf?.ligar, ["c1", "c2", "c3"]);
});

test("conta solo não é contada como duplicata", () => {
  const { resumo } = primeiraExecucao([conta("a", CPF), conta("b", CNPJ)]);
  assert.equal(resumo.duplicatas.documentos, 0);
  assert.equal(resumo.duplicatas.linhas, 0);
  assert.equal(resumo.duplicatas.maiorAgrupamento, 0);
});

// ── IDEMPOTÊNCIA ───────────────────────────────────────────────────────────

test("segunda execução não cria pessoa nem religa nada", () => {
  const linhas = [conta("a", CPF), conta("b", CPF), conta("c", CNPJ)];
  const { escrita: primeira } = primeiraExecucao(linhas);
  assert.equal(primeira.pessoasACriar, 2);
  assert.equal(primeira.linksAGravar, 3);

  // Estado depois de aplicar: pessoas existem, contas ligadas.
  const existentes = new Map([
    [CPF, "pg-cpf"],
    [CNPJ, "pg-cnpj"],
  ]);
  const ligadas: LinhaCliente[] = [
    { id: "a", cpfCnpj: CPF, pessoaGrupoId: "pg-cpf" },
    { id: "b", cpfCnpj: CPF, pessoaGrupoId: "pg-cpf" },
    { id: "c", cpfCnpj: CNPJ, pessoaGrupoId: "pg-cnpj" },
  ];
  const segunda = planejarEscrita(planejarBackfill(ligadas), ligadas, existentes);

  assert.equal(segunda.pessoasACriar, 0);
  assert.equal(segunda.linksAGravar, 0);
  assert.equal(segunda.jaLigadas, 3);
  assert.equal(segunda.divergentes, 0);
});

test("execução parcial: só o que falta entra no plano", () => {
  // O caso de backfill interrompido no meio de um lote.
  const linhas: LinhaCliente[] = [
    { id: "a", cpfCnpj: CPF, pessoaGrupoId: "pg-cpf" },
    { id: "b", cpfCnpj: CPF, pessoaGrupoId: null },
    { id: "c", cpfCnpj: CNPJ, pessoaGrupoId: null },
  ];
  const escrita = planejarEscrita(
    planejarBackfill(linhas),
    linhas,
    new Map([[CPF, "pg-cpf"]]),
  );
  assert.equal(escrita.pessoasACriar, 1); // só a do CNPJ
  assert.equal(escrita.linksAGravar, 2); // b e c
  assert.equal(escrita.jaLigadas, 1); // a
});

// ── Divergência: reportada, nunca corrigida ────────────────────────────────

test("conta ligada a OUTRA pessoa é reportada e fica fora de `ligar`", () => {
  // Religar seria um UPDATE silencioso disfarçado de "backfill idempotente".
  const linhas: LinhaCliente[] = [
    { id: "a", cpfCnpj: CPF, pessoaGrupoId: "pg-de-outro" },
    { id: "b", cpfCnpj: CPF, pessoaGrupoId: null },
  ];
  const escrita = planejarEscrita(
    planejarBackfill(linhas),
    linhas,
    new Map([[CPF, "pg-cpf"]]),
  );
  assert.equal(escrita.divergentes, 1);
  assert.equal(escrita.linksAGravar, 1);
  assert.deepEqual(escrita.acoes[0].divergentes, ["a"]);
  assert.deepEqual(escrita.acoes[0].ligar, ["b"]);
});

test("conta ligada quando a pessoa do documento ainda não existe também diverge", () => {
  // Vínculo apontando para pessoa que não é a do cpfCnpj atual — acontece se
  // o documento do cliente for editado depois do backfill.
  const linhas: LinhaCliente[] = [{ id: "a", cpfCnpj: CPF, pessoaGrupoId: "pg-antigo" }];
  const escrita = planejarEscrita(planejarBackfill(linhas), linhas, new Map());
  assert.equal(escrita.divergentes, 1);
  assert.equal(escrita.linksAGravar, 0);
  assert.equal(escrita.pessoasACriar, 1);
});

// ── Lotes ──────────────────────────────────────────────────────────────────

test("o lote padrão é 200 e o corte é por documento", () => {
  assert.equal(TAMANHO_DO_LOTE, 200);
  const itens = Array.from({ length: 450 }, (_, i) => i);
  const lotes = dividirEmLotes(itens);
  assert.deepEqual(lotes.map((l) => l.length), [200, 200, 50]);
});

test("lote não perde nem duplica item", () => {
  const itens = Array.from({ length: 137 }, (_, i) => i);
  assert.deepEqual(dividirEmLotes(itens, 20).flat(), itens);
});

test("lista vazia não gera lote vazio", () => {
  assert.deepEqual(dividirEmLotes([]), []);
});

test("tamanho de lote inválido falha alto, não em silêncio", () => {
  // Um `0` viraria laço infinito no `for` de `dividirEmLotes`.
  assert.throws(() => dividirEmLotes([1, 2], 0), /tamanho do lote/);
});

test("somarLotes agrega os contadores de progresso", () => {
  assert.deepEqual(
    somarLotes([
      { lote: 1, totalLotes: 2, pessoasCriadas: 200, linksGravados: 240, jaLigadas: 0, divergentes: 1 },
      { lote: 2, totalLotes: 2, pessoasCriadas: 33, linksGravados: 41, jaLigadas: 2, divergentes: 0 },
    ]),
    { pessoasCriadas: 233, linksGravados: 281, jaLigadas: 2, divergentes: 1 },
  );
});

// ── Resumo: nenhum dado pessoal ────────────────────────────────────────────

test("o resumo NÃO carrega documento, id de cliente nem nome", () => {
  // O teste que impede a regressão mais provável desta rota: alguém acrescenta
  // o documento "só na amostra, para conferir" e a API passa a devolver CPF.
  const { resumo } = primeiraExecucao([
    conta("cliente-1", CPF),
    conta("cliente-2", CPF),
    conta("cliente-3", CNPJ),
    conta("cliente-4", null),
  ]);
  const serializado = JSON.stringify(resumo);
  for (const proibido of [CPF, CNPJ, "529.982.247-25", "cliente-1", "cliente-4"]) {
    assert.ok(
      !serializado.includes(proibido),
      `"${proibido}" vazou para a resposta: ${serializado}`,
    );
  }
});

test("a amostra traz no máximo 5 agrupamentos, do maior para o menor", () => {
  const linhas: LinhaCliente[] = [];
  // 7 documentos duplicados, com 2..8 contas cada.
  for (let d = 0; d < 7; d++) {
    const doc = `1122233300${String(d).padStart(2, "0")}81`;
    for (let c = 0; c <= d + 1; c++) linhas.push(conta(`c-${d}-${c}`, doc));
  }
  const { resumo } = primeiraExecucao(linhas);

  assert.equal(TAMANHO_DA_AMOSTRA, 5);
  assert.equal(resumo.amostraDuplicatas.length, 5);
  assert.deepEqual(
    resumo.amostraDuplicatas.map((a) => a.contas),
    [8, 7, 6, 5, 4],
  );
  // Só tipo e contagem — nada mais.
  for (const item of resumo.amostraDuplicatas) {
    assert.deepEqual(Object.keys(item).sort(), ["contas", "tipo"]);
  }
});

test("sem duplicata, a amostra vem vazia em vez de inventada", () => {
  const { resumo } = primeiraExecucao([conta("a", CPF), conta("b", CNPJ)]);
  assert.deepEqual(resumo.amostraDuplicatas, []);
});

test("porTipo conta DOCUMENTOS distintos, não linhas", () => {
  const { resumo } = primeiraExecucao([
    conta("a", CPF),
    conta("b", CPF), // mesma pessoa
    conta("c", CNPJ),
    conta("d", CNPJ_OUTRO),
  ]);
  assert.deepEqual(resumo.porTipo, { CPF: 1, CNPJ: 2 });
  assert.equal(resumo.totalLinhas, 4);
});

test("os totais fecham: linhas = ligadas + já ligadas + divergentes + sem link", () => {
  const linhas: LinhaCliente[] = [
    conta("a", CPF),
    conta("b", CPF),
    { id: "c", cpfCnpj: CNPJ, pessoaGrupoId: "pg-cnpj" },
    { id: "d", cpfCnpj: CNPJ, pessoaGrupoId: "pg-errado" },
    conta("e", null),
  ];
  const escrita = planejarEscrita(
    planejarBackfill(linhas),
    linhas,
    new Map([[CNPJ, "pg-cnpj"]]),
  );
  const resumo = resumirPlano(planejarBackfill(linhas), escrita);
  assert.equal(
    resumo.linksAGravar + resumo.jaLigadas + resumo.divergentes + resumo.semLink,
    resumo.totalLinhas,
  );
});
