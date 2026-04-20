import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { SyncRequestStatus } from "@/lib/painel-do-dia/types";

/**
 * PATCH: cowork atualiza status de uma SyncRequest
 * (pending -> in-progress -> done/error).
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
    status: SyncRequestStatus;
    error?: string;
  };

  if (!["pending", "in-progress", "done", "error"].includes(body.status)) {
    return NextResponse.json({ error: "status invalido" }, { status: 400 });
  }

  const existente = await prisma.syncRequest.findFirst({
    where: { id, userId: session.userId },
  });
  if (!existente) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const atualizada = await prisma.syncRequest.update({
    where: { id },
    data: {
      status: body.status,
      error: body.error ?? null,
      completedAt:
        body.status === "done" || body.status === "error" ? new Date() : null,
    },
  });

  return NextResponse.json(atualizada);
}
