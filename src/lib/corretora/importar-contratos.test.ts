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
import {
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
    tipoProduto: { "SEGURO DE VIDA": "vida", "AUTO FÁCIL": "auto_residencial" },
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

const OPCOES = { parceiroPadrao: "Porto Seguro", dicionarioProduto: PERFIL.dicionarios.tipoProduto };

// ── O registro ───────────────────────────────────────────────────────────

test("uma linha completa vira registro, e o que não tem coluna vai para dadosProduto", () => {
  const [linha] = aplicar([BASE]);
  const r = montarRegistro(linha, "Porto Seguro", OPCOES.dicionarioProduto);
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
  const r = montarRegistro(linha, "Porto Seguro", OPCOES.dicionarioProduto);
  assert.ok(r.ok);
  assert.equal(r.registro.origemExtracao, "ia");
});

// ── Regra 1: casamento SÓ por documento ──────────────────────────────────

test("linha sem cpfCnpj é rejeitada, ainda que tenha nome completo", () => {
  const [linha] = aplicar([{ ...BASE, "CPF/CNPJ": "" }]);
  const r = montarRegistro(linha, "Porto Seguro", OPCOES.dicionarioProduto);
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
  const b = chaveNegocio({ parceiro: "Porto", numeroContrato: "AP-1", tipoProduto: "consorcio" });
  assert.notEqual(a, b);
});

test("reprocessar o mesmo arquivo ATUALIZA, não duplica", () => {
  const linhas = aplicar([BASE]);
  const primeiro = planejar(linhas, VAZIO, OPCOES);
  assert.equal(primeiro.acoes[0].acao, "criar");

  const depois: EstadoAtual = {
    pessoasPorDocumento: new Map([["09714600510", "pg_1"]]),
    contratosPorChave: new Map([[primeiro.acoes[0].chave, { id: "c_1", status: "ativo" }]]),
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
    contratosPorChave: new Map([[chave, { id: "c_1", status: "cancelado" }]]),
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
      contratosPorChave: new Map([[chave, { id: "c_1", status: "cancelado" }]]),
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
      contratosPorChave: new Map([[chave, { id: "c_1", status: "ativo" }]]),
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
  ] as Parameters<typeof diagnosticarGrafias>[0];
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
    const r1 = montarRegistro(comDicionario, "Porto Seguro", OPCOES.dicionarioProduto);
    assert.equal(r1.ok, false, `"${rotulo}" virou registro pelo caminho do dicionário`);

    // Caminho 2: perfil SEM dicionário nenhum — sobra o alias de mercado.
    const semDicionario = aplicarPerfil(
      [{ numero: 2, celulas: { ...BASE, Ramo: rotulo }, origem: "deterministica" }],
      { ...PERFIL, dicionarios: { status: PERFIL.dicionarios.status } },
    );
    const r2 = montarRegistro(semDicionario[0], "Porto Seguro");
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
  const r = montarRegistro(linhas[0], "Porto Seguro", { "SEGURO DE VIDA": "vidas" });
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
    [{ numero: 2, celulas: { ...BASE, Ramo: "Consórcio" }, origem: "deterministica" as const }],
    semDicionario,
  );
  const r = montarRegistro(linhas[0], "Porto Seguro");
  assert.ok(r.ok, r.ok ? "" : r.motivo);
  assert.equal(r.registro.tipoProduto, "consorcio");
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
