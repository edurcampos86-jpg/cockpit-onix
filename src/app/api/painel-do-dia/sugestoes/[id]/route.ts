import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const STATUS_VALIDOS = ["accepted", "snoozed", "dismissed"] as const;
type StatusSugestao = (typeof STATUS_VALIDOS)[number];

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
    status?: StatusSugestao;
    snoozeMinutes?: number;
  };

  if (!body.status || !STATUS_VALIDOS.includes(body.status)) {
    return NextResponse.json({ error: "status invalido" }, { status: 400 });
  }

  const existente = await prisma.painelSugestao.findFirst({
    where: { id, userId: session.userId },
  });
  if (!existente) {
    return NextResponse.json({ error: "nao encontrada" }, { status: 404 });
  }

  const now = new Date();
  const data: Parameters<typeof prisma.painelSugestao.update>[0]["data"] = {
    status: body.status,
  };
  if (body.status === "snoozed") {
    data.snoozedUntil = new Date(
      now.getTime() + (body.snoozeMinutes ?? 30) * 60 * 1000
    );
  } else {
    data.resolvedAt = now;
  }

  const atualizada = await prisma.painelSugestao.update({
    where: { id },
    data,
  });

  return NextResponse.json(atualizada);
}
