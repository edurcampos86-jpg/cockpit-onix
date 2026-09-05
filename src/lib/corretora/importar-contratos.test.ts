/**
 * Testes do planejamento do import — sem banco.
 *
 * As quatro regras que o módulo existe para garantir estão aqui, uma seção
 * cada: casamento só por documento, pessoa nova é criada, idempotência por
 * chave de negócio, e histórico que não anda para trás.
 *
 * A seção final é a mais importante do arquivo: um rótulo desconhecido não
 * pode virar `tipoProduto` válido por NENHUM caminho.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { aplicarPerfil } from "@/lib/importacao/aplicar-perfil.ts";
import type { LinhaAplicada } from "@/lib/importacao/aplicar-perfil.ts";
import type { LinhaExtraida } from "@/lib/importacao/extracao.ts";
import type { PerfilImportacaoConfig } from "@/lib/importacao/perfil.ts";
import { ehTipoProdutoValido, tiposProdutoValidos } from "./catalogo-produtos.ts";
import { dadosDoContrato } from "./executar-importacao.ts";
import {
  CAMPOS_SOBRESCREVIVEIS,
  chaveNegocio,
  diagnosticarGrafias,
  ehTerminal,
  montarRegistro,
  planejar,
  type EstadoAtual,
} from "./importar-contratos.ts";

const PERFIL: PerfilImportacaoConfig = {
  formato: "csv",
  extracao: { tipo: "csv", delimitador: ";" },
  mapeamentoColunas: {
    "CPF/CNPJ": "cpfCnpj",
    "Nome": "nome",
    "Ramo": "tipoProduto",
    "Apólice": "numeroContrato",
    "Parceiro": "parceiro",
    "Situação": "status",
    "Início": "inicioVigencia",
    "Prêmio": "premio",
    "Atendente": "atendenteCorretora",
    "Capital Segurado": "capitalSegurado",
  },
  formatosValor: {
    cpfCnpj: "documento_digitos",
    premio: "decimal_ptbr",
    inicioVigencia: "data_ddmmaaaa",
    capitalSegurado: "decimal_ptbr",
  },
  dicionarios: {
    tipoProduto: { "SEGURO DE VIDA": "vida", "AUTO FÁCIL": "auto" },
    status: { "EM VIGOR": "ativo", "CANCELADA": "cancelado", "ENCERRADA": "encerrado" },
  },
};

const BASE = {
  "CPF/CNPJ": "097.146.005-10",
  Nome: "Fulano de Tal",
  Ramo: "SEGURO DE VIDA",
  "Apólice": "AP-001234",
  Parceiro: "Porto Seguro",
  "Situação": "EM VIGOR",
  "Início": "01/09/2026",
  "Prêmio": "1.234,56",
  Atendente: "Ana Paula",
  "Capital Segurado": "500.000,00",
};

function aplicar(celulas: Record<string, string>[], origem: "deterministica" | "ia" = "deterministica"): LinhaAplicada[] {
  const linhas: LinhaExtraida[] = celulas.map((c, i) => ({ numero: i + 2, celulas: c, origem }));
  return aplicarPerfil(linhas, PERFIL);
}

const VAZIO: EstadoAtual = {
  pessoasPorDocumento: new Map(),
  contratosPorChave: new Map(),
};

/** Competências de referência dos testes — agosto e setembro de 2026. */
const AGOSTO = new Date(Date.UTC(2026, 7, 1, 12, 0, 0));
const SETEMBRO = new Date(Date.UTC(2026, 8, 1, 12, 0, 0));

/** Contexto de escrita dos testes — nada aqui é lido pela trava. */
const CONTEXTO = {
  loteImportacao: "lote_teste",
  arquivoOrigem: "relatorio.csv",
  perfilImportacaoId: null,
};

const OPCOES = {
  parceiroPadrao: "Porto Seguro",
  dicionarioProduto: PERFIL.dicionarios.tipoProduto,
  dataReferenciaDoLote: AGOSTO,
};

// ── O registro ───────────────────────────────────────────────────────────

