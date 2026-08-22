/* ──────────────────────────────────────────────────────────────
 * Catálogo do grupo Onix — a ESTRUTURA inteira, numa declaração só.
 *
 * ── O PROBLEMA QUE ELE RESOLVE ───────────────────────────────────────────
 * A mesma lista de empresas esteve escrita em três lugares que não se
 * conheciam, e os três divergiam: `scripts/seed-empresas.ts` semeava um
 * conjunto, `src/lib/hub-ecossistema/nos.ts` orbitava outro, e
 * `seed-hierarquia.ts` redigitava um terceiro. Nada quebrava de imediato — por
 * isso a divergência sobreviveu —, mas ela tinha consequência silenciosa dos
 * dois lados. Este arquivo é a declaração única; os outros DERIVAM dele, e
 * `catalogo.test.ts` é o que impede a derivação envelhecer.
 *
 * ── O QUE MUDOU NESTA PR: DE LISTA PLANA PARA ÁRVORE DE 3 NÍVEIS ─────────
 * Até aqui o catálogo era uma lista de EMPRESAS com dois eixos de presença
 * (`cadastrada` / `noHub`), e a hierarquia era implícita — "a raiz e as filhas
 * dela". A estrutura declarada pelo Eduardo tem 20 nós e três papéis:
 *
 *   holding        Onix Co                              1 nó
 *   empresa        Capital, Educação, Corretora,
 *                  Imob, Contábil, Tech                 6 nós
 *   departamento   Expansão, Marketing, Agro,
 *                  Investimentos, Planejamento,
 *                  Corretora, Corporate, e as 6
 *                  Qualidade e Pós-venda               13 nós
 *
 * `parentId` e `tipo` passam a ser declarados aqui, e o eixo `cadastrada`
 * SUMIU: todo nó da estrutura vira linha em `Empresa`. Ele existia para
 * registrar que `agro` e `contabil` eram anunciadas no hub sem existir no
 * cadastro — estado que esta PR encerra ao dar a cada uma o seu lugar na
 * árvore. `noHub` continua, porque orbitar o hub segue sendo decisão visual
 * independente do organograma (Qualidade não orbita; Corporate orbita mesmo
 * sendo departamento).
 *
 * ── OS IDS SÃO ESTÁVEIS E DISTINTOS DO RÓTULO ────────────────────────────
 * Dois rótulos se repetem de propósito, e é por isso que id nunca é derivado
 * do nome:
 *
 *   • "Onix Corretora" é EMPRESA (`corretora`) e também DEPARTAMENTO dentro
 *     dela (`corretora-corretora`).
 *   • "Qualidade e Pós-venda" aparece SEIS vezes, uma por empresa.
 *
 * A convenção para departamento novo é `<id do pai>-<apelido>`: o prefixo diz
 * onde o nó mora, e o apelido é curto e estável (`-qualidade`, não
 * `-qualidade-e-pos-venda`, que mudaria de valor se o rótulo ganhasse um
 * hífen). Ela produz `corretora-corretora` e `investimentos-investimentos`,
 * que gaguejam — e ainda assim é preferível a apelidos criativos: a gagueira é
 * a estrutura falando, não um descuido.
 *
 * TRÊS ids fogem da convenção, e não por estética: `agro`, `corporate` e
 * `planejamento` JÁ EXISTEM como slug em `empresas-config.ts`, em
 * `NOS_ECOSSISTEMA` e (no caso de `corporate`) em `Implementacao.empresaId`,
 * com linhas gravadas em produção. Virar departamento muda o PAPEL deles, não
 * a identidade; renomear o id criaria órfão no dia em que a FK entrar. Eles
 * estão declarados em `IDS_LEGADOS`, e `catalogo.test.ts` recusa um quarto
 * fora-da-convenção que apareça sem passar por lá.
 *
 * ── POR QUE OS IDS DAS EMPRESAS NÃO VIRARAM `onix-capital`, `onix-tech`… ──
 * Mesmo motivo, e já estava escrito antes desta PR: `Implementacao.empresaId`
 * tem linhas em produção com `investimentos`, `corretora`, …;
 * `PessoaEmpresa.empresaId` tem FK para `Empresa.id`; `NOS_ECOSSISTEMA` e
 * `EMPRESAS` casam por VALOR com estes mesmos ids — é essa igualdade que faz o
 * RBAC funcionar sem tabela de-para. O id é interno; o nome é o que aparece na
 * tela.
 *
 * ── QUEM CONSOME ─────────────────────────────────────────────────────────
 *   • `seed-hierarquia.ts` — deriva as sementes, e por elas o script de
 *     terminal e `POST /api/empresas/hierarquia`
 *   • `catalogo.test.ts`   — trava o hub contra `idsNoHub()`, o seed contra
 *     `idsCadastradas()` e a árvore contra `validarArvoreCompleta()`
 *   • `scripts/reparent-empresas.ts` — confere a própria lista contra
 *     `idsFilhasDaRaiz()` antes de escrever
 *   • `api/configuracoes/permissoes/auditoria` — usa `divergencias()` para
 *     explicar por que uma empresa concedida não aparece na tela
 *
 * PURO de propósito (sem prisma, sem `server-only`, sem React): é importado
 * por script Node, por teste e — via o teste — pelo lado cliente do hub.
 * ────────────────────────────────────────────────────────────── */

