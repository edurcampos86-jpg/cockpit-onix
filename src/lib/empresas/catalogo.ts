/* ──────────────────────────────────────────────────────────────
 * Catálogo das empresas do grupo — módulo PURO, uma declaração só.
 *
 * ── O PROBLEMA QUE ELE RESOLVE ───────────────────────────────────────────
 * A mesma lista de empresas estava escrita em dois lugares que não se
 * conheciam, e os dois já divergiam:
 *
 *   • `scripts/seed-empresas.ts`      — 8 ids (quem vira linha em `Empresa`)
 *   • `src/lib/hub-ecossistema/nos.ts` — outros 8 ids (quem orbita no hub)
 *
 * A interseção é 6. `agro` e `contabil` aparecem no hub e não no cadastro;
 * `planejamento` aparece no cadastro e não no hub. Nada quebrava de imediato —
 * por isso a divergência sobreviveu —, mas ela tem consequência silenciosa dos
 * dois lados, e é essa consequência que este arquivo torna visível.
 *
 * ── AS DUAS PRESENÇAS SÃO INDEPENDENTES, E ISSO É O PONTO ────────────────
 * `cadastrada` e `noHub` são dois eixos, não um. Uma empresa pode:
 *
 *   • existir no cadastro e não no hub  -> `planejamento`, `onix-co`
 *   • aparecer no hub sem existir no cadastro -> `agro`, `contabil`
 *
 * Modelar como um eixo só obrigaria a escolher uma verdade que o negócio
 * ainda não escolheu. Modelar como dois deixa cada estado declarado, com o
 * motivo ao lado, e transforma "mudar de ideia" em UMA palavra aqui.
 *
 * ── O QUE ESTE ARQUIVO NÃO DECIDE ────────────────────────────────────────
 * Não decide se `agro` e `contabil` existem juridicamente, nem se
 * `planejamento` deveria virar o 9º nó do hub. Essas são perguntas de
 * produto, ainda abertas. O arquivo só garante que a resposta, quando vier,
 * seja um `true` trocado por `false` num lugar — e que enquanto ela não vier,
 * ninguém precise descobrir a divergência lendo dois arquivos e comparando
 * na cabeça.
 *
 * ── QUEM CONSOME ─────────────────────────────────────────────────────────
 *   • `seed-hierarquia.ts` — deriva `ONIX_CO` / `EMPRESAS_DO_GRUPO` /
 *     `TODAS_AS_EMPRESAS`, e por eles o script de terminal e
 *     `POST /api/empresas/hierarquia`
 *   • `catalogo.test.ts`   — trava o hub contra `idsNoHub()` e o seed contra
 *     `idsCadastradas()`
 *   • `scripts/reparent-empresas.ts` — confere a própria lista contra
 *     `idsFilhasDaRaiz()` antes de escrever                        [RBAC]
 *   • `api/configuracoes/permissoes/auditoria` — usa `divergencias()` para
 *     explicar por que uma empresa concedida não aparece na tela   [RBAC]
 *
 * A declaração acima é da PR do hub; os itens [RBAC] são acrescentados por
 * esta PR, que só LÊ o catálogo e não redeclara empresa nenhuma. O catálogo
 * mora aqui, e não do lado do RBAC, porque a lista de quem orbita é invariante
 * do HUB: é `catalogo.test.ts` que impede um nó nascer em `nos.ts` sem passar
 * por aqui.
 *
 * ── SOBRE O NOME `CATALOGO_EMPRESAS` ─────────────────────────────────────
 * A constante já se chamou `EMPRESAS_DO_GRUPO`. Foi renomeada quando a #291
 * entrou na main com um símbolo homônimo em `seed-hierarquia.ts`, no MESMO
 * diretório e com outro formato (7 entradas de `{id, nome}`, sem a raiz).
 * Quem estava publicado ficou com o nome; esta, que ainda estava em revisão,
 * mudou. Dois `EMPRESAS_DO_GRUPO` vizinhos com semânticas diferentes seriam
 * uma armadilha de import.
 *
 * PURO de propósito (sem prisma, sem `server-only`, sem React): é importado
 * por script Node, por teste e — via o teste — pelo lado cliente do hub.
 * ────────────────────────────────────────────────────────────── */

