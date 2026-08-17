/**
 * Semeadura idempotente da tabela `Empresa` — fonte única.
 *
 * Compartilhado por `scripts/seed-empresas.ts` (terminal, semeia a árvore
 * inteira) e por `POST /api/empresas/hierarquia` (navegador: `acao` omitida
 * semeia SÓ a holding; `acao: "seed-filhas"` semeia todo o resto já
 * pendurado). A mecânica de idempotência e a lista canônica moram aqui; os
 * consumidores só escolhem QUAIS nós passar e como reportar o resultado.
 *
 * ── AS FILHAS NASCEM PENDURADAS ──────────────────────────────────────────
 * Até a PR-B4 o seed criava TODA empresa como raiz solta e o reparenting as
 * pendurava depois — duas etapas, e uma janela entre elas em que a árvore
 * ficava plana. Agora `parentId` faz parte da SEMENTE: quem nasce filha nasce
 * com pai. O reparenting não some por isso; ele deixa de ser etapa obrigatória
 * do bootstrap e passa a ser o que sempre deveria ter sido — FERRAMENTA DE
 * REPARO, para o dia em que uma linha aparecer com o pai errado.
 *
 * ── TRÊS NÍVEIS: A ORDEM DE INSERÇÃO PASSOU A SER CALCULADA ──────────────
 * Com 2 níveis bastava separar "raízes" de "filhas" e mandar dois
 * `createMany`. Com 3, um departamento pendurado numa empresa exige que a
 * EMPRESA já exista, que por sua vez exige a holding — a FK auto-referente
 * impõe uma ordem topológica. `lotesPorProfundidade` calcula essa ordem a
 * partir do próprio `parentId`, então acrescentar um quarto nível um dia não
 * pede mudança nenhuma aqui.
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
import type { TipoNo } from "@/lib/empresas/hierarquia";

/** O contrato mínimo usado aqui: contar, listar e criar pulando duplicata. */
export type ClienteEmpresa = Pick<PrismaClient, "empresa">;

export type EmpresaSemente = {
  id: string;
  nome: string;
  /** holding | empresa | departamento. Vem do catálogo, nunca é deduzido. */
  tipo: TipoNo;
  /** Função que se repete no grupo (as 6 "Qualidade e Pós-venda"). */
  transversal: boolean;
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
 * `lib/empresas/catalogo.ts`, que é a declaração única da ESTRUTURA — quem
 * existe, com que papel (`tipo`), pendurado em quem (`parentId`) e onde
 * aparece (`noHub`).
 *
 * O motivo é o histórico do repositório, não preferência: a mesma lista já
 * esteve escrita em três lugares que não se conheciam e os três divergiam —
 * `agro` e `contabil` orbitavam o hub sem nunca terem sido semeadas,
 * `planejamento` era semeada sem aparecer no hub. Este arquivo teria sido o
 * quarto. Um literal só é fonte de verdade enquanto é o ÚNICO; a partir do
 * segundo, é cópia.
 *
 * `catalogo.test.ts` trava os ids contra o catálogo. O formato ganhou
 * `parentId` na PR-B4 e `tipo`/`transversal` nesta — a semente carrega tudo
 * que a linha precisa para nascer no lugar certo, com o papel certo.
 *
 * Ninguém depende da ORDEM da lista: `semearEmpresas` reordena por
 * profundidade antes de escrever, `lerArvore` ordena no SQL, e o script
 * imprime contagens. O CONJUNTO é o que o teste trava.
 *
 * O import é seguro como estático: `catalogo.ts` é PURO (sem prisma, sem
 * `server-only`), então ele não reintroduz o problema que o guard de
 * DATABASE_URL do script existe para evitar. */
import { CATALOGO_EMPRESAS, RAIZ_DO_GRUPO, empresasCadastradas } from "@/lib/empresas/catalogo";

const semear = (e: (typeof CATALOGO_EMPRESAS)[number]): EmpresaSemente => ({
  id: e.id,
  nome: e.nome,
  tipo: e.tipo,
  transversal: e.transversal === true,
  parentId: e.parentId,
});

const doCatalogo = (id: string): EmpresaSemente => {
  const e = CATALOGO_EMPRESAS.find((x) => x.id === id);
  if (!e) throw new Error(`"${id}" não está em lib/empresas/catalogo.ts`);
  return semear(e);
};

/**
 * A holding. `onix-co` é o único id que NÃO vem de
 * `src/lib/empresas-config.ts`: a empresa-mãe não é aba de navegação, então
 * nunca precisou existir lá.
 *
 * O `parentId` deixou de ser passado por fora — quem declara onde cada nó
 * pendura é o catálogo, inclusive para dizer que a holding não pendura em
 * ninguém.
 */
export const ONIX_CO: EmpresaSemente = doCatalogo(RAIZ_DO_GRUPO);

/**
 * Tudo abaixo da holding: as 6 empresas, os 2 departamentos dela e os 11
 * departamentos das empresas — 19 nós, cada um já com o pai que o catálogo
 * declara.
 *
 * ── POR QUE O NOME MUDOU ─────────────────────────────────────────────────
 * Chamava-se `EMPRESAS_DO_GRUPO` e queria dizer "as 5 empresas jurídicas
 * penduradas na raiz". Nenhuma das duas metades sobreviveu à estrutura de 3
 * níveis: a maioria destes nós é DEPARTAMENTO, e nem todos penduram na raiz.
 * Manter o nome antigo faria `planejarSeedFilhas(arvore, EMPRESAS_DO_GRUPO)`
 * ler como se o segundo argumento fossem empresas.
 *
 * Quem é quem, e por quê, está por extenso no topo de `catalogo.ts`. Aqui não
 * se decide nada: esta lista é derivação, e os ids casam por VALOR com
 * `Implementacao.empresaId`, que já tem linhas gravadas em produção.
 */
export const NOS_ABAIXO_DA_HOLDING: EmpresaSemente[] = empresasCadastradas()
  .filter((e) => e.id !== RAIZ_DO_GRUPO)
  .map(semear);

/** A árvore inteira — o que o script de terminal semeia. Total esperado: 20 linhas. */
export const TODAS_AS_EMPRESAS: EmpresaSemente[] = [ONIX_CO, ...NOS_ABAIXO_DA_HOLDING];

/** Um nó da árvore, como sai para quem consome. */
export type NoArvore = {
  id: string;
  nome: string;
  tipo: TipoNo;
  transversal: boolean;
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
  /**
   * Nós com pai. Depois do seed completo são 19 dos 20 — só a holding fica
   * sem. Continua reportado porque é a contagem que denuncia, numa linha, um
   * banco que voltou a ficar plano.
   */
  comPai: number;
};

/** Árvore inteira, ordenada — raízes primeiro, depois por id. */
export async function lerArvore(db: ClienteEmpresa): Promise<NoArvore[]> {
  return db.empresa.findMany({
    select: { id: true, nome: true, tipo: true, transversal: true, parentId: true },
    orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { id: "asc" }],
  });
}