test("uma linha completa vira registro, e o que não tem coluna vai para dadosProduto", () => {
  const [linha] = aplicar([BASE]);
  const r = montarRegistro(linha, "Porto Seguro", OPCOES.dicionarioProduto, AGOSTO);
  assert.ok(r.ok, r.ok ? "" : r.motivo);
  assert.equal(r.registro.tipoProduto, "vida");
  assert.equal(r.registro.status, "ativo");
  assert.equal(r.registro.premio, 1234.56);
  assert.equal(r.registro.cpfCnpj, "09714600510");
  assert.equal(r.registro.linhaOrigem, 2);
  assert.equal(r.registro.origemExtracao, "deterministica");
  // `capitalSegurado` não é coluna de `ContratoCorretora` — e não pode sumir.
  assert.equal(r.registro.dadosProduto.capitalSegurado, 500000);
  assert.equal("nome" in r.registro.dadosProduto, false, "campo com coluna não duplica no Json");
});

test("origem 'ia' é preservada no registro — auditabilidade linha a linha", () => {
  const [linha] = aplicar([BASE], "ia");
  const r = montarRegistro(linha, "Porto Seguro", OPCOES.dicionarioProduto, AGOSTO);
  assert.ok(r.ok);
  assert.equal(r.registro.origemExtracao, "ia");
});

// ── Regra 1: casamento SÓ por documento ──────────────────────────────────

test("linha sem cpfCnpj é rejeitada, ainda que tenha nome completo", () => {
  const [linha] = aplicar([{ ...BASE, "CPF/CNPJ": "" }]);
  const r = montarRegistro(linha, "Porto Seguro", OPCOES.dicionarioProduto, AGOSTO);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.motivo, /casamento só existe por documento/);
});

test("nome igual e documento diferente são pessoas DIFERENTES", () => {
  // Dois "Fulano de Tal". Casar por nome fundiria duas carteiras, e o estrago
  // só apareceria quando alguém ligasse para o cliente errado.
  const plano = planejar(
    aplicar([
      { ...BASE, "CPF/CNPJ": "097.146.005-10", "Apólice": "AP-1" },
      { ...BASE, "CPF/CNPJ": "12.345.678/0001-95", "Apólice": "AP-2" },
    ]),
    VAZIO,
    OPCOES,
  );
  assert.equal(plano.pessoasACriar.length, 2);
});

test("CPF casa com CPF e CNPJ com CNPJ — o tamanho é quem separa", () => {
  const estado: EstadoAtual = {
    pessoasPorDocumento: new Map([["09714600510", "pg_1"]]),
    contratosPorChave: new Map(),
  };
  const plano = planejar(
    aplicar([
      { ...BASE, "CPF/CNPJ": "097.146.005-10", "Apólice": "AP-1" },
      { ...BASE, "CPF/CNPJ": "12.345.678/0001-95", "Apólice": "AP-2" },
    ]),
    estado,
    OPCOES,
  );
  assert.equal(plano.pessoasCasadas, 1);
  assert.deepEqual(
    plano.pessoasACriar.map((p) => p.cpfCnpj),
    ["12345678000195"],
  );
});

// ── Regra 2: pessoa sem vínculo é criada ─────────────────────────────────

test("pessoa desconhecida é CRIADA, e só uma vez por documento", () => {
  // O cliente exclusivo da Corretora, com cinco produtos no mesmo arquivo.
  const plano = planejar(
    aplicar([
      { ...BASE, "Apólice": "AP-1" },
      { ...BASE, "Apólice": "AP-2", Ramo: "AUTO FÁCIL" },
      { ...BASE, "Apólice": "AP-3" },
    ]),
    VAZIO,
    OPCOES,
  );
  assert.equal(plano.pessoasACriar.length, 1);
  assert.equal(plano.pessoasACriar[0].cpfCnpj, "09714600510");
  assert.equal(plano.acoes.length, 3);
});

// ── Regra 3: idempotência por chave de negócio ───────────────────────────

test("a chave normaliza os três lados", () => {
  const a = chaveNegocio({ parceiro: "Porto Seguro", numeroContrato: "AP-001234", tipoProduto: "vida" });
  const b = chaveNegocio({ parceiro: "porto  seguro", numeroContrato: "ap 001234", tipoProduto: "vida" });
  assert.equal(a, b);
});

test("produto diferente na MESMA apólice são contratos diferentes", () => {
  // Por isso o tipoProduto entra na chave: uma apólice pode cobrir dois ramos.
  const a = chaveNegocio({ parceiro: "Porto", numeroContrato: "AP-1", tipoProduto: "vida" });
  const b = chaveNegocio({ parceiro: "Porto", numeroContrato: "AP-1", tipoProduto: "consorcio-auto" });
  assert.notEqual(a, b);
});

