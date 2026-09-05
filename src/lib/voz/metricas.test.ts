import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularRitmo, extrairAnalogias, ranquearAnalogias, extrairAberturas,
  lexicoCaracteristico, usoDeJargao, frasesAssinatura, trechosPorProduto,
  contarPadroesGenericos, separarFrases, normalizarPalavras,
} from "./metricas";

test("separarFrases e normalizarPalavras ignoram placeholders", () => {
  assert.equal(separarFrases("uma. duas! três?").length, 3);
  assert.deepEqual(normalizarPalavras("o [cliente] tinha [valor] guardado"), ["o", "tinha", "guardado"]);
});

test("ritmo mede frase curta e pergunta retórica", () => {
  const r = calcularRitmo(["Faz a conta comigo. Quanto sobra? Nada."]);
  assert.equal(r.frases, 3);
  assert.ok(r.pctPerguntas > 30);
  assert.ok(r.pctFrasesCurtas > 60);
});

test("ritmo detecta anáfora em frases consecutivas", () => {
  const r = calcularRitmo(["Você tem carro. Você tem casa. Você tem seguro?"]);
  assert.equal(r.anaforas[0]?.abertura, "voce tem");
  assert.equal(r.anaforas[0]?.ocorrencias, 2);
});

test("analogias saem com a frase literal e agrupam por tema", () => {
  const falas = [
    "seguro é como o cinto do carro, você não usa todo dia.",
    "isso é igual o cinto do carro na estrada.",
    "pensa numa casa sem alicerce.",
  ];
  const rank = ranquearAnalogias(extrairAnalogias(falas));
  assert.equal(rank[0]?.tema, "cinto");
  assert.equal(rank[0]?.ocorrencias, 2);
  assert.match(rank[0]!.exemplos[0]!, /cinto do carro/);
});

test("aberturas só contam a partir de 3 ocorrências", () => {
  const falas = ["olha só, é assim que funciona", "olha só, o ponto é outro", "olha só, faz comigo", "bom dia tudo bem"];
  const ab = extrairAberturas(falas);
  assert.ok(ab.some((a) => a.abertura === "olha so" && a.ocorrencias === 3));
  assert.ok(!ab.some((a) => a.abertura.startsWith("bom dia")));
});

test("léxico característico separa a palavra dele da palavra do assunto", () => {
  const eduardo = Array(8).fill("alicerce alicerce patrimonio");
  const interlocutores = Array(8).fill("patrimonio patrimonio duvida");
  const lex = lexicoCaracteristico({ eduardo, interlocutores }, 5);
  assert.equal(lex[0]?.termo, "alicerce");
  assert.ok(lex[0]!.score > 0);
});

test("usoDeJargao ordena do que ele menos usa", () => {
  const j = usoDeJargao({ eduardo: ["taxa taxa"], interlocutores: ["volatilidade"] });
  assert.equal(j[0]!.eduardo, 0);
  assert.ok(j.some((t) => t.termo === "volatilidade" && t.interlocutores === 1));
});

test("frase-assinatura exige 3 reuniões distintas, não 3 repetições numa só", () => {
  const frase = "no fim do dia o que importa e a familia";
  const tres = frasesAssinatura([
    { reuniaoId: "a", falas: [frase] },
    { reuniaoId: "b", falas: [frase] },
    { reuniaoId: "c", falas: [frase] },
  ]);
  assert.ok(tres.some((f) => f.frase.includes("no fim do dia")));

  const umaSo = frasesAssinatura([{ reuniaoId: "a", falas: [frase, frase, frase] }]);
  assert.equal(umaSo.length, 0);
});

test("frase-assinatura não repete a mesma frase em cinco tamanhos", () => {
  const frase = "a conta que ninguem faz e essa aqui oh";
  const r = frasesAssinatura([
    { reuniaoId: "a", falas: [frase] },
    { reuniaoId: "b", falas: [frase] },
    { reuniaoId: "c", falas: [frase] },
  ]);
  const contidas = r.filter((x) => r.some((y) => y !== x && y.frase.includes(x.frase) && y.reunioes === x.reunioes));
  assert.deepEqual(contidas, []);
});

test("trechosPorProduto traz a vizinhança, não só a frase", () => {
  const t = trechosPorProduto(["antes", "o seguro de vida entra aqui", "depois"], 1);
  assert.equal(t["seguro de vida"]!.length, 1);
  assert.match(t["seguro de vida"]![0]!, /antes ⏵ .* ⏵ depois/);
});

test("padrões genéricos contam zero num corpus limpo e pegam o alarmismo", () => {
  const limpo = contarPadroesGenericos(["olha, faz a conta comigo"]);
  assert.ok(limpo.every((p) => p.ocorrencias === 0));
  const sujo = contarPadroesGenericos(["é urgente, última chance, retorno garantido"]);
  assert.ok(sujo.find((p) => p.padrao === "alarmismo")!.ocorrencias > 0);
  assert.ok(sujo.find((p) => p.padrao === "promessa de retorno")!.ocorrencias > 0);
});
