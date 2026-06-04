import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { syncGoogleCalendarComClientes } from "@/lib/integrations/google-calendar-clientes-sync";

/**
 * GET /api/cron/google-calendar-poll
 *
 * Polling do Google Calendar a cada 15min (configurado em railway.toml).
 * Itera sobre TODOS os usuários com UserGoogleAuth e sincroniza o
 * Calendar de cada um contra a base compartilhada de ClienteBackoffice.
 *
 * Refactor Fase 2 (2026-05): migrado de admin global (GOOGLE_REFRESH_TOKEN)
 * pra per-user OAuth (UserGoogleAuth). Hoje só Eduardo está conectado,
 * mas o codigo já suporta multi-tenant — quando outro assessor conectar,
 * o sync inclui automaticamente o calendar dele.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const guardErr = guardCron(req);
  if (guardErr) return guardErr;

  const usuarios = await prisma.userGoogleAuth.findMany({
    select: { userId: true, googleEmail: true },
  });

  if (usuarios.length === 0) {
    return NextResponse.json({
      ok: true,
      message: "Nenhum usuário com Google conectado.",
      usuariosSincronizados: 0,
    });
  }

  const log = await prisma.btgSyncLog.create({
    data: { tipo: "google-calendar-poll", trigger: "cron" },
  });

  let totalUpsert = 0;
  let totalRemovidas = 0;
  let totalRecomp = 0;
  let totalContatos = 0;
  let totalMatchEmail = 0;
  let totalMatchUnico = 0;
  let totalMatchSubstring = 0;
  const errosAgregados: Array<{ user: string; etapa: string; motivo: string }> = [];

  for (const u of usuarios) {
    try {
      const result = await syncGoogleCalendarComClientes({
        userId: u.userId,
        lookaheadDias: 60,
        lookbackDias: 7,
      });
      totalUpsert += result.reunioesUpsert;
      totalRemovidas += result.reunioesRemovidas;
      totalRecomp += result.agregadosRecomputados;
      totalContatos += result.contatosAtualizados;
      totalMatchEmail += result.matchEmail;
      totalMatchUnico += result.matchNomeUnico;
      totalMatchSubstring += result.matchNomeSubstring;
      for (const e of result.erros) {
        errosAgregados.push({ user: u.googleEmail, ...e });
      }
    } catch (e) {
      errosAgregados.push({
        user: u.googleEmail,
        etapa: "sync",
        motivo: e instanceof Error ? e.message : "?",
      });
    }
  }

  await prisma.btgSyncLog.update({
    where: { id: log.id },
    data: {
      finalizado: new Date(),
      sucesso: errosAgregados.length === 0,
      contasProcessadas: totalUpsert + totalRemovidas + totalContatos,
      contasComErro: errosAgregados.length,
      resumo: `${usuarios.length}u · ${totalUpsert} upsert · ${totalRemovidas} removidas · ${totalRecomp} recomp · ${totalContatos} contatos · match: ${totalMatchEmail}e/${totalMatchUnico}u/${totalMatchSubstring}s`,
      erros: errosAgregados.length > 0 ? errosAgregados : undefined,
    },
  });

  return NextResponse.json({
    ok: errosAgregados.length === 0,
    usuariosSincronizados: usuarios.length,
    reunioesUpsert: totalUpsert,
    reunioesRemovidas: totalRemovidas,
    agregadosRecomputados: totalRecomp,
    contatosAtualizados: totalContatos,
    matchEmail: totalMatchEmail,
    matchNomeUnico: totalMatchUnico,
    matchNomeSubstring: totalMatchSubstring,
    erros: errosAgregados,
  });
}