test("reprocessar o mesmo arquivo ATUALIZA, não duplica", () => {
  const linhas = aplicar([BASE]);
  const primeiro = planejar(linhas, VAZIO, OPCOES);
  assert.equal(primeiro.acoes[0].acao, "criar");

  const depois: EstadoAtual = {
    pessoasPorDocumento: new Map([["09714600510", "pg_1"]]),
    contratosPorChave: new Map([[primeiro.acoes[0].chave, { id: "c_1", status: "ativo", dataReferencia: null , preenchidos: [] }]]),
  };
  const segundo = planejar(linhas, depois, OPCOES);
  assert.equal(segundo.acoes.length, 1);
  assert.equal(segundo.acoes[0].acao, "atualizar");
  assert.equal(segundo.pessoasACriar.length, 0, "a terceira rodada também não cria ninguém");
});

test("linha repetida DENTRO do mesmo arquivo é contada e pulada", () => {
  const plano = planejar(aplicar([BASE, BASE]), VAZIO, OPCOES);
  assert.equal(plano.acoes.length, 1);
  assert.equal(plano.duplicadasNoLote.length, 1);
  assert.equal(plano.duplicadasNoLote[0].linha, 3);
});

// ── Regra 4: histórico não anda para trás ────────────────────────────────

test("cancelado, encerrado e recusado são terminais", () => {
  assert.equal(ehTerminal("cancelado"), true);
  assert.equal(ehTerminal("encerrado"), true);
  assert.equal(ehTerminal("recusado"), true);
  assert.equal(ehTerminal("ativo"), false);
  assert.equal(ehTerminal("suspenso"), false);
});

test("arquivo antigo NÃO ressuscita contrato cancelado", () => {
  const linhas = aplicar([BASE]); // status "EM VIGOR" → ativo
  const chave = chaveNegocio({ parceiro: "Porto Seguro", numeroContrato: "AP-001234", tipoProduto: "vida" });
  const estado: EstadoAtual = {
    pessoasPorDocumento: new Map([["09714600510", "pg_1"]]),
    contratosPorChave: new Map([[chave, { id: "c_1", status: "cancelado", dataReferencia: null , preenchidos: [] }]]),
  };
  const plano = planejar(linhas, estado, OPCOES);
  assert.equal(plano.acoes.length, 0, "nenhuma escrita — o cancelamento permanece");
  assert.equal(plano.historicoPreservado.length, 1);
  assert.equal(plano.historicoPreservado[0].statusAtual, "cancelado");
  assert.equal(plano.historicoPreservado[0].statusRecusado, "ativo");
});

test("reprocessar o MESMO cancelamento é atualização normal, não bloqueio", () => {
  const linhas = aplicar([{ ...BASE, "Situação": "CANCELADA" }]);
  const chave = chaveNegocio({ parceiro: "Porto Seguro", numeroContrato: "AP-001234", tipoProduto: "vida" });
  const plano = planejar(
    linhas,
    {
      pessoasPorDocumento: new Map([["09714600510", "pg_1"]]),
      contratosPorChave: new Map([[chave, { id: "c_1", status: "cancelado", dataReferencia: null , preenchidos: [] }]]),
    },
    OPCOES,
  );
  assert.equal(plano.acoes.length, 1);
  assert.equal(plano.acoes[0].acao, "atualizar");
  assert.equal(plano.historicoPreservado.length, 0);
});

test("contrato ativo PODE ser cancelado — a regra só barra a volta", () => {
  const linhas = aplicar([{ ...BASE, "Situação": "CANCELADA" }]);
  const chave = chaveNegocio({ parceiro: "Porto Seguro", numeroContrato: "AP-001234", tipoProduto: "vida" });
  const plano = planejar(
    linhas,
    {
      pessoasPorDocumento: new Map([["09714600510", "pg_1"]]),
      contratosPorChave: new Map([[chave, { id: "c_1", status: "ativo", dataReferencia: null , preenchidos: [] }]]),
    },
    OPCOES,
  );
  assert.equal(plano.acoes[0].acao, "atualizar");
  assert.equal(plano.acoes[0].registro.status, "cancelado");
});

// ── Diagnóstico de grafia de atendente ───────────────────────────────────