import type { NoTipado, TipoNo } from "@/lib/empresas/hierarquia";

/** A holding. Mesmo id em `Empresa.id` e no seed. */
export const RAIZ_DO_GRUPO = "onix-co";

export type NoDoGrupo = {
  /**
   * Slug estável. É o MESMO valor em `Empresa.id`, em
   * `Implementacao.empresaId` (já com linhas em produção), em
   * `empresas-config.ts` e no `NoEcossistema.id` — é essa igualdade que faz
   * o RBAC de empresa casar sem tabela de-para.
   */
  id: string;
  /** Rótulo, como aparece na tela. Pode repetir entre nós; o id não. */
  nome: string;
  /** holding | empresa | departamento. Declarado, nunca deduzido do nível. */
  tipo: TipoNo;
  /** Onde o nó pendura. `null` só na holding. */
  parentId: string | null;
  /**
   * Função que se repete em várias empresas e é a MESMA função — hoje só
   * "Qualidade e Pós-venda". Cada ocorrência é um nó próprio, pendurado na sua
   * empresa; a flag é o que permite perguntar "toda a Qualidade do grupo" sem
   * desfazer a separação por empresa que o RBAC precisa.
   */
  transversal?: boolean;
  /**
   * Departamento da HOLDING que consolida o trabalho das ocorrências
   * transversais das empresas.
   *
   * "ADM/Financeiro" existe sete vezes no grupo: uma em cada empresa, fazendo
   * o trabalho, e uma na holding, somando o das seis. Mesmo rótulo, papel
   * diferente — e a diferença precisa estar NO DADO, não na cabeça de quem lê
   * a tela, senão conceder acesso ao "Jurídico" vira escolha no escuro entre
   * sete nós de mesmo nome.
   *
   * `transversal` e `consolida` são excludentes: um FAZ, o outro SOMA.
   */
  consolida?: boolean;
  /**
   * Aparece como nó orbital no hub "Ecossistema Onix".
   *
   * Consequência de estar `false`: some da tela inicial. Quem chega pelo hub
   * não descobre que o nó existe — mesmo que ele tenha rota e acesso.
   */
  noHub: boolean;
  /** Por que este nó merece explicação. Só onde há o que explicar. */
  nota?: string;
};

/**
 * A estrutura do grupo — 20 nós, na ordem de leitura da árvore (holding,
 * depois cada empresa seguida dos departamentos dela).
 *
 * A ordem é para humano: `semearEmpresas` reordena por profundidade antes de
 * escrever, `lerArvore` ordena no SQL e o teste compara CONJUNTOS. Reordenar
 * aqui não muda comportamento nenhum.
 */