/* ── QUEM É PESSOA JURÍDICA DO GRUPO — DECISÃO DO EDUARDO (PR-B4) ─────────
 *
 * A lista canônica das filhas diretas de `onix-co` é EXATAMENTE esta, e o
 * critério é um só: existir juridicamente como empresa do grupo.
 *
 *   investimentos  "Onix Capital"
 *   corretora      "Onix Corretora"
 *   imobiliaria    "Onix Imobiliária"
 *   corporate      "Onix Corporate"
 *   tech           "Onix Tech"
 *
 * E, com o mesmo peso, quem FICOU DE FORA e por quê — porque a pergunta
 * "cadê a Onix Agro?" volta a cada leitura da árvore, e a resposta tem de
 * estar aqui e não na memória de quem decidiu:
 *
 *   • Onix Agro (`agro`)                — DEPARTAMENTO, não PJ.
 *   • Planejamento Patrimonial (`planejamento`) — DEPARTAMENTO dentro da
 *     Onix Capital, não PJ.
 *   • Onix Contábil (`contabil`)        — NÃO EXISTE juridicamente. Estava
 *     anunciada no hub como protótipo aprovado.
 *   • Meu Sucesso Patrimonial (`educacao`) — PRODUTO, não PJ.
 *   • Barreiras e Unaí                  — FILIAIS. Não são nós da hierarquia;
 *     viram ATRIBUTO da empresa numa fase posterior. Nunca tiveram id aqui, e
 *     é proposital que continuem sem — filial que vira nó reabre a régua de
 *     2 níveis de `hierarquia.ts`, que é justamente o que não se quer.
 *
 * ── POR QUE OS IDS NÃO VIRARAM `onix-capital`, `onix-tech`… ──────────────
 * A decisão chegou escrita com ids no padrão da raiz (`onix-capital`,
 * `onix-corretora`, `onix-imobiliaria`, `onix-corporate`, `onix-tech`). Os
 * NOMES foram adotados como vieram — inclusive "Onix Imobiliária", que aqui
 * era "Onix Imob". Os IDS não, e o motivo é dado, não gosto:
 *
 *   • `Implementacao.empresaId` já tem linhas em produção com `investimentos`,
 *     `corretora`, … (ver comentário em `empresas-config.ts:17`). Ids novos
 *     criariam empresa órfã no dia em que a FK entrar.
 *   • `PessoaEmpresa.empresaId` tem FK para `Empresa.id`: as concessões de
 *     RBAC apontam para os ids atuais.
 *   • `NOS_ECOSSISTEMA` (`hub-ecossistema/nos.ts`) e `EMPRESAS`
 *     (`empresas-config.ts`) casam por VALOR com estes mesmos ids — é essa
 *     igualdade que faz o RBAC funcionar sem tabela de-para.
 *
 * Trocar os ids seria coerente só mexendo nesses quatro lugares de uma vez, e
 * a PR-B4 foi pedida explicitamente "sem tocar em outras rotas/ações". O id é
 * interno; o nome é o que aparece na tela, e o nome é o que a decisão mudou.
 * Se a renomeação for mesmo desejada, ela é PR própria — com UPDATE em massa
 * de `Implementacao` e `PessoaEmpresa` no mesmo commit. */

/** A empresa-mãe. Mesmo id em `seed-empresas.ts` e em `Empresa.id`. */
export const RAIZ_DO_GRUPO = "onix-co";

export type EmpresaDoGrupo = {
  /**
   * Slug estável. É o MESMO valor em `Empresa.id`, em
   * `Implementacao.empresaId` (já com linhas em produção), em
   * `empresas-config.ts` e no `NoEcossistema.id` — é essa igualdade que faz
   * o RBAC de empresa casar sem tabela de-para.
   */
  id: string;
  /** Razão social curta, como aparece no cadastro. */
  nome: string;
  /**
   * Ganha linha na tabela `Empresa` (via `scripts/seed-empresas.ts`).
   *
   * Consequência de estar `false`: a empresa é INVISÍVEL para o RBAC. A FK de
   * `PessoaEmpresa` impede até conceder acesso a ela, e o hub nunca a mostra
   * travada — ausência de cadastro não é negação de acesso (ver
   * `hub-ecossistema/acesso.ts`).
   */
  cadastrada: boolean;
  /**
   * Aparece como nó orbital no hub "Ecossistema Onix".
   *
   * Consequência de estar `false`: some da tela inicial. Quem chega pelo hub
   * não descobre que ela existe — mesmo que tenha rota e acesso.
   */
  noHub: boolean;
  /** Por que esta empresa diverge entre os dois lados. Só onde diverge. */
  nota?: string;
};