test("grafias do mesmo atendente colapsam, com as variações listadas", () => {
  const plano = planejar(
    aplicar([
      { ...BASE, "Apólice": "AP-1", Atendente: "Ana Paula" },
      { ...BASE, "Apólice": "AP-2", Atendente: "ANA PAULA" },
      { ...BASE, "Apólice": "AP-3", Atendente: "Ana  Paula " },
      { ...BASE, "Apólice": "AP-4", Atendente: "Bruno Lima" },
      { ...BASE, "Apólice": "AP-5", Atendente: "" },
    ]),
    VAZIO,
    OPCOES,
  );
  const ana = plano.grafiasAtendente.find((g) => g.normalizado === "ana paula");
  assert.equal(ana?.linhas, 3);
  assert.deepEqual(ana?.grafias, ["ANA PAULA", "Ana  Paula", "Ana Paula"]);
  assert.equal(plano.grafiasAtendente.length, 2, "atendente vazio não vira grafia");
  assert.equal(plano.grafiasAtendente[0].normalizado, "ana paula", "o mais frequente vem primeiro");
});

test("o diagnóstico só CONTA — não corrige nem unifica nada", () => {
  const registros = [
    { atendenteCorretora: "Ana Paula" },
    { atendenteCorretora: "ANA PAULA" },
    // O diagnóstico lê UM campo do registro. O cast atravessa `unknown`
    // porque `RegistroContrato` tem quinze campos e recriá-los aqui não
    // provaria nada sobre agrupamento de grafia.
  ] as unknown as Parameters<typeof diagnosticarGrafias>[0];
  const [g] = diagnosticarGrafias(registros);
  assert.equal(g.grafias.length, 2, "as duas grafias literais continuam visíveis");
});

// ── A trava: rótulo desconhecido NUNCA vira tipoProduto válido ───────────

test("por NENHUM caminho um rótulo desconhecido vira tipoProduto válido", () => {
  const desconhecidos = [
    "SEGURO VIAGEM",
    "PREVIDÊNCIA PRIVADA",
    "AUTO FÁCIL 3.0", // quase igual a um mapeado
    "SEGURO DE VIDA EM GRUPO PREMIADO", // contém um mapeado inteiro
    "vidas", // um caractere de distância do id canônico
    "VID",
    "???",
  ];

  for (const rotulo of desconhecidos) {
    // Caminho 1: perfil COM dicionário que não conhece o rótulo.
    const [comDicionario] = aplicar([{ ...BASE, Ramo: rotulo }]);
    const r1 = montarRegistro(comDicionario, "Porto Seguro", OPCOES.dicionarioProduto, AGOSTO);
    assert.equal(r1.ok, false, `"${rotulo}" virou registro pelo caminho do dicionário`);

    // Caminho 2: perfil SEM dicionário nenhum — sobra o alias de mercado.
    const semDicionario = aplicarPerfil(
      [{ numero: 2, celulas: { ...BASE, Ramo: rotulo }, origem: "deterministica" }],
      { ...PERFIL, dicionarios: { status: PERFIL.dicionarios.status } },
    );
    const r2 = montarRegistro(semDicionario[0], "Porto Seguro", undefined, AGOSTO);
    assert.equal(r2.ok, false, `"${rotulo}" virou registro pelo caminho do alias`);

    // Caminho 3: o plano inteiro. Nenhuma ação pode carregar o rótulo.
    const plano = planejar(aplicar([{ ...BASE, Ramo: rotulo }]), VAZIO, OPCOES);
    assert.equal(plano.acoes.length, 0, `"${rotulo}" chegou a virar ação`);
    assert.equal(plano.rejeitadas.length, 1);
    for (const acao of plano.acoes) {
      assert.ok(ehTipoProdutoValido(acao.registro.tipoProduto));
    }
  }
});

test("dicionário do perfil apontando para id INVÁLIDO não grava nada", () => {
  // Erro de digitação no perfil: "vidas" em vez de "vida". Se isto passasse,
  // o banco ganharia um tipoProduto que o catálogo não conhece — exatamente o
  // defeito de `Implementacao.empresaId`.
  const linhas = aplicarPerfil(
    [{ numero: 2, celulas: BASE, origem: "deterministica" }],
    { ...PERFIL, dicionarios: { ...PERFIL.dicionarios, tipoProduto: { "SEGURO DE VIDA": "vidas" } } },
  );
  const r = montarRegistro(linhas[0], "Porto Seguro", { "SEGURO DE VIDA": "vidas" }, AGOSTO);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.motivo, /sem mapeamento/);
});

