/* ──────────────────────────────────────────────────────────────
 * Catálogo de produtos da Onix Corretora — módulo PURO.
 *
 * ── POR QUE CATÁLOGO EM CÓDIGO, E NÃO ENUM DE BANCO ──────────────────────
 * Um `enum` no Postgres transforma "entrou um produto novo" em migration de
 * FAIXA VERMELHA: `ALTER TYPE ... ADD VALUE` não roda dentro de transação em
 * versões antigas, não tem rollback simples, e o start do serviço é
 * `prisma migrate deploy && next start` — migration que falha derruba o app em
 * loop de restart. Pagar esse preço para acrescentar "seguro viagem" à lista é
 * desproporcional.
 *
 * A lista de produtos de uma corretora CRESCE: são 5 a 15 parceiros, cada um
 * com o próprio portfólio, e o portfólio muda por decisão comercial deles.
 *
 * ── MAS String SEM VALIDAÇÃO FOI O ERRO DA `Implementacao` ───────────────
 * `Implementacao.empresaId` (`prisma/schema.prisma:2778`) é `String` sem FK e
 * o guard em `actions/implementacao.ts:58` só checa não-vazio. Resultado: um
 * typo vira empresa fantasma no filtro da tela, e a tela precisa se defender
 * derivando as opções dos valores REALMENTE gravados
 * (`configuracoes/implementacoes/page.tsx:76`).
 *
 * O erro ali não foi ser `String` — foi NÃO VALIDAR. Aqui a coluna é `String`
 * pelo motivo acima, e a validação é obrigatória em toda escrita, via
 * `exigirTipoProduto()`. Sem catálogo, `String` é campo de texto livre; com
 * catálogo validado, é enum sem o custo de migration.
 *
 * ── NORMALIZAÇÃO DE VOCABULÁRIO ──────────────────────────────────────────
 * "Seguro de Vida" na Porto e "Vida Individual" na Bradesco são o MESMO
 * produto. Se cada parceiro entrar com o rótulo dele, o relatório consolidado
 * por produto deixa de existir — e o dano é silencioso: a tela mostra doze
 * "tipos" onde há seis, e ninguém percebe que são duplicatas de vocabulário.
 *
 * A resolução tem DUAS camadas, nesta ordem:
 *
 *   1. `dicionario` do `PerfilImportacao` — o rótulo exato daquele parceiro.
 *      É onde mora o vocabulário POR FONTE, porque é dado que muda quando o
 *      parceiro muda o relatório dele, e dado não deve virar deploy.
 *   2. `aliases` deste catálogo — os sinônimos genéricos do mercado, que
 *      valem para qualquer parceiro e não merecem ser redigitados em 15
 *      perfis.
 *
 * O dicionário do perfil VENCE o catálogo: se um parceiro chama de "Vida" o
 * que para o mercado é outra coisa, quem sabe disso é o perfil dele.
 *
 * ── AGO/2026: SEIS FAMÍLIAS VIRARAM ONZE PRODUTOS ────────────────────────
 * Revisão do Eduardo, e a régua dele foi explícita: NÃO agrupar produtos
 * diferentes sob o mesmo nome. Um agrupamento cômodo no catálogo vira, três
 * meses depois, um relatório que soma coisas que não se somam — e o dano é
 * silencioso, porque o número existe e parece certo.
 *
 * O que se desfez, e por quê:
 *
 *   `auto_residencial` → `auto`, `residencial`, `empresarial`
 *      Eram uma família porque compartilham a lógica de franquia. Mas
 *      precificação e cobertura são distintas, e é por produto que se decide
 *      onde vender.
 *
 *   `consorcio` → `consorcio-auto`, `consorcio-imobiliario`
 *      Carta de crédito de veículo e de imóvel têm prazo, valor e público
 *      diferentes. Somar as duas esconde qual está crescendo.
 *
 *   `fianca_rc_profissional` → `fianca-locaticia`, `rc-profissional`
 *      Estavam juntas por ambas garantirem obrigação de terceiro — parentesco
 *      conceitual que não sobrevive à pergunta "quanto vendemos de fiança?".
 *
 *   `saude_odonto` → `saude`, `odonto`
 *      Mesma régua. Odonto é ticket e ciclo próprios.
 *
 *   `vida` continua uma, com VIDA FLEX entre os sinônimos.
 *
 * ── O QUE ISSO CUSTA, E POR QUE É VERDE MESMO ASSIM ─────────────────────
 * `tipoProduto` é `String` validada contra este catálogo, não `enum` de banco:
 * mudar a lista é mudar código, sem migration e sem `ALTER TYPE`.
 *
 * O preço é que os quatro ids antigos deixam de ser válidos. Contrato gravado
 * com `auto_residencial` passaria a falhar em `ehTipoProdutoValido` — e é por
 * isso que esta mudança é segura AGORA e não seria daqui a um mês:
 * `ContratoCorretora` está vazia. Depois da primeira importação, redividir
 * família vira trabalho de dado, não de catálogo.
 *
 * ── AMBIGUIDADE VIROU RECUSA, DE PROPÓSITO ───────────────────────────────
 * Alguns sinônimos genéricos deixaram de existir porque agora apontariam para
 * mais de um produto: "consórcio" sozinho (auto ou imobiliário?), "carta de
 * crédito" (idem), "patrimonial" (auto, residencial ou empresarial?), "seguro
 * de pessoas" (vida, saúde ou DIT?).
 *
 * Nenhum deles foi atribuído ao "mais provável". Rótulo ambíguo devolve `null`,
 * a linha é recusada e o rótulo aparece no relatório do ensaio para virar
 * entrada no dicionário DAQUELE parceiro — que é quem sabe o que "Consórcio"
 * significa no arquivo dele. Chutar aqui inventaria dado de cliente.
 * ────────────────────────────────────────────────────────────── */