/**
 * Agrupa as sementes em lotes que respeitam a FK: primeiro as raízes, depois
 * quem pendura nelas, e assim por diante.
 *
 * Semente cujo pai NÃO está na lista entra no primeiro lote — é o caso de
 * semear só um pedaço da árvore (o `seed-filhas` com a holding já no banco).
 * A FK ainda protege: se o pai também não estiver no BANCO, o INSERT falha,
 * que é o comportamento certo. O que esta função garante é a ordem entre as
 * sementes de uma mesma chamada.
 *
 * Devolve `null` se as sementes formarem ciclo entre si — sem isso o laço não
 * terminaria, e um ciclo declarado no catálogo é bug de código, não estado
 * ruim de banco.
 */
export function lotesPorProfundidade(
  sementes: readonly EmpresaSemente[],
): EmpresaSemente[][] | null {
  const idsPedidos = new Set(sementes.map((s) => s.id));
  const pendentes = new Map(sementes.map((s) => [s.id, s]));
  const colocados = new Set<string>();
  const lotes: EmpresaSemente[][] = [];

  while (pendentes.size > 0) {
    const lote = [...pendentes.values()].filter(
      (s) =>
        s.parentId === null ||
        // Pai fora desta chamada: já está no banco (ou vai falhar na FK).
        !idsPedidos.has(s.parentId) ||
        colocados.has(s.parentId),
    );

    if (lote.length === 0) return null; // ciclo entre as sementes

    for (const s of lote) {
      pendentes.delete(s.id);
      colocados.add(s.id);
    }
    lotes.push(lote);
  }

  return lotes;
}

/** As linhas como o Prisma as recebe. Um lugar só, usado pelos dois `createMany`. */
function paraCreate(sementes: readonly EmpresaSemente[]) {
  return sementes.map((e) => ({
    id: e.id,
    nome: e.nome,
    tipo: e.tipo,
    transversal: e.transversal,
    parentId: e.parentId,
  }));
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
  // UM createMany POR NÍVEL, não um só: `Empresa.parentId` é FK auto-referente,
  // e um nó só pode entrar depois do pai. Postgres verifica RI em AFTER ROW
  // trigger no fim do statement, então um INSERT único bem ordenado até
  // funcionaria — mas isso é detalhe de implementação do banco, invisível para
  // quem lê, e uma reordenação inocente da lista quebraria em produção.
  // Separar torna a ordem uma propriedade do código.
  const lotes = lotesPorProfundidade(empresas);
  if (lotes === null) {
    throw new Error(
      "As sementes formam ciclo entre si (algum `parentId` aponta para um descendente). " +
        "Nada foi escrito — conserte src/lib/empresas/catalogo.ts.",
    );
  }

  let count = 0;
  for (const lote of lotes) {
    const r = await db.empresa.createMany({
      data: paraCreate(lote),
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
 * A idempotência sai daqui de graça: na segunda execução todos os 19 caem em
 * `jaExistiam`, `criar` fica vazio, e não há escrita nenhuma para fazer.
 */
export function planejarSeedFilhas(
  arvore: readonly NoArvore[],
  filhas: readonly EmpresaSemente[] = NOS_ABAIXO_DA_HOLDING,
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
    ...criar.map((e) => ({
      id: e.id,
      nome: e.nome,
      tipo: e.tipo,
      transversal: e.transversal,
      parentId: e.parentId,
    })),
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
      data: paraCreate(plano.criar),
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