/**
 * As empresas do grupo, com as duas presenças declaradas.
 *
 * A ordem aqui é a do CADASTRO (raiz primeiro), não a da órbita do hub — essa
 * mora em `NOS_ECOSSISTEMA` e é decisão visual. Reordenar aqui não move nada
 * na tela.
 */
export const CATALOGO_EMPRESAS: readonly EmpresaDoGrupo[] = [
  {
    id: RAIZ_DO_GRUPO,
    nome: "Onix Co",
    cadastrada: true,
    noHub: false,
    nota:
      "Raiz societária: existe para as outras pendurarem nela e para conceder " +
      "acesso ao grupo inteiro numa linha só (`incluiDescendentes`). Não é " +
      "destino de navegação — no hub ela É o núcleo, não um nó da órbita.",
  },
  { id: "investimentos", nome: "Onix Capital", cadastrada: true, noHub: true },
  { id: "corretora", nome: "Onix Corretora", cadastrada: true, noHub: true },
  { id: "corporate", nome: "Onix Corporate", cadastrada: true, noHub: true },
  { id: "imobiliaria", nome: "Onix Imobiliária", cadastrada: true, noHub: true },
  { id: "tech", nome: "Onix Tech", cadastrada: true, noHub: true },
  {
    id: "educacao",
    nome: "Onix Educação",
    cadastrada: false,
    noHub: true,
    nota:
      "FORA DA LISTA CANÔNICA por decisão do Eduardo (PR-B4): é PRODUTO — " +
      '"Meu Sucesso Patrimonial" —, não pessoa jurídica do grupo. Estava ' +
      "`cadastrada: true` desde a #291 sem que ninguém tivesse decidido que " +
      "ela era empresa; era herança da lista original de 8, não uma escolha. " +
      "Nada regride ao sair: ela não tem rota em `src/app/empresas/` (é " +
      '`maturidade: "sem-rota"` em `nos.ts`), então não havia gate de RBAC a ' +
      "perder. Continua orbitando o hub como anúncio, igual a `agro` e " +
      "`contabil`. Se um dia virar PJ, o conserto é `cadastrada: true` aqui.",
  },
  {
    id: "planejamento",
    nome: "Planejamento Patrimonial",
    cadastrada: false,
    noHub: false,
    nota:
      "FORA DA LISTA CANÔNICA por decisão do Eduardo (PR-B4): é DEPARTAMENTO " +
      "dentro da Onix Capital, não pessoa jurídica — logo não pendura na raiz " +
      "societária. A rota `src/app/empresas/planejamento/` e o link da sidebar " +
      "(`sidebar.tsx:231`) continuam funcionando: a página é o " +
      "`EmpresaPlaceholder` e NÃO usa `podeVerEmpresa` (não há layout com gate " +
      "nessa pasta, diferente de investimentos/corretora/corporate/" +
      "imobiliaria/tech), então sair do cadastro não abre nada que estivesse " +
      "fechado. A divergência anterior — cadastrada e fora do hub — deixa de " +
      "existir: agora ela está fora dos dois, coerente com ser departamento.",
  },
  {
    id: "agro",
    nome: "Onix Agro",
    cadastrada: false,
    noHub: true,
    nota:
      "ANUNCIADA, não operacional: aparece no hub (protótipo aprovado) e não " +
      "existe em lugar nenhum do sistema — sem rota, sem linha em `Empresa`. " +
      "Por isso o hub tem a guarda `cadastradas` em `acesso.ts`: sem ela, " +
      "apareceria TRAVADA (\"sem acesso\") para quem tem concessão restrita, " +
      "dizendo \"você não pode\" sobre algo que ninguém pode. Pergunta aberta: " +
      "é empresa que já existe juridicamente e ainda não ganhou sistema, ou é " +
      "plano? Se for a primeira, o conserto é `cadastrada: true` aqui + rodar " +
      "o seed.",
  },
  {
    id: "contabil",
    nome: "Onix Contábil",
    cadastrada: false,
    noHub: true,
    nota: "Mesma situação de `agro` — anunciada no hub, ausente do sistema.",
  },
] as const;

