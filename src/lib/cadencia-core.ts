/**
 * Cadência Supernova ABC — PURA (sem prisma, sem server-only).
 *
 * Vive separada de cadencia.ts pra poder ser importada tanto no client
 * (tabela de clientes) quanto no server (cron de alertas, backfill).
 *
 * ── O 12-4-2 tem UMA definição, e é a de CONTAGEM ──
 * Até 22/08/2026 o repositório carregava duas leituras contraditórias de
 * "12-4-2": a de CONTAGEM (12 ligações + 4 reuniões + 2 revisões por ano, no
 * método Supernova, escrita em schema.prisma e no Glossário) e a de JANELA
 * (dias máximos entre contatos, escrita aqui). Nem o código sabia qual valia.
 *
 * Decisão do Eduardo em 22/08/2026: **vale a de contagem**. `TOQUES_POR_CLASSE`
 * abaixo é a régua oficial, e é ela que classifica cadência.
 *
 * `DIAS_POR_CLASSE` CONTINUA existindo, mas rebaixada: virou métrica auxiliar
 * de RECÊNCIA ("há quantos dias foi o último toque"), que alimenta o tooltip da
 * tabela, o selo de presença e o Painel de Atenção. Não classifica mais o
 * cumprimento da promessa de serviço.
 */
/**
 * Régua de RECÊNCIA — dias desde o último toque de qualquer canal.
 *
 * NÃO é mais a régua de cadência (ver `TOQUES_POR_CLASSE`). Fica porque três
 * lugares dependem dela para outra finalidade, e nenhum deles é "cumpri a
 * promessa de serviço?":
 *   • o tooltip "há N dias · X% da régua" da tabela de clientes;
 *   • `selo-presenca.ts`, que funde recência com quem falou por último;
 *   • `painel-atencao/core.ts`, cujo "no-vácuo" mede silêncio do cliente
 *     depois de NÓS falarmos — pergunta de conversa, não de cadência.
 */
export const DIAS_POR_CLASSE: Record<string, number> = {
  A: 30,
  B: 90,
  C: 180,
};

export const DIAS_CLASSE_PADRAO = 180; // fallback p/ classificação desconhecida

export function diasCadencia(classificacao: string | null | undefined): number {
  return DIAS_POR_CLASSE[(classificacao || "").toUpperCase()] ?? DIAS_CLASSE_PADRAO;
}

const MS_DIA = 24 * 60 * 60 * 1000;

// ============================================================================
// RÉGUA OFICIAL DA CADÊNCIA — toques/ano por classe (Supernova 12-4-2)
// ============================================================================

/** Alvo anual de cada tipo de toque. */
export type ToquesAlvo = {
  ligacoes: number;
  reunioes: number;
  /** Alvo DECLARADO. Ainda não entra na conta — ver `TOQUES_CONTADOS`. */
  revisoes: number;
};

/**
 * Toques por ano, por classe. Números fechados pelo Eduardo em 22/08/2026.
 *
 *   A = 12 + 4 + 2 = 18/ano
 *   B =  8 + 3 + 1 = 12/ano
 *   C =  4 + 2 + 1 =  7/ano
 *
 * O nome "12-4-2" vem da classe A, que é onde o método Supernova foi escrito;
 * B e C seguem a mesma forma com o volume proporcional ao nível de serviço.
 */
export const TOQUES_POR_CLASSE: Record<string, ToquesAlvo> = {
  A: { ligacoes: 12, reunioes: 4, revisoes: 2 },
  B: { ligacoes: 8, reunioes: 3, revisoes: 1 },
  C: { ligacoes: 4, reunioes: 2, revisoes: 1 },
};

/** Classe desconhecida cai no nível de serviço mais leve — nunca no mais exigente. */
export const TOQUES_PADRAO: ToquesAlvo = TOQUES_POR_CLASSE.C!;

export function toquesAlvo(classificacao: string | null | undefined): ToquesAlvo {
  return TOQUES_POR_CLASSE[(classificacao || "").toUpperCase()] ?? TOQUES_PADRAO;
}

