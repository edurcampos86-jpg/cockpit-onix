import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type {
  CoworkSyncPayload,
  EmailAcao,
  EventoAgenda,
  QuadrantePM,
} from "@/lib/painel-do-dia/types";

/**
 * Endpoint de ingestao do cowork (Chrome MCP).
 *
 * O Claude, rodando na maquina do usuario, abre Outlook Web ou Priority Matrix,
 * extrai os dados e faz POST aqui. Este handler grava no cache (calendar/mail)
 * ou reconcilia AcaoPainel (ms-todo/priority-matrix).
 *
 * Protocolo: ver docs/painel-do-dia-cowork-skill.md
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as CoworkSyncPayload;
  const fontesValidas = ["ms-calendar", "ms-mail", "ms-todo", "priority-matrix"];
  if (!fontesValidas.includes(payload.source)) {
    return NextResponse.json({ error: "source invalido" }, { status: 400 });
  }

  try {
    if (payload.source === "ms-calendar") {
      await persistirCache(
        session.userId,
        "ms-calendar",
        payload.items as EventoAgenda[]
      );
    } else if (payload.source === "ms-mail") {
      await persistirCache(
        session.userId,
        "ms-mail",
        payload.items as EmailAcao[]
      );
    } else {
      // ms-todo | priority-matrix: reconcilia AcaoPainel por externoId
      await reconciliarAcoes(
        session.userId,
        payload.source,
        payload.items as AcaoExternaInput[]
      );
    }

    return NextResponse.json({ ok: true, source: payload.source });
  } catch (error) {
    console.error("Erro no cowork-sync:", error);
    return NextResponse.json(
      { error: "falha ao processar sync" },
      { status: 500 }
    );
  }
}

async function persistirCache(
  userId: string,
  source: "ms-calendar" | "ms-mail",
  items: EventoAgenda[] | EmailAcao[]
) {
  await prisma.painelCacheExterno.upsert({
    where: { userId_source: { userId, source } },
    update: { payload: items, syncedAt: new Date() },
    create: { userId, source, payload: items },
  });
}

type AcaoExternaInput = {
  id?: string;
  externoId: string;
  titulo: string;
  concluida: boolean;
  vence?: string;
  importante?: boolean;
  noMeuDia?: boolean;
  quadrante?: QuadrantePM;
  projetoPm?: string;
};

async function reconciliarAcoes(
  userId: string,
  origem: "ms-todo" | "priority-matrix",
  items: AcaoExternaInput[]
) {
  for (const item of items) {
    // Correlaciona 1) por id local (quando cowork aplica um pending create),
    // 2) ou por externoId (quando e leitura de estado da fonte)
    const existente = item.id
      ? await prisma.acaoPainel.findFirst({
          where: { userId, origem, id: item.id },
        })
      : await prisma.acaoPainel.findFirst({
          where: { userId, origem, externoId: item.externoId },
        });

    if (existente) {
      await prisma.acaoPainel.update({
        where: { id: existente.id },
        data: {
          titulo: item.titulo,
          concluida: item.concluida,
          vence: item.vence ? new Date(item.vence) : null,
          importante: item.importante ?? existente.importante,
          noMeuDia: item.noMeuDia ?? existente.noMeuDia,
          quadrante: item.quadrante ?? null,
          projetoPm: item.projetoPm ?? null,
          externoId: item.externoId,
          pendingSync: false,
          syncOp: null,
          syncError: null,
        },
      });
    } else {
      await prisma.acaoPainel.create({
        data: {
          userId,
          titulo: item.titulo,
          concluida: item.concluida,
          vence: item.vence ? new Date(item.vence) : null,
          importante: item.importante ?? false,
          noMeuDia: item.noMeuDia ?? false,
          quadrante: item.quadrante ?? null,
          projetoPm: item.projetoPm ?? null,
          origem,
          externoId: item.externoId,
          pendingSync: false,
        },
      });
    }
  }
}

/**
 * GET retorna a lista de acoes pendingSync que o cowork precisa aplicar na origem
 * (drena fila antes de ler estado atualizado).
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pendentes = await prisma.acaoPainel.findMany({
    where: { userId: session.userId, pendingSync: true },
    orderBy: { updatedAt: "asc" },
  });

  return NextResponse.json({ pendentes });
}