export const CATALOGO_EMPRESAS: readonly NoDoGrupo[] = [
  {
    id: RAIZ_DO_GRUPO,
    nome: "Onix Co",
    tipo: "holding",
    parentId: null,
    noHub: false,
    nota:
      "Raiz societária: existe para as outras pendurarem nela e para conceder " +
      "acesso ao grupo inteiro numa linha só (`incluiDescendentes`). Não é " +
      "destino de navegação — no hub ela É o núcleo, não um nó da órbita.",
  },

  /* ── Departamentos da holding ─────────────────────────────────────────
   * Penduram direto na "Onix Co", no MESMO nível das empresas. São eles que
   * tornam impossível deduzir o tipo pela profundidade: nível 2 tem empresa e
   * departamento convivendo. */
  {
    id: "onix-co-expansao",
    nome: "Expansão",
    tipo: "departamento",
    parentId: RAIZ_DO_GRUPO,
    noHub: false,
    nota:
      "Departamento da holding, não de uma empresa: atende o grupo inteiro. " +
      "Nasce nesta PR — não tinha id, rota nem linha antes.",
  },
  {
    id: "onix-co-marketing",
    nome: "Marketing/Mídias Sociais",
    tipo: "departamento",
    parentId: RAIZ_DO_GRUPO,
    noHub: false,
    nota:
      "Departamento da holding. É a área por trás de `/kpis` (KPIs do " +
      "Instagram) e de `/roteiros`, que hoje vivem fora de qualquer empresa " +
      "na navegação — este nó é o lugar delas no organograma.",
  },


  /* ── Consolidadores da holding ─────────────────────────────────────────
   * Mesmo rótulo das ocorrências nas empresas, papel diferente: aqui se SOMA
   * o que lá se FAZ. É para isso que `consolida` existe como campo. */
  {
    id: "onix-co-adm",
    nome: "ADM/Financeiro",
    tipo: "departamento",
    parentId: RAIZ_DO_GRUPO,
    consolida: true,
    noHub: false,
    nota:
      "Consolida o ADM/Financeiro das seis empresas: é o número do grupo, "
      + "não o de uma casa.",
  },
  {
    id: "onix-co-juridico",
    nome: "Jurídico",
    tipo: "departamento",
    parentId: RAIZ_DO_GRUPO,
    consolida: true,
    noHub: false,
    nota:
      "Consolida o Jurídico das seis. O cofre de contratos "
      + "(`/juridico/contratos`) já é do grupo inteiro — este é o nó dele.",
  },
  {
    id: "onix-co-compliance",
    nome: "Compliance",
    tipo: "departamento",
    parentId: RAIZ_DO_GRUPO,
    consolida: true,
    noHub: false,
    nota:
      "Consolida o Compliance das seis. Regulatório de corretora e de "
      + "gestora não se misturam na execução, mas se somam no risco do grupo.",
  },
  {
    id: "onix-co-clientes",
    nome: "Clientes do Grupo",
    tipo: "departamento",
    parentId: RAIZ_DO_GRUPO,
    consolida: true,
    noHub: false,
    nota:
      "Base ÚNICA de pessoas do grupo, sem duplicidade entre empresas. NÃO "
      + "cria identidade nova: lê o `PessoaGrupo` que já está em produção "
      + "(2.476 pessoas, 2.613 vínculos). O nó existe para o RBAC ter onde "
      + "conceder acesso à base consolidada.",
  },

  /* ── Onix Capital ─────────────────────────────────────────────────────── */
  { id: "investimentos", nome: "Onix Capital", tipo: "empresa", parentId: RAIZ_DO_GRUPO, noHub: true },
  {
    id: "agro",
    nome: "Onix Agro",
    tipo: "departamento",
    parentId: "investimentos",
    noHub: true,
    nota:
      "ERA anunciada no hub como empresa e não existia em lugar nenhum do " +
      "sistema — sem rota, sem linha em `Empresa`. A pergunta aberta (\"é PJ " +
      "que ainda não ganhou sistema, ou é plano?\") foi respondida: é " +
      "DEPARTAMENTO da Onix Capital. O id não muda porque `NOS_ECOSSISTEMA` " +
      "casa por valor com ele.",
  },
  {
    id: "investimentos-qualidade",
    nome: "Qualidade e Pós-venda",
    tipo: "departamento",
    parentId: "investimentos",
    transversal: true,
    noHub: false,
  },
  {
    id: "investimentos-investimentos",
    nome: "Onix Investimentos",
    tipo: "departamento",
    parentId: "investimentos",
    noHub: false,
    nota:
      "A gagueira do id é a convenção `<pai>-<slug>` aplicada a um " +
      "departamento cujo rótulo é quase o do pai: a EMPRESA se chama \"Onix " +
      "Capital\" mas carrega o id legado `investimentos`, e o DEPARTAMENTO " +
      "dentro dela se chama \"Onix Investimentos\". Ids diferentes, rótulos " +
      "parecidos — intencional.",
  },

  { id: "investimentos-adm", nome: "ADM/Financeiro", tipo: "departamento", parentId: "investimentos", transversal: true, noHub: false },
  { id: "investimentos-juridico", nome: "Jurídico", tipo: "departamento", parentId: "investimentos", transversal: true, noHub: false },
  { id: "investimentos-compliance", nome: "Compliance", tipo: "departamento", parentId: "investimentos", transversal: true, noHub: false },
  { id: "investimentos-backoffice", nome: "Backoffice", tipo: "departamento", parentId: "investimentos", transversal: true, noHub: false },

  /* ── Onix Educação ────────────────────────────────────────────────────── */
  {
    id: "educacao",
    nome: "Onix Educação",
    tipo: "empresa",
    parentId: RAIZ_DO_GRUPO,
    noHub: true,
    nota:
      "Volta a ser EMPRESA. Tinha saído da lista canônica como \"produto, não " +
      "PJ\" (Meu Sucesso Patrimonial); a estrutura declarada nesta PR a traz " +
      "de volta como pessoa jurídica com Qualidade própria. O rótulo também " +
      "muda: `nos.ts` dizia \"Onix Educacional\".",
  },
  {
    id: "educacao-qualidade",
    nome: "Qualidade e Pós-venda",
    tipo: "departamento",
    parentId: "educacao",
    transversal: true,
    noHub: false,
  },

  { id: "educacao-adm", nome: "ADM/Financeiro", tipo: "departamento", parentId: "educacao", transversal: true, noHub: false },
  { id: "educacao-juridico", nome: "Jurídico", tipo: "departamento", parentId: "educacao", transversal: true, noHub: false },
  { id: "educacao-compliance", nome: "Compliance", tipo: "departamento", parentId: "educacao", transversal: true, noHub: false },
  { id: "educacao-backoffice", nome: "Backoffice", tipo: "departamento", parentId: "educacao", transversal: true, noHub: false },

  /* ── Onix Corretora ───────────────────────────────────────────────────── */
  { id: "corretora", nome: "Onix Corretora", tipo: "empresa", parentId: RAIZ_DO_GRUPO, noHub: true },
  {
    id: "planejamento",
    nome: "Planejamento Patrimonial",
    tipo: "departamento",
    parentId: "corretora",
    noHub: false,
    nota:
      "Já era departamento por escrito; o que muda é ONDE ele pendura — a nota " +
      "anterior dizia \"dentro da Onix Capital\", e a estrutura declarada nesta " +
      "PR o põe na Corretora. Mantém id, rota (`src/app/empresas/planejamento/`) " +
      "e link de sidebar.",
  },
  {
    id: "corretora-corretora",
    nome: "Onix Corretora",
    tipo: "departamento",
    parentId: "corretora",
    noHub: false,
    nota:
      "Rótulo IGUAL ao da empresa que o contém, id diferente — intencional. É " +
      "o departamento operacional dentro da PJ de mesmo nome; a empresa é " +
      "`corretora`, o departamento é `corretora-corretora`.",
  },
  {
    id: "corporate",
    nome: "Onix Corporate",
    tipo: "departamento",
    parentId: "corretora",
    noHub: true,
    nota:
      "DEIXA DE SER EMPRESA e passa a departamento da Corretora. O id fica: " +
      "`Implementacao.empresaId` tem linhas em produção com `corporate`, e a " +
      "rota `/empresas/corporate` continua respondendo. Segue orbitando o hub " +
      "— orbitar é decisão visual, não societária.",
  },
  {
    id: "corretora-qualidade",
    nome: "Qualidade e Pós-venda",
    tipo: "departamento",
    parentId: "corretora",
    transversal: true,
    noHub: false,
  },

  { id: "corretora-adm", nome: "ADM/Financeiro", tipo: "departamento", parentId: "corretora", transversal: true, noHub: false },
  { id: "corretora-juridico", nome: "Jurídico", tipo: "departamento", parentId: "corretora", transversal: true, noHub: false },
  { id: "corretora-compliance", nome: "Compliance", tipo: "departamento", parentId: "corretora", transversal: true, noHub: false },
  { id: "corretora-backoffice", nome: "Backoffice", tipo: "departamento", parentId: "corretora", transversal: true, noHub: false },

  /* ── Onix Imob ────────────────────────────────────────────────────────── */
  {
    id: "imobiliaria",
    nome: "Onix Imob",
    tipo: "empresa",
    parentId: RAIZ_DO_GRUPO,
    noHub: true,
    nota:
      "O rótulo volta a \"Onix Imob\", como está na estrutura declarada e como " +
      "`nos.ts` sempre mostrou no hub. O catálogo tinha \"Onix Imobiliária\" " +
      "desde a PR-B4 — era a única divergência de nome entre catálogo e hub, e " +
      "ela some aqui.",
  },
  {
    id: "imobiliaria-qualidade",
    nome: "Qualidade e Pós-venda",
    tipo: "departamento",
    parentId: "imobiliaria",
    transversal: true,
    noHub: false,
  },

  { id: "imobiliaria-adm", nome: "ADM/Financeiro", tipo: "departamento", parentId: "imobiliaria", transversal: true, noHub: false },
  { id: "imobiliaria-juridico", nome: "Jurídico", tipo: "departamento", parentId: "imobiliaria", transversal: true, noHub: false },
  { id: "imobiliaria-compliance", nome: "Compliance", tipo: "departamento", parentId: "imobiliaria", transversal: true, noHub: false },
  { id: "imobiliaria-backoffice", nome: "Backoffice", tipo: "departamento", parentId: "imobiliaria", transversal: true, noHub: false },

  /* ── Onix Contábil ────────────────────────────────────────────────────── */
  {
    id: "contabil",
    nome: "Onix Contábil",
    tipo: "empresa",
    parentId: RAIZ_DO_GRUPO,
    noHub: true,
    nota:
      "Passa a EXISTIR na estrutura. A nota anterior dizia \"não existe " +
      "juridicamente, estava anunciada no hub como protótipo aprovado\" — a " +
      "estrutura declarada nesta PR a registra como empresa do grupo, com " +
      "Qualidade própria.",
  },
  {
    id: "contabil-qualidade",
    nome: "Qualidade e Pós-venda",
    tipo: "departamento",
    parentId: "contabil",
    transversal: true,
    noHub: false,
  },

  { id: "contabil-adm", nome: "ADM/Financeiro", tipo: "departamento", parentId: "contabil", transversal: true, noHub: false },
  { id: "contabil-juridico", nome: "Jurídico", tipo: "departamento", parentId: "contabil", transversal: true, noHub: false },
  { id: "contabil-compliance", nome: "Compliance", tipo: "departamento", parentId: "contabil", transversal: true, noHub: false },
  { id: "contabil-backoffice", nome: "Backoffice", tipo: "departamento", parentId: "contabil", transversal: true, noHub: false },

  /* ── Onix Tech ────────────────────────────────────────────────────────── */
  { id: "tech", nome: "Onix Tech", tipo: "empresa", parentId: RAIZ_DO_GRUPO, noHub: true },
  {
    id: "tech-qualidade",
    nome: "Qualidade e Pós-venda",
    tipo: "departamento",
    parentId: "tech",
    transversal: true,
    noHub: false,
  },
  { id: "tech-adm", nome: "ADM/Financeiro", tipo: "departamento", parentId: "tech", transversal: true, noHub: false },
  { id: "tech-juridico", nome: "Jurídico", tipo: "departamento", parentId: "tech", transversal: true, noHub: false },
  { id: "tech-compliance", nome: "Compliance", tipo: "departamento", parentId: "tech", transversal: true, noHub: false },
  { id: "tech-backoffice", nome: "Backoffice", tipo: "departamento", parentId: "tech", transversal: true, noHub: false },
] as const;

