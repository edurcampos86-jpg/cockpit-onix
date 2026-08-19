import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcRiceScore,
  calcRiceScoreV2,
  validarRice,
  RICE_CAMPOS,
} from "./rice";

/* ────────────────────────────────────────────────────────────────────────────
 * O GATE DA ENTREGA: a v2 não pode reordenar a fila.
 *
 * A promessa é "a fórmula nova divide todos por 100, o ranking preserva". Isso
 * só é verdade se a igualdade valer EXATAMENTE — inclusive no arredondamento,
 * que é onde ela quase se perdeu: arredondar a v2 a 2 casas colapsaria pares
 * que a v1 distingue, e empate onde havia ordem É reordenação.
 *
 * Não há banco neste ambiente, então a prova é sobre o DOMÍNIO do que o banco
 * pode conter, que é mais forte que uma amostra: `impact` é Int restrito a
 * 1|2|3 pela régua da IA, `confidence` inteiro, `effort` inteiro positivo,
 * `reach` inteiro não-negativo. O varredor abaixo cobre esse domínio inteiro
 * numa grade densa e confere as duas propriedades em cada ponto.
 * ──────────────────────────────────────────────────────────────────────────── */

const REACHES = [0, 1, 2, 3, 7, 12, 25, 40, 50, 99, 100, 150, 240, 500, 1000, 3333];
const IMPACTS = [1, 2, 3];
const CONFIDENCES = [1, 10, 25, 50, 60, 75, 80, 90, 100];
const EFFORTS = [1, 2, 3, 4, 5, 8, 13, 20, 40];

type Linha = { reach: number; impact: number; confidence: number; effort: number };

const DOMINIO: Linha[] = REACHES.flatMap((reach) =>
  IMPACTS.flatMap((impact) =>
    CONFIDENCES.flatMap((confidence) =>
      EFFORTS.map((effort) => ({ reach, impact, confidence, effort })),
    ),
  ),
);

const v1 = (l: Linha) => calcRiceScore(l.reach, l.impact, l.confidence, l.effort);
const v2 = (l: Linha) => calcRiceScoreV2(l.reach, l.impact, l.confidence, l.effort);

test("v2 é exatamente v1/100 em todo o domínio gravável", () => {
  // Comparado em espaço INTEIRO, não com `v1 / 100`. A divisão por 100 em ponto
  // flutuante introduz lixo de representação (16,67 / 100 = 0,16670000000000001)
  // que não é diferença de valor — é o binário não representando o decimal. Os
  // dois lados carregam a MESMA mantissa decimal, e é isso que precisa valer.
  for (const l of DOMINIO) {
    assert.equal(
      Math.round(v2(l)! * 10000),
      Math.round(v1(l)! * 100),
      `divergiu em R=${l.reach} I=${l.impact} C=${l.confidence} E=${l.effort}`,
    );
  }
});

test("v2 nunca cria empate onde a v1 distinguia", () => {
  for (let i = 0; i < DOMINIO.length; i++) {
    for (let j = i + 1; j < DOMINIO.length; j += 97) {
      const a = DOMINIO[i];
      const b = DOMINIO[j];
      if (v1(a) !== v1(b)) {
        assert.notEqual(v2(a), v2(b), "empate novo — o ranking mudaria");
      }
    }
  }
});

test("ordenar por v2 devolve a MESMA fila que ordenar por v1", () => {
  // Reproduz o comparador da tela: score desc, nulos por último.
  const porScore = (get: (l: Linha) => number | null) => (a: Linha, b: Linha) => {
    const sa = get(a);
    const sb = get(b);
    if (sa == null && sb == null) return 0;
    if (sa == null) return 1;
    if (sb == null) return -1;
    return sb - sa;
  };

  // Uma amostra grande do domínio, embaralhada de forma determinística para não
  // depender de Math.random (teste que varia de execução não prova nada).
  const amostra = DOMINIO.filter((_, i) => i % 7 === 0);
  const embaralhada = [...amostra].sort(
    (a, b) => ((a.reach * 31 + a.effort * 7) % 101) - ((b.reach * 31 + b.effort * 7) % 101),
  );

  const chave = (l: Linha) => `${l.reach}|${l.impact}|${l.confidence}|${l.effort}`;
  const filaV1 = [...embaralhada].sort(porScore(v1)).map(chave);
  const filaV2 = [...embaralhada].sort(porScore(v2)).map(chave);

  assert.deepEqual(filaV2, filaV1);
});

