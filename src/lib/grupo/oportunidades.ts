/**
 * O que a pessoa TEM no grupo, e o que ela NÃO tem.
 *
 * Módulo PURO: não consulta banco, não sabe de que empresa foi chamado, não
 * importa nada de `src/app`. Recebe a posse já carregada e devolve o recorte.
 *
 * ── POR QUE ISTO NÃO MORA NA CORRETORA ───────────────────────────────────
 * A aba Oportunidades vai existir em TODAS as empresas do grupo, não só na
 * Corretora — Imobiliária, Corporate e Tech consomem o mesmo cálculo. Se ele
 * nascesse dentro da tela da Corretora, a segunda empresa a precisar dele o
 * copiaria, e a partir daí duas telas responderiam diferente à mesma pergunta
 * sobre a mesma pessoa. Já vimos esse filme neste repositório.
 *
 * Por isso o módulo recebe `PossePessoa` — um dado, não um cliente Prisma — e
 * quem consulta é o chamador. É também o que torna cada regra aqui testável
 * sem banco.
 *
 * ── O EFEITO QUE ELE PRECISA PRODUZIR ────────────────────────────────────
 * O atendente abre a pessoa e vê que ela tem R$ 2 milhões no BTG e nenhum
 * seguro de vida. É leitura de carteira desbalanceada: o que chama atenção não
 * é o que está alocado, é a classe AUSENTE.
 *
 * Daí a forma do retorno. `possui` e `lacunas` lado a lado, e um `destaque`
 * que nomeia a ausência mais alta em uma frase — porque uma lista de nove
 * "não tem" não produz esse efeito, produz ruído que se aprende a ignorar.
 *
 * ── A DISTINÇÃO QUE SUSTENTA A HONESTIDADE DO MÓDULO ─────────────────────
 * "não possui" e "não sabemos" NÃO são a mesma coisa, e colapsá-los seria a
 * mentira mais fácil de cometer aqui.
 *
 * Hoje o grupo tem fonte de dado para duas coisas: os contratos da Corretora e
 * a conta de Investimentos. Imobiliária, Educação, Corporate, Tech e
 * Planejamento não têm tabela de produto por cliente — então dizer que a
 * pessoa "não tem" um imóvel pela Onix Imob seria afirmar o que ninguém
 * verificou, e o atendente ligaria oferecendo algo que o cliente já comprou.
 *
 * Por isso existe `nao_rastreado`, e por isso ele aparece na tela em bloco
 * separado. Quando a Imobiliária ganhar sua tabela, a oferta migra de
 * `nao_rastreado` para rastreada mudando UMA linha do catálogo.
 */
import { CATALOGO_PRODUTOS } from "@/lib/corretora/catalogo-produtos";

/** Uma coisa que o grupo vende, em qualquer empresa. */
export type OfertaDoGrupo = {
  /** Identidade estável da oferta. Para a Corretora, é o id do catálogo. */
  readonly id: string;
  readonly nome: string;
  /** Qual empresa do grupo entrega isto. Ids de `empresas-config.ts`. */
  readonly empresaId: string;
  /**
   * Existe fonte de dado para dizer se a pessoa TEM isto?
   *
   * `false` não é "a empresa não vende": é "ninguém consegue afirmar". A
   * diferença é a que separa uma oportunidade de uma ligação constrangedora.
   */
  readonly rastreada: boolean;
};

export type Situacao = "possui" | "nao_possui" | "nao_rastreado";

export type OfertaAvaliada = OfertaDoGrupo & {
  readonly situacao: Situacao;
  /**
   * Quantos contratos/contas sustentam o `possui`. `0` nos demais casos.
   *
   * Serve à tela: "Auto (2)" diz que há dois carros, e isso muda a conversa.
   */
  readonly quantidade: number;
};

/**
 * O catálogo do grupo.
 *
 * As onze ofertas da Corretora vêm de `CATALOGO_PRODUTOS` — não são copiadas.
 * Copiar criaria a segunda lista que ninguém lembra de atualizar, que é o
 * defeito que este repositório já pagou mais de uma vez.
 *
 * As demais empresas entram declaradas como NÃO RASTREADAS, e isso é
 * deliberado: uma oferta que existe no grupo e some deste catálogo vira lacuna
 * invisível, que é pior do que lacuna que a tela admite não saber medir.
 */
export const CATALOGO_DO_GRUPO: readonly OfertaDoGrupo[] = [
  {
    id: "conta-investimentos",
    nome: "Conta de investimentos",
    empresaId: "investimentos",
    rastreada: true,
  },
  ...CATALOGO_PRODUTOS.map((p) => ({
    id: p.id,
    nome: p.nome,
    empresaId: "corretora",
    rastreada: true,
  })),
  // As cinco abaixo existem no grupo (`empresas-config.ts`) e não têm tabela
  // de produto por cliente. Ficam aqui para a ausência ser DECLARADA em vez de
  // silenciosa — e para a migração ser uma linha quando a fonte existir.
  { id: "imovel", nome: "Imóvel", empresaId: "imobiliaria", rastreada: false },
  { id: "curso", nome: "Formação", empresaId: "educacao", rastreada: false },
  { id: "consultoria-corporate", nome: "Consultoria", empresaId: "corporate", rastreada: false },
  { id: "produto-tech", nome: "Solução de tecnologia", empresaId: "tech", rastreada: false },
  {
    id: "plano-patrimonial",
    nome: "Plano patrimonial",
    empresaId: "planejamento",
    rastreada: false,
  },
];