/**
 * Departamentos cujo id NÃO segue `<id do pai>-<apelido>`, e por quê.
 *
 * Os três já existiam como slug antes de virarem departamento — em
 * `empresas-config.ts`, em `NOS_ECOSSISTEMA` e, no caso de `corporate`, em
 * `Implementacao.empresaId` com linhas gravadas em produção. Renomear o id
 * seria trocar a identidade para arrumar a aparência.
 *
 * A lista existe para o teste poder recusar um QUARTO caso: id fora da
 * convenção que apareça sem passar por aqui é descuido, não legado.
 */
export const IDS_LEGADOS: readonly string[] = ["agro", "corporate", "planejamento"] as const;

/** Índice id→nó, para as buscas não serem O(n) dentro de laço. */
const PorId = new Map(CATALOGO_EMPRESAS.map((e) => [e.id, e]));

export function empresaDoGrupo(id: string): NoDoGrupo | undefined {
  return PorId.get(id);
}

/**
 * A árvore no formato que a régua de `hierarquia.ts` consome.
 *
 * É por aqui que o teste valida os 20 nós contra `validarArvoreCompleta` —
 * o catálogo não é só uma lista, é a árvore que vai para o banco.
 */
export function arvoreDoCatalogo(): NoTipado[] {
  return CATALOGO_EMPRESAS.map((e) => ({ id: e.id, parentId: e.parentId, tipo: e.tipo }));
}

