import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GERADOR_QUESTIONARIO_PAT_VERSAO,
  PERGUNTA_PAT_IDS,
  gerarPerguntasPat,
  type PatParaQuestionario,
} from "./questionario-pat.ts";

function ids(pat: PatParaQuestionario | null) {
  return gerarPerguntasPat(pat).map((pergunta) => pergunta.id);
}

test("versão do gerador começa em 1", () => {
  assert.equal(GERADOR_QUESTIONARIO_PAT_VERSAO, 1);
});

test("perfil social e rápido abre por impacto e usa tom dinâmico", () => {
  const perguntas = gerarPerguntasPat({
    orientacao: "Social",
    perspectiva: "Alta",
    tendencias: {
      foco: 20,
      orientacao: 81,
      acao: 82,
      conexao: 12,
      suportePressao: 80,
    },
  });

  assert.equal(perguntas[0]?.id, "motivadores");
  assert.match(perguntas[0]?.texto ?? "", /conquista|impacto/i);
  assert.equal(perguntas[1]?.id, "objetivoCurtoPrazo");
  assert.ok(perguntas.every((pergunta) => pergunta.tom === "dinamico"));
});

test("orientação social declarada não vira técnica por foco alto", () => {
  const perguntas = gerarPerguntasPat({
    orientacao: "Social",
    tendencias: { foco: 90, acao: 80, conexao: 20 },
  });

  assert.equal(perguntas[0]?.id, "motivadores");
  assert.equal(perguntas[0]?.tom, "dinamico");
  assert.match(perguntas[0]?.texto ?? "", /conquista|impacto/i);
});

test("perfil técnico e analítico prioriza resultado, indicador e esforço", () => {
  const perguntas = gerarPerguntasPat({
    orientacao: "Técnico",
    tendencias: {
      foco: 90,
      orientacao: 8,
      acao: 70,
      conexao: 20,
      suportePressao: 75,
    },
    ambiente: {
      orientacoes: ["Usar dados e evidências objetivas"],
    },
  });

  assert.deepEqual(perguntas.slice(0, 3).map((pergunta) => pergunta.id), [
    "objetivoCurtoPrazo",
    "evidenciasProgresso",
    "esforcosNecessarios",
  ]);
  assert.match(perguntas[0]?.texto ?? "", /mensurável/i);
  assert.ok(perguntas.every((pergunta) => pergunta.tom === "direto"));
});

test("perfil cuidadoso e ponderado usa apoio antes de cobrança e baixa pressão", () => {
  const perguntas = gerarPerguntasPat({
    orientacao: "Social",
    perspectiva: "Baixa",
    tendencias: {
      orientacao: 75,
      acao: 10,
      conexao: 92,
      regras: 80,
      suportePressao: 15,
    },
    ambiente: {
      orientacoes: ["Dar clareza, apoio e permitir ritmo próprio"],
    },
    estrutural: {
      suporteEstrutural: 20,
      suporteNivel: "Muito Baixo",
      perspectivaValor: -7,
    },
  });

  assert.deepEqual(perguntas.slice(0, 4).map((pergunta) => pergunta.id), [
    "motivadores",
    "apoioEsperado",
    "desmotivadores",
    "preocupacoes",
  ]);
  assert.match(perguntas[1]?.texto ?? "", /sem gerar pressão/i);
  assert.ok(perguntas.every((pergunta) => pergunta.tom === "acolhedor"));
  assert.equal(perguntas.some((pergunta) => /urgente|compar/i.test(pergunta.texto)), false);
});

test("PAT incompleto degrada para o mesmo fallback neutro de PAT ausente", () => {
  const incompleto = gerarPerguntasPat({});
  assert.deepEqual(incompleto, gerarPerguntasPat(null));
  assert.deepEqual(incompleto, gerarPerguntasPat(undefined));
  assert.equal(incompleto[0]?.texto, "O que mais dá energia e sentido ao seu trabalho hoje?");
  assert.ok(incompleto.every((pergunta) => pergunta.tom === "neutro"));
});

test("todo resultado tem exatamente os oito IDs estáveis, únicos e completos", () => {
  const cenarios: Array<PatParaQuestionario | null> = [
    null,
    { orientacao: "Social", tendencias: { conexao: 5, acao: 90 } },
    { orientacao: "Técnico", tendencias: { foco: 90 } },
    { perspectiva: "Baixa", tendencias: { conexao: 90, acao: 10 } },
  ];

  for (const cenario of cenarios) {
    const resultado = ids(cenario);
    assert.equal(resultado.length, 8);
    assert.equal(new Set(resultado).size, 8);
    assert.deepEqual([...resultado].sort(), [...PERGUNTA_PAT_IDS].sort());
  }
});

test("a mesma entrada sempre produz o mesmo snapshot e não é alterada", () => {
  const pat: PatParaQuestionario = {
    orientacao: "Social",
    tendencias: { orientacao: 80, conexao: 10, acao: 90 },
    ambiente: { recomendacoes: ["Conversar sobre impacto"] },
  };
  const antes = structuredClone(pat);

  assert.deepEqual(gerarPerguntasPat(pat), gerarPerguntasPat(pat));
  assert.deepEqual(pat, antes);
});
