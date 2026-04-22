import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * PATCH /api/painel-do-dia/sugestoes/[id]
 * Estados: accepted | snoozed | dismissed
 *
 * Body: { status, snoozedUntil? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json()) as {
    status?: "accepted" | "snoozed" | "dismissed";
    snoozedUntil?: string;
    snoozeMinutes?: number;
  };

  const snoozedUntil =
    body.snoozedUntil
      ? new Date(body.snoozedUntil)
      : typeof body.snoozeMinutes === "number"
        ? new Date(Date.now() + body.snoozeMinutes * 60 * 1000)
        : null;

  const existente = await prisma.painelSugestao.findFirst({
    where: { id, userId: session.userId },
  });
  if (!existente) {
    return NextResponse.json({ error: "nao encontrada" }, { status: 404 });
  }

  const upd = await prisma.painelSugestao.update({
    where: { id },
    data: {
      status: body.status ?? existente.status,
      snoozedUntil,
      resolvedAt:
        body.status === "accepted" || body.status === "dismissed"
          ? new Date()
          : null,
    },
  });
  return NextResponse.json(upd);
}