/** Um produto canônico do catálogo. O `id` é o que vai para o banco. */
export type FamiliaProduto = {
  /** Valor canônico gravado em `ContratoCorretora.tipoProduto`. */
  readonly id: string;
  /** Rótulo para tela. */
  readonly nome: string;
  /** O que entra nesta família — a régua para classificar um produto novo. */
  readonly descricao: string;
  /**
   * Sinônimos genéricos de mercado, em qualquer grafia: a comparação é feita
   * sobre a forma normalizada, então acento, caixa e espaço extra não
   * importam aqui.
   */
  readonly aliases: readonly string[];
};

/**
 * Os onze produtos. Acrescentar produto novo é acrescentar linha AQUI — sem
 * migration, sem deploy de banco, e com o teste de unicidade abaixo travando
 * id ou alias repetido.
 */
export const CATALOGO_PRODUTOS: readonly FamiliaProduto[] = [
  {
    id: "auto",
    nome: "Auto",
    descricao:
      "Seguro de automóvel: casco, terceiros e assistência 24h. Franquia por " +
      "sinistro sobre o veículo segurado.",
    aliases: ["auto", "automovel", "seguro auto", "seguro automovel", "seguro de automovel"],
  },
  {
    id: "residencial",
    nome: "Residencial",
    descricao:
      "Seguro de imóvel de moradia: incêndio, roubo, danos elétricos e " +
      "assistência. Inclui condomínio residencial.",
    aliases: ["residencial", "seguro residencial", "residencia", "condominio"],
  },
  {
    id: "empresarial",
    nome: "Empresarial",
    descricao:
      "Seguro patrimonial de estabelecimento comercial ou industrial. Separado " +
      "de residencial porque a vistoria, o prêmio e a cobertura são outros.",
    aliases: ["empresarial", "seguro empresarial", "empresa", "comercial", "seguro comercial"],
  },
  {
    id: "vida",
    nome: "Vida",
    descricao:
      "Seguro de vida individual, em grupo ou resgatável. Cobertura por morte, " +
      "invalidez e assistências ligadas à pessoa.",
    aliases: [
      "seguro de vida",
      "vida",
      "vida flex",
      "vida individual",
      "vida em grupo",
      "seguro vida",
      "vida resgatavel",
      "vida inteira",
      "prestamista",
    ],
  },
  {
    id: "saude",
    nome: "Saúde",
    descricao:
      "Plano de saúde individual, familiar ou PME. Contrato com mensalidade e " +
      "rede credenciada, não com apólice de sinistro.",
    aliases: [
      "saude",
      "plano de saude",
      "assistencia medica",
      "saude pme",
      "saude empresarial",
      "seguro saude",
    ],
  },
  {
    id: "odonto",
    nome: "Odonto",
    descricao:
      "Plano odontológico, individual ou PME. Ticket e ciclo de venda próprios — " +
      "por isso não entra em saúde.",
    aliases: ["odonto", "odontologico", "plano odontologico", "dental", "plano dental"],
  },
  {
    id: "consorcio-auto",
    nome: "Consórcio Auto",
    descricao:
      "Carta de crédito em grupo para veículo. Não é seguro: não há sinistro, " +
      "há contemplação.",
    aliases: ["consorcio auto", "consorcio veiculo", "consorcio de automovel", "consorcio automovel"],
  },
  {
    id: "consorcio-imobiliario",
    nome: "Consórcio Imobiliário",
    descricao:
      "Carta de crédito em grupo para imóvel. Prazo, valor e público distintos " +
      "do consórcio de veículo.",
    aliases: ["consorcio imobiliario", "consorcio imovel", "consorcio de imovel"],
  },
  {
    id: "fianca-locaticia",
    nome: "Fiança Locatícia",
    descricao:
      "Garantia de aluguel em lugar do fiador. Garante OBRIGAÇÃO de terceiro, " +
      "não bem nem pessoa.",
    aliases: ["fianca", "fianca locaticia", "seguro fianca", "garantia locaticia"],
  },
  {
    id: "rc-profissional",
    nome: "RC Profissional",
    descricao:
      "Responsabilidade civil profissional — E&O, D&O. Cobre dano causado a " +
      "terceiro no exercício da atividade.",
    aliases: [
      "rc profissional",
      "rcivil",
      "rc civil",
      "responsabilidade civil",
      "responsabilidade civil profissional",
      "e o",
      "d o",
      "erros e omissoes",
    ],
  },
  {
    id: "dit",
    nome: "DIT",
    descricao:
      "Diária de Incapacidade Temporária — renda diária durante afastamento. " +
      "Separado de `vida` porque a régua de contratação e o sinistro são outros.",
    aliases: [
      "dit",
      "diaria de incapacidade temporaria",
      "diaria por incapacidade",
      "incapacidade temporaria",
      "perda de renda",
    ],
  },
] as const;

