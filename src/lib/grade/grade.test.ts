import { test } from "node:test";
import assert from "node:assert/strict";
import { PECAS, pecaDe, pecaAncora, ROTULOS } from "./pecas";
import {
  GRADE,
  PECAS_POR_SEMANA,
  categoriasDaSemana,
  diaDaPeca,
  pecaDoDia,
  pecasForaDaGrade,
} from "./semanal";
import {
  REGIME_PADRAO,
  ocupaSlotDaGrade,
  regimeDoPost,
  somenteQueOcupamSlot,
} from "./regime";
import { montarEsteira } from "./esteira";
import {
  CATEGORY_CTA_MAP,
  CATEGORY_DAYS,
  DAY_CATEGORY_MAP,
  DAY_FORMAT_MAP,
} from "@/lib/types";

// ── As derivações batem com o que estava escrito à mão ──────────────────
//
// Mesma técnica da PR 1: os valores ANTIGOS, copiados literalmente de
// `lib/types.ts` antes desta refatoração, confrontados com o que a grade
// agora deriva. É o que prova que a semana renderizada não mudou.

test("CATEGORY_DAYS deriva exatamente o mapa antigo", () => {
  assert.deepEqual({ ...CATEGORY_DAYS }, {
    pergunta_semana: 1,
    onix_pratica: 2,
    patrimonio_mimimi: 3,
    alerta_patrimonial: 4,
    sabado_bastidores: 6,
  });
});

test("DAY_CATEGORY_MAP deriva exatamente o mapa antigo", () => {
  assert.deepEqual({ ...DAY_CATEGORY_MAP }, {
    1: "pergunta_semana",
    2: "onix_pratica",
    3: "patrimonio_mimimi",
    4: "alerta_patrimonial",
    6: "sabado_bastidores",
  });
});

test("DAY_FORMAT_MAP deriva exatamente o mapa antigo", () => {
  assert.deepEqual({ ...DAY_FORMAT_MAP }, {
    1: "story",
    2: "reel",
    3: "carrossel",
    4: "carrossel",
    6: "reel",
  });
});

test("CATEGORY_CTA_MAP deriva exatamente o mapa antigo", () => {
  assert.deepEqual({ ...CATEGORY_CTA_MAP }, {
    pergunta_semana: "implicito",
    onix_pratica: "explicito",
    patrimonio_mimimi: "algoritmo",
    alerta_patrimonial: "algoritmo",
    sabado_bastidores: "identificacao",
  });
});

test("os dois sentidos da grade são consistentes entre si", () => {
  // Antes eram duas listas mantidas à mão, uma o inverso da outra. Este é o
  // teste que não existia e que teria pego a divergência.
  for (const [categoria, dia] of Object.entries(CATEGORY_DAYS)) {
    assert.equal(DAY_CATEGORY_MAP[dia], categoria, `dia ${dia}`);
  }
});

// ── Peças ───────────────────────────────────────────────────────────────

test("existe exatamente UMA peça âncora", () => {
  // Duas âncoras tornariam a regra de bloqueio (PR 5) ambígua.
  assert.equal(PECAS.filter((p) => p.ancora).length, 1);
  assert.equal(pecaAncora().categoria, "patrimonio_mimimi");
});

test("cada peça tem um rótulo narrativo distinto, e todos são usados", () => {
  const usados = PECAS.map((p) => p.rotulo);
  assert.equal(new Set(usados).size, PECAS.length, "rótulos repetidos");
  assert.deepEqual([...usados].sort(), [...ROTULOS].sort(), "arco incompleto");
});

test("a peça âncora é a que responde — hoje", () => {
  // Âncora e rótulo são campos separados de propósito, mas hoje coincidem.
  // Se um dia divergirem, que seja por decisão e não por descuido.
  assert.equal(pecaAncora().rotulo, "resposta");
});

test("formato e CTA pendem da peça, não do dia", () => {
  const pergunta = pecaDe("pergunta_semana")!;
  assert.equal(pergunta.formato, "story");
  assert.equal(pergunta.cta, "implicito");
});

// ── Grade ───────────────────────────────────────────────────────────────

test("a grade vigente ainda é a v4 — esta PR não muda a semana", () => {
  assert.deepEqual(categoriasDaSemana(), [
    "pergunta_semana",
    "onix_pratica",
    "patrimonio_mimimi",
    "alerta_patrimonial",
    "sabado_bastidores",
  ]);
  assert.equal(PECAS_POR_SEMANA, 5);
});

test("pecaDoDia e diaDaPeca são inversos", () => {
  for (const posicao of GRADE) {
    assert.equal(pecaDoDia(posicao.dia)!.categoria, posicao.categoria);
    assert.equal(diaDaPeca(posicao.categoria), posicao.dia);
  }
});

test("dia sem posição não publica — sexta e domingo, na v4", () => {
  assert.equal(pecaDoDia(5), undefined, "sexta");
  assert.equal(pecaDoDia(0), undefined, "domingo");
});

