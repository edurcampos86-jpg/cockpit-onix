/**
 * GET /api/cron/juridico-email-poll
 *
 * Cron a cada 30min: pra cada User com Gmail OAuth conectado, busca
 * emails de plataformas de assinatura (Clicksign, DocuSign, etc) das
 * últimas 24h com PDF anexo e processa via pipeline do cofre.
 *
 * Auth: Bearer CRON_SECRET (guardCron).
 *
 * Idempotência: IngestaoEmail.gmailMessageId unique + dedup por hash
 * SHA-256 no pipeline registrarUploadContrato.
 */
import { NextResponse } from "next/server";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { listarUsuariosComGmail, rodarComLogDeErro } from "@/lib/juridico/email-ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  const blocked = guardCron(req);
  if (blocked) return blocked;

  const userIds = await listarUsuariosComGmail();
  if (userIds.length === 0) {
    return NextResponse.json({
      ok: true,
      mensagem: "Nenhum usuário com Gmail conectado — nada a fazer",
    });
  }

  const resultados = [];
  for (const userId of userIds) {
    try {
      const r = await rodarComLogDeErro(userId, {
        backfill: false,
        janelaDias: 1,
        limit: 50,
      });
      resultados.push({ userId, ok: true, ...r });
    } catch (e) {
      resultados.push({
        userId,
        ok: false,
        erro: (e as Error).message,
      });
    }
  }

  return NextResponse.json({ ok: true, resultados });
}
