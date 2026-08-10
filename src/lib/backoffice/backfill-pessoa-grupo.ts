/**
 * Backfill de `PessoaGrupo` a partir de `ClienteBackoffice.cpfCnpj` — fonte única.
 *
 * Cria uma `PessoaGrupo` por documento normalizado distinto e liga cada
 * `ClienteBackoffice` à sua. Consumido por
 * `POST /api/backoffice/pessoa-grupo/backfill` e pelo ensaio de shadow-DB
 * (`scripts/ensaio-backfill-pessoa-grupo.ts`).
 *
 * ── A RÉGUA NÃO MORA AQUI ────────────────────────────────────────────────
 * Quem decide o que é documento e quando dois registros são a mesma pessoa é
 * `src/lib/empresas/pessoa-grupo.ts` (#292), e este módulo só a consome. É de
 * propósito: a régua foi escrita ANTES do backfill exatamente para que o
 * UPDATE em massa não a inventasse no meio do caminho.
 *
 *   - une SÓ por `cpfCnpj` normalizado idêntico
 *   - CPF ↔ CNPJ nunca une (sócio e empresa são titulares distintos)
 *   - e-mail e telefone nunca unem (`contatoUneSozinho()` devolve false)
 *
 * ── PLANEJAR É PURO; APLICAR É A ÚNICA ESCRITA ───────────────────────────
 * Mesma separação de `empresas/reparent.ts` e `empresas/seed-hierarquia.ts`,
 * pelo mesmo motivo: o dry-run não é "o aplicar com um if no fim", é
 * literalmente a função de planejamento com a escrita nunca chamada. Num
 * backfill de faixa VERMELHA isso é o que torna o ensaio confiável.
 *
 * ── O QUE ESTE MÓDULO NÃO FAZ ────────────────────────────────────────────
 * Não escreve NENHUM campo de `ClienteBackoffice` além de `pessoaGrupoId`.
 * Não apaga nada, em lugar nenhum. Não desfaz vínculo existente: cliente que
 * já aponta para uma PessoaGrupo é deixado como está — inclusive quando
 * aponta para a "errada", caso em que a divergência é REPORTADA e não
 * corrigida (mesma postura de `seed-filhas`: conserto em silêncio apaga a
 * evidência de como o estado ruim entrou).
 *
 * ── NENHUM DADO PESSOAL SAI DAQUI PARA A RESPOSTA ────────────────────────
 * O plano carrega documentos e ids porque precisa deles para escrever. O que
 * a rota devolve é `resumirPlano()`, que produz SÓ contagens — nem cpfCnpj,
 * nem id de cliente, nem nome. É a mesma regra de
 * `api/backoffice/recon-identidade`, e aqui ela é mais importante ainda: a
 * amostra de agrupamentos é justamente onde seria tentador vazar documento
 * "só para conferir".
 */
import {
  classificarTipo,
  normalizarDocumento,
  type TipoDocumento,
} from "@/lib/empresas/pessoa-grupo";

/** O mínimo que o backfill precisa saber sobre um cliente. */
export type LinhaCliente = {
  id: string;
  cpfCnpj: string | null;
  /** Vínculo atual. Não-nulo = já ligado; este módulo não o reescreve. */
  pessoaGrupoId: string | null;
};

/** Um documento distinto e as contas que pertencem a ele. */
export type GrupoDocumento = {
  /** Documento canônico (só dígitos). NUNCA sai para a resposta HTTP. */
  documento: string;
  tipo: TipoDocumento;
  /** Ids das contas com este documento. Ordenados para o lote ser estável. */
  clienteIds: string[];
};

export type PlanoBackfill = {
  /** Um por documento distinto, ordenado por documento. */
  grupos: GrupoDocumento[];
  /**
   * Contas cujo `cpfCnpj` não é documento reconhecível — nulo, vazio, ou com
   * contagem de dígitos fora de 11/14.
   *
   * Ficam com `pessoaGrupoId = null` e ISSO NÃO É ERRO: é a ausência de
   * documento sendo preservada em vez de inventada. Agrupá-las sob uma chave
   * vazia faria de todo cadastro incompleto "a mesma pessoa".
   */
  semDocumento: string[];
  totalLinhas: number;
};

/**
 * Agrupa as contas por documento normalizado. PURO — não toca em banco.
 *
 * A ordenação (documento asc, e ids asc dentro do grupo) não é estética: ela
 * é o que torna a divisão em lotes DETERMINÍSTICA. Um backfill interrompido
 * no lote 7 tem de recomeçar exatamente onde parou, e isso só vale se a
 * ordem for a mesma nas duas execuções.
 */
