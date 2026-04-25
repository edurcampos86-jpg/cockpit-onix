/**
 * Algoritmos de insights do time — funções puras (sem IO).
 *
 * Usadas em:
 *  - Página /time/insights (visões agregadas)
 *  - Compatibilidade na ficha individual
 *  - Banner de alertas
 */

/* ──────────────────────────────────────────────────────────────────────────
   COMPATIBILIDADE VIA TENDÊNCIAS DO PAT
   ────────────────────────────────────────────────────────────────────────── */

export type TendenciasPat = {
  foco: number | null;
  orientacao: number | null;
  acao: number | null;
  conexao: number | null;
  relacionamento: number | null;
  regras: number | null;
  suportePressao: number | null;
};

const TENDENCIA_KEYS: (keyof TendenciasPat)[] = [
  "foco",
  "orientacao",
  "acao",
  "conexao",
  "relacionamento",
  "regras",
  "suportePressao",
];

/**
 * Calcula similaridade e complementaridade entre duas tendências PAT.
 *
 * - similaridade: 100 = idênticos; 0 = polos opostos (ambas em 0% e 100%)
 * - complementaridade: 100 = polos opostos (perfeito complemento); 0 = idênticos
 *
 * Ambos são derivados da mesma distância normalizada — mesmo número, lados opostos.
 */
export function calcCompatibilidade(
  a: TendenciasPat | null,
  b: TendenciasPat | null,
): { similaridade: number; complementaridade: number; cobertura: number } | null {
  if (!a || !b) return null;

  let somaDist = 0;
  let count = 0;
  for (const k of TENDENCIA_KEYS) {
    const va = a[k];
    const vb = b[k];
    if (va !== null && vb !== null && va !== undefined && vb !== undefined) {
      somaDist += Math.abs(va - vb);
      count++;
    }
  }
  if (count === 0) return null;

  const distMedia = somaDist / count; // 0..100
  const similaridade = Math.round(100 - distMedia);
  const complementaridade = Math.round(distMedia);
  const cobertura = Math.round((count / TENDENCIA_KEYS.length) * 100);

  return { similaridade, complementaridade, cobertura };
}

/**
 * Para uma pessoa-base, retorna os top N matches por modo entre uma lista de candidatos.
 */
export type MatchCandidato = {
  pessoaId: string;
  nome: string;
  apelido: string | null;
  fotoUrl: string | null;
  cargoFamilia: string;
  tendencias: TendenciasPat | null;
};

export type MatchResult = MatchCandidato & {
  score: number; // 0..100
  cobertura: number;
};

export function topMatches(
  base: TendenciasPat | null,
  candidatos: MatchCandidato[],
  modo: "similaridade" | "complementaridade",
  n: number = 3,
): MatchResult[] {
  if (!base) return [];
  const scored: MatchResult[] = [];
  for (const c of candidatos) {
    if (!c.tendencias) continue;
    const r = calcCompatibilidade(base, c.tendencias);
    if (!r) continue;
    const score = modo === "similaridade" ? r.similaridade : r.complementaridade;
    scored.push({ ...c, score, cobertura: r.cobertura });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n);
}

/* ──────────────────────────────────────────────────────────────────────────
   ALERTAS ATIVOS POR PESSOA
   ────────────────────────────────────────────────────────────────────────── */

export type Alerta = {
  tipo: "perspectiva_baixa" | "pat_vencido" | "sem_pat" | "aniversario_proximo" | "ano_pessoal_desatualizado";
  severidade: "alta" | "media" | "baixa" | "info";
  titulo: string;
  detalhe: string;
};

export type PessoaParaAlerta = {
  dataNascimento: Date | null;
  nomeCompleto: string;
};

export type PatParaAlerta = {
  perspectiva: string | null; // "Baixa" | "Média" | "Alta"
  dataPat: Date;
} | null;

export type NumerologiaParaAlerta = {
  anoPessoalRef: number;
} | null;

/**
 * Calcula alertas ativos para uma pessoa.
 *
 * @param hoje  data de referência (default = new Date())
 * @param patMaisRecente  PAT mais recente da pessoa, ou null
 * @param numerologia  numerologia atual da pessoa, ou null
 */