test("dicionário DECLARADO é autoritativo — o alias de mercado não o completa", () => {
  // "Consórcio" é alias de mercado conhecido do catálogo, mas este perfil
  // declara um dicionário de tipoProduto e não o lista. Deliberado: quem
  // declarou o vocabulário da fonte respondeu pelo vocabulário inteiro, e
  // completar por fora traria de volta, pela porta dos fundos, o encaixe que a
  // regra do PENDENTE existe para impedir. O rótulo aparece no diagnóstico e
  // se resolve com uma linha no dicionário.
  const plano = planejar(aplicar([{ ...BASE, Ramo: "Consórcio" }]), VAZIO, OPCOES);
  assert.equal(plano.acoes.length, 0);
  assert.equal(plano.pendentes, 1);
});

test("sem dicionário declarado, vale o alias de mercado do catálogo", () => {
  const semDicionario = { ...PERFIL, dicionarios: { status: PERFIL.dicionarios.status } };
  const linhas = aplicarPerfil(
    [{ numero: 2, celulas: { ...BASE, Ramo: "Consórcio Auto" }, origem: "deterministica" as const }],
    semDicionario,
  );
  const r = montarRegistro(linhas[0], "Porto Seguro", undefined, AGOSTO);
  assert.ok(r.ok, r.ok ? "" : r.motivo);
  assert.equal(r.registro.tipoProduto, "consorcio-auto");
});

test("alias AMBÍGUO é recusado pelo motor inteiro, não só pelo catálogo", () => {
  // "Consórcio" sozinho deixou de resolver quando a família virou dois
  // produtos. O que importa aqui é o comportamento de PONTA: a linha é
  // rejeitada com motivo, e não gravada no produto mais provável.
  const semDicionario = { ...PERFIL, dicionarios: { status: PERFIL.dicionarios.status } };
  const linhas = aplicarPerfil(
    [{ numero: 2, celulas: { ...BASE, Ramo: "Consórcio" }, origem: "deterministica" as const }],
    semDicionario,
  );
  const r = montarRegistro(linhas[0], "Porto Seguro", undefined, AGOSTO);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.motivo, /tipoProduto sem mapeamento/);
});

test("todo tipoProduto que sai do plano está no catálogo", () => {
  const validos = tiposProdutoValidos();
  const plano = planejar(
    aplicar([
      { ...BASE, "Apólice": "AP-1", Ramo: "SEGURO DE VIDA" },
      { ...BASE, "Apólice": "AP-2", Ramo: "AUTO FÁCIL" },
    ]),
    VAZIO,
    OPCOES,
  );
  assert.equal(plano.acoes.length, 2);
  for (const a of plano.acoes) {
    assert.ok(validos.includes(a.registro.tipoProduto), `${a.registro.tipoProduto} fora do catálogo`);
  }
});

test("status desconhecido também rejeita a linha", () => {
  const plano = planejar(aplicar([{ ...BASE, "Situação": "SINISTRADA" }]), VAZIO, OPCOES);
  assert.equal(plano.acoes.length, 0);
  assert.equal(plano.pendentes, 1);
  assert.match(plano.rejeitadas[0].motivo, /status sem mapeamento/);
});

// ── Regra 5: valor não anda para trás ────────────────────────────────────
// O bug que estes testes fecham foi achado no ensaio, não na leitura: rodado
// setembro, reprocessar agosto devolvia o prêmio velho — sem erro nenhum.