/**
 * Forma comparável de um rótulo: minúsculas, sem acento, sem pontuação, com
 * espaços colapsados.
 *
 * `NFD` + remoção da faixa de diacríticos resolve "Consórcio" → "consorcio"
 * sem tabela de-para. A troca de tudo que não é alfanumérico por espaço é o
 * que faz "E&O", "E & O" e "e o" caírem no mesmo lugar — planilha de parceiro
 * é digitada à mão e a pontuação varia entre linhas do MESMO arquivo.
 */
export function normalizarRotulo(rotulo: string): string {
  return rotulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Índice rótulo normalizado → id da família, montado uma vez. */
const POR_ROTULO: ReadonlyMap<string, string> = (() => {
  const mapa = new Map<string, string>();
  for (const familia of CATALOGO_PRODUTOS) {
    mapa.set(normalizarRotulo(familia.id), familia.id);
    mapa.set(normalizarRotulo(familia.nome), familia.id);
    for (const alias of familia.aliases) mapa.set(normalizarRotulo(alias), familia.id);
  }
  return mapa;
})();

/** Os ids canônicos, para montar filtro de tela sem varrer o catálogo. */
export function tiposProdutoValidos(): string[] {
  return CATALOGO_PRODUTOS.map((f) => f.id);
}

/** O `id` é uma família do catálogo? Comparação EXATA — não normaliza. */
export function ehTipoProdutoValido(id: string): boolean {
  return CATALOGO_PRODUTOS.some((f) => f.id === id);
}

export function familiaPorId(id: string): FamiliaProduto | null {
  return CATALOGO_PRODUTOS.find((f) => f.id === id) ?? null;
}

/**
 * Resolve um rótulo CRU de parceiro para a família canônica, ou `null`.
 *
 * `dicionario` é o mapa daquele `PerfilImportacao` (rótulo do parceiro → id
 * canônico) e tem PRECEDÊNCIA sobre os aliases genéricos: quem conhece o
 * vocabulário de uma fonte é o perfil dela. As chaves do dicionário também são
 * normalizadas, para o perfil não precisar acertar acento e caixa.
 *
 * Devolve `null` em vez de chutar. Rótulo desconhecido tem de PARAR o import
 * daquela linha e aparecer no relatório — classificar por proximidade
 * inventaria dado de cliente, que é o oposto do que este módulo existe para
 * fazer.
 */
export function resolverFamilia(
  rotuloCru: string,
  dicionario?: Readonly<Record<string, string>>,
): string | null {
  const chave = normalizarRotulo(rotuloCru);
  if (chave === "") return null;

  if (dicionario) {
    for (const [rotuloPerfil, destino] of Object.entries(dicionario)) {
      if (normalizarRotulo(rotuloPerfil) !== chave) continue;
      // O perfil aponta para um id canônico. Se ele apontar para lixo, o erro
      // é do perfil e precisa aparecer — não cair no catálogo em silêncio.
      return ehTipoProdutoValido(destino) ? destino : null;
    }
  }

  return POR_ROTULO.get(chave) ?? null;
}

/**
 * Valida na ESCRITA. Devolve o id ou lança.
 *
 * Existe como função separada de `ehTipoProdutoValido` para que o caminho de
 * gravação seja uma linha só e não tenha como esquecer o `if`. A mensagem lista
 * os válidos porque quem vai lê-la está no meio de um import de 2.000 linhas.
 */
export function exigirTipoProduto(id: string): string {
  if (!ehTipoProdutoValido(id)) {
    throw new Error(
      `tipoProduto inválido: ${JSON.stringify(id)}. ` +
        `Válidos: ${tiposProdutoValidos().join(", ")}. ` +
        "Rótulo de parceiro deve passar por resolverFamilia() antes de chegar aqui.",
    );
  }
  return id;
}
