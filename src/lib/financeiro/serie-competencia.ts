/**
 * A série mensal de receita, com os buracos VISÍVEIS.
 *
 * Módulo puro: recebe as linhas já lidas do banco e devolve o que a tela
 * desenha. Sem Prisma, sem `now()` implícito — é o que permite conferir a
 * conta à mão, que é o critério que o Eduardo pediu.
 *
 * ── A DECISÃO QUE ESTE ARQUIVO EXISTE PARA CARIMBAR ──────────────────────
 * Mês SEM linha e mês com valor ZERO são coisas diferentes, e a tela precisa
 * distingui-las.
 *
 *   sem linha  → a sincronização do BTG não rodou, ou rodou e não trouxe
 *                aquele mês. É uma falha de coleta.
 *   zero       → rodou, trouxe, e a comissão daquele mês foi zero. É um fato
 *                do negócio.
 *
 * Tratar os dois como "R$ 0" desenha um gráfico que despenca e some — e o
 * despencar seria mentira. Este projeto já pagou por essa confusão duas vezes:
 * `NULL ? 'chave'` devolvendo NULL em Postgres fez uma medição perder 5
 * clientes em silêncio, e o `contagem-tabelas.ts` carrega um comentário
 * inteiro sobre por que `?? 0` é proibido lá.
 *
 * Por isso `MesDaSerie.presente` é um campo, e não uma inferência de `valor`.
 */

export interface LinhaCompetencia {
  /** `"AAAA-MM"`. */
  competencia: string;
  /** Soma da competência, em reais. */
  valor: number;
  /** Quantos clientes contribuíram. */
  clientes: number;
}

export interface MesDaSerie {
  competencia: string;
  /** Havia linha para este mês? `false` = não coletado, NÃO "zero". */
  presente: boolean;
  valor: number;
  clientes: number;
  /** Variação sobre o mês anterior, em fração (0,15 = +15%).
   *  `null` quando não há base de comparação — primeiro mês da janela, ou
   *  mês anterior ausente/zero. Dividir por zero devolveria `Infinity`, e
   *  "+∞%" na tela é pior que um traço. */
  variacao: number | null;
}

export interface Serie {
  meses: MesDaSerie[];
  /** Soma dos meses PRESENTES na janela. Ausentes não somam zero: não somam. */
  total: number;
  /** Quantos meses da janela têm dado. */
  mesesComDado: number;
  /** A competência mais recente COM dado, ou `null` se a janela está vazia. */
  ultimaComDado: string | null;
}

/** Soma 1 mês a `"AAAA-MM"`, sem passar por `Date` — competência é rótulo. */
export function proximaCompetencia(c: string): string {
  const [ano, mes] = c.split("-").map(Number);
  return mes === 12
    ? `${ano + 1}-01`
    : `${ano}-${String(mes + 1).padStart(2, "0")}`;
}

/** Subtrai `n` meses de `"AAAA-MM"`. */
export function competenciaMenos(c: string, n: number): string {
  const [ano, mes] = c.split("-").map(Number);
  const total = ano * 12 + (mes - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/**
 * Monta a janela de `quantidade` meses terminando em `ate` (inclusive),
 * marcando cada mês como presente ou ausente.
 *
 * `ate` é ARGUMENTO e não `new Date()`: uma função que lê o relógio não se
 * testa duas vezes com o mesmo resultado.
 */
export function montarSerie(
  linhas: readonly LinhaCompetencia[],
  ate: string,
  quantidade: number,
): Serie {
  const porMes = new Map(linhas.map((l) => [l.competencia, l]));

  const meses: MesDaSerie[] = [];
  let anterior: LinhaCompetencia | undefined;

  for (let i = quantidade - 1; i >= 0; i--) {
    const competencia = competenciaMenos(ate, i);
    const achada = porMes.get(competencia);

    /* Variação só existe quando os DOIS lados existem e o anterior não é
     * zero. Sem essa guarda, um mês depois de um zero devolveria Infinity. */
    const variacao =
      achada && anterior && anterior.valor !== 0
        ? (achada.valor - anterior.valor) / anterior.valor
        : null;

    meses.push({
      competencia,
      presente: achada !== undefined,
      valor: achada?.valor ?? 0,
      clientes: achada?.clientes ?? 0,
      variacao,
    });

    /* O mês ausente NÃO vira base de comparação para o seguinte: comparar com
     * um zero que ninguém mediu inventaria uma alta de 100%. */
    anterior = achada;
  }

  const presentes = meses.filter((m) => m.presente);

  return {
    meses,
    total: presentes.reduce((s, m) => s + m.valor, 0),
    mesesComDado: presentes.length,
    ultimaComDado: presentes.length === 0 ? null : presentes[presentes.length - 1].competencia,
  };
}
