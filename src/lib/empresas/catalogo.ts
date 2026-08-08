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
 *   • `scripts/seed-empresas.ts` — deriva a lista de `empresasCadastradas()`
 *   • `catalogo.test.ts`         — trava o hub contra `idsNoHub()`
 *
 * O RBAC por empresa (PR própria, em revisão à parte) apenas LÊ este arquivo e
 * acrescenta helpers derivados; ele não redeclara empresa nenhuma. O catálogo
 * mora aqui, e não lá, porque a lista de quem orbita é invariante do HUB: é
 * `catalogo.test.ts` que impede um nó nascer em `nos.ts` sem passar por aqui.
 *
 * PURO de propósito (sem prisma, sem `server-only`, sem React): é importado
 * por script Node, por teste e — via o teste — pelo lado cliente do hub.
 * ────────────────────────────────────────────────────────────── */

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
   * Consequência de estar `false`: a empresa não existe como cadastro, então
   * nada que dependa de `Empresa` a enxerga — nem hierarquia, nem qualquer
   * permissão que venha a se pendurar nela. Ausência de cadastro é ausência,
   * não negação: quem consumir isto tem de tratar os dois casos diferente.
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
export const EMPRESAS_DO_GRUPO: readonly EmpresaDoGrupo[] = [
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
  { id: "imobiliaria", nome: "Onix Imob", cadastrada: true, noHub: true },
  { id: "tech", nome: "Onix Tech", cadastrada: true, noHub: true },
  { id: "educacao", nome: "Onix Educação", cadastrada: true, noHub: true },
  {
    id: "planejamento",
    nome: "Planejamento Patrimonial",
    cadastrada: true,
    noHub: false,
    nota:
      "DIVERGÊNCIA REAL, não intencional. Tem rota que responde " +
      "(`src/app/empresas/planejamento/`), link próprio na sidebar " +
      "(`sidebar.tsx:231`) e cadastro no banco — mas ficou fora dos 8 nós do " +
      "hub. Efeito prático: quem chega pela tela inicial não vê que ela " +
      "existe, embora possa abri-la. Virar o 9º nó é decisão de produto " +
      "pendente (muda o ângulo da órbita de 45° para 40°, o que a geometria já " +
      "suporta: `posicaoOrbital` recebe o total). Enquanto não vier, fica " +
      "declarado aqui em vez de esquecido.",
  },
  {
    id: "agro",
    nome: "Onix Agro",
    cadastrada: false,
    noHub: true,
    nota:
      "ANUNCIADA, não operacional: aparece no hub (protótipo aprovado) e não " +
      "existe em lugar nenhum do sistema — sem rota, sem linha em `Empresa`. " +
      "Consequência que já vale hoje: o clique cai no 404 do Next, e por isso " +
      "ela é `maturidade: \"sem-rota\"` em `nos.ts`. Consequência para quem " +
      "vier depois: nada que dependa de `Empresa` sabe que ela existe, então " +
      "tratá-la como \"sem acesso\" seria dizer \"você não pode\" sobre algo " +
      "que ninguém pode. Pergunta aberta: é empresa que já existe " +
      "juridicamente e ainda não ganhou sistema, ou é plano? Se for a " +
      "primeira, o conserto é `cadastrada: true` aqui + rodar o seed.",
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
const PorId = new Map(EMPRESAS_DO_GRUPO.map((e) => [e.id, e]));

export function empresaDoGrupo(id: string): EmpresaDoGrupo | undefined {
  return PorId.get(id);
}

/**
 * Quem vira linha em `Empresa`. É a lista que `scripts/seed-empresas.ts`
 * insere — inclusive a raiz.
 */
export function empresasCadastradas(): EmpresaDoGrupo[] {
  return EMPRESAS_DO_GRUPO.filter((e) => e.cadastrada);
}

/** Só os ids de `empresasCadastradas()`. */
export function idsCadastradas(): string[] {
  return empresasCadastradas().map((e) => e.id);
}

/** Quem orbita no hub. Travado contra `NOS_ECOSSISTEMA` por teste. */
export function idsNoHub(): string[] {
  return EMPRESAS_DO_GRUPO.filter((e) => e.noHub).map((e) => e.id);
}