/**
 * O que a pessoa possui, já carregado por quem chamou.
 *
 * Tipos deliberadamente frouxos — `readonly string[]`, não entidades do
 * Prisma. É o que permite a Imobiliária chamar isto amanhã sem que este módulo
 * saiba que ela existe, e é o que faz cada teste aqui rodar sem banco.
 */
export type PossePessoa = {
  /**
   * `tipoProduto` de cada contrato EM VIGOR na Corretora. Repetido de
   * propósito: duas apólices de auto são dois carros, e a contagem conta.
   */
  readonly produtosCorretora: readonly string[];
  /** A pessoa tem conta de investimentos no grupo? */
  readonly temContaInvestimentos: boolean;
  /**
   * Saldo da conta, quando houver. Só entra no `destaque` — nenhuma decisão
   * deste módulo depende dele.
   */
  readonly saldoInvestimentos: number | null;
};

export type ResultadoOportunidades = {
  readonly possui: readonly OfertaAvaliada[];
  readonly lacunas: readonly OfertaAvaliada[];
  readonly naoRastreado: readonly OfertaAvaliada[];
  /**
   * A frase que produz o efeito. `null` quando não há o que dizer — e é
   * melhor não dizer nada do que encher a tela com uma observação óbvia.
   */
  readonly destaque: string | null;
};

/**
 * Avalia a pessoa contra o catálogo do grupo.
 *
 * A ordem de `possui` e de `lacunas` segue a do catálogo, não a alfabética nem
 * a de volume: a leitura é comparativa entre pessoas, e ordem que muda de
 * ficha para ficha obriga a reler tudo toda vez.
 */
export function calcularOportunidades(
  posse: PossePessoa,
  catalogo: readonly OfertaDoGrupo[] = CATALOGO_DO_GRUPO,
): ResultadoOportunidades {
  const contagem = new Map<string, number>();
  for (const p of posse.produtosCorretora) {
    contagem.set(p, (contagem.get(p) ?? 0) + 1);
  }

  const avaliadas: OfertaAvaliada[] = catalogo.map((oferta) => {
    if (!oferta.rastreada) {
      return { ...oferta, situacao: "nao_rastreado" as const, quantidade: 0 };
    }
    const quantidade =
      oferta.id === "conta-investimentos"
        ? posse.temContaInvestimentos
          ? 1
          : 0
        : (contagem.get(oferta.id) ?? 0);
    return {
      ...oferta,
      situacao: quantidade > 0 ? ("possui" as const) : ("nao_possui" as const),
      quantidade,
    };
  });

  return {
    possui: avaliadas.filter((o) => o.situacao === "possui"),
    lacunas: avaliadas.filter((o) => o.situacao === "nao_possui"),
    naoRastreado: avaliadas.filter((o) => o.situacao === "nao_rastreado"),
    destaque: montarDestaque(posse, avaliadas),
  };
}

/** Formata em reais sem centavos — a frase é de impacto, não de extrato. */
function reais(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/**
 * A ausência que vale ser dita em voz alta.
 *
 * Uma frase, ou nenhuma. A regra de escolha é a do desequilíbrio: patrimônio
 * na casa sem a proteção que ele pede é o que faz o atendente pegar o telefone
 * — e é literalmente o exemplo que originou esta aba ("R$ 2 milhões no BTG e
 * nenhum seguro de vida").
 *
 * `vida` vem primeiro por ser o produto cuja ausência mais destoa de
 * patrimônio acumulado. Depois `saude` e `dit`, que protegem a renda que
 * sustenta esse patrimônio. Não é ranking de margem: é a ordem em que a
 * ausência fica estranha ao lado do que a pessoa já tem.
 *
 * Sem conta de investimentos NÃO há destaque de proteção. A frase existe para
 * apontar desequilíbrio entre o que a pessoa tem e o que falta; sem o lado
 * cheio da balança, ela viraria só uma lista de produtos que ainda não foram
 * vendidos — e isso a tela já mostra em `lacunas`, sem fingir que é insight.
 */
function montarDestaque(posse: PossePessoa, avaliadas: readonly OfertaAvaliada[]): string | null {
  const falta = (id: string) => avaliadas.some((o) => o.id === id && o.situacao === "nao_possui");

  if (posse.temContaInvestimentos) {
    const valor =
      posse.saldoInvestimentos !== null && posse.saldoInvestimentos > 0
        ? reais(posse.saldoInvestimentos)
        : null;
    const patrimonio = valor ? `${valor} investidos pela Onix` : "conta de investimentos na Onix";

    for (const [id, oQueFalta] of PRIORIDADE_DE_PROTECAO) {
      if (falta(id)) return `Tem ${patrimonio} e ${oQueFalta}.`;
    }
  }

  // Sem conta de investimentos, o único desequilíbrio afirmável é o inverso:
  // a pessoa é cliente da Corretora e o grupo não administra nada dela.
  const temAlgumSeguro = avaliadas.some(
    (o) => o.empresaId === "corretora" && o.situacao === "possui",
  );
  if (temAlgumSeguro && !posse.temContaInvestimentos) {
    return "É cliente da Corretora e não tem conta de investimentos na Onix.";
  }

  return null;
}

/**
 * A ordem em que a ausência de proteção fica estranha ao lado de patrimônio.
 *
 * Lista curta e fechada de propósito: destaque que tenta cobrir os onze
 * produtos vira parágrafo, e parágrafo não é destaque.
 */
const PRIORIDADE_DE_PROTECAO: ReadonlyArray<readonly [string, string]> = [
  ["vida", "nenhum seguro de vida"],
  ["saude", "nenhum plano de saúde pela Onix"],
  ["dit", "nenhuma proteção de renda por afastamento"],
];
