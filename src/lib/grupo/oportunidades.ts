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
 * separado. Ele tem DUAS causas, distinguidas por `motivoNaoRastreado`: a
 * empresa que o grupo ainda não mede (`sem-fonte`) e o produto que ele mede
 * cujo valor chegou ilegível (`quantidade-invalida`). São coisas diferentes, e
 * a tela precisa poder separá-las.
 *
 * Quando a Imobiliária ganhar sua tabela, rastrear passa a ser DUAS coisas:
 * virar `rastreada: true` no catálogo E o chamador passar a preencher a posse
 * daquela oferta. As duas, sempre — virar só a chave faria o módulo afirmar
 * que ninguém tem imóvel, que é a mentira que ele existe para impedir.
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

/** Por que uma chave de posse não entrou na conta. Ver `naoComputado`. */
export type MotivoNaoComputado = "fora-do-catalogo" | "quantidade-invalida";

export type OfertaAvaliada = OfertaDoGrupo & {
  readonly situacao: Situacao;
  /**
   * Por que a oferta caiu em `nao_rastreado`. Ausente nas demais situações.
   *
   * O balde passou a misturar duas coisas incomparáveis: a empresa que o grupo
   * ainda não mede (`sem-fonte`) e o produto que ele MEDE, cujo valor chegou
   * ilegível (`quantidade-invalida`). Sem este campo, a tela rotularia "ainda
   * não medimos isto" um produto da Corretora — e só conseguiria separá-los
   * cruzando com `naoComputado` por id.
   */
  readonly motivoNaoRastreado?: MotivoNaoComputado | "sem-fonte";
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
 * ── POR QUE UM MAPA, E NÃO UM CAMPO POR EMPRESA ──────────────────────────
 * A primeira versão tinha `produtosCorretora: string[]` e
 * `temContaInvestimentos: boolean`. Parecia inofensivo e destruía a premissa
 * do módulo: com campos nomeados por empresa, não havia como informar posse de
 * uma oferta da Imobiliária. Consequência — bastava trocar `rastreada: false`
 * por `true` no catálogo para o sistema AFIRMAR que a pessoa não tem o imóvel
 * que ela comprou pela Onix Imob. O caminho de migração que o cabeçalho
 * promete produzia exatamente a mentira que o módulo existe para impedir.
 *
 * Agora a posse é `ofertaId → quantidade`, e o módulo não conhece empresa
 * nenhuma. Rastrear a Imobiliária passa a ser: virar a chave no catálogo E
 * passar a preencher o mapa. As duas coisas, e é assim que tem de ser — a
 * segunda é justamente o que faltava.
 */
export type PossePessoa = {
  /**
   * `ofertaId → quantidade`. Ausente e zero significam a MESMA coisa aqui
   * ("não possui"), e quem não sabe não deve chamar: para isso existe
   * `rastreada: false` no catálogo.
   *
   * A quantidade importa: duas apólices de auto são dois carros, e isso muda
   * a conversa.
   */
  readonly posse: Readonly<Record<string, number>>;
  /**
   * Saldo da conta de investimentos, quando houver. Só entra no `destaque` —
   * nenhuma decisão de classificação deste módulo depende dele.
   */
  readonly saldoInvestimentos: number | null;
};

/** A oferta que representa a conta de Investimentos no catálogo do grupo. */
export const OFERTA_CONTA_INVESTIMENTOS = "conta-investimentos";

export type ResultadoOportunidades = {
  readonly possui: readonly OfertaAvaliada[];
  readonly lacunas: readonly OfertaAvaliada[];
  readonly naoRastreado: readonly OfertaAvaliada[];
  /**
   * Posse que a tela precisa mostrar como NÃO COMPUTADA, com o motivo.
   *
   * Duas famílias, e nenhuma delas pode virar lacuna em silêncio:
   *
   * `fora-do-catalogo` — `catalogo-produtos.ts` registra que quatro ids foram
   * APOSENTADOS em ago/2026 (`auto_residencial`, `consorcio`,
   * `fianca_rc_profissional`, `saude_odonto`). Um contrato antigo com um desses
   * sumiria de `possui` E faria as famílias que o substituíram aparecerem como
   * lacuna — duas afirmações erradas de uma vez, sem nada na tela dizendo que
   * houve um contrato.
   *
   * `quantidade-invalida` — o valor chegou num tipo que não dá para contar.
   * BigInt é o caso real: `COUNT(*)` do Postgres chega assim neste repositório.
   */
  readonly naoComputado: readonly {
    readonly id: string;
    readonly motivo: MotivoNaoComputado;
  }[];
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
  const invalidas: { id: string; motivo: MotivoNaoComputado }[] = [];

  // Dedup por id. Catálogo com id repetido — dois consumidores declarando a
  // mesma oferta — faria a mesma linha aparecer duas vezes na tela, com o
  // total inflado. A primeira declaração vence, e a segunda é ignorada em
  // silêncio: erro de catálogo não pode derrubar a ficha de um cliente.
  //
  // Qual delas vence deixou de importar para a correção do resultado, porque
  // `rastreada` passou a governar SÓ a negativa — ver abaixo.
  const vistos = new Set<string>();
  const unicas = catalogo.filter((o) => (vistos.has(o.id) ? false : (vistos.add(o.id), true)));

  const avaliadas: OfertaAvaliada[] = unicas.map((oferta) => {
    const q = quantidadeDe(posse.posse, oferta.id, invalidas);

    // Quantidade que não dá para contar suprime a NEGATIVA. É a mesma régua do
    // módulo aplicada ao valor e não ao catálogo: se o número chegou num tipo
    // que não sabemos ler, não sabemos se a pessoa tem — e "não sabemos" não
    // pode virar "não tem". Reportar em `naoComputado` E afirmar lacuna seria
    // dizer as duas coisas ao mesmo tempo.
    if (q === INVALIDA) {
      return {
        ...oferta,
        situacao: "nao_rastreado" as const,
        quantidade: 0,
        motivoNaoRastreado: "quantidade-invalida" as const,
      };
    }

    // ── A REGRA, e ela é assimétrica de propósito ───────────────────────
    // Posse informada é CONHECIMENTO: se o chamador diz que a pessoa tem
    // duas apólices, ela tem duas apólices, e nenhum campo de catálogo
    // desmente isso. `rastreada` governa apenas a NEGATIVA — ela responde
    // "dá para afirmar que NÃO tem?", não "dá para saber se tem".
    //
    // A primeira versão fazia `rastreada` decidir os dois lados, e por isso
    // uma oferta marcada como não rastreada engolia a posse informada. A
    // assimetria é o que faz "ausência de dado" nunca virar "ausência de
    // produto", sem custar a informação positiva que alguém já tinha.
    if (q > 0) return { ...oferta, situacao: "possui" as const, quantidade: q };
    if (oferta.rastreada !== true) {
      // `!== true` e não `!oferta.rastreada`: o catálogo pode chegar de JSON,
      // e ali `"false"` é uma string TRUTHY.
      return {
        ...oferta,
        situacao: "nao_rastreado" as const,
        quantidade: 0,
        motivoNaoRastreado: "sem-fonte" as const,
      };
    }
    return { ...oferta, situacao: "nao_possui" as const, quantidade: 0 };
  });

  // Chave de posse que o catálogo não conhece — produto aposentado, por
  // exemplo. Ver `naoComputado`.
  for (const [id, bruta] of Object.entries(posse.posse)) {
    if (vistos.has(id)) continue;
    if (ehChaveDePrototipo(id)) continue;
    if (ehQuantidade(bruta) && bruta > 0) {
      invalidas.push({ id, motivo: "fora-do-catalogo" });
    } else if (!ehQuantidade(bruta)) {
      invalidas.push({ id, motivo: "quantidade-invalida" });
    }
    // Chave desconhecida com quantidade ZERO não é notícia: é o chamador
    // dizendo que a pessoa não tem algo que o catálogo também não conhece.
  }

  return {
    possui: avaliadas.filter((o) => o.situacao === "possui"),
    lacunas: avaliadas.filter((o) => o.situacao === "nao_possui"),
    naoRastreado: avaliadas.filter((o) => o.situacao === "nao_rastreado"),
    naoComputado: invalidas,
    destaque: montarDestaque(posse, avaliadas),
  };
}

/**
 * A chave da posse é herdada de `Object.prototype`?
 *
 * REGRA, e não lista, porque a lista pegava três nomes e o problema é a classe
 * inteira: `toString`, `valueOf`, `hasOwnProperty` e `__defineGetter__` vindos
 * de `JSON.parse` continuavam virando linha "produto fora do catálogo" na tela
 * do atendente. Filtro que pega três tickers e não a regra deixa o resto
 * passar.
 *
 * Não é proteção de segurança — `ehQuantidade` já cobre o lado da leitura, e a
 * posse nunca é alvo de atribuição. É higiene de tela: ninguém explica
 * "toString: produto fora do catálogo" para quem vai ligar para o cliente.
 *
 * Vale só para a POSSE, que vem de dado. Id de catálogo é declaração
 * deliberada de quem escreveu o catálogo, e recusá-lo esconderia um erro em
 * vez de mostrá-lo.
 */
function ehChaveDePrototipo(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(Object.prototype, id);
}

/** Quantidade utilizável: inteiro finito não negativo. */
function ehQuantidade(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

/**
 * A situação da conta de investimentos, pela MESMA régua do cálculo.
 *
 * Existe porque a frase e o cálculo liam a mesma informação por caminhos
 * diferentes, com predicados diferentes — `Number.isFinite` de um lado,
 * `ehQuantidade` do outro —, e divergiam em `1.5` e em todo tipo ilegível.
 * Dois predicados para o mesmo fato é como o módulo passou a dizer duas coisas
 * contraditórias no mesmo retorno.
 *
 * Independe do CATÁLOGO de propósito: catálogo é a régua do que dá para
 * afirmar sobre ausência; quem tem a informação de posse é o chamador. Derivar
 * isto de `avaliadas` fazia o módulo negar a conta quando a oferta estivesse
 * fora do catálogo injetado, recebendo o saldo no mesmo argumento.
 */
type SituacaoConta = "possui" | "nao_possui" | "ilegivel";

function situacaoDaConta(posse: Readonly<Record<string, number>>): SituacaoConta {
  const bruta: unknown = posse[OFERTA_CONTA_INVESTIMENTOS];
  if (bruta === undefined) return "nao_possui";
  if (!ehQuantidade(bruta)) return "ilegivel";
  return bruta > 0 ? "possui" : "nao_possui";
}

/**
 * Sentinela para "veio um valor e não dá para contá-lo".
 *
 * `-1` e não `null`: o retorno é `number` e o chamador compara com `> 0`, então
 * um sentinela negativo nunca é confundido com posse. E é constante nomeada, e
 * não `-1` solto, porque o dia em que alguém ler `if (q === -1)` sem contexto é
 * o dia em que a regra volta a se perder.
 */
const INVALIDA = -1;

/**
 * Lê a quantidade de uma oferta, reportando o que não der para usar.
 *
 * O valor NÃO utilizável não pode virar lacuna em silêncio, e é aqui que isso
 * quase aconteceu: `COUNT(*)` do Postgres chega como BigInt neste repositório
 * — é assim que `radar-renovacoes.ts` já lê contrato. O primeiro chamador que
 * montar a posse com `GROUP BY … COUNT(*)` num `$queryRaw` entregaria
 * `{auto: 2n}`, e uma guarda de `typeof === "number"` transformaria o cliente
 * com duas apólices numa lacuna de auto. Silenciosamente, e na direção que
 * afirma.
 *
 * Fracionário também cai aqui: "Auto (1,5)" na tela não é contagem de apólice,
 * é sintoma de que o chamador somou a coisa errada.
 */
function quantidadeDe(
  posse: Readonly<Record<string, number>>,
  id: string,
  invalidas: { id: string; motivo: MotivoNaoComputado }[],
): number {
  const bruta: unknown = posse[id];
  if (bruta === undefined) return 0;
  if (ehQuantidade(bruta)) return bruta;
  invalidas.push({ id, motivo: "quantidade-invalida" });
  return INVALIDA;
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
  const conta = situacaoDaConta(posse.posse);
  const temConta = conta === "possui";

  if (temConta) {
    const s = posse.saldoInvestimentos;
    // `Number.isFinite` além do `> 0`: `Infinity` imprimiria "R$ ∞ investidos".
    const valor = s !== null && Number.isFinite(s) && s > 0 ? reais(s) : null;
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
  // A NEGATIVA precisa das DUAS metades da assimetria, e essa é a lição que
  // custou quatro rodadas:
  //
  //   • a posse governa o positivo — o chamador informou, então a pessoa tem, e
  //     nenhum campo de catálogo desmente;
  //   • o CATÁLOGO governa a negativa — só dá para afirmar ausência de uma
  //     oferta que o grupo consegue medir.
  //
  // `situacaoDaConta` aplica só a primeira metade, de propósito. Usá-la sozinha
  // aqui estendia à negativa uma regra escrita para o positivo: com a conta
  // marcada `rastreada: false`, o mesmo retorno dizia "não dá para afirmar
  // sobre a conta" em `naoRastreado` e "ela não tem conta" na frase.
  //
  // Não é hipótese de catálogo injetado: no dia em que a integração com o BTG
  // sair do ar, `rastreada: false` na conta é o caminho NORMAL — e é justamente
  // o dia em que ninguém pode afirmar que o cliente não tem conta.
  const podeNegarAConta = avaliadas.some(
    (o) => o.id === OFERTA_CONTA_INVESTIMENTOS && o.situacao === "nao_possui",
  );

  if (temAlgumSeguro && podeNegarAConta) {
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
  // TODA frase é qualificada com "pela Onix". O módulo só enxerga contratos em
  // vigor da Onix Corretora — dizer "nenhum seguro de vida", sem qualificar,
  // afirma sobre o mercado inteiro. O atendente leria em voz alta que o cliente
  // não tem seguro de vida, o cliente responderia que tem na concorrência, e a
  // conversa acabaria na primeira frase.
  ["vida", "nenhum seguro de vida pela Onix"],
  ["saude", "nenhum plano de saúde pela Onix"],
  ["dit", "nenhuma proteção de renda por afastamento pela Onix"],
];
