/**
 * A tela de abertura da Onix Capital — parte pura.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 * O recon dos 12 itens do projeto mostrou 47 de 90 modelos já sendo de
 * estrutura interna: quase tudo que uma tela de abertura precisa JÁ existe —
 * está espalhado por cinco telas que ninguém abre na mesma ordem.
 *
 * Este módulo não calcula métrica nova. Ele AGREGA o que já é calculado em
 * outro lugar, reusando as mesmas funções e os mesmos limiares:
 *
 *   • atenção      → `classificarEstadoAtencao` + `resolverLimiarVacuoDias`
 *                    (`src/lib/painel-atencao/`), o mesmo do painel por assessor
 *   • pendências   → `derivarPendenciasGlobais` (`src/lib/cockpit-reuniao/`)
 *   • saúde        → `resumirAuditoria` (`src/lib/integracoes-auditadas.ts`)
 *
 * ── O QUE FICOU DE FORA, E POR QUÊ ───────────────────────────────────────
 * Três blocos pedidos NÃO entraram, porque cada um exigiria um limiar ou um
 * dado que hoje não existe — e limiar inventado vira métrica inventada:
 *
 *   • **variação do saldo do dia** — não há snapshot histórico de
 *     `saldoConta`. A coluna guarda só o valor de agora, e `saldoContaDesde`
 *     é "parado desde", não "valor de ontem". Sem série, não há variação.
 *     Entradas e saídas do dia entram no lugar: essas existem, em
 *     `MovimentacaoBtg.data`/`.valor`.
 *   • **saldo parado há N dias** — `saldoContaDesde` existe e a tabela de
 *     clientes já mostra "parado há Xd" POR LINHA. Contar quantos passaram de
 *     N exige escolher o N, e N não existe em lugar nenhum do código.
 *   • **suitability vencendo em N dias** — mesmo motivo. Já **vencido**
 *     entra, porque aí quem define é a data no dado, não um número que eu
 *     escolhi.
 *
 * A parte com regra fica aqui, testável sem banco; as consultas ficam na
 * página, com o cliente Prisma real e o escopo RBAC — mesma divisão de
 * `integracoes-auditadas.ts`.
 */

import type { EstadoAtencao } from "@/lib/painel-atencao/core";

/** Um cartão da seção "Precisa de atenção hoje". */
export type CartaoAtencao = {
  chave: string;
  rotulo: string;
  valor: number;
  /** Para onde o clique leva. Cartão que não leva a lugar nenhum é enfeite. */
  href: string;
  /** `true` pinta o cartão como alerta. Zero nunca é alerta. */
  alerta: boolean;
  /** Uma linha explicando o que o número quer dizer. */
  legenda: string;
};

export type EntradaAtencaoAgregada = {
  /** Totais por estado, como `getPainelAtencao` já devolve. */
  totais: Record<EstadoAtencao, number>;
  /** Limiar de vácuo em dias — vem do Config, não daqui. */
  limiarVacuoDias: number;
  pendenciasAbertas: number;
  pendenciasAtrasadas: number;
  suitabilityVencido: number;
  /** `false` quando nenhum cliente da carteira tem mensagem ingerida. */
  assessorPlugado: boolean;
};

/**
 * Monta os cartões. Ordem é decisão de leitura: o que exige ação humana
 * imediata primeiro, o que é cadastro depois.
 */
export function montarCartoes(e: EntradaAtencaoAgregada): CartaoAtencao[] {
  const cartoes: CartaoAtencao[] = [];

  // "Esquecido" e "sem contato" só significam alguma coisa se houver mensagem
  // ingerida na carteira. Sem isso, pintar todo mundo de vermelho seria falso —
  // é a mesma ressalva que `PainelAtencao.assessorPlugado` carrega.
  if (e.assessorPlugado) {
    cartoes.push({
      chave: "esquecido",
      rotulo: "Esquecidos",
      valor: e.totais.esquecido,
      href: "/empresas/investimentos/clientes?atencao=esquecido",
      alerta: e.totais.esquecido > 0,
      legenda: "Sem contato nenhum além do limiar da classe",
    });
    cartoes.push({
      chave: "no-vacuo",
      rotulo: "No vácuo",
      valor: e.totais["no-vacuo"],
      href: "/empresas/investimentos/clientes?atencao=no-vacuo",
      alerta: e.totais["no-vacuo"] > 0,
      legenda: `Você falou e o cliente não respondeu há ${e.limiarVacuoDias}+ dias`,
    });
  }

  cartoes.push({
    chave: "pendencias",
    rotulo: "Pendências abertas",
    valor: e.pendenciasAbertas,
    href: "/empresas/investimentos/pendencias",
    // O alerta é a ATRASADA, não a aberta: pendência aberta dentro do prazo é
    // trabalho combinado, não problema.
    alerta: e.pendenciasAtrasadas > 0,
    legenda:
      e.pendenciasAtrasadas > 0
        ? `${e.pendenciasAtrasadas} já passaram da data de retorno`
        : "Nenhuma passou da data de retorno",
  });

  cartoes.push({
    chave: "suitability",
    rotulo: "Suitability vencido",
    valor: e.suitabilityVencido,
    href: "/empresas/investimentos/clientes",
    alerta: e.suitabilityVencido > 0,
    legenda: "Data de validade do perfil já passou",
  });

  return cartoes;
}