/**
 * Quais tipos a régua COBRA hoje.
 *
 * ⚠️ TEMPORÁRIO, e declarado de propósito: "revisao" está no alvo oficial mas
 * FORA da conta, porque nenhum caminho do sistema registra uma revisão. Os três
 * gravadores de `InteracaoCliente` produzem "ligacao" ou "reuniao"; "revisao"
 * só entra se alguém escolher à mão num dos dois formulários.
 *
 * Contar revisão hoje daria 0/2 em toda a carteira e reprovaria todo mundo por
 * um dado que o sistema não coleta — mentira estatística, não exigência. Então
 * a régua cobra o que ela consegue medir, e a TELA diz que a revisão não é
 * rastreada em vez de exibir um zero que parece descumprimento.
 *
 * Quando existir caminho de registro de revisão, acrescentar "revisao" aqui e
 * apagar este parágrafo — a mudança é de uma linha, e é essa a intenção.
 */
export const TOQUES_CONTADOS = ["ligacoes", "reunioes"] as const;

/** Alvo anual COMPLETO, incluindo revisão. É o que a promessa de serviço diz. */
export function alvoOficial(classificacao: string | null | undefined): number {
  const a = toquesAlvo(classificacao);
  return a.ligacoes + a.reunioes + a.revisoes;
}

/** Alvo anual EFETIVAMENTE cobrado hoje (sem revisão). É o denominador da conta. */
export function alvoContado(classificacao: string | null | undefined): number {
  const a = toquesAlvo(classificacao);
  return a.ligacoes + a.reunioes;
}

export type StatusCadencia = "ok" | "atencao" | "alerta" | "sem-historico";

export interface CumprimentoCadencia {
  status: StatusCadencia;
  /** Toques contados nos últimos 12 meses (ligações + reuniões). */
  feitos: number;
  /** Denominador aplicado — `alvoContado`, sem revisão. */
  alvo: number;
  /** Alvo completo da promessa, com revisão. Para a tela mostrar o que falta medir. */
  alvoComRevisao: number;
  /** feitos / alvo. `null` quando não há histórico. */
  pct: number | null;
  /** Alvo de revisões da classe — a parte que a conta ainda não enxerga. */
  revisoesNaoRastreadas: number;
}

/**
 * Abaixo disto o cliente entra em atenção. Mesmos 80% do termômetro antigo.
 *
 * Guardado como INTEIRO (80), não como 0.8, e o motivo é aritmético: multiplicar
 * pelo 0.8 reintroduz o erro de ponto flutuante que a comparação em inteiro
 * existe para evitar — `6 * 0.8 * 100` dá 480.0000000000001, e o cliente que
 * está exatamente no limite reprova por um dígito que ninguém vê.
 */
const LIMIAR_ATENCAO_PCT = 80;

/**
 * Cumprimento da cadência por CONTAGEM de toques no último ano.
 *
 * Direção invertida em relação à régua de dias: lá, mais dias era pior; aqui,
 * mais toques é melhor. Os cortes de 80%/100% são os mesmos para o verde/
 * amarelo/vermelho continuar querendo dizer a mesma coisa na tela.
 *
 * `temHistorico` existe para preservar o estado neutro de hoje: cliente que
 * nunca foi contatado não é "atrasado", é "ainda não começou" — e contava como
 * OK no KPI antes desta mudança. Sem esse parâmetro, 0 toques viraria alerta e
 * toda conta recém-aberta nasceria reprovada.
 */
export function cumprimentoCadencia(
  classificacao: string | null | undefined,
  toquesNoAno: number,
  temHistorico: boolean,
): CumprimentoCadencia {
  const a = toquesAlvo(classificacao);
  const alvo = alvoContado(classificacao);
  const base = {
    feitos: Math.max(0, toquesNoAno),
    alvo,
    alvoComRevisao: alvoOficial(classificacao),
    revisoesNaoRastreadas: a.revisoes,
  };

  if (!temHistorico) return { ...base, status: "sem-historico", pct: null };

  const pct = alvo > 0 ? base.feitos / alvo : 1;
  // Comparação em INTEIRO, não pelo `pct`. Com ponto flutuante, 4,8/6 dá
  // 0.7999999999999999 e um cliente exatamente em 80% cairia para alerta por
  // erro de arredondamento. `feitos * 100 >= alvo * 80` é a mesma régua sem a
  // aritmética que erra.
  let status: StatusCadencia;
  if (base.feitos >= alvo) status = "ok";
  else if (base.feitos * 100 >= alvo * LIMIAR_ATENCAO_PCT) status = "atencao";
  else status = "alerta";

  return { ...base, status, pct };
}