test("agosto → setembro → agosto de novo: o prêmio de setembro PERMANECE", () => {
  const linhaAgosto = aplicar([{ ...BASE, "Prêmio": "1.234,56" }]);
  const linhaSetembro = aplicar([{ ...BASE, "Prêmio": "1.400,00" }]);

  // 1ª passada: agosto cria.
  const primeiro = planejar(linhaAgosto, VAZIO, OPCOES);
  assert.equal(primeiro.acoes.length, 1);
  assert.equal(primeiro.acoes[0].acao, "criar");
  const chave = primeiro.acoes[0].chave;

  // 2ª passada: setembro atualiza — competência maior, é o caminho normal.
  const gravadoEmAgosto: EstadoAtual = {
    pessoasPorDocumento: new Map([["09714600510", "p_1"]]),
    contratosPorChave: new Map([[chave, { id: "c_1", status: "ativo", dataReferencia: AGOSTO , preenchidos: [] }]]),
  };
  const segundo = planejar(linhaSetembro, gravadoEmAgosto, {
    ...OPCOES,
    dataReferenciaDoLote: SETEMBRO,
  });
  assert.equal(segundo.acoes.length, 1);
  assert.equal(segundo.acoes[0].acao, "atualizar");
  assert.equal(segundo.acoes[0].registro.premio, 1400);
  assert.equal(segundo.ignoradasPorAntiguidade.length, 0);

  // 3ª passada: agosto DE NOVO, contra o estado de setembro. É aqui que o bug
  // vivia. Nenhuma ação, e o motivo sai no relatório com as duas datas.
  const gravadoEmSetembro: EstadoAtual = {
    pessoasPorDocumento: new Map([["09714600510", "p_1"]]),
    contratosPorChave: new Map([[chave, { id: "c_1", status: "ativo", dataReferencia: SETEMBRO , preenchidos: [] }]]),
  };
  const terceiro = planejar(linhaAgosto, gravadoEmSetembro, OPCOES);
  assert.equal(terceiro.acoes.length, 0, "o arquivo de agosto reescreveu setembro");
  assert.equal(terceiro.ignoradasPorAntiguidade.length, 1);
  assert.equal(terceiro.ignoradasPorAntiguidade[0].linha, 2);
  assert.equal(terceiro.ignoradasPorAntiguidade[0].referenciaDoLote.getTime(), AGOSTO.getTime());
  assert.equal(terceiro.ignoradasPorAntiguidade[0].referenciaGravada.getTime(), SETEMBRO.getTime());
});

test("arquivo antigo com contrato INEXISTENTE cria normalmente", () => {
  // A metade da regra que se esquece. Recusar o arquivo velho inteiro seria
  // fácil e errado: ele tem direito de completar buraco, não de reescrever.
  const gravadoEmSetembro: EstadoAtual = {
    pessoasPorDocumento: new Map([["09714600510", "p_1"]]),
    contratosPorChave: new Map([
      [
        chaveNegocio({ parceiro: "Porto Seguro", numeroContrato: "AP-999", tipoProduto: "vida" }),
        { id: "c_9", status: "ativo", dataReferencia: SETEMBRO , preenchidos: [] },
      ],
    ]),
  };
  const plano = planejar(aplicar([{ ...BASE, "Apólice": "AP-001234" }]), gravadoEmSetembro, OPCOES);
  assert.equal(plano.acoes.length, 1);
  assert.equal(plano.acoes[0].acao, "criar");
  assert.equal(plano.ignoradasPorAntiguidade.length, 0);
});

test("MESMA competência duas vezes ATUALIZA — reprocessar não é regressão", () => {
  // `>=`, não `>`. A segunda passada do mesmo relatório costuma ser a correção
  // da primeira; tratá-la como regressão travaria o conserto.
  const chave = chaveNegocio({
    parceiro: "Porto Seguro",
    numeroContrato: "AP-001234",
    tipoProduto: "vida",
  });
  const gravadoEmAgosto: EstadoAtual = {
    pessoasPorDocumento: new Map([["09714600510", "p_1"]]),
    contratosPorChave: new Map([[chave, { id: "c_1", status: "ativo", dataReferencia: AGOSTO , preenchidos: [] }]]),
  };
  const plano = planejar(aplicar([{ ...BASE, "Prêmio": "1.300,00" }]), gravadoEmAgosto, OPCOES);
  assert.equal(plano.acoes.length, 1);
  assert.equal(plano.acoes[0].acao, "atualizar");
  assert.equal(plano.acoes[0].registro.premio, 1300);
  assert.equal(plano.ignoradasPorAntiguidade.length, 0);
});

test("sem competência — nem no perfil, nem no lote — a linha é REJEITADA, não estimada", () => {
  // Chutar "hoje" aqui devolveria o bug inteiro: hoje é sempre o mais recente.
  const [linha] = aplicar([BASE]);
  const r = montarRegistro(linha, "Porto Seguro", OPCOES.dicionarioProduto);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.motivo, /dataReferencia/);
});

