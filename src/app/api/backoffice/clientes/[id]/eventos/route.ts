import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { rbacEnforcementHabilitado, assertClienteVisivel } from "@/lib/rbac";
import { getAuthContext } from "@/lib/auth-helpers";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // RBAC — Camada 2 (escopo). Criar evento fora do escopo = 404 (não pode ver
    // ⇒ não pode editar). Checagem ANTES do create. Flag RBAC_ENFORCEMENT
    // (default OFF) → idêntico a hoje.
    if (await rbacEnforcementHabilitado()) {
      const ctx = await getAuthContext();
      const { visivel } = await assertClienteVisivel(id, ctx);
      if (!visivel) {
        return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
      }
    }

    const body = await req.json();
    if (!body.titulo || !body.data) {
      return NextResponse.json({ error: "Título e data obrigatórios" }, { status: 400 });
    }
    const evento = await prisma.eventoVida.create({
      data: {
        clienteId: id,
        tipo: String(body.tipo || "outro"),
        titulo: String(body.titulo),
        data: new Date(body.data),
        recorrente: !!body.recorrente,
        lembrar: body.lembrar !== false,
        notas: body.notas || null,
      },
    });
    return NextResponse.json(evento);
  } catch (error) {
    console.error("Erro criar evento:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