/** Início da janela de 12 meses usada na contagem. Uma definição só. */
export function inicioJanelaToques(agora: Date = new Date()): Date {
  return new Date(agora.getTime() - 365 * MS_DIA);
}

/**
 * Os tipos de `InteracaoCliente` que contam como toque.
 *
 * Especificado pelo Eduardo: ligação, WhatsApp e presencial. Traduzido para os
 * valores que a tabela realmente guarda:
 *
 *   ligação   → tipo "ligacao"
 *   WhatsApp  → tipo "whatsapp"
 *   presencial→ NÃO é um `tipo`, é um `canal`. Uma reunião presencial tem
 *               tipo "reuniao" e canal "presencial"; uma visita rápida tem
 *               tipo "ligacao" e canal "presencial". Filtrar `tipo` por
 *               "presencial" não casaria com linha nenhuma — o presencial já
 *               entra por "reuniao"/"ligacao", que estão aqui.
 *
 * "reuniao" está na lista porque o alvo é literalmente "12 ligações + 4
 * REUNIÕES + 2 revisões": sem ela, o denominador cobraria reuniões que o
 * numerador nunca contaria.
 *
 * Ficam de fora: "revisao" (pelo motivo em `TOQUES_CONTADOS`), "email" e
 * "evento" — nenhum dos dois é toque de relacionamento na promessa Supernova.
 */
export const TIPOS_QUE_CONTAM_TOQUE = ["ligacao", "reuniao", "whatsapp"] as const;

export function contaComoToque(tipo: string): boolean {
  return (TIPOS_QUE_CONTAM_TOQUE as readonly string[]).includes(tipo);
}


export type StatusTermometro = "sem-historico" | "verde" | "amarelo" | "vermelho";

export interface TermometroPresenca {
  status: StatusTermometro;
  dias: number | null; // dias desde último contato (null = nunca contatado)
  cadencia: number; // dias da régua da classe
  pct: number | null; // dias/cadencia (null = sem histórico)
}

/**
 * Termômetro de presença: dias desde `ultimoContatoAt` vs a cadência da classe.
 *
 *   verde    → < 80% do intervalo (em dia)
 *   amarelo  → 80%–100% (chegando no limite)
 *   vermelho → > 100% (estourou a cadência)
 *   sem-historico → nunca contatado (estado neutro/cinza, NÃO vermelho)
 *
 * A classe A é a mais exigente (30 dias), então estoura mais rápido.
 */
export function statusTermometro(
  classificacao: string | null | undefined,
  ultimoContatoAt: Date | string | null | undefined,
  now: number = Date.now(),
): TermometroPresenca {
  const cadencia = diasCadencia(classificacao);
  if (!ultimoContatoAt) {
    return { status: "sem-historico", dias: null, cadencia, pct: null };
  }
  const dias = Math.floor((now - new Date(ultimoContatoAt).getTime()) / MS_DIA);
  const pct = dias / cadencia;
  let status: StatusTermometro;
  if (pct > 1) status = "vermelho";
  else if (pct >= 0.8) status = "amarelo";
  else status = "verde";
  return { status, dias, cadencia, pct };
}

// ============================================================================
// Régua de REUNIÃO — eixo INDEPENDENTE do contato acima.
// ============================================================================

/**
 * O termômetro acima mede CONTATO (mensagem, ligação, qualquer canal) olhando
 * para trás: `ultimoContatoAt`. Esta régua mede outra coisa — se existe
 * reunião AGENDADA dentro do teto da classe, olhando para a frente.
 *
 * São eixos distintos e ambos importam. Um cliente pode estar VERDE no
 * termômetro por ter trocado WhatsApp ontem e estar há oito meses sem reunião
 * marcada: contato em dia, relacionamento em risco. Antes desta régua, esse
 * caso era invisível na tabela.
 *
 * Tetos (máximo entre reuniões):
 *   A =  90 dias (3 meses)
 *   B = 120 dias (4 meses)
 *   C = 180 dias (6 meses)
 *
 * Os números NÃO seguem a proporção 1:3:6 do contato. Lá a razão vem de
 * toques/ano (12-4-2); aqui a régua é mais comprimida — 3× o teto de A daria
 * 270 dias, mais frouxo que o C, o que seria incoerente.
 *
 * Sobre o override: as réguas vêm de teoria, e cliente real tem exceção.
 * `overrideDias` permite fixar outro teto para um cliente específico sem
 * mexer na régua de ninguém. Valor <= 0 ou ausente cai no padrão da classe.
 */