test("competência do ARQUIVO vence a do lote — relatório com meses misturados", () => {
  // Um arquivo que traz a própria competência sabe mais do que quem digitou a
  // do lote. É o caso em que o valor do lote mentiria para metade das linhas.
  const perfilComColuna = {
    ...PERFIL,
    mapeamentoColunas: { ...PERFIL.mapeamentoColunas, "Competência": "dataReferencia" },
    formatosValor: { ...PERFIL.formatosValor, dataReferencia: "data_ddmmaaaa" as const },
  };
  const linhas = aplicarPerfil(
    [
      {
        numero: 2,
        celulas: { ...BASE, "Competência": "01/09/2026" },
        origem: "deterministica" as const,
      },
    ],
    perfilComColuna,
  );
  const r = montarRegistro(linhas[0], "Porto Seguro", OPCOES.dicionarioProduto, AGOSTO);
  assert.ok(r.ok, r.ok ? "" : r.motivo);
  assert.equal(r.registro.dataReferencia.getTime(), SETEMBRO.getTime());
  // E não vaza duplicada para dentro de dadosProduto.
  assert.equal("dataReferencia" in r.registro.dadosProduto, false);
});

// ── A trava contra o update cego ─────────────────────────────────────────
//
// O motor apagava dado em silêncio: `data(c.fimVigencia)` devolvia `null` tanto
// para célula vazia quanto para COLUNA NÃO MAPEADA NO PERFIL, e o `update` com
// o objeto inteiro zerava a coluna. Com cinco seguradoras e cinco perfis, o
// relatório de uma apagava o fim de vigência que veio da outra — o campo que
// diz quando ligar para o cliente.
//
// `PERFIL` (o do topo deste arquivo) não mapeia `fimVigencia`, `comissao` nem
// `assessorCge`: é exatamente o perfil incompleto do problema real.

test("campo que o perfil não mapeia NÃO entra na escrita — o update não o toca", () => {
  const [linha] = aplicar([BASE]);
  const r = montarRegistro(linha, "Porto Seguro", OPCOES.dicionarioProduto, AGOSTO);
  assert.ok(r.ok, r.ok ? "" : r.motivo);

  const dados = dadosDoContrato(r.registro, "pg_1", "corretora", CONTEXTO) as Record<
    string,
    unknown
  >;

  // `undefined` e não `null`: no Prisma, `undefined` é "não toque nesta
  // coluna" e `null` é "grave null". É a diferença inteira entre preservar e
  // apagar, e é por isso que o teste checa o tipo do vazio, não só que é falsy.
  for (const campo of ["fimVigencia", "comissao", "assessorCge"]) {
    assert.equal(dados[campo], undefined, `${campo} não veio no relatório e não pode ser escrito`);
    assert.equal(campo in dados, true, "a chave existe; o valor é que é undefined");
  }
});

test("campo mapeado com célula VAZIA continua apagando — é a fonte afirmando", () => {
  // A distinção é o ponto: "não veio a coluna" é ausência de informação;
  // "a coluna veio em branco" é a companhia dizendo que não há valor.
  const [linha] = aplicar([{ ...BASE, "Prêmio": "", Atendente: "" }]);
  const r = montarRegistro(linha, "Porto Seguro", OPCOES.dicionarioProduto, AGOSTO);
  assert.ok(r.ok, r.ok ? "" : r.motivo);

  const dados = dadosDoContrato(r.registro, "pg_1", "corretora", CONTEXTO) as Record<
    string,
    unknown
  >;
  assert.equal(dados.premio, null, "coluna mapeada e vazia grava null");
  assert.equal(dados.atendenteCorretora, null, "coluna mapeada e vazia grava null");
});

test("campo mapeado e preenchido é escrito normalmente", () => {
  const [linha] = aplicar([BASE]);
  const r = montarRegistro(linha, "Porto Seguro", OPCOES.dicionarioProduto, AGOSTO);
  assert.ok(r.ok);
  const dados = dadosDoContrato(r.registro, "pg_1", "corretora", CONTEXTO) as Record<
    string,
    unknown
  >;
  assert.equal(dados.premio, 1234.56);
  assert.equal(dados.atendenteCorretora, "Ana Paula");
});

test("camposDoRelatorio lista o que o perfil trouxe, e só isso", () => {
  const [linha] = aplicar([BASE]);
  const r = montarRegistro(linha, "Porto Seguro", OPCOES.dicionarioProduto, AGOSTO);
  assert.ok(r.ok);
  const trazidos = new Set(r.registro.camposDoRelatorio);
  assert.equal(trazidos.has("premio"), true);
  assert.equal(trazidos.has("atendenteCorretora"), true);
  assert.equal(trazidos.has("fimVigencia"), false, "PERFIL não mapeia fim de vigência");
  assert.equal(trazidos.has("comissao"), false);
  assert.equal(trazidos.has("assessorCge"), false);
});