/**
 * Quem vira linha em `Empresa`: TODOS os nós.
 *
 * O nome ficou de quando havia o eixo `cadastrada` e nem todo nó era semeado.
 * A distinção acabou nesta PR — a estrutura declarada é o cadastro — mas a
 * função continua existindo porque é ela que os consumidores chamam, e porque
 * "quem é semeado" segue sendo uma pergunta legítima a fazer ao catálogo.
 */
export function empresasCadastradas(): NoDoGrupo[] {
  return [...CATALOGO_EMPRESAS];
}

/** Só os ids de `empresasCadastradas()`. */
export function idsCadastradas(): string[] {
  return CATALOGO_EMPRESAS.map((e) => e.id);
}

/** Quem orbita no hub. Travado contra `NOS_ECOSSISTEMA` por teste. */
export function idsNoHub(): string[] {
  return CATALOGO_EMPRESAS.filter((e) => e.noHub).map((e) => e.id);
}

/** Os nós por papel. */
export function idsPorTipo(tipo: TipoNo): string[] {
  return CATALOGO_EMPRESAS.filter((e) => e.tipo === tipo).map((e) => e.id);
}

/**
 * As ocorrências de uma função transversal — hoje as 6 "Qualidade e Pós-venda".
 *
 * É a consulta cruzada que a flag existe para permitir: o RBAC continua
 * concedendo acesso por `empresaId` (uma Qualidade por vez), e quem precisa
 * falar da função inteira pergunta aqui em vez de casar por nome.
 */
