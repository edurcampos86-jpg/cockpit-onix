import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import * as btg from "@/lib/integrations/btg";

/**
 * POST /api/backoffice/btg-stvm
 * Body: { startDate?: "YYYY-MM-DD", endDate?: "YYYY-MM-DD" }
 * Default: primeiro dia do mês atual até hoje.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Não autenticado" }, { status: 401 });
  }

  let body: { startDate?: string; endDate?: string } = {};
  try { body = await req.json(); } catch { /* ok */ }

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startDate = body.startDate || firstOfMonth.toISOString().slice(0, 10);
  const endDate = body.endDate || today.toISOString().slice(0, 10);

  const log = await prisma.btgSyncLog.create({
    data: { tipo: "stvm-report", trigger: "manual", userId: session.userId, resumo: `${startDate} → ${endDate}` },
  });

  const r = await btg.getStvmReport(startDate, endDate);

  await prisma.btgSyncLog.update({
    where: { id: log.id },
    data: {
      finalizado: new Date(),
      sucesso: r.status === 200,
      resumo: `${startDate} → ${endDate} · status=${r.status}`,
    },
  });

  if (r.status !== 200) {
    return NextResponse.json(
      {
        success: false,
        message: `BTG STVM retornou ${r.status}`,
        sample: r.raw.slice(0, 1000),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, startDate, endDate, data: r.body });
}
