/**
 * Endpoint admin temporário para reidratar o módulo Time depois da perda de dados
 * causada pela migração SQLite -> Postgres (commit 57a0fa5 / PR #30).
 *
 * Como funciona:
 *  - Gate em admin (User.role === "admin" OU Pessoa.teamRole === "admin").
 *  - GET retorna um preview (quantas filiais/pessoas tem hoje + quantas a rotina
 *    inseriria) — não escreve nada. Útil pra Eduardo conferir antes.
 *  - POST com `{ "confirm": "yes-recover-the-team" }` roda recoverTeamData.
 *    Idempotente (upsert por CPF / nome).
 *
 * Uso (com session cookie de admin):
 *   curl https://cockpit-onix-production.up.railway.app/api/admin/recover-team \
 *     -b "session=..."
 *
 *   curl -X POST https://cockpit-onix-production.up.railway.app/api/admin/recover-team \
 *     -H "Content-Type: application/json" \
 *     -b "session=..." \
 *     -d '{"confirm":"yes-recover-the-team"}'
 *
 * Remova esse endpoint depois que rodar.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { recoverTeamData } from "@/lib/recover-team-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function snapshot() {
  const [filiais, departamentos, pessoasAtivas, pessoasArquivadas, acordos] = await Promise.all([
    prisma.filial.count(),
    prisma.departamento.count(),
    prisma.pessoa.count({ where: { status: "ativo" } }),
    prisma.pessoa.count({ where: { status: "arquivado" } }),
    prisma.acordoComercial.count(),
  ]);
  return { filiais, departamentos, pessoasAtivas, pessoasArquivadas, acordos };
}

export async function GET() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const antes = await snapshot();
  return NextResponse.json({
    ok: true,
    estadoAtual: antes,
    descricao:
      "Rotina reidrata filiais (3), departamentos (5), pessoas (~20) e acordos comerciais (6). Idempotente — pode rodar várias vezes. PDFs de contrato NÃO são reanexados (Eduardo reanexa via UI).",
    paraExecutar: {
      metodo: "POST",
      body: { confirm: "yes-recover-the-team" },
    },
  });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let payload: { confirm?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (payload?.confirm !== "yes-recover-the-team") {
    return NextResponse.json(
      {
        error: "confirm required",
        hint: 'envie { "confirm": "yes-recover-the-team" } no body',
      },
      { status: 400 },
    );
  }

  const antes = await snapshot();

  try {
    const report = await recoverTeamData(prisma);
    const depois = await snapshot();
    return NextResponse.json({ ok: true, antes, depois, report });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json(
      { ok: false, error: err.message, stack: err.stack },
      { status: 500 },
    );
  }
}