export function planejarBackfill(linhas: readonly LinhaCliente[]): PlanoBackfill {
  const porDocumento = new Map<string, string[]>();
  const semDocumento: string[] = [];

  for (const linha of linhas) {
    const doc = normalizarDocumento(linha.cpfCnpj);
    if (doc === null) {
      semDocumento.push(linha.id);
      continue;
    }
    const atual = porDocumento.get(doc);
    if (atual) atual.push(linha.id);
    else porDocumento.set(doc, [linha.id]);
  }

  const grupos: GrupoDocumento[] = [...porDocumento.entries()]
    .map(([documento, clienteIds]) => ({
      documento,
      tipo: classificarTipo(documento) as TipoDocumento,
      clienteIds: [...clienteIds].sort(),
    }))
    .sort((a, b) => (a.documento < b.documento ? -1 : a.documento > b.documento ? 1 : 0));

  return { grupos, semDocumento: [...semDocumento].sort(), totalLinhas: linhas.length };
}

/* ──────────────────────────────────────────────────────────────────────────
 * O que fazer com cada grupo, dado o que já existe no banco
 * ────────────────────────────────────────────────────────────────────── */

export type AcaoGrupo = {
  documento: string;
  tipo: TipoDocumento;
  /** A PessoaGrupo precisa nascer? `false` = já existe (reexecução). */
  criarPessoa: boolean;
  /** Contas que ainda não têm vínculo e vão receber este `pessoaGrupoId`. */
  ligar: string[];
  /** Contas já ligadas a ESTA PessoaGrupo. Nada a fazer. */
  jaLigadas: string[];
  /**
   * Contas ligadas a OUTRA PessoaGrupo.
   *
   * Estado que nenhum caminho deste módulo produz — só chegaria por escrita
   * manual ou por documento editado depois do backfill. É reportado, nunca
   * corrigido: religar aqui seria um UPDATE silencioso em produção
   * disfarçado de "backfill idempotente".
   */
  divergentes: string[];
};

export type PlanoEscrita = {
  acoes: AcaoGrupo[];
  pessoasACriar: number;
  linksAGravar: number;
  jaLigadas: number;
  divergentes: number;
  semLink: number;
};

/**
 * Cruza o plano com o estado atual do banco. PURO — recebe o estado, não o lê.
 *
 * `pessoasExistentes` é documento → `PessoaGrupo.id` do que já está gravado.
 * Na primeira execução vem vazio; na segunda vem completo, e é isso que faz
 * `pessoasACriar` e `linksAGravar` zerarem — a idempotência é uma
 * CONSEQUÊNCIA desta função, não um `if` no aplicador.
 */