test("os cinco sobrescrevíveis são exatamente as colunas opcionais do contrato", () => {
  // Guarda de divergência: se alguém somar uma coluna opcional ao model e
  // esquecer de listá-la aqui, ela volta a ser apagada em silêncio pelo perfil
  // que não a mapeia — que é o defeito inteiro, de novo.
  assert.deepEqual([...CAMPOS_SOBRESCREVIVEIS].sort(), [
    "assessorCge",
    "atendenteCorretora",
    "comissao",
    "fimVigencia",
    "premio",
  ]);

  // E nenhum deles pode ser obrigatório: campo que `montarRegistro` exige
  // nunca chega ausente, e listá-lo aqui esconderia um bug em vez de travá-lo.
  const [linha] = aplicar([BASE]);
  const r = montarRegistro(linha, "Porto Seguro", OPCOES.dicionarioProduto, AGOSTO);
  assert.ok(r.ok);
  for (const obrigatorio of ["tipoProduto", "status", "parceiro", "numeroContrato", "inicioVigencia"]) {
    assert.equal(
      CAMPOS_SOBRESCREVIVEIS.includes(obrigatorio),
      false,
      `${obrigatorio} é obrigatório — não é sobrescrevível`,
    );
  }
});

// ── O ensaio passa a contar ──────────────────────────────────────────────

test("o plano conta os campos que a base tem e o perfil não traz", () => {
  const [linha] = aplicar([BASE]);
  const primeiro = planejar([linha], VAZIO, OPCOES);
  const chave = primeiro.acoes[0].chave;

  const comDados: EstadoAtual = {
    pessoasPorDocumento: new Map([["09714600510", "pg_1"]]),
    contratosPorChave: new Map([
      [
        chave,
        {
          id: "c_1",
          status: "ativo",
          dataReferencia: null,
          // A base tem fim de vigência e comissão; o PERFIL não traz nenhum
          // dos dois. É o perfil incompleto que o operador precisa enxergar.
          preenchidos: ["fimVigencia", "comissao", "premio"],
        },
      ],
    ]),
  };

  const plano = planejar([linha], comDados, OPCOES);
  assert.equal(plano.acoes[0].acao, "atualizar");
  assert.deepEqual(plano.camposNaoCobertos, [
    { campo: "fimVigencia", contratos: 1 },
    { campo: "comissao", contratos: 1 },
  ]);
  // `premio` está preenchido na base E vem no relatório: não é campo não
  // coberto, é campo que vai ser atualizado. Contá-lo aqui seria alarme falso.
});

test("contrato que o lote não atualiza não entra na contagem de não cobertos", () => {
  const [linha] = aplicar([BASE]);
  const primeiro = planejar([linha], VAZIO, OPCOES);
  const chave = primeiro.acoes[0].chave;

  // Terminal: a regra 4 recusa a atualização. Campo não coberto num contrato
  // que o lote nem toca não é notícia — seria ruído que ensina a ignorar o
  // aviso de verdade.
  const terminal: EstadoAtual = {
    pessoasPorDocumento: new Map([["09714600510", "pg_1"]]),
    contratosPorChave: new Map([
      [chave, { id: "c_1", status: "cancelado", dataReferencia: null, preenchidos: ["fimVigencia"] }],
    ]),
  };

  const plano = planejar([linha], terminal, OPCOES);
  assert.equal(plano.acoes.length, 0);
  assert.deepEqual(plano.camposNaoCobertos, []);
});

test("base sem nada preenchido não gera aviso de campo não coberto", () => {
  const [linha] = aplicar([BASE]);
  const primeiro = planejar([linha], VAZIO, OPCOES);
  const chave = primeiro.acoes[0].chave;

  const vazia: EstadoAtual = {
    pessoasPorDocumento: new Map([["09714600510", "pg_1"]]),
    contratosPorChave: new Map([
      [chave, { id: "c_1", status: "ativo", dataReferencia: null, preenchidos: [] }],
    ]),
  };

  const plano = planejar([linha], vazia, OPCOES);
  assert.equal(plano.acoes[0].acao, "atualizar");
  assert.deepEqual(plano.camposNaoCobertos, [], "não há valor gravado para preservar");
});
