import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { marcarContatoAgora } from "@/lib/painel-do-dia/clientes-esquecidos";
import { rbacEnforcementHabilitado, clienteVisivelPorAssessorCge } from "@/lib/rbac";
import { getAuthContext } from "@/lib/auth-helpers";

/**
 * POST /api/painel-do-dia/clientes-esquecidos/[id]/marcar-contato
 *
 * Usuario clicou "Marcar contato" num card de cliente esquecido. Atualiza
 * `ultimoContatoAt = NOW`, sem criar InteracaoCliente (touch informal).
 *
 * Multi-usuario: ClienteBackoffice nao tem userId, eh global da firma.
 * Qualquer usuario logado pode marcar contato.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await context.params;
  const cliente = await prisma.clienteBackoffice.findUnique({
    where: { id },
    select: { id: true, assessorCge: true },
  });
  if (!cliente) {
    return NextResponse.json(
      { error: "Cliente não encontrado" },
      { status: 404 },
    );
  }

  // RBAC — Camada 2 (escopo). Marcar contato fora do escopo = 404 (não pode ver
  // ⇒ não pode editar). Reusa o assessorCge já carregado — sem 2ª query.
  // Checagem ANTES do marcarContatoAgora (write). Flag RBAC_ENFORCEMENT
  // (default OFF) → idêntico a hoje.
  if (await rbacEnforcementHabilitado()) {
    const ctx = await getAuthContext();
    if (!(await clienteVisivelPorAssessorCge(cliente.assessorCge, ctx))) {
      return NextResponse.json(
        { error: "Cliente não encontrado" },
        { status: 404 },
      );
    }
  }

  const result = await marcarContatoAgora(id);
  return NextResponse.json(result);
}
