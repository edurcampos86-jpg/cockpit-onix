import "server-only";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";
import { sendSlackAlertThrottled } from "@/lib/integrations/slack";
import { fetchConversas, fetchMensagens, VENDEDORES_CONFIG } from "@/lib/datacrazy";
import {
  ingestConversa,
  normalizarTipoMensagem,
  extrairBody,
  type ConversaCanonical,
  type MensagemCanonical,
} from "@/lib/integrations/datacrazy-ingest";

/**
 * Lógica compartilhada do polling Datacrazy WhatsApp.
 *
 * Originalmente vivia inline em /api/cron/datacrazy-poll/route.ts.
 * Extraída pra ser reutilizada pelo endpoint admin manual
 * (/api/backoffice/datacrazy-poll-now) que serve como workaround
 * enquanto os crons do Railway estão fora.
 *
 * Mantida idêntica à versão cron — não muda comportamento.
 */

export interface DatacrazyPollResult {
  conversasVistas: number;
  conversasComMudanca: number;
  mensagensNovas: number;
  erros: Array<{ etapa: string; motivo: string }>;
}

/**
 * Janela de captura padrão (minutos). O poll só processa conversas ativas nos
 * últimos `cutoffMinutes`; pra não deixar ponto-cego, a janela tem que cobrir o
 * intervalo entre rodadas consecutivas.
 *
 * O webhook DataCrazy nunca operou, então o poll é a única via — e o GHA NÃO
 * honra o cron de 5 min do cron.yml: medição de 7 dias (BtgSyncLog) deu mediana
 * ~133min e MÁXIMO ~302min (5h, overnight) entre rodadas. 30min antigo deixava
 * ~77% do tempo cego. 720min (12h) ≈ 2,4× o pior gap → cobre overnight + folga
 * pra stalls maiores do GHA. É barato: reprocessar é idempotente (guard `lt` em
 * ultimoContatoAt + short-circuit por `conversaExistente`), não duplica nem regride.
 *
 * Override via Config DB `DATACRAZY_POLL_CUTOFF_MINUTES` (lido na rota cron).
 */
export const DEFAULT_POLL_CUTOFF_MINUTES = 720;

