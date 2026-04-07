import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as btg from "@/lib/integrations/btg";

/**
 * POST /api/backoffice/btg-sync
 * Itera sobre todos os clientes com numeroConta, busca a posição no BTG
 * e atualiza o saldo. Retorna sumário.
 */
export async function POST() {
  let updated = 0;
  let failed = 0;
  let totalAum = 0;
  const erros: Array<{ conta: string; nome: string; motivo: string }> = [];
  const detalhes: Array<{ conta: string; nome: string; saldoAnterior: number; saldoNovo: number; positionDate: string }> = [];

  let clientes: Array<{ id: string; nome: string; numeroConta: string; saldo: number }> = [];
  try {
    clientes = await prisma.clienteBackoffice.findMany({
      where: { numeroConta: { not: "" } },
      select: { id: true, nome: true, numeroConta: true, saldo: true },
    });
  } catch {
    return NextResponse.json({ success: false, message: "Banco indisponível" }, { status: 500 });
  }

  for (const c of clientes) {
    const conta = c.numeroConta.replace(/^0+/, ""); // BTG aceita sem zeros à esquerda
    try {
      const r = await btg.getPositionByAccount(conta);
      if (r.status !== 200) {
        failed++;
        const body = r.body as { meta?: { globalErrors?: Array<{ message: string }> }; errors?: Array<{ message: string }> };
        const msg = body?.meta?.globalErrors?.[0]?.message || body?.errors?.[0]?.message || `HTTP ${r.status}`;
        erros.push({ conta: c.numeroConta, nome: c.nome, motivo: msg });
        continue;
      }
      const data = r.body as { TotalAmmount?: string; PositionDate?: string };
      const novoSaldo = data.TotalAmmount ? parseFloat(data.TotalAmmount) : 0;
      const positionDate = data.PositionDate ? new Date(data.PositionDate) : new Date();
      await prisma.clienteBackoffice.update({
        where: { id: c.id },
        data: { saldo: novoSaldo },
      });
      detalhes.push({
        conta: c.numeroConta,
        nome: c.nome,
        saldoAnterior: c.saldo,
        saldoNovo: novoSaldo,
        positionDate: positionDate.toISOString(),
      });
      totalAum += novoSaldo;
      updated++;
    } catch (e) {
      failed++;
      erros.push({ conta: c.numeroConta, nome: c.nome, motivo: e instanceof Error ? e.message : "erro" });
    }
  }

  return NextResponse.json({
    success: true,
    message: `${updated} cliente(s) atualizado(s), ${failed} falha(s). AUM total: R$ ${totalAum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    updated,
    failed,
    totalAum,
    detalhes,
    erros,
  });
}