export function planejarEscrita(
  plano: PlanoBackfill,
  linhas: readonly LinhaCliente[],
  pessoasExistentes: ReadonlyMap<string, string>,
): PlanoEscrita {
  const vinculoAtual = new Map(linhas.map((l) => [l.id, l.pessoaGrupoId]));
  const acoes: AcaoGrupo[] = [];

  for (const grupo of plano.grupos) {
    const pessoaId = pessoasExistentes.get(grupo.documento) ?? null;
    const ligar: string[] = [];
    const jaLigadas: string[] = [];
    const divergentes: string[] = [];

    for (const clienteId of grupo.clienteIds) {
      const atual = vinculoAtual.get(clienteId) ?? null;
      if (atual === null) ligar.push(clienteId);
      else if (pessoaId !== null && atual === pessoaId) jaLigadas.push(clienteId);
      else divergentes.push(clienteId);
    }

    acoes.push({
      documento: grupo.documento,
      tipo: grupo.tipo,
      criarPessoa: pessoaId === null,
      ligar,
      jaLigadas,
      divergentes,
    });
  }

  return {
    acoes,
    pessoasACriar: acoes.filter((a) => a.criarPessoa).length,
    linksAGravar: acoes.reduce((n, a) => n + a.ligar.length, 0),
    jaLigadas: acoes.reduce((n, a) => n + a.jaLigadas.length, 0),
    divergentes: acoes.reduce((n, a) => n + a.divergentes.length, 0),
    semLink: plano.semDocumento.length,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Resumo PII-free — o que a rota tem permissão de devolver
 * ────────────────────────────────────────────────────────────────────── */

/** Um agrupamento descrito SEM o documento: só o tipo e quantas contas tem. */
export type AmostraAgrupamento = { tipo: TipoDocumento; contas: number };

export type ResumoBackfill = {
  totalLinhas: number;
  documentosDistintos: number;
  pessoasACriar: number;
  linksAGravar: number;
  jaLigadas: number;
  divergentes: number;
  /** Contas que ficam com `pessoaGrupoId = null`. Não é erro. */
  semLink: number;
  porTipo: { CPF: number; CNPJ: number };
  duplicatas: {
    /** Documentos que aparecem em 2+ contas. */
    documentos: number;
    /** Total de contas envolvidas nesses documentos. */
    linhas: number;
    /** Maior agrupamento encontrado, em número de contas. */
    maiorAgrupamento: number;
  };
  /**
   * Até 5 agrupamentos duplicados, do maior para o menor — SÓ contagens.
   *
   * Sem documento, sem id, sem nome. A amostra existe para dimensionar a
   * conferência manual ("tem grupo de 7 contas?"), não para identificar
   * ninguém; documento aqui seria dado pessoal numa resposta de API, que é
   * colável em ticket, chat e print.
   */
  amostraDuplicatas: AmostraAgrupamento[];
};

/** Quantas amostras a resposta carrega. Pedido explícito: 5. */
export const TAMANHO_DA_AMOSTRA = 5;

/**
 * Traduz plano + escrita no payload da resposta, removendo todo dado pessoal.
 *
 * É a ÚNICA função cujo retorno atravessa o HTTP. Manter a conversão num
 * lugar só é o que permite auditar "a rota vaza documento?" lendo um tipo, em
 * vez de conferindo cada `NextResponse.json` da rota.
 */
export function resumirPlano(plano: PlanoBackfill, escrita: PlanoEscrita): ResumoBackfill {
  const duplicados = plano.grupos.filter((g) => g.clienteIds.length > 1);

  return {
    totalLinhas: plano.totalLinhas,
    documentosDistintos: plano.grupos.length,
    pessoasACriar: escrita.pessoasACriar,
    linksAGravar: escrita.linksAGravar,
    jaLigadas: escrita.jaLigadas,
    divergentes: escrita.divergentes,
    semLink: escrita.semLink,
    porTipo: {
      CPF: plano.grupos.filter((g) => g.tipo === "CPF").length,
      CNPJ: plano.grupos.filter((g) => g.tipo === "CNPJ").length,
    },
    duplicatas: {
      documentos: duplicados.length,
      linhas: duplicados.reduce((n, g) => n + g.clienteIds.length, 0),
      maiorAgrupamento: duplicados.reduce((n, g) => Math.max(n, g.clienteIds.length), 0),
    },
    amostraDuplicatas: [...duplicados]
      .sort((a, b) => b.clienteIds.length - a.clienteIds.length)
      .slice(0, TAMANHO_DA_AMOSTRA)
      .map((g) => ({ tipo: g.tipo, contas: g.clienteIds.length })),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Lotes
 * ────────────────────────────────────────────────────────────────────── */

/** Tamanho do lote pedido: 200 documentos por transação. */
export const TAMANHO_DO_LOTE = 200;

/**
 * Divide as ações em lotes de tamanho fixo.
 *
 * O corte é por DOCUMENTO, não por conta: as contas de um mesmo documento têm
 * de entrar na mesma transação da PessoaGrupo delas, senão uma interrupção no
 * meio deixaria pessoa criada com parte das contas ligadas — estado válido
 * para o banco e confuso para quem lê. Um lote de 200 documentos pode
 * portanto tocar mais de 200 contas, e isso é intencional.
 *
 * Ações sem nada a fazer (reexecução) são MANTIDAS no lote em vez de
 * filtradas: é o que faz a segunda execução percorrer os mesmos lotes na
 * mesma ordem, e o log de progresso ficar comparável entre as duas.
 */
export function dividirEmLotes<T>(itens: readonly T[], tamanho = TAMANHO_DO_LOTE): T[][] {
  if (tamanho < 1) throw new Error("O tamanho do lote precisa ser >= 1.");
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    lotes.push(itens.slice(i, i + tamanho));
  }
  return lotes;
}

/** Contadores de um lote aplicado — o que vai para o log de progresso. */
export type ResultadoLote = {
  lote: number;
  totalLotes: number;
  pessoasCriadas: number;
  linksGravados: number;
  jaLigadas: number;
  divergentes: number;
};

/** Soma dos lotes, no formato do resumo. */
export function somarLotes(resultados: readonly ResultadoLote[]): {
  pessoasCriadas: number;
  linksGravados: number;
  jaLigadas: number;
  divergentes: number;
} {
  return {
    pessoasCriadas: resultados.reduce((n, r) => n + r.pessoasCriadas, 0),
    linksGravados: resultados.reduce((n, r) => n + r.linksGravados, 0),
    jaLigadas: resultados.reduce((n, r) => n + r.jaLigadas, 0),
    divergentes: resultados.reduce((n, r) => n + r.divergentes, 0),
  };
}