test("na v4 nenhuma peça fica fora da grade", () => {
  assert.deepEqual(pecasForaDaGrade(), []);
});

// ── Regime ──────────────────────────────────────────────────────────────

test("sem o campo, o post é planejado — o comportamento de hoje", () => {
  // A coluna só existe depois da PR de migration. Até lá tudo vem undefined,
  // e nada pode mudar de comportamento por causa disso.
  assert.equal(regimeDoPost({}), REGIME_PADRAO);
  assert.equal(regimeDoPost({ regime: null }), "planejado");
  assert.equal(regimeDoPost({ regime: "" }), "planejado");
  assert.equal(regimeDoPost({ regime: "valor_estranho" }), "planejado");
});

test("valor desconhecido no banco não derruba a tela", () => {
  assert.doesNotThrow(() => regimeDoPost({ regime: "🙂" }));
  assert.equal(ocupaSlotDaGrade({ regime: "🙂" }), true);
});

test("só planejado ocupa slot", () => {
  assert.equal(ocupaSlotDaGrade({ regime: "planejado" }), true);
  assert.equal(ocupaSlotDaGrade({ regime: "oportunista" }), false);
});

test("oportunista não fecha o slot da peça planejada", () => {
  // O caso concreto: um Patrimônio oportunista na quarta não pode fazer a
  // semana parecer completa nem calar o alerta que cobra a peça de sexta.
  const posts = [
    { category: "patrimonio_mimimi", regime: "oportunista" },
    { category: "pergunta_semana", regime: "planejado" },
  ];
  const contam = somenteQueOcupamSlot(posts);
  assert.deepEqual(contam.map((p) => p.category), ["pergunta_semana"]);
});

test("sem regime, tudo continua contando — nada muda hoje", () => {
  const posts = [{ category: "patrimonio_mimimi" }, { category: "onix_pratica" }];
  assert.equal(somenteQueOcupamSlot(posts).length, 2);
});

// ── Piso de data na esteira ─────────────────────────────────────────────

test("sem piso, a esteira é idêntica à de antes", () => {
  const pub = new Date(2026, 2, 6);
  const semPiso = montarEsteira({ tituloDoPost: "X", publicacaoEm: pub });
  assert.deepEqual(semPiso.map((p) => p.dueDate.getDate()), [3, 4, 5, 6]);
});

test("piso: publicação amanhã comprime as três etapas para hoje", () => {
  const hoje = new Date(2026, 2, 5);
  const amanha = new Date(2026, 2, 6);
  const passos = montarEsteira({
    tituloDoPost: "Notícia de última hora",
    publicacaoEm: amanha,
    pisoEm: hoje,
  });
  assert.deepEqual(passos.map((p) => p.dueDate.getDate()), [5, 5, 5, 6]);
});

test("piso: publicação hoje põe tudo hoje, e nada vence no passado", () => {
  const hoje = new Date(2026, 2, 6);
  const passos = montarEsteira({
    tituloDoPost: "Agora",
    publicacaoEm: hoje,
    pisoEm: hoje,
  });
  assert.deepEqual(passos.map((p) => p.dueDate.getDate()), [6, 6, 6, 6]);
  for (const p of passos) {
    assert.ok(p.dueDate.getTime() >= hoje.getTime(), p.type);
  }
});

test("piso: a ordem das etapas nunca inverte", () => {
  const hoje = new Date(2026, 2, 5);
  for (let offset = 0; offset <= 7; offset++) {
    const pub = new Date(2026, 2, 5 + offset);
    const passos = montarEsteira({ tituloDoPost: "X", publicacaoEm: pub, pisoEm: hoje });
    const datas = passos.map((p) => p.dueDate.getTime());
    for (let i = 1; i < datas.length; i++) {
      assert.ok(datas[i]! >= datas[i - 1]!, `offset ${offset}, etapa ${i}`);
    }
  }
});

test("piso: planejar no domingo para terça também não gera tarefa vencida", () => {
  // O caso dele: peça PLANEJADA criada em cima da hora. O piso vale nos dois
  // regimes — é por isso que ele não é característica de regime.
  const domingo = new Date(2026, 2, 1);
  const terca = new Date(2026, 2, 3);
  const passos = montarEsteira({ tituloDoPost: "Peça da grade", publicacaoEm: terca, pisoEm: domingo });
  for (const p of passos) {
    assert.ok(p.dueDate.getTime() >= domingo.getTime(), p.type);
  }
  assert.equal(passos[0]!.dueDate.getDate(), 1, "roteiro sobe para o domingo");
});

test("piso não altera a data recebida como piso", () => {
  const piso = new Date(2026, 2, 5);
  const copia = new Date(piso);
  montarEsteira({ tituloDoPost: "X", publicacaoEm: new Date(2026, 2, 6), pisoEm: piso });
  assert.equal(piso.getTime(), copia.getTime());
});
