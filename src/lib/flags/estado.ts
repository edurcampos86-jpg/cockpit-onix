import "server-only";
import { prisma } from "@/lib/prisma";
import { envUtilizavel } from "@/lib/config-db";
import {
  CHAVES_REGISTRADAS,
  FLAGS_REGISTRADAS,
  flagLigada,
  type DialetoBooleano,
  type ImpactoFlag,
  type TipoFlag,
} from "@/lib/flags/registro";

/**
 * Estado das flags do Config DB — o lado que toca banco.
 *
 * Uma query só para TODAS as flags (`where key IN (...)`), não uma por flag:
 * são 18 chaves e este código roda em endpoint de diagnóstico, que não pode
 * custar 18 idas ao Postgres.
 *
 * A query é escopada pela allowlist do registro — nunca `findMany()` sem
 * `where`. A tabela `Config` guarda segredos na mesma estrutura, e uma varredura
 * aberta os traria junto.
 */

/** De onde saiu o valor efetivo — mesma precedência do `getConfig`. */
export type OrigemValor = "db" | "env" | "ausente";

export type EstadoFlag = {
  key: string;
  rotulo: string;
  onde: string;
  tipo: TipoFlag;
  origem: OrigemValor;
  /** Valor cru, como está gravado. Só flags da allowlist chegam aqui. */
  valor: string | null;
  /** Só para `tipo: "booleana"`. */
  ligada: boolean | null;
  /** `Config.updatedAt` quando a origem é o banco. */
  atualizadoEm: string | null;
  /** Só para `booleana` — a tela usa para decidir se pede confirmação. */
  impacto: ImpactoFlag | null;
  /** Só quando `impacto: "alto"` — texto do diálogo de confirmação. */
  aviso: string | null;
  /** Só para `booleana` — a tela mostra quais valores aquela flag aceita. */
  dialeto: DialetoBooleano | null;
  /**
   * Email de quem fez a última mudança REGISTRADA (`ConfigAudit`).
   *
   * `null` com `atualizadoEm` preenchido não é falha: significa que a chave foi
   * mudada FORA da tela — direto no banco, ou antes desta auditoria existir.
   * A tela mostra essa diferença em vez de esconder.
   */
  ultimoAutor: string | null;
};

/** Uma linha do histórico de mudanças. */
export type MudancaFlag = {
  key: string;
  de: string | null;
  para: string;
  quemEmail: string | null;
  /** ISO — serializável para o componente client. */
  quando: string;
};

/**
 * A mudança mais recente de CADA flag, em uma query.
 *
 * `distinct: ["key"]` com `orderBy [key, quando desc]` vira `DISTINCT ON` no
 * Postgres. O ganho aqui é o banco devolver 18 linhas em vez de o app trazer o
 * histórico inteiro para reduzir em memória — isso sim cresceria sem teto.
 *
 * MEDIDO (Postgres 16, 20k linhas semeadas em 16 chaves): o planner escolhe
 * Seq Scan + Sort, NÃO o índice `(key, quando DESC)` — com pouquíssimas chaves
 * distintas para muitas linhas, varrer sai mais barato que passear pelo índice.
 * Custa 18ms nesse volume, e o volume real é ordens de grandeza menor (a tabela
 * só cresce quando alguém vira uma flag na mão). O índice composto segue
 * valendo para a consulta por UMA chave, não para esta.
 */
async function ultimaMudancaPorFlag(): Promise<Map<string, MudancaFlag>> {
  const linhas = await prisma.configAudit.findMany({
    where: { key: { in: [...CHAVES_REGISTRADAS] } },
    orderBy: [{ key: "asc" }, { quando: "desc" }],
    distinct: ["key"],
    select: { key: true, de: true, para: true, quemEmail: true, quando: true },
  });
  return new Map(
    linhas.map((l) => [l.key, { ...l, quando: l.quando.toISOString() }]),
  );
}

/**
 * As `limite` mudanças mais recentes, de qualquer flag — o painel do topo.
 * Usa o índice `(quando DESC)`. Escopado à allowlist como todo o resto.
 */
export async function ultimasMudancas(limite = 5): Promise<MudancaFlag[]> {
  const linhas = await prisma.configAudit.findMany({
    where: { key: { in: [...CHAVES_REGISTRADAS] } },
    orderBy: { quando: "desc" },
    take: limite,
    select: { key: true, de: true, para: true, quemEmail: true, quando: true },
  });
  return linhas.map((l) => ({ ...l, quando: l.quando.toISOString() }));
}

/** Estado de todas as flags registradas, na ordem do registro. */
export async function resolverEstadoDasFlags(): Promise<EstadoFlag[]> {
  const [linhas, autores] = await Promise.all([
    prisma.config.findMany({
      where: { key: { in: [...CHAVES_REGISTRADAS] } },
      select: { key: true, value: true, updatedAt: true },
    }),
    ultimaMudancaPorFlag(),
  ]);
  const porChave = new Map(linhas.map((l) => [l.key, l]));

  return FLAGS_REGISTRADAS.map((flag) => {
    const linha = porChave.get(flag.key);
    // Mesma precedência do getConfig: banco primeiro, env depois. O banco só
    // ganha com valor NÃO vazio — `if (row?.value)` lá, `linha?.value` aqui.
    const doBanco = linha?.value ? linha.value : undefined;
    const doEnv = envUtilizavel(process.env[flag.key]) ? process.env[flag.key] : undefined;

    const valor = doBanco ?? doEnv ?? null;
    const origem: OrigemValor = doBanco ? "db" : doEnv ? "env" : "ausente";

    return {
      key: flag.key,
      rotulo: flag.rotulo,
      onde: flag.onde,
      tipo: flag.tipo,
      origem,
      valor,
      ligada: flag.tipo === "booleana" ? flagLigada(valor ?? undefined, flag.dialeto) : null,
      atualizadoEm: origem === "db" ? (linha?.updatedAt.toISOString() ?? null) : null,
      impacto: flag.impacto ?? null,
      aviso: flag.aviso ?? null,
      dialeto: flag.dialeto ?? null,
      ultimoAutor: autores.get(flag.key)?.quemEmail ?? null,
    };
  });
}

/**
 * Só as chaves booleanas LIGADAS, ordenadas — a forma compacta que o
 * `/api/health` publica para o smoke pós-deploy comparar.
 *
 * Ordenado de propósito: a comparação do workflow é textual, e a ordem do
 * registro mudaria a string sem nada ter mudado no ambiente.
 */
export async function chavesLigadas(): Promise<string[]> {
  const flags = await resolverEstadoDasFlags();
  return flags
    .filter((f) => f.ligada === true)
    .map((f) => f.key)
    .sort();
}