export function idsTransversais(): string[] {
  return CATALOGO_EMPRESAS.filter((e) => e.transversal).map((e) => e.id);
}

/**
 * Quem pendura direto na holding: as 6 empresas + os 2 departamentos dela.
 *
 * É o alvo do reparenting (`reparent.ts` confere a própria lista contra esta).
 * NÃO é mais "todo mundo menos a raiz": com 3 níveis, `agro` e as Qualidades
 * penduram nas empresas, e movê-las para a raiz seria desfazer a estrutura.
 */
export function idsFilhasDaRaiz(): string[] {
  return CATALOGO_EMPRESAS.filter((e) => e.parentId === RAIZ_DO_GRUPO).map((e) => e.id);
}

/** Os filhos diretos de um nó, na ordem do catálogo. */
export function filhosDe(id: string): NoDoGrupo[] {
  return CATALOGO_EMPRESAS.filter((e) => e.parentId === id);
}

/* ── DIVERGÊNCIAS ENTRE CADASTRO E HUB ───────────────────────────────────── */

/** As quatro caixas do catálogo, já separadas. */
export type Divergencias = {
  /** No hub e no cadastro — o caso saudável. */
  nosDois: string[];
  /**
   * Anunciada no hub, ausente do cadastro: o RBAC não a enxergaria.
   *
   * Caixa PROVADAMENTE VAZIA desde esta PR — todo nó do catálogo é semeado, e
   * `catalogo.test.ts` trava `NOS_ECOSSISTEMA` contra `idsNoHub()`, que só
   * devolve ids do catálogo. Ela continua declarada porque
   * `/api/configuracoes/permissoes/auditoria` a lê como
   * `anunciadasSemCadastro`, e porque é o estado que a PR encerrou: uma caixa
   * vazia com nome é mais legível que a ausência da caixa.
   */
  soNoHub: string[];
  /** Cadastrado e fora do hub: acesso funciona, descoberta pela tela inicial não. */
  soNoCadastro: string[];
  /** Em NENHUM dos dois eixos. Vazia pelo mesmo motivo de `soNoHub`. */
  foraDosDois: string[];
};

/**
 * Divide o catálogo nas quatro caixas. Usado pelo teste e pela auditoria de
 * permissões (`/api/configuracoes/permissoes/auditoria`), que precisa dizer
 * ao admin POR QUE uma empresa concedida não aparece na tela inicial.
 *
 * Com o fim do eixo `cadastrada`, "estar no cadastro" virou "estar no
 * catálogo" — sempre verdadeiro aqui dentro. Sobram duas caixas com ocupante:
 * `nosDois` e `soNoCadastro`.
 */
export function divergencias(): Divergencias {
  return {
    nosDois: CATALOGO_EMPRESAS.filter((e) => e.noHub).map((e) => e.id),
    soNoHub: [],
    soNoCadastro: CATALOGO_EMPRESAS.filter((e) => !e.noHub).map((e) => e.id),
    foraDosDois: [],
  };
}