export function alertasAtivos({
  pessoa,
  patMaisRecente,
  numerologia,
  hoje = new Date(),
}: {
  pessoa: PessoaParaAlerta;
  patMaisRecente: PatParaAlerta;
  numerologia: NumerologiaParaAlerta;
  hoje?: Date;
}): Alerta[] {
  const alertas: Alerta[] = [];

  // Perspectiva Baixa no PAT mais recente
  if (patMaisRecente?.perspectiva === "Baixa") {
    alertas.push({
      tipo: "perspectiva_baixa",
      severidade: "alta",
      titulo: "Perspectiva Baixa no PAT atual",
      detalhe:
        "Indicador situacional: incerteza em relação a objetivos/projetos. Momento delicado — atenção em interações e cobranças.",
    });
  }

  // PAT vencido (>12 meses) ou sem PAT
  if (!patMaisRecente) {
    alertas.push({
      tipo: "sem_pat",
      severidade: "media",
      titulo: "Sem PAT registrado",
      detalhe: "Considere aplicar o PAT da Criativa Humana para mapear perfil.",
    });
  } else {
    const mesesDesdePat =
      (hoje.getTime() - new Date(patMaisRecente.dataPat).getTime()) /
      (1000 * 60 * 60 * 24 * 30.44);
    if (mesesDesdePat > 18) {
      alertas.push({
        tipo: "pat_vencido",
        severidade: "media",
        titulo: `PAT desatualizado (${Math.round(mesesDesdePat)} meses)`,
        detalhe:
          "PAT é situacional — recomenda-se reaplicar a cada 12-18 meses para acompanhar evolução.",
      });
    }
  }

  // Ano Pessoal desatualizado (numerologia)
  if (numerologia) {
    const anoAtual = hoje.getUTCFullYear();
    if (numerologia.anoPessoalRef !== anoAtual) {
      alertas.push({
        tipo: "ano_pessoal_desatualizado",
        severidade: "info",
        titulo: `Ano Pessoal está em ${numerologia.anoPessoalRef}`,
        detalhe: `Recalcular para refletir ${anoAtual}.`,
      });
    }
  }

  // Aniversário próximo (<= 14 dias)
  if (pessoa.dataNascimento) {
    const nasc = new Date(pessoa.dataNascimento);
    const proximoAniv = new Date(
      hoje.getUTCFullYear(),
      nasc.getUTCMonth(),
      nasc.getUTCDate(),
    );
    if (proximoAniv < hoje) {
      proximoAniv.setUTCFullYear(proximoAniv.getUTCFullYear() + 1);
    }
    const diasParaAniv =
      (proximoAniv.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
    if (diasParaAniv <= 14 && diasParaAniv >= 0) {
      const dias = Math.round(diasParaAniv);
      alertas.push({
        tipo: "aniversario_proximo",
        severidade: "info",
        titulo:
          dias === 0
            ? "🎂 Aniversário hoje!"
            : `🎂 Aniversário em ${dias} dia${dias === 1 ? "" : "s"}`,
        detalhe: `Faz aniversário em ${proximoAniv.toLocaleDateString("pt-BR")}.`,
      });
    }
  }

  return alertas;
}

/* ──────────────────────────────────────────────────────────────────────────
   AGREGADOS — funções que recebem listas e produzem totais/distribuições
   ────────────────────────────────────────────────────────────────────────── */

export type DistribuicaoItem = { label: string; valor: number };

export function distribuicaoPor<T>(
  items: T[],
  keyFn: (it: T) => string | null | undefined,
): DistribuicaoItem[] {
  const mapa = new Map<string, number>();
  for (const it of items) {
    const k = keyFn(it);
    if (k) mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  const result: DistribuicaoItem[] = [];
  for (const [label, valor] of mapa) result.push({ label, valor });
  result.sort((a, b) => b.valor - a.valor);
  return result;
}

/**
 * Constrói matriz Filial × Departamento com contagens.
 */
export function matrizFilialDepartamento(
  pessoas: Array<{ filialId: string; departamentoId: string }>,
  filiais: Array<{ id: string; nome: string }>,
  departamentos: Array<{ id: string; nome: string }>,
): {
  matriz: Array<{ filial: { id: string; nome: string }; cells: Array<{ depto: { id: string; nome: string }; count: number }> }>;
  totalPorFilial: Record<string, number>;
  totalPorDepto: Record<string, number>;
} {
  const totalPorFilial: Record<string, number> = {};
  const totalPorDepto: Record<string, number> = {};
  for (const p of pessoas) {
    totalPorFilial[p.filialId] = (totalPorFilial[p.filialId] ?? 0) + 1;
    totalPorDepto[p.departamentoId] = (totalPorDepto[p.departamentoId] ?? 0) + 1;
  }

  const matriz = filiais.map((f) => ({
    filial: { id: f.id, nome: f.nome },
    cells: departamentos.map((d) => ({
      depto: { id: d.id, nome: d.nome },
      count: pessoas.filter(
        (p) => p.filialId === f.id && p.departamentoId === d.id,
      ).length,
    })),
  }));

  return { matriz, totalPorFilial, totalPorDepto };
}
