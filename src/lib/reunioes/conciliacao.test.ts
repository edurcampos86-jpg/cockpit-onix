import assert from "node:assert/strict";
import { test } from "node:test";
import {
  estadoDaConciliacao,
  deveExporMesaConciliacao,
  lerLimiteConciliacao,
  montarMetricasConciliacao,
  ordenarConciliacao,
  payloadTemCamposSensiveis,
  type PlaudConciliacaoItem,
  type PlaudConciliacaoPayload,
} from "./conciliacao";

test("flag OFF mantém a mesa ausente", () => {
  assert.equal(deveExporMesaConciliacao(false), false);
  assert.equal(deveExporMesaConciliacao(true), true);
});

test("limite aceita apenas inteiro entre 1 e 100", () => {
  assert.equal(lerLimiteConciliacao(null), 50);
  assert.equal(lerLimiteConciliacao("1"), 1);
  assert.equal(lerLimiteConciliacao("100"), 100);
  for (const invalido of ["0", "101", "-1", "1.5", "abc", " 10 "]) {
    assert.equal(lerLimiteConciliacao(invalido), null, invalido);
  }
});

test("match nominal nunca vira confirmação", () => {
  assert.equal(
    estadoDaConciliacao(
      { tipo: "casou", clienteId: "c1", nome: "Ana", participante: "Ana" },
      true,
    ),
    "cliente_sugerido",
  );
  assert.equal(
    estadoDaConciliacao({ tipo: "ambiguo", participante: "Ana", clienteIds: ["1", "2"] }, true),
    "ambiguo",
  );
  assert.equal(estadoDaConciliacao({ tipo: "nenhum" }, true), "sem_cliente");
  assert.equal(estadoDaConciliacao({ tipo: "nenhum" }, false), "sem_transcricao");
});

function item(id: string, estado: PlaudConciliacaoItem["estado"]): PlaudConciliacaoItem {
  return {
    id,
    titulo: id,
    data: "2026-09-01T10:00:00.000Z",
    duracaoMin: 30,
    participantes: [],
    vendedor: null,
    recebidoEm: "2026-09-01T10:05:00.000Z",
    temTranscricao: estado !== "sem_transcricao",
    estado,
    clienteSugerido: null,
    clienteAmbiguo: null,
    podeAbrirPreview: false,
    previewUrl: null,
  };
}

test("exceções vêm antes de sugestões nominais", () => {
  const ids = ordenarConciliacao([
    item("sugerida", "cliente_sugerido"),
    item("sem-cliente", "sem_cliente"),
    item("ambigua", "ambiguo"),
    item("sem-transcricao", "sem_transcricao"),
  ]).map((i) => i.id);
  assert.deepEqual(ids, ["sem-transcricao", "ambigua", "sem-cliente", "sugerida"]);
});

test("métricas não observáveis continuam explicitamente nulas", () => {
  const metricas = montarMetricasConciliacao([
    item("a", "cliente_sugerido"),
    item("b", "sem_cliente"),
  ]);
  assert.equal(metricas.recebidasNestaLista, 2);
  assert.equal(metricas.comSugestaoNominalNestaLista, 1);
  assert.equal(metricas.excecoesNestaLista, 1);
  assert.equal(metricas.ultimoSincronismo, null);
  assert.equal(metricas.importadasNaFicha, null);
  assert.equal(metricas.aguardandoRevisao, null);
  assert.equal(metricas.falhas, null);
});

test("DTO não serializa texto sensível ou campos paralelos", () => {
  const payload: PlaudConciliacaoPayload = {
    items: [item("a", "sem_cliente")],
    metricas: montarMetricasConciliacao([item("a", "sem_cliente")]),
    janela: { limite: 50, truncada: false, descricao: "50 gravações visíveis" },
  };
  assert.equal(payloadTemCamposSensiveis(payload), false);
});
