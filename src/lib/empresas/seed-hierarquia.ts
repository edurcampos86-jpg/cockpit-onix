/**
 * Semeadura idempotente da tabela `Empresa` — fonte única.
 *
 * Compartilhado por `scripts/seed-empresas.ts` (terminal, semeia raiz + as 5) e
 * por `POST /api/empresas/hierarquia` (navegador: `acao` omitida semeia SÓ a
 * raiz; `acao: "seed-filhas"` semeia as 5 já penduradas). A mecânica de
 * idempotência e a lista canônica moram aqui; os consumidores só escolhem
 * QUAIS empresas passar e como reportar o resultado.
 *
 * ── AS FILHAS NASCEM PENDURADAS ──────────────────────────────────────────
 * Até a PR-B4 o seed criava TODA empresa como raiz solta e o reparenting as
 * pendurava depois — duas etapas, e uma janela entre elas em que a árvore
 * ficava plana. Agora `parentId` faz parte da SEMENTE: quem nasce filha nasce
 * com pai. O reparenting não some por isso; ele deixa de ser etapa obrigatória
 * do bootstrap e passa a ser o que sempre deveria ter sido — FERRAMENTA DE
 * REPARO, para o dia em que uma linha aparecer com o pai errado.
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
 * reparenting: linha que JÁ EXISTE nunca tem o `parentId` mexido por este
 * módulo, nem quando ele está errado. Filha encontrada com outro pai é
 * reportada como DIVERGÊNCIA e deixada intacta — corrigir em silêncio
 * apagaria a evidência de como o estado ruim entrou, e o conserto tem
 * ferramenta própria (`reparent.ts`), com dry-run e autoria.
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

export type EmpresaSemente = {
  id: string;
  nome: string;
  /**
   * Pai com que a linha NASCE. `null` = raiz.
   *
   * Só vale na criação. Semente cujo id já existe é ignorada inteira (ver
   * `skipDuplicates` acima), então este campo NUNCA reescreve o pai de uma
   * linha existente — nem para "consertar".
   */
  parentId: string | null;
};

/* ── A LISTA VEM DO CATÁLOGO, NÃO DAQUI ──────────────────────────────────
 *
 * As três constantes abaixo eram literais neste arquivo. Passaram a derivar de
 * `lib/empresas/catalogo.ts`, que é a declaração única de quem existe no grupo
 * e de ONDE cada empresa aparece (`cadastrada` para o cadastro, `noHub` para a
 * tela inicial).
 *
 * O motivo é o histórico do repositório, não preferência: a mesma lista já
 * esteve escrita em três lugares que não se conheciam e os três divergiam —
 * `agro` e `contabil` orbitavam o hub sem nunca terem sido semeadas,
 * `planejamento` era semeada sem aparecer no hub. Este arquivo teria sido o
 * quarto. Um literal só é fonte de verdade enquanto é o ÚNICO; a partir do
 * segundo, é cópia.
 *
 * Os três símbolos e os consumidores são os mesmos; `catalogo.test.ts` trava os
 * ids contra o catálogo. O formato ganhou `parentId` na PR-B4 (ver o topo
 * deste arquivo) — a semente passou a carregar com quem a linha nasce.
 *
 * Ninguém depende da ORDEM da lista: `semearEmpresas` separa raízes de filhas
 * antes de escrever, `lerArvore` ordena no SQL, e o script imprime contagens.
 * O CONJUNTO é o que o teste trava.
 *
 * O import é seguro como estático: `catalogo.ts` é PURO (sem prisma, sem
 * `server-only`), então ele não reintroduz o problema que o guard de
 * DATABASE_URL do script existe para evitar. */
import { CATALOGO_EMPRESAS, RAIZ_DO_GRUPO, empresasCadastradas } from "@/lib/empresas/catalogo";

const doCatalogo = (id: string, parentId: string | null): EmpresaSemente => {
  const e = CATALOGO_EMPRESAS.find((x) => x.id === id);
  if (!e) throw new Error(`"${id}" não está em lib/empresas/catalogo.ts`);
  return { id: e.id, nome: e.nome, parentId };
};

