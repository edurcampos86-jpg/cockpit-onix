import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { assertClienteVisivel, rbacEnforcementHabilitado } from "@/lib/rbac";
import {
  chaveLockReuniaoManual,
  externalIdReuniaoManual,
  validarMutacaoReuniaoManual,
} from "@/lib/reuniao-manual-core";
import { recomputeAgregadosReuniao, upsertReuniao } from "@/lib/reunioes";
import { getSession } from "@/lib/session";

/**
 * PUT/DELETE /api/backoffice/clientes/[id]/reunioes/manual
 *
 * PUT:    { tipo: "ultima" | "proxima", data: ISO, relato?: string }
 * DELETE: { tipo: "ultima" | "proxima" }
 *
 * A linha manual vive em ReuniaoCliente, a fonte canonica dos agregados. Escrever
 * direto em ClienteBackoffice seria temporario: o proximo sync de agenda faria
 * recompute e apagaria a edicao humana. DELETE remove somente o slot manual.
 */
type RouteContext = { params: Promise<{ id: string }> };

async function mutarReuniaoManual(
  req: NextRequest,
  { params }: RouteContext,
  operacao: "salvar" | "remover",
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { id } = await params;
    if (await rbacEnforcementHabilitado()) {
      const ctx = await getAuthContext();
      const { visivel } = await assertClienteVisivel(id, ctx);
      if (!visivel) {
        return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
      }
    }

    const entrada = validarMutacaoReuniaoManual(await req.json(), new Date(), operacao);
    if (!entrada.ok) {
      return NextResponse.json({ error: entrada.erro }, { status: 400 });
    }

    const cliente = await prisma.clienteBackoffice.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!cliente) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const externalId = externalIdReuniaoManual(entrada.tipo);
    const resultado = await prisma.$transaction(async (tx) => {
      let operacao: "created" | "updated" | "noop" | "removed" = "noop";

      // userId NULL não é considerado igual a NULL em unique constraints do
      // Postgres. Serializa o slot por cliente+tipo para dois PUT simultâneos
      // não passarem juntos pelo find/create do upsert.
      const chaveLock = chaveLockReuniaoManual(id, entrada.tipo);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('onix-reuniao-manual'), hashtext(${chaveLock}))`;

      // Blindagem adicional: se uma versão anterior/incompleta tiver deixado
      // duplicatas, conserva a mais recentemente editada e remove as demais
      // DENTRO do mesmo lock antes de salvar ou apagar.
      const existentes = await tx.reuniaoCliente.findMany({
        where: { clienteId: id, userId: null, source: "manual", externalId },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        select: { id: true },
      });
      if (existentes.length > 1) {
        await tx.reuniaoCliente.deleteMany({
          where: { id: { in: existentes.slice(1).map((r) => r.id) } },
        });
      }

      if (entrada.data === null) {
        const removida = await tx.reuniaoCliente.deleteMany({
          where: { clienteId: id, userId: null, source: "manual", externalId },
        });
        if (removida.count > 0) operacao = "removed";
      } else {
        operacao = await upsertReuniao(
          {
            clienteId: id,
            userId: null,
            source: "manual",
            externalId,
            startAt: entrada.data,
            titulo: entrada.relato,
            matchedVia: "manual",
            rawPayload: {
              slot: entrada.tipo,
              editadoPor: session.userId,
              editadoEm: new Date().toISOString(),
            },
          },
          tx,
        );
      }

      await recomputeAgregadosReuniao(id, tx);
      const agregados = await tx.clienteBackoffice.findUniqueOrThrow({
        where: { id },
        select: {
          ultimaReuniaoAt: true,
          ultimaReuniaoSource: true,
          ultimaReuniaoConfirmadaManualmente: true,
          proximaReuniaoAt: true,
          proximaReuniaoSource: true,
          proximaReuniaoConfirmadaManualmente: true,
        },
      });
      return { operacao, agregados };
    });

    return NextResponse.json({
      tipo: entrada.tipo,
      operacao: resultado.operacao,
      dataManual: entrada.data?.toISOString() ?? null,
      ultimaReuniaoAt: resultado.agregados.ultimaReuniaoAt?.toISOString() ?? null,
      ultimaReuniaoSource: resultado.agregados.ultimaReuniaoSource,
      ultimaReuniaoConfirmadaManualmente:
        resultado.agregados.ultimaReuniaoConfirmadaManualmente,
      proximaReuniaoAt: resultado.agregados.proximaReuniaoAt?.toISOString() ?? null,
      proximaReuniaoSource: resultado.agregados.proximaReuniaoSource,
      proximaReuniaoConfirmadaManualmente:
        resultado.agregados.proximaReuniaoConfirmadaManualmente,
    });
  } catch (error) {
    console.error("Erro ao editar reunião manual:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, context: RouteContext) {
  return mutarReuniaoManual(req, context, "salvar");
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  return mutarReuniaoManual(req, context, "remover");
}
