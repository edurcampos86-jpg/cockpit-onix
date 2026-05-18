import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getConfig } from "@/lib/config-db";
import { fetchConversas, VENDEDORES_CONFIG } from "@/lib/datacrazy";

/**
 * GET /api/backoffice/grupos-datacrazy
 *
 * Lista todos os grupos WhatsApp detectados nas instâncias Datacrazy
 * configuradas, junto com o mapeamento atual em GrupoCliente (se houver).
 *
 * Usado pela UI de vinculação: Eduardo vê grupos disponíveis, escolhe
 * cliente e vincula. Só admin.
 *
 * Query opcional:
 *   ?soNaoMapeados=true — filtra só grupos sem mapeamento
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Apenas admin" }, { status: 403 });
  }

  const token = await getConfig("DATACRAZY_TOKEN") ?? process.env.DATACRAZY_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "DATACRAZY_TOKEN não configurado" },
      { status: 400 },
    );
  }

  const url = new URL(req.url);
  const soNaoMapeados = url.searchParams.get("soNaoMapeados") === "true";

  // Fetch grupos de todas instâncias (até 5 páginas = 500 conversas/instância)
  const grupos: Array<{
    externalId: string;
    nome: string;
    instanceId: string;
    instanceNome: string;
    contactId: string | null;
    lastMessageAt: string | null;
  }> = [];

  for (const [nome, config] of Object.entries(VENDEDORES_CONFIG)) {
    for (const instanceId of config.instanceIds) {
      try {
        const conversas = await fetchConversas(instanceId, token, 5);
        for (const conv of conversas) {
          if ((conv as { isGroup?: boolean }).isGroup !== true) continue;
          const externalId = String(conv.id ?? conv._id ?? "");
          if (!externalId) continue;
          grupos.push({
            externalId,
            nome: String(conv.name ?? "(sem nome)"),
            instanceId,
            instanceNome: nome,
            contactId:
              ((conv.contact as Record<string, unknown> | undefined)?.contactId as string | undefined) ?? null,
            lastMessageAt:
              (conv.lastMessageDate as string | undefined) ??
              (conv.updatedAt as string | undefined) ??
              null,
          });
        }
      } catch (e) {
        console.error(`[grupos-datacrazy] erro em ${nome}/${instanceId}:`, e);
      }
    }
  }

  // Carrega mapeamentos existentes
  const ids = grupos.map((g) => g.externalId);
  const mapeamentos = await prisma.grupoCliente.findMany({
    where: { groupExternalId: { in: ids } },
    select: {
      id: true,
      groupExternalId: true,
      clienteId: true,
      cliente: { select: { nome: true, numeroConta: true } },
    },
  });
  const porGroupId = new Map(mapeamentos.map((m) => [m.groupExternalId, m]));

  const resultado = grupos.map((g) => {
    const map = porGroupId.get(g.externalId);
    return {
      ...g,
      mapeamentoId: map?.id ?? null,
      clienteId: map?.clienteId ?? null,
      clienteNome: map?.cliente?.nome ?? null,
      clienteConta: map?.cliente?.numeroConta ?? null,
    };
  });

  const filtrado = soNaoMapeados
    ? resultado.filter((g) => !g.mapeamentoId)
    : resultado;

  // Ordena: não-mapeados primeiro, depois por lastMessageAt desc
  filtrado.sort((a, b) => {
    if (!!a.mapeamentoId !== !!b.mapeamentoId) {
      return a.mapeamentoId ? 1 : -1;
    }
    const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return tb - ta;
  });

  return NextResponse.json({ grupos: filtrado, total: filtrado.length });
}