/**
 * A raiz do grupo. `onix-co` é o único id que NÃO vem de
 * `src/lib/empresas-config.ts`: a empresa-mãe não é aba de navegação, então
 * nunca precisou existir lá.
 */
export const ONIX_CO: EmpresaSemente = doCatalogo(RAIZ_DO_GRUPO, null);

/**
 * As 5 empresas jurídicas do grupo, cada uma já com `parentId = "onix-co"` —
 * as `cadastrada: true` do catálogo menos a raiz.
 *
 * Quem está e quem NÃO está (Agro, Planejamento, Contábil, Meu Sucesso
 * Patrimonial, Barreiras/Unaí) é decisão do Eduardo, escrita por extenso no
 * topo de `catalogo.ts`. Aqui não se decide nada: esta lista é derivação.
 *
 * Os ids são os slugs de `empresas-config.ts` e casam por VALOR com
 * `Implementacao.empresaId`, que já tem linhas gravadas em produção; divergir
 * criaria empresa órfã no dia em que a FK entrar. É por isso que a lista é
 * derivada e não redigitada.
 */
export const EMPRESAS_DO_GRUPO: EmpresaSemente[] = empresasCadastradas()
  .filter((e) => e.id !== RAIZ_DO_GRUPO)
  .map((e) => ({ id: e.id, nome: e.nome, parentId: RAIZ_DO_GRUPO }));

/** Raiz + as 5 — o que o script de terminal semeia. Total esperado: 6 linhas. */
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
  //
  // DOIS createMany, não um: `Empresa.parentId` é FK auto-referente, e uma
  // filha só pode entrar depois de o pai existir. Postgres verifica RI em
  // AFTER ROW trigger no fim do statement, então um INSERT único com a raiz na
  // primeira posição até funcionaria — mas isso é detalhe de implementação do
  // banco, invisível para quem lê, e uma reordenação inocente da lista
  // quebraria em produção. Separar torna a ordem uma propriedade do código.
  const raizes = empresas.filter((e) => e.parentId === null);
  const filhas = empresas.filter((e) => e.parentId !== null);

  let count = 0;
  for (const lote of [raizes, filhas]) {
    if (lote.length === 0) continue;
    const r = await db.empresa.createMany({
      data: lote.map((e) => ({ id: e.id, nome: e.nome, parentId: e.parentId })),
      skipDuplicates: true,
    });
    count += r.count;
  }

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

/* ──────────────────────────────────────────────────────────────────────────
 * `seed-filhas` — planejar (PURO) e executar
 *
 * Mesma separação de `reparent.ts`, pelo mesmo motivo: o planejamento não toca
 * em banco, então dá para testá-lo sem Postgres e dá para o chamador conferir
 * a régua ANTES de qualquer escrita. A diferença é o verbo — lá é UPDATE de
 * `parentId`, aqui é INSERT de linha que falta.
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Uma filha que já existe apontando para o pai ERRADO.
 *
 * Não é erro fatal e não interrompe as demais criações: as outras quatro
 * continuam entrando. É reportado para que apareça na resposta do endpoint em
 * vez de virar surpresa numa leitura futura da árvore.
 */
export type DivergenciaParent = {
  id: string;
  /** O pai que a lista canônica manda. Sempre `onix-co` hoje. */
  esperado: string | null;
  /** O pai que está no banco. `null` = a linha ficou como raiz solta. */
  atual: string | null;
};

export type PlanoSeedFilhas = {
  /** Sementes que serão inseridas — as que não têm linha nenhuma no banco. */
  criar: EmpresaSemente[];
  /** Ids que já existem COM o pai certo. Nada a fazer, e é o caso comum. */
  jaExistiam: string[];
  /** Ids que já existem com pai diferente do canônico. Ficam INTOCADOS. */
  divergencias: DivergenciaParent[];
  /** A árvore como ficaria se `criar` fosse aplicado. Alimenta a régua. */
  arvoreSimulada: NoArvore[];
  /** A raiz existe na árvore recebida? Sem ela não há onde pendurar. */
  raizPresente: boolean;
};