export async function runDatacrazyPoll(opts: {
  token: string;
  cutoffMinutes?: number; // default DEFAULT_POLL_CUTOFF_MINUTES
}): Promise<DatacrazyPollResult> {
  const cutoffMs = (opts.cutoffMinutes ?? DEFAULT_POLL_CUTOFF_MINUTES) * 60 * 1000;
  const erros: Array<{ etapa: string; motivo: string }> = [];
  let conversasVistas = 0;
  let mensagensNovas = 0;
  let conversasComMudanca = 0;

  for (const [nome, config] of Object.entries(VENDEDORES_CONFIG)) {
    for (const instanceId of config.instanceIds) {
      try {
        const conversas = await fetchConversas(instanceId, opts.token, 2);
        conversasVistas += conversas.length;

        const cutoff = Date.now() - cutoffMs;
        const ativas = conversas.filter((c) => {
          const t = c.lastMessageDate ?? c.updatedAt ?? c.lastMessage?.createdAt;
          if (!t) return false;
          return new Date(t).getTime() >= cutoff;
        });

        const ativasGrupo = ativas.filter(
          (c) => (c as { isGroup?: boolean }).isGroup === true,
        );
        if (ativasGrupo.length > 0) {
          const idsGrupo = ativasGrupo
            .map((g) => String(g.id ?? g._id ?? ""))
            .filter(Boolean);
          const mapeamentos = await prisma.grupoCliente.findMany({
            where: { groupExternalId: { in: idsGrupo } },
            select: { groupExternalId: true, clienteId: true },
          });
          const porGroupId = new Map(
            mapeamentos.map((m) => [m.groupExternalId, m.clienteId]),
          );
          for (const g of ativasGrupo) {
            const gid = String(g.id ?? g._id ?? "");
            const clienteId = porGroupId.get(gid);
            if (!clienteId) continue;
            const t = g.lastMessageDate ?? g.updatedAt ?? g.lastMessage?.createdAt;
            if (!t) continue;
            const lastMsgAt = new Date(t);
            await prisma.clienteBackoffice.updateMany({
              where: {
                id: clienteId,
                OR: [
                  { ultimoContatoAt: null },
                  { ultimoContatoAt: { lt: lastMsgAt } },
                ],
              },
              data: { ultimoContatoAt: lastMsgAt },
            });
            conversasComMudanca++;
          }
        }

        const ativasIndividuais = ativas.filter(
          (c) => (c as { isGroup?: boolean }).isGroup !== true,
        );

        for (const conv of ativasIndividuais) {
          const externalId = String(conv.id ?? conv._id ?? "");
          if (!externalId) continue;

          // `ativas` (a montante) já filtrou por timestamp truthy, então este
          // guard é no-op em runtime; existe só pra narrowing de tipo agora que
          // fetchConversas devolve DatacrazyConversa (campos de data são string?).
          const lastMsgTs =
            conv.lastMessageDate ?? conv.updatedAt ?? conv.lastMessage?.createdAt;
          if (!lastMsgTs) continue;
          const lastMsgRemote = new Date(lastMsgTs);
          const conversaExistente = await prisma.conversa.findUnique({
            where: { externalId },
            select: { lastMessageAt: true },
          });

          if (
            conversaExistente?.lastMessageAt &&
            conversaExistente.lastMessageAt.getTime() >= lastMsgRemote.getTime()
          ) {
            continue;
          }

          let msgsRaw: Record<string, unknown>[] = [];
          try {
            msgsRaw = (await fetchMensagens(externalId, opts.token, 1)) as Record<
              string,
              unknown
            >[];
          } catch (e) {
            erros.push({
              etapa: `fetchMensagens(${externalId})`,
              motivo: e instanceof Error ? e.message : "?",
            });
            continue;
          }

          const contactObj = conv.contact as Record<string, unknown> | undefined;
          const rawContactId = contactObj?.contactId as string | undefined;
          const contactIdValido =
            rawContactId && !rawContactId.includes("@") ? rawContactId : undefined;

          const conversaCanonica: ConversaCanonical = {
            externalId,
            instanceId,
            contactPhone:
              (contactObj?.phone as string | undefined) ??
              (contactObj?.number as string | undefined) ??
              contactIdValido ??
              (conv.phone as string | undefined),
            contactName:
              (contactObj?.name as string | undefined) ??
              (conv.contactName as string | undefined) ??
              (conv.name as string | undefined),
            lastMessageAt: lastMsgRemote,
          };

          const mensagensCanonicas: MensagemCanonical[] = msgsRaw
            .map((m): MensagemCanonical | null => {
              const msgId =
                (m.id as string | undefined) ?? (m._id as string | undefined);
              if (!msgId) return null;
              return {
                externalId: msgId,
                conversaExternalId: externalId,
                fromMe: m.fromMe === true || m.received === false,
                tipo: normalizarTipoMensagem(
                  (m.type as string | undefined) ?? (m.messageType as string | undefined),
                ),
                body: extrairBody(m),
                mediaUrl:
                  (m.mediaUrl as string | undefined) ??
                  (m.media_url as string | undefined) ??
                  null,
                sentAt:
                  (m.createdAt as string | undefined) ??
                  (m.timestamp as string | undefined) ??
                  new Date().toISOString(),
                rawPayload: m,
              };
            })
            .filter((x): x is MensagemCanonical => x !== null);

          const result = await ingestConversa(conversaCanonica, mensagensCanonicas);
          if (result.novasMensagens > 0) {
            conversasComMudanca++;
            mensagensNovas += result.novasMensagens;
          }
        }
      } catch (e) {
        erros.push({
          etapa: `${nome}:${instanceId}`,
          motivo: e instanceof Error ? e.message : "?",
        });
      }
    }
  }

  return {
    conversasVistas,
    conversasComMudanca,
    mensagensNovas,
    erros,
  };
}

/**
 * Wrapper logado do poll: resolve token (Config DB→env) + cutoff (override Config
 * DB), envolve em BtgSyncLog e roda. Compartilhado pela rota /api/cron/datacrazy-poll
 * e pelo scheduler in-process (instrumentation.ts) — comportamento idêntico, um só
 * lugar pra montar o log. `trigger` distingue a origem no BtgSyncLog ("cron" | "in-process").
 *
 * `skipped` (sem token) preserva o comportamento antigo da rota (200 + mensagem).
 */
