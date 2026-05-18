import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { recomputeAgregadosReuniao } from "@/lib/reunioes";

/**
 * POST /api/backoffice/clientes/recompute-agregados
 *
 * Recalcula `proximaReuniaoAt` e `ultimaReuniaoAt` de TODOS os clientes
 * a partir da tabela `ReuniaoCliente`. Usado como backfill one-shot
 * após o refactor que moveu o estado das reuniões pra ReuniaoCliente —
 * valores legacy (escritos direto no ClienteBackoffice antes do refactor)
 * que não têm linha correspondente em ReuniaoCliente são zerados.
 *
 * GET → dry-run: retorna o que MUDARIA sem persistir.
 * POST → executa.
 *
 * Requer admin (mesma proteção dos outros endpoints de backoffice/clientes).
 */

async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }
  if (session.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Apenas admin pode rodar recompute-agregados." },
        { status: 403 },
      ),
    };
  }
  return { session };
}

interface DiffRow {
  id: string;
  nome: string;
  antesProxima: Date | null;
  depoisProxima: Date | null;
  antesUltima: Date | null;
  depoisUltima: Date | null;
}

async function calcularDiffs(): Promise<DiffRow[]> {
  const agora = new Date();
  const clientes = await prisma.clienteBackoffice.findMany({
    select: {
      id: true,
      nome: true,
      proximaReuniaoAt: true,
      ultimaReuniaoAt: true,
    },
  });

  const diffs: DiffRow[] = [];
  for (const c of clientes) {
    const [proxima, ultima] = await Promise.all([
      prisma.reuniaoCliente.findFirst({
        where: { clienteId: c.id, startAt: { gte: agora } },
        orderBy: { startAt: "asc" },
        select: { startAt: true },
      }),
      prisma.reuniaoCliente.findFirst({
        where: { clienteId: c.id, startAt: { lt: agora } },
        orderBy: { startAt: "desc" },
        select: { startAt: true },
      }),
    ]);

    const depoisProxima = proxima?.startAt ?? null;
    const depoisUltima = ultima?.startAt ?? null;

    const mudouProxima =
      (c.proximaReuniaoAt?.getTime() ?? null) !== (depoisProxima?.getTime() ?? null);
    const mudouUltima =
      (c.ultimaReuniaoAt?.getTime() ?? null) !== (depoisUltima?.getTime() ?? null);

    if (mudouProxima || mudouUltima) {
      diffs.push({
        id: c.id,
        nome: c.nome,
        antesProxima: c.proximaReuniaoAt,
        depoisProxima,
        antesUltima: c.ultimaReuniaoAt,
        depoisUltima,
      });
    }
  }
  return diffs;
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const diffs = await calcularDiffs();
  return NextResponse.json({
    dryRun: true,
    totalAfetados: diffs.length,
    diffs: diffs.slice(0, 50), // preview limitado
    truncated: diffs.length > 50,
  });
}

export async function POST() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const clientes = await prisma.clienteBackoffice.findMany({
    select: { id: true },
  });

  const log = await prisma.btgSyncLog.create({
    data: {
      tipo: "recompute-agregados-reuniao",
      trigger: "manual",
      userId: guard.session.userId,
      resumo: `${clientes.length} clientes`,
    },
  });

  let atualizados = 0;
  const erros: Array<{ etapa: string; motivo: string }> = [];
  for (const c of clientes) {
    try {
      await recomputeAgregadosReuniao(c.id);
      atualizados++;
    } catch (e) {
      erros.push({
        etapa: `recompute ${c.id}`,
        motivo: e instanceof Error ? e.message : "?",
      });
    }
  }

  await prisma.btgSyncLog.update({
    where: { id: log.id },
    data: {
      finalizado: new Date(),
      sucesso: erros.length === 0,
      contasProcessadas: atualizados,
      contasComErro: erros.length,
      resumo: `recompute concluído: ${atualizados} clientes atualizados, ${erros.length} erros`,
      erros: erros.length > 0 ? erros.slice(0, 20) : undefined,
    },
  });

  return NextResponse.json({
    success: erros.length === 0,
    totalClientes: clientes.length,
    atualizados,
    erros: erros.slice(0, 20),
  });
}
