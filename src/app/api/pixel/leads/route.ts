/**
 * GET /api/pixel/leads?subpersona=&limit=&offset=
 * Leads com origem de tracking (vindos do Pixel/UTM), paginado.
 * Auth: sessão (proxy padrão).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const subpersona = url.searchParams.get("subpersona")?.trim() || undefined;
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  const where = {
    firstEventId: { not: null },
    ...(subpersona ? { sourceSubpersona: subpersona } : {}),
  };

  const [total, leads] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: { enteredAt: "desc" },
      skip: offset,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        stage: true,
        temperature: true,
        enteredAt: true,
        sourceSubpersona: true,
        sourceDor: true,
        sourceProjeto: true,
      },
    }),
  ]);

  return NextResponse.json({ total, limit, offset, leads });
}