export async function runDatacrazyPollLogged(
  trigger: string,
): Promise<{ result: DatacrazyPollResult | null; skipped?: string }> {
  const token = await getConfig("DATACRAZY_TOKEN");
  if (!token) return { result: null, skipped: "DATACRAZY_TOKEN não configurado" };

  const cutoffRaw = await getConfig("DATACRAZY_POLL_CUTOFF_MINUTES");
  const cutoffParsed = cutoffRaw ? Number(cutoffRaw) : NaN;
  const cutoffMinutes =
    Number.isFinite(cutoffParsed) && cutoffParsed > 0
      ? cutoffParsed
      : DEFAULT_POLL_CUTOFF_MINUTES;

  const log = await prisma.btgSyncLog.create({
    data: { tipo: "datacrazy-poll", trigger },
  });
  const result = await runDatacrazyPoll({ token, cutoffMinutes });
  await prisma.btgSyncLog.update({
    where: { id: log.id },
    data: {
      finalizado: new Date(),
      sucesso: result.erros.length === 0,
      contasProcessadas: result.conversasComMudanca,
      contasComErro: result.erros.length,
      resumo: `${result.conversasVistas} conversas vistas · ${result.conversasComMudanca} c/ delta · ${result.mensagensNovas} msgs novas`,
      erros: result.erros.length > 0 ? result.erros : undefined,
    },
  });
  return { result };
}

/** Limiar default (minutos) de freshness do poll. Com o scheduler in-process
 *  a cada 15min, 90min tolera ~6 ciclos perdidos antes de alertar. Antes, com
 *  o poll via GHA (gap real de ~302min), o default precisava ser 360.
 *  Ajustável via Config DB DATACRAZY_POLL_FRESHNESS_MAX_MIN. */
export const DEFAULT_POLL_FRESHNESS_MAX_MIN = 90;

export interface DatacrazyPollFreshness {
  ok: boolean;
  ultimaCorrida: string | null;
  idadeMin: number | null;
  limiarMin: number;
  alertou: boolean;
}

/**
 * Heartbeat: alerta no Slack se o último `BtgSyncLog tipo='datacrazy-poll'` for
 * mais velho que o limiar. Roda DENTRO do btg-freshness (GHA, dias úteis 13h UTC)
 * — INDEPENDENTE do scheduler in-process, então detecta o scheduler morto (um
 * heartbeat no próprio tick não detectaria a própria morte). Limiar via Config DB.
 */
export async function checkDatacrazyPollFreshness(): Promise<DatacrazyPollFreshness> {
  const raw = await getConfig("DATACRAZY_POLL_FRESHNESS_MAX_MIN");
  const parsed = raw ? Number(raw) : NaN;
  const limiarMin =
    Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_POLL_FRESHNESS_MAX_MIN;

  const ultimo = await prisma.btgSyncLog.findFirst({
    where: { tipo: "datacrazy-poll" },
    orderBy: { iniciado: "desc" },
    select: { iniciado: true },
  });

  if (!ultimo) {
    const alertou = await sendSlackAlertThrottled(
      "datacrazy-poll",
      '⚠️ *datacrazy-poll*: nenhuma execução registrada no BtgSyncLog — "Último contato" pode estar sem alimentação.',
    );
    return { ok: false, ultimaCorrida: null, idadeMin: null, limiarMin, alertou };
  }

  const idadeMin = Math.round((Date.now() - ultimo.iniciado.getTime()) / 60_000);
  if (idadeMin > limiarMin) {
    const alertou = await sendSlackAlertThrottled(
      "datacrazy-poll",
      `⚠️ *datacrazy-poll* parado há ${idadeMin}min (limiar ${limiarMin}min). ` +
        `"Último contato" não está sendo alimentado. Última corrida: ${ultimo.iniciado.toISOString()}.`,
    );
    return { ok: false, ultimaCorrida: ultimo.iniciado.toISOString(), idadeMin, limiarMin, alertou };
  }

  return { ok: true, ultimaCorrida: ultimo.iniciado.toISOString(), idadeMin, limiarMin, alertou: false };
}
