import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { marcarContatoAgora } from "@/lib/painel-do-dia/clientes-esquecidos";

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
    select: { id: true },
  });
  if (!cliente) {
    return NextResponse.json(
      { error: "Cliente não encontrado" },
      { status: 404 },
    );
  }

  const result = await marcarContatoAgora(id);
  return NextResponse.json(result);
}