/** Índice id→empresa, para as buscas não serem O(n) dentro de laço. */
const PorId = new Map(CATALOGO_EMPRESAS.map((e) => [e.id, e]));

export function empresaDoGrupo(id: string): EmpresaDoGrupo | undefined {
  return PorId.get(id);
}

/**
 * Quem vira linha em `Empresa`. É a lista que `scripts/seed-empresas.ts`
 * insere — inclusive a raiz.
 */
export function empresasCadastradas(): EmpresaDoGrupo[] {
  return CATALOGO_EMPRESAS.filter((e) => e.cadastrada);
}

/** Só os ids de `empresasCadastradas()`. */
export function idsCadastradas(): string[] {
  return empresasCadastradas().map((e) => e.id);
}

/** Quem orbita no hub. Travado contra `NOS_ECOSSISTEMA` por teste. */
export function idsNoHub(): string[] {
  return CATALOGO_EMPRESAS.filter((e) => e.noHub).map((e) => e.id);
}

/* ── DAQUI PARA BAIXO: acrescentado pelo RBAC por empresa ─────────────────
 *
 * O catálogo em si é da PR do hub — é lá que a lista de quem orbita é
 * invariante, e é lá que o teste impede um nó nascer sem declaração. Esta PR
 * só LÊ o que já está declarado acima e deriva duas visões que só ela consome.
 *
 * Ficam neste arquivo, e não num módulo próprio, porque derivar do catálogo em
 * outro lugar recria exatamente o problema que o catálogo resolveu: uma segunda
 * casa capaz de discordar da primeira. */

/**
 * Quem o reparenting pendura na raiz: as cadastradas MENOS a própria raiz.
 * A raiz não pode ser filha de si mesma (`validarParent` recusaria por
 * `auto_referencia`).
 */
export function idsFilhasDaRaiz(): string[] {
  return idsCadastradas().filter((id) => id !== RAIZ_DO_GRUPO);
}

/** As quatro caixas do catálogo, já separadas. */
export type Divergencias = {
  /** No hub e no cadastro — o caso saudável. */
  nosDois: string[];
  /** Anunciada no hub, ausente do cadastro: o RBAC não a enxerga. */
  soNoHub: string[];
  /** Cadastrada e fora do hub: existe, mas a tela inicial não a mostra. */
  soNoCadastro: string[];
  /**
   * Em NENHUM dos dois eixos. Era caixa vazia até a PR-B4 e passou a ter
   * ocupante: `planejamento`, que tem rota e link de sidebar mas não é PJ do
   * grupo nem orbita o hub. A caixa existe para que esse estado seja
   * DECLARADO — antes, uma linha assim seria confundida com esquecimento.
   */
  foraDosDois: string[];
};

/**
 * Divide o catálogo nas quatro caixas. Usado pelo teste e pela auditoria de
 * permissões (`/api/configuracoes/permissoes/auditoria`), que precisa dizer
 * ao admin POR QUE uma empresa concedida não aparece na tela inicial.
 *
 * A auditoria consome só as três primeiras e continua correta: `foraDosDois`
 * é, por definição, quem não está no cadastro — logo nunca deveria entrar em
 * `faltandoSeed`.
 */
export function divergencias(): Divergencias {
  return {
    nosDois: CATALOGO_EMPRESAS.filter((e) => e.cadastrada && e.noHub).map((e) => e.id),
    soNoHub: CATALOGO_EMPRESAS.filter((e) => !e.cadastrada && e.noHub).map((e) => e.id),
    soNoCadastro: CATALOGO_EMPRESAS.filter((e) => e.cadastrada && !e.noHub).map((e) => e.id),
    foraDosDois: CATALOGO_EMPRESAS.filter((e) => !e.cadastrada && !e.noHub).map((e) => e.id),
  };
}
