import { prisma } from "@/lib/prisma";

/**
 * Reconciliação de saldos BTG vs banco local.
 *
 * Princípio: o BTG é a fonte da verdade. Após cada importação, somar os
 * totais devolvidos pelas APIs (`listAllBalances` + `getPartnerPositions`)
 * e comparar com `prisma.clienteBackoffice.aggregate(_sum)` — sem nenhum
 * filtro de UI. Divergência > 0.01% bloqueia o `sucesso=true` no
 * `BtgSyncLog` e marca o endpoint de import com `success=false`, pra o
 * front exibir um banner avisando que o snapshot publicado não bate.
 */
export const DIVERGENCIA_MAXIMA = 0.0001; // 0.01%

export interface ReconciliacaoBtg {
  contasBtg: number;
  contasDb: number;
  aumBtg: number;
  aumDb: number;
  saldoContaBtg: number;
  saldoContaDb: number;
  divergPctAum: number;
  divergPctSaldoConta: number;
  divergPctContas: number;
  divergeAcima: boolean;
  // Itens novos pra debug — quais contas estão em um lado e não no outro
  somenteNoBtg: string[];
  somenteNoDb: string[];
}

export async function reconciliarTotaisBtg(args: {
  contasBtg: number;
  saldosMap: Map<string, { saldo: number; saldoConta: number }>;
  posicoesMap: Map<string, { aum: number; positionDate: Date | null; breakdown: unknown }>;
}): Promise<ReconciliacaoBtg> {
  const { contasBtg, saldosMap, posicoesMap } = args;

  // Soma BTG (preferimos posição quando disponível, caímos pra saldoTotal)
  let aumBtg = 0;
  let saldoContaBtg = 0;
  for (const [conta, s] of saldosMap) {
    const pos = posicoesMap.get(conta);
    aumBtg += pos?.aum ?? s.saldo;
    saldoContaBtg += s.saldoConta;
  }

  // Soma DB (todos os clientes ativos — sem nenhum filtro de UI)
  const agg = await prisma.clienteBackoffice.aggregate({
    _sum: { saldo: true, saldoConta: true },
    _count: { _all: true },
  });
  const aumDb = agg._sum.saldo ?? 0;
  const saldoContaDb = agg._sum.saldoConta ?? 0;
  const contasDb = agg._count._all;

  // Diff de contas (quem está em BTG e não está no DB e vice-versa)
  const contasDbAll = await prisma.clienteBackoffice.findMany({
    select: { numeroConta: true },
  });
  const dbContasSet = new Set(contasDbAll.map((c) => c.numeroConta));
  const btgContasSet = new Set(saldosMap.keys());
  const somenteNoBtg = [...btgContasSet].filter((c) => !dbContasSet.has(c)).slice(0, 50);
  const somenteNoDb = [...dbContasSet].filter((c) => !btgContasSet.has(c)).slice(0, 50);

  const safePct = (delta: number, base: number) =>
    Math.abs(base) < 0.01 ? (Math.abs(delta) < 0.01 ? 0 : 1) : Math.abs(delta) / Math.abs(base);
  const divergPctAum = safePct(aumDb - aumBtg, aumBtg);
  const divergPctSaldoConta = safePct(saldoContaDb - saldoContaBtg, saldoContaBtg);
  const divergPctContas = safePct(contasDb - contasBtg, contasBtg);

  return {
    contasBtg,
    contasDb,
    aumBtg,
    aumDb,
    saldoContaBtg,
    saldoContaDb,
    divergPctAum,
    divergPctSaldoConta,
    divergPctContas,
    divergeAcima:
      divergPctAum > DIVERGENCIA_MAXIMA ||
      divergPctSaldoConta > DIVERGENCIA_MAXIMA ||
      divergPctContas > DIVERGENCIA_MAXIMA,
    somenteNoBtg,
    somenteNoDb,
  };
}
