/**
 * Semeadura idempotente da tabela `Empresa` — fonte única.
 *
 * Compartilhado por `scripts/seed-empresas.ts` (terminal, semeia as 8) e por
 * `POST /api/empresas/hierarquia` (navegador, semeia SÓ a raiz). A mecânica de
 * idempotência e a lista canônica moram aqui; os dois consumidores só escolhem
 * QUAIS empresas passar e como reportar o resultado.
 *
 * ── POR QUE É IDEMPOTENTE POR CONSTRUÇÃO ─────────────────────────────────
 * `createMany({ skipDuplicates: true })`: linha cuja PK já existe é ignorada e
 * NENHUMA linha existente é reescrita. Rodar dez vezes não duplica nem
 * sobrescreve — se alguém renomeou "Onix Imob" na mão, o nome dele sobrevive.
 * Um `upsert` faria o contrário: devolveria o nome ao valor deste arquivo,
 * apagando a edição em silêncio.
 *
 * ── A ÚNICA ESCRITA É UM CREATE CONDICIONAL ──────────────────────────────
 * Não há UPDATE nem DELETE aqui, e não pode haver. Em particular NÃO existe
 * reparenting: ninguém passa a apontar para a raiz por este módulo. Mexer em
 * `parentId` de linha existente é PR própria, com conferência antes.
 *
 * ── POR QUE O CLIENT VEM POR PARÂMETRO ───────────────────────────────────
 * Nada aqui importa `@/lib/prisma` estaticamente. O script precisa checar
 * DATABASE_URL ANTES de o cliente ser construído (src/lib/prisma.ts:10 usa
 * `process.env.DATABASE_URL!` no import), e um import estático nosso quebraria
 * esse guard. A rota passa o singleton normal. Mesmo padrão de
 * `src/lib/backoffice/recon-identidade.ts`.
 */
import type { PrismaClient } from "@/generated/prisma/client";

/** O contrato mínimo usado aqui: contar, listar e criar pulando duplicata. */
export type ClienteEmpresa = Pick<PrismaClient, "empresa">;

export type EmpresaSemente = { id: string; nome: string };

/**
 * A raiz do grupo. `onix-co` é o único id que NÃO vem de
 * `src/lib/empresas-config.ts`: a empresa-mãe não é aba de navegação, então
 * nunca precisou existir lá.
 */
export const ONIX_CO: EmpresaSemente = { id: "onix-co", nome: "Onix Co" };

/**
 * As 7 empresas do grupo. Os ids são os slugs de `empresas-config.ts` — não
 * invente nomes novos aqui. Eles casam por VALOR com `Implementacao.empresaId`,
 * que já tem linhas gravadas em produção; divergir criaria empresa órfã no dia
 * em que a FK entrar.
 */
export const EMPRESAS_DO_GRUPO: EmpresaSemente[] = [
  { id: "investimentos", nome: "Onix Capital" },
  { id: "corretora", nome: "Onix Corretora" },
  { id: "planejamento", nome: "Planejamento Patrimonial" },
  { id: "imobiliaria", nome: "Onix Imob" },
  { id: "corporate", nome: "Onix Corporate" },
  { id: "tech", nome: "Onix Tech" },
  { id: "educacao", nome: "Onix Educação" },
];

/** Raiz + as 7 — o que o script de terminal semeia. */
export const TODAS_AS_EMPRESAS: EmpresaSemente[] = [ONIX_CO, ...EMPRESAS_DO_GRUPO];

/** Um nó da árvore, como sai para quem consome. */
export type NoArvore = {
  id: string;
  nome: string;
  parentId: string | null;
};

export type ResultadoSemeadura = {
  /** "criado" = ao menos uma linha nova; "ja_existia" = nada foi inserido. */
  resultado: "criado" | "ja_existia";
  totalAntes: number;
  inseridas: number;
  totalDepois: number;
  /** Ids que foram efetivamente pedidos nesta chamada. */
  solicitadas: string[];
  arvore: NoArvore[];
  /** Empresas com pai. Esperado 0 até a PR de reparenting. */
  comPai: number;
};

/** Árvore inteira, ordenada — raízes primeiro, depois por id. */
export async function lerArvore(db: ClienteEmpresa): Promise<NoArvore[]> {
  return db.empresa.findMany({
    select: { id: true, nome: true, parentId: true },
    orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { id: "asc" }],
  });
}

/** Total de linhas em `Empresa`. */
export async function contarEmpresas(db: ClienteEmpresa): Promise<number> {
  return db.empresa.count();
}

/**
 * Semeia as empresas informadas, pulando as que já existem.
 *
 * `resultado` é "criado" quando ao menos uma linha nova entrou e "ja_existia"
 * quando nenhuma entrou — é a distinção que o chamador precisa para saber se a
 * chamada teve efeito, sem ter de comparar contagens.
 */
export async function semearEmpresas(
  db: ClienteEmpresa,
  empresas: readonly EmpresaSemente[],
): Promise<ResultadoSemeadura> {
  const totalAntes = await db.empresa.count();

  // ÚNICA escrita do módulo. skipDuplicates torna a chamada idempotente sem
  // precisar de leitura-antes-de-escrever (que teria corrida entre o SELECT e
  // o INSERT se duas chamadas chegassem juntas).
  const { count } = await db.empresa.createMany({
    data: empresas.map((e) => ({ id: e.id, nome: e.nome })),
    skipDuplicates: true,
  });

  const totalDepois = await db.empresa.count();
  const comPai = await db.empresa.count({ where: { parentId: { not: null } } });

  return {
    resultado: count > 0 ? "criado" : "ja_existia",
    totalAntes,
    inseridas: count,
    totalDepois,
    solicitadas: empresas.map((e) => e.id),
    arvore: await lerArvore(db),
    comPai,
  };
}

/**
 * Semeia SÓ a raiz "Onix Co". É o que o endpoint expõe.
 *
 * Deliberadamente não aceita parâmetro: a rota não deve poder criar as demais
 * empresas nem escolher a lista. Quem quiser semear o grupo inteiro usa o
 * script, onde a conferência é humana.
 */
export async function semearRaiz(db: ClienteEmpresa): Promise<ResultadoSemeadura> {
  return semearEmpresas(db, [ONIX_CO]);
}

/**
 * A raiz existe e é de fato raiz?
 *
 * `parentId` não-nulo na raiz é estado ruim que nenhum código deste módulo
 * produz — só chegaria por SQL manual — e por isso é reportado em vez de
 * corrigido: consertar em silêncio esconderia como aconteceu.
 */
export function conferirRaiz(arvore: readonly NoArvore[]): {
  existe: boolean;
  ehRaiz: boolean;
  parentIdInesperado: string | null;
} {
  const raiz = arvore.find((e) => e.id === ONIX_CO.id);
  if (!raiz) return { existe: false, ehRaiz: false, parentIdInesperado: null };
  return {
    existe: true,
    ehRaiz: raiz.parentId === null,
    parentIdInesperado: raiz.parentId,
  };
}
