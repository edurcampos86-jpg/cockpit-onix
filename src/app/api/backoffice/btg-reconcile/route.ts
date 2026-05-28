import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import * as btg from "@/lib/integrations/btg";
import {
  reconciliarTotaisBtg,
  DIVERGENCIA_MAXIMA,
  type ReconciliacaoBtg,
} from "@/lib/backoffice/reconciliacao-btg";
import { parseValorFinanceiro } from "@/lib/backoffice/parse-financeiro";

/**
 * GET /api/backoffice/btg-reconcile
 *
 * Reconciliação on-demand: busca saldos atuais do BTG, soma totais e
 * compara com somatórios do banco — sem nenhum filtro de UI. Devolve
 * divergências e (opcionalmente) bloqueia a publicação se algum delta
 * passar de 0,01%.
 *
 * Não escreve nada no banco. Loga em BtgSyncLog se divergeAcima.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Não autenticado" }, { status: 401 });
  }

  const log = await prisma.btgSyncLog.create({
    data: { tipo: "reconcile", trigger: "manual", userId: session.userId },
  });

  try {
    // 1. Lista canônica de contas (sem isso, não há base de comparação)
    const accountsRes = await btg.listAllAccounts();
    if (accountsRes.status !== 200) {
      await prisma.btgSyncLog.update({
        where: { id: log.id },
        data: {
          finalizado: new Date(),
          sucesso: false,
          resumo: `Falha em listAllAccounts: HTTP ${accountsRes.status}`,
        },
      });
      return NextResponse.json(
        { success: false, message: `BTG listAllAccounts retornou ${accountsRes.status}` },
        { status: 502 },
      );
    }

    const contas = extractContas(accountsRes.body);

    // 2. Saldos
    const saldosMap = new Map<string, { saldo: number; saldoConta: number }>();
    try {
      const balRes = await btg.listAllBalances();
      if (balRes.status === 200) {
        for (const b of extractBalances(balRes.body)) {
          saldosMap.set(normalizeAccount(b.numeroConta), {
            saldo: b.saldoTotal,
            saldoConta: b.saldoConta,
          });
        }
      }
    } catch {
      // tolerante — recon ainda devolve o que tem
    }

    // 3. Posições (AUM por conta)
    const posicoesMap = new Map<
      string,
      { aum: number; positionDate: Date | null; breakdown: unknown }
    >();
    try {
      const posRes = await btg.getPartnerPositions();
      if (posRes.status === 200) {
        for (const p of extractPositions(posRes.body)) {
          posicoesMap.set(normalizeAccount(p.numeroConta), {
            aum: p.aum,
            positionDate: p.positionDate,
            breakdown: null,
          });
        }
      }
    } catch {
      // tolerante
    }

    // 4. Reconciliar
    const recon: ReconciliacaoBtg = await reconciliarTotaisBtg({
      contasBtg: contas.length,
      saldosMap,
      posicoesMap,
    });

    const resumo = formatResumo(recon);
    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: {
        finalizado: new Date(),
        sucesso: !recon.divergeAcima,
        contasProcessadas: contas.length,
        resumo,
        erros: recon.divergeAcima
          ? [
              {
                etapa: "reconcile",
                divergPctAum: recon.divergPctAum,
                divergPctSaldoConta: recon.divergPctSaldoConta,
                divergPctContas: recon.divergPctContas,
              },
            ]
          : undefined,
      },
    });

    return NextResponse.json({
      success: !recon.divergeAcima,
      divergenciaMaxima: DIVERGENCIA_MAXIMA,
      reconciliacao: recon,
      resumo,
    });
  } catch (e) {
    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: {
        finalizado: new Date(),
        sucesso: false,
        resumo: e instanceof Error ? e.message : "erro desconhecido",
      },
    });
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : "erro" },
      { status: 500 },
    );
  }
}

// ===== helpers locais =====

function normalizeAccount(s: string): string {
  return s.replace(/^0+/, "").trim();
}

function asArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const k of ["data", "accounts", "balances", "positions", "result", "items", "content"]) {
      if (Array.isArray(obj[k])) return obj[k] as unknown[];
    }
  }
  return [];
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function extractContas(body: unknown): Array<{ numeroConta: string }> {
  return asArray(body)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const p = item as Record<string, unknown>;
      const conta = pickString(p, ["accountNumber", "AccountNumber", "account", "numeroConta", "Conta"]);
      return conta ? { numeroConta: conta } : null;
    })
    .filter((x): x is { numeroConta: string } => x !== null);
}

function extractBalances(
  body: unknown,
): Array<{ numeroConta: string; saldoTotal: number; saldoConta: number }> {
  return asArray(body)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const p = item as Record<string, unknown>;
      const conta = pickString(p, ["accountNumber", "AccountNumber", "account", "numeroConta"]);
      if (!conta) return null;
      const saldoConta =
        parseValorFinanceiro(
          p.availableBalance ?? p.cashBalance ?? p.AvailableBalance ?? p.CashBalance ?? p.balance ?? p.Balance ?? p.saldo,
        ) ?? 0;
      const saldoTotal =
        parseValorFinanceiro(p.totalBalance ?? p.TotalBalance ?? p.totalAmount ?? p.TotalAmmount ?? p.TotalAmount) ??
        saldoConta;
      return { numeroConta: conta, saldoTotal, saldoConta };
    })
    .filter((x): x is { numeroConta: string; saldoTotal: number; saldoConta: number } => x !== null);
}

function extractPositions(
  body: unknown,
): Array<{ numeroConta: string; aum: number; positionDate: Date | null }> {
  return asArray(body)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const p = item as Record<string, unknown>;
      const conta = pickString(p, ["accountNumber", "AccountNumber", "account", "numeroConta"]);
      if (!conta) return null;
      const aum =
        parseValorFinanceiro(p.TotalAmmount ?? p.TotalAmount ?? p.totalAmount ?? p.AUM ?? p.total ?? p.GrossValue) ?? 0;
      const dateStr = pickString(p, ["PositionDate", "positionDate", "date", "Date"]);
      const positionDate = dateStr ? safeDate(dateStr) : null;
      return { numeroConta: conta, aum, positionDate };
    })
    .filter((x): x is { numeroConta: string; aum: number; positionDate: Date | null } => x !== null);
}

function safeDate(s: string): Date | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function formatResumo(r: ReconciliacaoBtg): string {
  const pct = (n: number) => (n * 100).toFixed(3) + "%";
  const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  if (r.divergeAcima) {
    return [
      `⚠️ DIVERGÊNCIA (limite ${pct(DIVERGENCIA_MAXIMA)}):`,
      `  AUM BTG R$ ${fmt(r.aumBtg)} vs DB R$ ${fmt(r.aumDb)} (Δ ${pct(r.divergPctAum)})`,
      `  Saldo conta BTG R$ ${fmt(r.saldoContaBtg)} vs DB R$ ${fmt(r.saldoContaDb)} (Δ ${pct(r.divergPctSaldoConta)})`,
      `  Contas BTG ${r.contasBtg} vs DB ${r.contasDb} (Δ ${pct(r.divergPctContas)})`,
    ].join("\n");
  }
  return `OK · ${r.contasBtg} contas · AUM R$ ${fmt(r.aumBtg)} · saldo conta R$ ${fmt(r.saldoContaBtg)}`;
}