/**
 * O que fazer com cada filha canônica, sem tocar em banco.
 *
 * Três desfechos possíveis por empresa, e nenhum deles escreve por cima do que
 * já está lá:
 *
 *   • ausente             → entra em `criar`, já com o `parentId` da semente
 *   • presente, pai certo → entra em `jaExistiam`
 *   • presente, pai errado → entra em `divergencias` e NÃO entra em `criar`
 *
 * O terceiro caso é o que torna a operação segura de repetir num banco sujo:
 * a alternativa — mandar um UPDATE "de correção" — faria o seed reescrever
 * silenciosamente uma hierarquia que alguém pode ter mexido de propósito.
 * Quem quer corrigir chama `acao: "reparent"`, que mostra o plano antes.
 *
 * A idempotência sai daqui de graça: na segunda execução todas as 5 caem em
 * `jaExistiam`, `criar` fica vazio, e não há escrita nenhuma para fazer.
 */
export function planejarSeedFilhas(
  arvore: readonly NoArvore[],
  filhas: readonly EmpresaSemente[] = EMPRESAS_DO_GRUPO,
): PlanoSeedFilhas {
  const porId = new Map(arvore.map((e) => [e.id, e]));

  const criar: EmpresaSemente[] = [];
  const jaExistiam: string[] = [];
  const divergencias: DivergenciaParent[] = [];

  for (const semente of filhas) {
    const atual = porId.get(semente.id);

    if (!atual) {
      criar.push(semente);
      continue;
    }

    if (atual.parentId === semente.parentId) {
      jaExistiam.push(semente.id);
      continue;
    }

    divergencias.push({
      id: semente.id,
      esperado: semente.parentId,
      atual: atual.parentId,
    });
  }

  // A simulação só ACRESCENTA — nenhuma linha existente muda, porque nenhuma
  // escrita deste módulo muda linha existente. É a árvore que a régua valida.
  const arvoreSimulada: NoArvore[] = [
    ...arvore.map((e) => ({ ...e })),
    ...criar.map((e) => ({ id: e.id, nome: e.nome, parentId: e.parentId })),
  ];

  return {
    criar,
    jaExistiam,
    divergencias,
    arvoreSimulada,
    raizPresente: porId.has(ONIX_CO.id),
  };
}

export type ResultadoSeedFilhas = {
  plano: PlanoSeedFilhas;
  /** Ids que o plano mandou criar e que existem no banco depois. */
  criadas: string[];
  /**
   * Linhas que ESTE `createMany` inseriu, segundo o banco.
   *
   * Normalmente igual a `criadas.length`. Fica menor se uma chamada
   * concorrente tiver criado a mesma empresa no meio do caminho — o
   * `skipDuplicates` engole a duplicata, e é essa diferença que denuncia a
   * corrida. Vale a pena distinguir: `criadas` responde "está lá?" e
   * `inseridas` responde "fui eu?".
   */
  inseridas: number;
  totalAntes: number;
  totalDepois: number;
  /** Relida do banco DEPOIS da escrita — não a simulada. */
  arvoreFinal: NoArvore[];
};

/**
 * Cria as filhas ausentes, já penduradas na raiz.
 *
 * NÃO valida a régua nem confere a raiz: quem chama faz isso sobre
 * `planejarSeedFilhas` ANTES, para poder recusar sem ter escrito. Esta função
 * é só a escrita, pelo mesmo motivo que `aplicarPlano` em `reparent.ts` é.
 */
export async function semearFilhas(
  db: ClienteEmpresa,
  plano: PlanoSeedFilhas,
): Promise<ResultadoSeedFilhas> {
  const totalAntes = await db.empresa.count();

  let inseridas = 0;
  if (plano.criar.length > 0) {
    const r = await db.empresa.createMany({
      data: plano.criar.map((e) => ({ id: e.id, nome: e.nome, parentId: e.parentId })),
      skipDuplicates: true,
    });
    inseridas = r.count;
  }

  const arvoreFinal = await lerArvore(db);
  const presentes = new Set(arvoreFinal.map((e) => e.id));

  return {
    plano,
    // Confirmadas contra o banco, não contra o plano: o plano diz o que se
    // pretendia, a árvore relida diz o que de fato está lá.
    criadas: plano.criar.filter((e) => presentes.has(e.id)).map((e) => e.id),
    inseridas,
    totalAntes,
    totalDepois: arvoreFinal.length,
    arvoreFinal,
  };
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
