import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * GET /api/backoffice/grupos-clientes
 * Lista todos mapeamentos grupo→cliente.
 *
 * POST /api/backoffice/grupos-clientes
 * Cria mapeamento. Body: { groupExternalId, clienteId, instanceId, nomeGrupo? }
 *
 * Só admin.
 */

async function requireAdmin() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (session.role !== "admin") {
    return { error: NextResponse.json({ error: "Apenas admin" }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const mapeamentos = await prisma.grupoCliente.findMany({
    orderBy: { criadoEm: "desc" },
    select: {
      id: true,
      groupExternalId: true,
      nomeGrupo: true,
      instanceId: true,
      criadoEm: true,
      cliente: { select: { id: true, nome: true, numeroConta: true } },
    },
  });
  return NextResponse.json({ mapeamentos, total: mapeamentos.length });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const body = await req.json();
  const groupExternalId = String(body.groupExternalId ?? "").trim();
  const clienteId = String(body.clienteId ?? "").trim();
  const instanceId = String(body.instanceId ?? "").trim();
  const nomeGrupo = body.nomeGrupo ? String(body.nomeGrupo).trim() : null;

  if (!groupExternalId || !clienteId || !instanceId) {
    return NextResponse.json(
      { error: "groupExternalId, clienteId e instanceId obrigatórios" },
      { status: 400 },
    );
  }

  // Valida que o cliente existe
  const cliente = await prisma.clienteBackoffice.findUnique({
    where: { id: clienteId },
    select: { id: true, nome: true },
  });
  if (!cliente) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  // Upsert (substitui mapeamento existente se houver)
  const r = await prisma.grupoCliente.upsert({
    where: { groupExternalId },
    create: { groupExternalId, clienteId, instanceId, nomeGrupo },
    update: { clienteId, instanceId, nomeGrupo },
  });

  return NextResponse.json({ ok: true, mapeamento: r });
}
