/**
 * Motor de priorização RICE — FONTE ÚNICA, importada pela tela e pela API.
 *
 * Duas leituras do MESMO cálculo convivem aqui de propósito:
 *
 *   • `calcRiceScore`   — a régua histórica, `(R × I × C) / E`. É ela que está
 *     gravada na coluna `score` de toda linha já existente, e ela NÃO muda.
 *   • `calcRiceScoreV2` — a mesma conta com a confiança lida como percentual,
 *     `R × I × (C/100) / E`. Numericamente é a v1 dividida por 100.
 *
 * Dividir todo mundo pela mesma constante positiva NÃO reordena nada: a v2 é
 * uma transformação monótona da v1, então o ranking sobre os registros já em
 * banco é idêntico. O que muda é só a grandeza do número exibido — de "2400"
 * para "24" —, que é o ponto: com C em porcentagem, o score volta a significar
 * "alcance × impacto por unidade de esforço" em vez de um número inflado 100×.
 */

/**
 * O numerador cru, sem arredondar. Existe para que v1 e v2 percorram
 * EXATAMENTE o mesmo caminho de ponto flutuante — é isso que garante, bit a
 * bit, que `v2 === v1 / 100` para todo valor possível, e não "quase sempre".
 */
function riceBruto(
  reach?: number | null,
  impact?: number | null,
  confidence?: number | null,
  effort?: number | null,
): number | null {
  if (
    reach == null ||
    impact == null ||
    confidence == null ||
    effort == null ||
    effort <= 0
  ) {
    return null;
  }
  return (reach * impact * confidence) / effort;
}

/**
 * Score RICE = (reach × impact × confidence) / effort.
 * Calculado no app (não no banco). Retorna null se faltar campo ou effort <= 0.
 */
export function calcRiceScore(
  reach?: number | null,
  impact?: number | null,
  confidence?: number | null,
  effort?: number | null,
): number | null {
  const bruto = riceBruto(reach, impact, confidence, effort);
  if (bruto == null) return null;
  // arredonda a 2 casas para evitar ruído de ponto flutuante
  return Math.round(bruto * 100) / 100;
}

/**
 * Score RICE v2 = reach × impact × (confidence / 100) / effort.
 *
 * QUATRO casas, não duas, e isso é o detalhe que faz o ranking se preservar.
 * A v1 arredonda a 2 casas; a v2 vale 1/100 dela. Arredondar a v2 também a 2
 * casas colapsaria pares que a v1 distingue — 240,00 e 240,30 virariam ambos
 * 2,40 — e um empate onde antes havia ordem É mudança de ranking. Duas casas
 * a mais compensam exatamente o fator 100, e a igualdade
 * `calcRiceScoreV2(x) === calcRiceScore(x) / 100` passa a valer para todo x.
 */
export function calcRiceScoreV2(
  reach?: number | null,
  impact?: number | null,
  confidence?: number | null,
  effort?: number | null,
): number | null {
  const bruto = riceBruto(reach, impact, confidence, effort);
  if (bruto == null) return null;
  return Math.round(bruto * 100) / 10000;
}

// ── Unidades e escalas declaradas ───────────────────────────────────────────
//
// Vive aqui, e não no componente, porque três lugares precisam da MESMA régua:
// o cabeçalho da tabela (tooltip), os botões de preset e o texto de ajuda. Régua
// duplicada é régua que diverge — foi exatamente assim que o texto de ajuda
// passou a prometer uma escala fracionária que a coluna `impact` (Int) nunca
// aceitou.

export type RicePreset = { valor: number; rotulo: string };

export type RiceCampo = {
  sigla: "R" | "I" | "C" | "E";
  nome: string;
  /** A unidade, em português de quem usa a tela — não a do modelo de dados. */
  unidade: string;
  /** Uma linha explicando o que a pessoa deve estimar. */
  ajuda: string;
  /** Valores sugeridos, clicáveis. Vazio quando o campo é número livre. */
  presets: RicePreset[];
};

export type RiceEixo = "reach" | "impact" | "confidence" | "effort";

/**
 * Impacto em INTEIROS (1, 2, 3). A escala fracionária (0,25 / 0,5) exigiria
 * `impact` como decimal no banco; enquanto a coluna for `Int`, o servidor
 * trunca 0,5 para 0 e o score do item some sem aviso. Prometer aqui uma escala
 * que o armazenamento não sustenta é o que a tela fazia antes.
 */
export const RICE_CAMPOS: Record<RiceEixo, RiceCampo> = {
  reach: {
    sigla: "R",
    nome: "Alcance",
    unidade: "pessoas ou atendimentos impactados por mês",
    ajuda: "Quantas pessoas (ou atendimentos) isso atinge em um mês.",
    presets: [],
  },
  impact: {
    sigla: "I",
    nome: "Impacto",
    unidade: "degraus inteiros: 1 médio, 2 alto, 3 massivo",
    ajuda: "A força do efeito em cada pessoa atingida.",
    presets: [
      { valor: 1, rotulo: "médio" },
      { valor: 2, rotulo: "alto" },
      { valor: 3, rotulo: "massivo" },
    ],
  },
  confidence: {
    sigla: "C",
    nome: "Confiança",
    unidade: "% de certeza na estimativa (1 a 100)",
    ajuda: "O quanto você confia nos números acima.",
    presets: [
      { valor: 50, rotulo: "chute" },
      { valor: 80, rotulo: "boa evidência" },
      { valor: 100, rotulo: "certeza" },
    ],
  },
  effort: {
    sigla: "E",
    nome: "Esforço",
    unidade: "pessoa-semana",
    ajuda: "Quantas semanas de UMA pessoa isso custa.",
    presets: [],
  },
};

export const RICE_EIXOS: RiceEixo[] = ["reach", "impact", "confidence", "effort"];

// ── Validação (mesma régua no cliente e no servidor) ────────────────────────

export type ErroRice = { eixo: RiceEixo; mensagem: string };

/**
 * Confere os limites que tornam o score interpretável. Roda no cliente (para
 * avisar antes de gravar) e no servidor (porque o cliente não é autoridade).
 *
 * Campo VAZIO não é erro: a fila aceita item sem RICE completo de propósito —
 * ele fica sem score e cai no recorte "sem RICE". Só valida o que foi digitado.
 */
export function validarRice(vals: {
  reach?: number | null;
  impact?: number | null;
  confidence?: number | null;
  effort?: number | null;
}): ErroRice[] {
  const erros: ErroRice[] = [];

  if (vals.confidence != null) {
    if (!Number.isFinite(vals.confidence) || vals.confidence < 1 || vals.confidence > 100) {
      erros.push({
        eixo: "confidence",
        mensagem: "Confiança vai de 1 a 100 (é uma porcentagem).",
      });
    }
  }

  if (vals.effort != null) {
    if (!Number.isFinite(vals.effort) || vals.effort <= 0) {
      erros.push({
        eixo: "effort",
        mensagem: "Esforço tem que ser maior que zero (em pessoa-semana).",
      });
    }
  }

  if (vals.reach != null && (!Number.isFinite(vals.reach) || vals.reach < 0)) {
    erros.push({ eixo: "reach", mensagem: "Alcance não pode ser negativo." });
  }

  if (vals.impact != null && !RICE_CAMPOS.impact.presets.some((p) => p.valor === vals.impact)) {
    erros.push({
      eixo: "impact",
      mensagem: "Impacto aceita 1 (médio), 2 (alto) ou 3 (massivo).",
    });
  }

  return erros;
}
