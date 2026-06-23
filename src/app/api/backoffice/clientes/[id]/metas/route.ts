import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { rbacEnforcementHabilitado, assertClienteVisivel } from "@/lib/rbac";
import { getAuthContext } from "@/lib/auth-helpers";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // RBAC — Camada 2 (escopo). Criar meta fora do escopo = 404 (não pode ver ⇒
    // não pode editar). Checagem ANTES do create. Flag RBAC_ENFORCEMENT (default
    // OFF) → idêntico a hoje.
    if (await rbacEnforcementHabilitado()) {
      const ctx = await getAuthContext();
      const { visivel } = await assertClienteVisivel(id, ctx);
      if (!visivel) {
        return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
      }
    }

    const body = await req.json();
    if (!body.titulo) return NextResponse.json({ error: "Título obrigatório" }, { status: 400 });
    const meta = await prisma.metaCliente.create({
      data: {
        clienteId: id,
        titulo: body.titulo,
        descricao: body.descricao ?? null,
        prazoData: body.prazoData ? new Date(body.prazoData) : null,
        valorAlvo: body.valorAlvo != null ? Number(body.valorAlvo) : null,
        categoria: body.categoria ?? null,
        status: body.status ?? "ativa",
      },
    });
    return NextResponse.json(meta);
  } catch (error) {
    console.error("Erro criar meta:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
