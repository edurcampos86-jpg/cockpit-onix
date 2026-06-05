import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { sendSlackMessage } from "@/lib/integrations/slack";
import { auditarTodas, type ResultadoAuditoria } from "@/lib/integrations/audit-integracoes";
import {
  decidirAlerta,
  type AcaoAlerta,
  type EstadoAuditoria,
  type StatusIntegracao,
} from "@/lib/integrations/audit-integracoes-core";

/**
 * GET /api/cron/integration-audit
 *
 * Auditor de Integrações (a cada 30min via cron.yml). Testa cada integração
 * com token, auto-cura o recuperável (refresh) e alerta no Slack quando uma
 * integração ENTRA em "precisa_reconectar" — com dedupe (1 alerta na
 * transição, reenvio 1x/dia, "resolvido" ao voltar).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NOME_INTEGRACAO: Record<ResultadoAuditoria["integracao"], string> = {
  google: "Google (Calendar/Gmail)",
  microsoft: "Microsoft (Graph)",
  btg: "BTG Pactual",
};

function baseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  return "";
}

function tempoDecorrido(desde: Date | null, agora: Date): string {
  if (!desde) return "agora";
  const min = Math.max(1, Math.round((agora.getTime() - desde.getTime()) / 60000));
  if (min < 60) return `${min}min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function montarMensagem(
  acao: AcaoAlerta,
  r: ResultadoAuditoria,
  estado: EstadoAuditoria,
  agora: Date,
  link: string,
): string {
  const nome = NOME_INTEGRACAO[r.integracao];
  const quem = r.email ?? "global";
  const reconectar = link ? `${link}/integracoes` : "/integracoes";

  if (acao === "resolvido") {
    return `:white_check_mark: *Integração recuperada* — ${nome} (${quem}) voltou ao normal.`;
  }

  const lembrete = acao === "reenvio" ? " _(lembrete diário)_" : "";
  const classe =
    r.status === "precisa_reconectar"
      ? "precisa reconectar (consentimento manual)"
      : "instável (transitório persistente)";
  const motivo = r.mensagem ? `\n> ${r.mensagem.slice(0, 200)}` : "";
  const ha = tempoDecorrido(estado.statusDesde, agora);

  return (
    `:rotating_light: *Integração caída*${lembrete} — ${nome} (${quem})\n` +
    `Classe: ${classe}\n` +
    `Caída há ${ha}${motivo}\n` +
    `Reconectar: ${reconectar}`
  );
}

export async function GET(req: NextRequest) {
  const guardErr = guardCron(req);
  if (guardErr) return guardErr;

  const agora = new Date();
  const log = await prisma.btgSyncLog.create({
    data: { tipo: "integration-audit", trigger: "cron" },
  });

  const contagem: Record<StatusIntegracao, number> = {
    ok: 0,
    refresh_recuperado: 0,
    precisa_reconectar: 0,
    transitorio: 0,
  };
  const erros: Array<{ conta: string; motivo: string }> = [];
  let alertasEnviados = 0;

  try {
    const resultados = await auditarTodas();

    for (const r of resultados) {
      contagem[r.status]++;

      const prevRow = await prisma.integracaoAuditoria.findUnique({
        where: { chave: r.chave },
      });
      const prev: EstadoAuditoria = prevRow
        ? {
            status: prevRow.status as StatusIntegracao,
            statusDesde: prevRow.statusDesde,
            alertadoEm: prevRow.alertadoEm,
            transitorioStreak: prevRow.transitorioStreak,
          }
        : { status: null, statusDesde: null, alertadoEm: null, transitorioStreak: 0 };

      const { acao, estado } = decidirAlerta(prev, r.status, agora);

      await prisma.integracaoAuditoria.upsert({
        where: { chave: r.chave },
        create: {
          chave: r.chave,
          integracao: r.integracao,
          userId: r.userId,
          status: estado.status ?? r.status,
          statusDesde: estado.statusDesde,
          alertadoEm: estado.alertadoEm,
          transitorioStreak: estado.transitorioStreak,
          ultimoErro: r.mensagem,
        },
        update: {
          integracao: r.integracao,
          userId: r.userId,
          status: estado.status ?? r.status,
          statusDesde: estado.statusDesde,
          alertadoEm: estado.alertadoEm,
          transitorioStreak: estado.transitorioStreak,
          ultimoErro: r.mensagem,
        },
      });

      if (acao !== "nada") {
        const enviado = await sendSlackMessage(
          montarMensagem(acao, r, estado, agora, baseUrl()),
        );
        if (enviado) alertasEnviados++;
        else erros.push({ conta: r.chave, motivo: "Slack não configurado/falhou" });
      }
    }

    const resumo =
      `${resultados.length} integr. · ok:${contagem.ok} ` +
      `recuperado:${contagem.refresh_recuperado} ` +
      `reconectar:${contagem.precisa_reconectar} ` +
      `transitorio:${contagem.transitorio} · alertas:${alertasEnviados}`;

    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: {
        finalizado: new Date(),
        sucesso: erros.length === 0,
        contasProcessadas: resultados.length,
        contasComErro: erros.length,
        resumo,
        erros: erros.length > 0 ? erros : undefined,
      },
    });

    return NextResponse.json({
      ok: true,
      auditadas: resultados.length,
      contagem,
      alertasEnviados,
      resultados: resultados.map((r) => ({
        integracao: r.integracao,
        email: r.email,
        status: r.status,
      })),
    });
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: {
        finalizado: new Date(),
        sucesso: false,
        contasComErro: 1,
        resumo: `falha: ${motivo}`,
      },
    });
    return NextResponse.json({ ok: false, erro: motivo }, { status: 500 });
  }
}
