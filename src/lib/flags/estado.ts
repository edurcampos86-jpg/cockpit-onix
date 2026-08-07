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
};

/** Estado de todas as flags registradas, na ordem do registro. */
export async function resolverEstadoDasFlags(): Promise<EstadoFlag[]> {
  const linhas = await prisma.config.findMany({
    where: { key: { in: [...CHAVES_REGISTRADAS] } },
    select: { key: true, value: true, updatedAt: true },
  });
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