/** Uma linha da seção "Números da empresa". */
export type NumeroEmpresa = {
  rotulo: string;
  valor: number;
  formato: "moeda" | "inteiro";
  legenda: string;
};

export type EntradaNumeros = {
  totalEmConta: number;
  clientesComSaldo: number;
  entradasHoje: number;
  saidasHoje: number;
  movimentacoesHoje: number;
};

export function montarNumeros(e: EntradaNumeros): NumeroEmpresa[] {
  return [
    {
      rotulo: "Total em conta",
      valor: e.totalEmConta,
      formato: "moeda",
      legenda: `Somado sobre ${e.clientesComSaldo} cliente(s) com saldo`,
    },
    {
      rotulo: "Entradas de hoje",
      valor: e.entradasHoje,
      formato: "moeda",
      legenda: `${e.movimentacoesHoje} movimentação(ões) registrada(s) hoje`,
    },
    {
      rotulo: "Saídas de hoje",
      // Guardado como positivo: o rótulo já diz que é saída, e sinal negativo
      // ao lado da palavra "saída" faz o leitor somar duas vezes.
      valor: Math.abs(e.saidasHoje),
      formato: "moeda",
      legenda: "Valor bruto, sem líquido",
    },
    {
      rotulo: "Saldo do dia",
      valor: e.entradasHoje - Math.abs(e.saidasHoje),
      formato: "moeda",
      legenda: "Entradas menos saídas do dia — NÃO é a variação do saldo total",
    },
  ];
}

/** Uma fonte na seção "Saúde dos dados". */
export type FonteDado = {
  rotulo: string;
  /** ISO da última execução, ou `null` quando nunca rodou. */
  ultima: string | null;
  idadeHoras: number | null;
  ok: boolean;
  detalhe: string;
};

export type LinhaImport = {
  tipo: string;
  iniciado: Date;
  sucesso: boolean;
  contasProcessadas: number;
  resumo: string | null;
};

/** Os três arquivos que o Eduardo sobe à mão, na ordem em que ele os sobe. */
export const ARQUIVOS_IMPORT: Array<{ tipo: string; rotulo: string }> = [
  { tipo: "import-base_btg", rotulo: "Base BTG" },
  { tipo: "import-informacoes", rotulo: "Informações" },
  { tipo: "import-saldo_em_cc", rotulo: "Saldo em CC (D0)" },
];

/**
 * Estado de cada arquivo importado.
 *
 * `ultima: null` NÃO é "nunca importou": é "nunca importou COM RECIBO". O
 * recibo entrou em produção em 17/08 05:46 UTC; antes disso o import não
 * gravava linha nenhuma. Enquanto a primeira importação de cada arquivo não
 * acontecer, o traço aqui é ausência de instrumento, não ausência de trabalho —
 * e o `detalhe` diz isso com todas as letras, porque ler ao contrário foi
 * exatamente o que custou onze dias no incidente do Saldo D0.
 */
export function montarSaudeImports(
  linhas: LinhaImport[],
  agora: Date,
): FonteDado[] {
  const porTipo = new Map<string, LinhaImport>();
  for (const l of linhas) {
    const atual = porTipo.get(l.tipo);
    if (!atual || l.iniciado > atual.iniciado) porTipo.set(l.tipo, l);
  }

  return ARQUIVOS_IMPORT.map(({ tipo, rotulo }) => {
    const l = porTipo.get(tipo);
    if (!l) {
      return {
        rotulo,
        ultima: null,
        idadeHoras: null,
        ok: false,
        detalhe: "Sem recibo ainda — o registro por execução começou em 17/08",
      };
    }
    const idadeHoras = Math.max(
      0,
      Math.round((agora.getTime() - l.iniciado.getTime()) / 3_600_000),
    );
    return {
      rotulo,
      ultima: l.iniciado.toISOString(),
      idadeHoras,
      ok: l.sucesso,
      detalhe: l.resumo ?? `${l.contasProcessadas} linha(s) gravada(s)`,
    };
  });
}