test("item sem RICE completo continua sem score nas duas réguas", () => {
  assert.equal(calcRiceScore(10, 2, null, 5), null);
  assert.equal(calcRiceScoreV2(10, 2, null, 5), null);
  assert.equal(calcRiceScoreV2(10, 2, 80, 0), null, "effort zero não divide");
  assert.equal(calcRiceScoreV2(null, null, null, null), null);
});

test("a v2 devolve grandeza legível — não o número inflado 100×", () => {
  // 40 pessoas/mês, impacto alto, boa evidência, 2 pessoa-semana.
  assert.equal(calcRiceScore(40, 2, 80, 2), 3200);
  assert.equal(calcRiceScoreV2(40, 2, 80, 2), 32);
});

/* ── Validação ──────────────────────────────────────────────────────────── */

test("confiança fora de 1–100 é recusada; dentro passa", () => {
  assert.equal(validarRice({ confidence: 0 }).length, 1);
  assert.equal(validarRice({ confidence: 101 }).length, 1);
  assert.equal(validarRice({ confidence: 1 }).length, 0);
  assert.equal(validarRice({ confidence: 100 }).length, 0);
});

test("esforço tem que ser maior que zero", () => {
  assert.equal(validarRice({ effort: 0 })[0]?.eixo, "effort");
  assert.equal(validarRice({ effort: -3 })[0]?.eixo, "effort");
  assert.equal(validarRice({ effort: 1 }).length, 0);
});

test("campo vazio não é erro — a fila aceita item sem RICE", () => {
  assert.deepEqual(validarRice({}), []);
  assert.deepEqual(
    validarRice({ reach: null, impact: null, confidence: null, effort: null }),
    [],
  );
});

test("impacto fracionário é recusado enquanto a coluna for inteira", () => {
  // 0,5 é justamente o valor que o texto de ajuda antigo ensinava a usar e que
  // o servidor truncava para 0 — o score do item sumia em silêncio.
  assert.equal(validarRice({ impact: 0.5 })[0]?.eixo, "impact");
  assert.equal(validarRice({ impact: 0 }).length, 1);
  assert.equal(validarRice({ impact: 4 }).length, 1);
  for (const p of RICE_CAMPOS.impact.presets) {
    assert.equal(validarRice({ impact: p.valor }).length, 0);
  }
});

test("validação restrita a um eixo não reprova por causa de outro", () => {
  // O caso real: linha legada com impact = 0 (o help antigo ensinava 0,5 e o
  // servidor truncava). Corrigir só o Alcance dela precisa passar — validar o
  // conjunto inteiro travaria a linha para sempre.
  const legada = { reach: 40, impact: 0, confidence: 80, effort: 2 };
  assert.equal(validarRice(legada).length, 1, "sem recorte, o impacto reprova");
  assert.deepEqual(validarRice(legada, ["reach"]), [], "editando o alcance, passa");
  assert.deepEqual(validarRice(legada, ["confidence"]), []);
  assert.equal(validarRice(legada, ["impact"]).length, 1, "editando o impacto, reprova");
});

test("o recorte não afrouxa o eixo editado", () => {
  assert.equal(validarRice({ confidence: 150 }, ["confidence"]).length, 1);
  assert.equal(validarRice({ effort: 0 }, ["effort"]).length, 1);
});
