import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { rbacEnforcementHabilitado, clienteVisivelPorAssessorCge } from "@/lib/rbac";
import { getAuthContext } from "@/lib/auth-helpers";

/**
 * PATCH /api/backoffice/clientes/[id]/apelido
 *
 * Edita apenas o campo manual `apelido` (e os campos de auditoria
 * apelidoEditadoEm + apelidoEditadoPor). Endpoint separado porque:
 *   1. É o único campo MANUAL (FIELD_SOURCE_POLICY) — semanticamente
 *      diferente de qualquer outra edição de cadastro
 *   2. Não precisa de admin (qualquer assessor humaniza o nome do cliente
 *      que ele atende — apenas autenticação)
 *   3. Validação específica: max 50 caracteres, trim, null = remover
 *
 * Usa [id] (cuid) e não [conta] porque numeroConta não é @unique no schema.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;
  let body: { apelido?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const apelidoRaw = body.apelido;
  if (apelidoRaw !== null && apelidoRaw !== undefined && typeof apelidoRaw !== "string") {
    return NextResponse.json({ error: "Apelido deve ser string ou null" }, { status: 400 });
  }
  const apelidoTrim = typeof apelidoRaw === "string" ? apelidoRaw.trim() : null;
  if (apelidoTrim && apelidoTrim.length > 50) {
    return NextResponse.json(
      { error: "Apelido muito longo (max 50 caracteres)" },
      { status: 400 },
    );
  }
  const apelidoFinal = apelidoTrim && apelidoTrim.length > 0 ? apelidoTrim : null;

  try {
    const anterior = await prisma.clienteBackoffice.findUnique({
      where: { id },
      select: { apelido: true, assessorCge: true },
    });
    if (!anterior) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    // RBAC — Camada 2 (escopo). Editar apelido fora do escopo = 404 (não pode
    // ver ⇒ não pode editar). Reusa o assessorCge já carregado — sem 2ª query.
    // Checagem ANTES do update. Flag RBAC_ENFORCEMENT (default OFF) → idêntico a hoje.
    if (await rbacEnforcementHabilitado()) {
      const ctx = await getAuthContext();
      if (!(await clienteVisivelPorAssessorCge(anterior.assessorCge, ctx))) {
        return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
      }
    }

    const atualizado = await prisma.clienteBackoffice.update({
      where: { id },
      data: {
        apelido: apelidoFinal,
        apelidoEditadoEm: new Date(),
        apelidoEditadoPor: session.userId,
      },
      select: {
        id: true,
        numeroConta: true,
        nome: true,
        nomeCompleto: true,
        apelido: true,
        apelidoEditadoEm: true,
        apelidoEditadoPor: true,
      },
    });

    // Auditoria leve: usa BtgSyncLog porque AuditLog ainda não existe no
    // schema. Best-effort — não bloqueia se falhar.
    void prisma.btgSyncLog
      .create({
        data: {
          tipo: "apelido_edit",
          trigger: "manual",
          userId: session.userId,
          finalizado: new Date(),
          sucesso: true,
          resumo: `Apelido cliente ${atualizado.numeroConta}: "${anterior.apelido ?? ""}" → "${apelidoFinal ?? ""}"`,
        },
      })
      .catch((e) => console.warn("[apelido] audit log falhou:", e));

    return NextResponse.json({ success: true, cliente: atualizado });
  } catch (error) {
    console.error("[PATCH apelido] erro:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar apelido" },
      { status: 500 },
    );
  }
}
