import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { rbacEnforcementHabilitado, assertClienteVisivel } from "@/lib/rbac";
import { getAuthContext } from "@/lib/auth-helpers";

const ALLOWED = [
  "visaoFamiliar",
  "objetivoPrincipal",
  "horizonteAnos",
  "perfilRisco",
  "alocacaoAlvo",
  "riscosPrincipais",
  "proximosPassos",
  "resumoExecutivo",
] as const;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // RBAC — Camada 2 (escopo). Editar plano fora do escopo = 404 (não pode ver
    // ⇒ não pode editar). Checagem ANTES do upsert. Flag RBAC_ENFORCEMENT
    // (default OFF) → idêntico a hoje.
    if (await rbacEnforcementHabilitado()) {
      const ctx = await getAuthContext();
      const { visivel } = await assertClienteVisivel(id, ctx);
      if (!visivel) {
        return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
      }
    }

    const body = await req.json();
    const data: Record<string, unknown> = {};
    for (const k of ALLOWED) {
      if (k in body) {
        data[k] = k === "horizonteAnos" && body[k] != null ? Number(body[k]) : body[k];
      }
    }
    const plano = await prisma.planoUmaPagina.upsert({
      where: { clienteId: id },
      create: { clienteId: id, ...data },
      update: data,
    });
    return NextResponse.json(plano);
  } catch (error) {
    console.error("Erro plano:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
