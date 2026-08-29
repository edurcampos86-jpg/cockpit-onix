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

/* ── POR QUE O MÊS ESTÁ VAZIO ─────────────────────────────────────────────
 *
 * A série já marca o buraco. Ela não diz o MOTIVO — e quem abre a tela em
 * janeiro e vê dezembro vazio não sabe se o BTG não mandou ou se a
 * sincronização caiu. É linha em branco no extrato: o susto não é o valor, é
 * não saber o que houve.
 *
 * O `BtgSyncLog` responde, e o cruzamento é o que transforma "sem dado" em uma
 * frase. Três casos, e eles preveem coisas diferentes:
 *
 *   sincronização NUNCA rodou no mês  → falha de agendamento; ninguém tentou
 *   rodou e FALHOU                    → erro a investigar, com data
 *   rodou, teve SUCESSO, e mesmo assim
 *   não há comissão                   → o BTG não trouxe comissão naquele mês.
 *                                       É fato do negócio, não falha nossa
 *
 * O terceiro é o mais importante e o menos óbvio: sem ele, todo mês vazio
 * pareceria defeito, e o time perderia tempo caçando um erro que não existe.
 */

export interface ExecucaoSync {
  /** Competência `"AAAA-MM"` em que a execução começou. */
  competencia: string;
  sucesso: boolean;
}

export type MotivoVazio =
  | { tipo: "nunca_rodou" }
  | { tipo: "rodou_e_falhou"; tentativas: number }
  | { tipo: "rodou_sem_comissao"; execucoes: number }
  | { tipo: "mes_futuro" };

/**
 * Por que este mês não tem comissão? Função PURA — recebe as execuções já
 * lidas e a competência de hoje, e não olha o relógio.
 *
 * `mes_futuro` vem primeiro porque é o caso que não é falha de nada: a janela
 * de 12 meses termina no mês corrente, mas se alguém olhar a série no dia 1º,
 * o mês ainda mal começou. Chamar isso de "nunca rodou" seria alarme falso.
 */
export function motivoDoMesVazio(
  competencia: string,
  execucoes: readonly ExecucaoSync[],
  hoje: string,
): MotivoVazio {
  if (competencia > hoje) return { tipo: "mes_futuro" };

  const doMes = execucoes.filter((e) => e.competencia === competencia);
  if (doMes.length === 0) return { tipo: "nunca_rodou" };

  const comSucesso = doMes.filter((e) => e.sucesso);
  if (comSucesso.length === 0) {
    return { tipo: "rodou_e_falhou", tentativas: doMes.length };
  }
  return { tipo: "rodou_sem_comissao", execucoes: comSucesso.length };
}

/** A frase que a tela mostra na linha do mês. Curta: cabe numa célula. */
export function fraseDoMotivo(motivo: MotivoVazio): string {
  switch (motivo.tipo) {
    case "mes_futuro":
      return "mês ainda em curso";
    case "nunca_rodou":
      return "sincronização não rodou";
    case "rodou_e_falhou":
      return motivo.tentativas === 1
        ? "sincronização falhou"
        : `sincronização falhou ${motivo.tentativas}×`;
    case "rodou_sem_comissao":
      return "sincronizou, sem comissão";
  }
}

/**
 * Há quantos dias foi a última coleta bem-sucedida?
 *
 * `null` = nunca houve. E `null` NÃO é "hoje" nem "muito tempo": é ausência de
 * resposta, a mesma distinção que o resto deste módulo carrega.
 *
 * `agora` é ARGUMENTO pela razão de sempre — função que lê o relógio não se
 * testa duas vezes com o mesmo resultado.
 */
export function diasDesde(ultima: Date | null, agora: Date): number | null {
  if (ultima === null) return null;
  const ms = agora.getTime() - ultima.getTime();
  /* Piso, não arredondamento: uma coleta de 30 horas atrás é "1 dia", não 1
   * dia arredondado para 1. E negativo (relógio do banco à frente) vira 0 em
   * vez de "-1 dia", que ninguém sabe ler. */
  return Math.max(0, Math.floor(ms / 86_400_000));
}
