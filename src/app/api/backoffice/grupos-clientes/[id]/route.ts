import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * DELETE /api/backoffice/grupos-clientes/[id]
 * Remove mapeamento grupo→cliente. Só admin.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Apenas admin" }, { status: 403 });
  }

  const { id } = await params;
  try {
    await prisma.grupoCliente.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Mapeamento não encontrado" }, { status: 404 });
  }
}
