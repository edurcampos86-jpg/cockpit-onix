/**
 * GET /api/cron/btg-freshness
 * Heartbeat de freshness dos dados BTG (seg-sex via cron.yml).
 * Auth: Bearer CRON_SECRET (guardCron). Delega a lógica in-process.
 */
import { NextResponse } from "next/server";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { verificarFreshnessBtg } from "@/lib/backoffice/btg-freshness";
import { checkDatacrazyPollFreshness } from "@/lib/integrations/datacrazy-poll-runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const blocked = guardCron(req);
  if (blocked) return blocked;
  const resultado = await verificarFreshnessBtg();
  // Heartbeat do poll DataCrazy (alimenta "Último contato"). Fica AQUI — job GHA
  // independente do scheduler in-process, então detecta o scheduler morto. A
  // própria função alerta no Slack se estiver stale; aqui só anexamos o estado.
  const datacrazyPoll = await checkDatacrazyPollFreshness();
  return NextResponse.json(
    { ...resultado, datacrazyPoll },
    { status: resultado.ok ? 200 : 500 },
  );
}
