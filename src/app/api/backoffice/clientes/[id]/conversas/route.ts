import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { rbacEnforcementHabilitado, assertClienteVisivel } from "@/lib/rbac";
import { getAuthContext } from "@/lib/auth-helpers";

/**
 * GET /api/backoffice/clientes/[id]/conversas
 *
 * Retorna as conversas WhatsApp vinculadas a um cliente, com as
 * últimas mensagens. Usado pela seção "Conversas — ao vivo" no
 * dossiê do cliente.
 *
 * Query params:
 *   limit=N          (default 50) — quantas mensagens por conversa
 *   conversaId=X     (opcional)   — filtra uma única conversa específica
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;

  // RBAC — Camada 2 (escopo). Flag RBAC_ENFORCEMENT (default OFF) → idêntico a
  // hoje. ON → cliente fora do escopo responde 404 ANTES do findMany — não
  // entrega histórico de WhatsApp nem disfarça com lista vazia.
  if (await rbacEnforcementHabilitado()) {
    const ctx = await getAuthContext();
    const { visivel } = await assertClienteVisivel(id, ctx);
    if (!visivel) {
      return NextResponse.json({ ok: false, message: "Cliente não encontrado" }, { status: 404 });
    }
  }

  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit") ?? "50"),
    200,
  );
  const conversaIdFiltro = req.nextUrl.searchParams.get("conversaId");

  const conversas = await prisma.conversa.findMany({
    where: {
      clienteId: id,
      ...(conversaIdFiltro ? { id: conversaIdFiltro } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    include: {
      mensagens: {
        orderBy: { sentAt: "desc" },
        take: limit,
      },
      _count: { select: { mensagens: true } },
    },
  });

  // Inverte mensagens pra ordem cronológica (mais antiga primeiro) — UX
  // melhor para timeline de chat.
  const payload = conversas.map((c) => ({
    id: c.id,
    externalId: c.externalId,
    contactPhone: c.contactPhone,
    contactName: c.contactName,
    lastMessageAt: c.lastMessageAt,
    totalMensagens: c._count.mensagens,
    mensagens: c.mensagens
      .slice()
      .reverse()
      .map((m) => ({
        id: m.id,
        fromMe: m.fromMe,
        tipo: m.tipo,
        body: m.body,
        mediaUrl: m.mediaUrl,
        sentAt: m.sentAt,
      })),
  }));

  return NextResponse.json({ ok: true, conversas: payload });
}