export const DIAS_REUNIAO_POR_CLASSE: Record<string, number> = {
  A: 90,
  B: 120,
  C: 180,
};

export const DIAS_REUNIAO_PADRAO = 180; // fallback p/ classificação desconhecida

export function diasCadenciaReuniao(
  classificacao: string | null | undefined,
  overrideDias?: number | null,
): number {
  if (typeof overrideDias === "number" && Number.isFinite(overrideDias) && overrideDias > 0) {
    return Math.floor(overrideDias);
  }
  return (
    DIAS_REUNIAO_POR_CLASSE[(classificacao || "").toUpperCase()] ?? DIAS_REUNIAO_PADRAO
  );
}

export type StatusReuniao = "ok" | "atencao" | "risco";

export type MotivoReuniao =
  | "agendada-no-prazo" // há reunião marcada dentro do teto
  | "agendada-fora-do-teto" // há reunião marcada, mas tarde demais
  | "sem-agenda-no-prazo" // nada marcado, mas o teto ainda não venceu
  | "sem-agenda-vencida"; // nada marcado e o teto já venceu — o caso grave

export interface RiscoEvasao {
  status: StatusReuniao;
  motivo: MotivoReuniao;
  /** Teto em dias efetivamente aplicado (já com override, se houver). */
  cadencia: number;
  /** true quando o teto veio de override manual, não da régua da classe. */
  override: boolean;
  /** Até quando a próxima reunião deveria acontecer (ISO ms). */
  prazoLimite: number;
  /** Dias até o prazo. Negativo = já venceu. */
  diasAteLimite: number;
}

const LIMIAR_ATENCAO = 0.8; // mesmos 80% do termômetro de contato

/**
 * Risco de evasão por ausência de reunião agendada.
 *
 * O teto conta a partir da ÚLTIMA reunião — é o intervalo entre reuniões que
 * a régua limita. Cliente sem histórico nenhum tem o prazo contado de hoje, e
 * não é marcado como vencido de saída: sem reunião passada, não há intervalo
 * estourado, há um relacionamento que ainda não começou.
 *
 *   ok      → reunião marcada dentro do teto
 *   atencao → nada marcado e o prazo se aproxima (>=80%), ou marcada fora do
 *             teto (existe agenda, mas atrasa o ciclo)
 *   risco   → prazo vencido sem nada marcado — a falha grave
 */
export function riscoEvasaoReuniao(
  classificacao: string | null | undefined,
  ultimaReuniaoAt: Date | string | null | undefined,
  proximaReuniaoAt: Date | string | null | undefined,
  overrideDias?: number | null,
  now: number = Date.now(),
): RiscoEvasao {
  const cadencia = diasCadenciaReuniao(classificacao, overrideDias);
  const override = cadencia !== diasCadenciaReuniao(classificacao, null);

  const base = ultimaReuniaoAt ? new Date(ultimaReuniaoAt).getTime() : now;
  const prazoLimite = base + cadencia * MS_DIA;
  const diasAteLimite = Math.floor((prazoLimite - now) / MS_DIA);

  const proxima = proximaReuniaoAt ? new Date(proximaReuniaoAt).getTime() : null;

  if (proxima !== null) {
    const dentro = proxima <= prazoLimite;
    return {
      status: dentro ? "ok" : "atencao",
      motivo: dentro ? "agendada-no-prazo" : "agendada-fora-do-teto",
      cadencia,
      override,
      prazoLimite,
      diasAteLimite,
    };
  }

  // Nada agendado.
  const decorrido = 1 - diasAteLimite / cadencia;
  if (diasAteLimite < 0) {
    return {
      status: "risco",
      motivo: "sem-agenda-vencida",
      cadencia,
      override,
      prazoLimite,
      diasAteLimite,
    };
  }
  return {
    status: decorrido >= LIMIAR_ATENCAO ? "atencao" : "ok",
    motivo: "sem-agenda-no-prazo",
    cadencia,
    override,
    prazoLimite,
    diasAteLimite,
  };
}
