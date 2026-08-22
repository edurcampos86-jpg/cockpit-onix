/**
 * O recibo do import de planilha — contagem, veredito e motivo do descarte.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 * De 30/07 a 15/08, o Eduardo subiu o Saldo D0 à mão em ~11 dias úteis. O
 * banco registrou UMA escrita, em UM cliente, no dia 30/07. Nenhum dia teve
 * erro na tela: a rota respondia `200 OK` e a tela dizia "importado".
 *
 * Onze dias de trabalho evaporaram sem sinal porque o `POST
 * /api/backoffice/clientes` era o ÚNICO dos ~19 tipos de job do sistema que
 * não gravava linha de log. Tentativa fracassada e ausência de tentativa
 * deixavam exatamente o mesmo rastro: nenhum.
 *
 * Este módulo é a parte com regra — e portanto a parte que o teste alcança.
 * A gravação fica no chamador, com o cliente Prisma real, pela mesma divisão
 * de `integracoes-auditadas.ts` e `migrations-aplicadas.ts`.
 *
 * ── A REGRA QUE MUDA O COMPORTAMENTO ─────────────────────────────────────
 * Import que LÊ linhas e ESCREVE zero responde ERRO, não sucesso. Sucesso
 * silencioso é pior que falha barulhenta: a falha custa um susto, o silêncio
 * custou onze dias.
 */

/**
 * Os motivos que o código realmente produz hoje. Cada um tem endereço:
 *
 * - `sem_numero_conta`   → `clientes/route.ts:863-871`
 * - `orfao_sem_cliente`  → `clientes/route.ts:550-557` (modos update-only)
 * - `erro_no_upsert`     → `clientes/route.ts:886-892`
 * - `sem_mudanca`        → `upsert-cliente.ts:76` (`acao: "noop"`)
 *
 * `sem_mudanca` não é descarte: a linha chegou ao banco e o banco decidiu que
 * nada mudou. Fica em campo próprio justamente para não se disfarçar de
 * escrita nem de erro — hoje ele não aparece em lugar nenhum, e é o candidato
 * mais silencioso dos três.
 */
export const MOTIVOS_DESCARTE = [
  "sem_numero_conta",
  "orfao_sem_cliente",
  "erro_no_upsert",
] as const;

export type MotivoDescarte = (typeof MOTIVOS_DESCARTE)[number];

export type EntradaContagem = {
  /** Linhas que o navegador enviou — o denominador de tudo. */
  lidas: number;
  criadas: number;
  atualizadas: number;
  /** `noop`: chegou ao upsert e nenhum campo foi escrito. */
  semMudanca: number;
  /** motivo → quantidade. Só agregado; nunca linha de cliente. */
  descartes: Partial<Record<MotivoDescarte, number>>;
};

export type VeredictoImport = {
  lidas: number;
  escritas: number;
  semMudanca: number;
  descartadas: number;
  motivos: Partial<Record<MotivoDescarte, number>>;
  /**
   * `lidas === escritas + semMudanca + descartadas`. Falso significa bug no
   * próprio contador — e é a primeira coisa que o teste confere, porque
   * contador que não fecha é pior que contador nenhum.
   */
  fecha: boolean;
  /** `false` quando leu linhas e não escreveu nenhuma. Vira HTTP 422. */
  ok: boolean;
  /**
   * Quando `ok` é falso: o ramo que engoliu as linhas. É a resposta à
   * pergunta "onde o dado morreu?" — em uma palavra, sem adivinhação.
   */
  ramo: MotivoDescarte | "sem_mudanca" | null;
  /** Uma linha, para o `resumo` do log e para a tela. */
  resumo: string;
};

function somar(d: Partial<Record<MotivoDescarte, number>>): number {
  return Object.values(d).reduce((a: number, b) => a + (b ?? 0), 0);
}

/** Qual motivo respondeu pela maior parte das linhas perdidas. */
function ramoDominante(
  descartes: Partial<Record<MotivoDescarte, number>>,
  semMudanca: number,
): MotivoDescarte | "sem_mudanca" | null {
  const candidatos: Array<[MotivoDescarte | "sem_mudanca", number]> = [
    ...(Object.entries(descartes) as Array<[MotivoDescarte, number]>),
    ["sem_mudanca", semMudanca] as [MotivoDescarte | "sem_mudanca", number],
  ].filter((par): par is [MotivoDescarte | "sem_mudanca", number] => par[1] > 0);

  if (candidatos.length === 0) return null;
  // Empate resolve pela ordem de MOTIVOS_DESCARTE (o mais "cedo" no caminho
  // ganha): se a linha morreu por falta de conta, não chegou a ser órfã.
  const ordem = [...MOTIVOS_DESCARTE, "sem_mudanca"] as string[];
  candidatos.sort((a, b) => b[1] - a[1] || ordem.indexOf(a[0]) - ordem.indexOf(b[0]));
  return candidatos[0][0];
}

export function apurarImport(e: EntradaContagem): VeredictoImport {
  const escritas = e.criadas + e.atualizadas;
  const descartadas = somar(e.descartes);
  const motivos = Object.fromEntries(
    Object.entries(e.descartes).filter(([, qtd]) => (qtd ?? 0) > 0),
  ) as Partial<Record<MotivoDescarte, number>>;

  // Leu linhas e não escreveu nenhuma = erro, mesmo que o processo tenha
  // terminado sem exceção. É a regra inteira desta rodada.
  const ok = !(e.lidas > 0 && escritas === 0);
  const ramo = ok ? null : ramoDominante(motivos, e.semMudanca);

  const partes = [
    `lidas:${e.lidas}`,
    `escritas:${escritas}`,
    `sem_mudanca:${e.semMudanca}`,
    `descartadas:${descartadas}`,
  ];
  for (const [motivo, qtd] of Object.entries(motivos)) partes.push(`${motivo}:${qtd}`);
  if (!ok) partes.push(`RAMO:${ramo ?? "indeterminado"}`);

  return {
    lidas: e.lidas,
    escritas,
    semMudanca: e.semMudanca,
    descartadas,
    motivos,
    fecha: e.lidas === escritas + e.semMudanca + descartadas,
    ok,
    ramo,
    resumo: partes.join(" "),
  };
}

/**
 * A frase que o Eduardo lê na tela. Sempre com números — "importado com
 * sucesso" sem número ao lado foi o que deixou onze dias passarem.
 */
export function frasePraTela(v: VeredictoImport, rotulo: string): string {
  if (!v.ok) {
    const explicacao: Record<string, string> = {
      sem_numero_conta:
        "nenhuma linha trouxe número de conta reconhecível — confira o cabeçalho da coluna Conta",
      orfao_sem_cliente:
        "nenhuma conta do arquivo existe na base — importe a Base BTG antes",
      erro_no_upsert: "todas as linhas falharam ao gravar",
      sem_mudanca: "todas as linhas já tinham exatamente esse valor no banco",
    };
    const porque = v.ramo ? explicacao[v.ramo] : "motivo indeterminado";
    return (
      `${rotulo}: NADA foi gravado. ${v.lidas} linhas lidas, 0 escritas — ${porque}.`
    );
  }

  const partes = [`${rotulo}: ${v.escritas} de ${v.lidas} linhas gravadas`];
  if (v.semMudanca > 0) partes.push(`${v.semMudanca} sem mudança`);
  if (v.descartadas > 0) {
    const detalhe = Object.entries(v.motivos)
      .map(([m, q]) => `${q} ${m.replace(/_/g, " ")}`)
      .join(", ");
    partes.push(`${v.descartadas} descartadas (${detalhe})`);
  }
  return partes.join(" · ");
}
