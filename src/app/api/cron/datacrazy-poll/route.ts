import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import {
  fetchConversas,
  fetchMensagens,
  VENDEDORES_CONFIG,
} from "@/lib/datacrazy";
import {
  ingestConversa,
  normalizarTipoMensagem,
  extrairBody,
  type ConversaCanonical,
  type MensagemCanonical,
} from "@/lib/datacrazy-ingest";

/**
 * GET /api/cron/datacrazy-poll
 *
 * Polling defensivo — roda a cada 5 minutos via railway.toml.
 * Serve como FALLBACK do webhook DataCrazy: se o webhook falhar
 * (DataCrazy down, blip de rede, nosso servidor reiniciando), o
 * cron eventualmente puxa o que escapou.
 *
 * Por ser idempotente (upsert por externalId), nunca duplica.
 *
 * Estatística esperada em produção:
 *   - Webhook entrega ~99,5% das mensagens em <2s
 *   - Polling cobre os ~0,5% restantes em até 5min
 *
 * Custos: cada execução faz ~3 requests/instância (2 páginas de
 * conversas + 1 página de mensagens das conversas que mudaram).
 * Com 3 vendedores e janela de 1h, ~9 requests/min. Bem dentro do
 * rate-limit DataCrazy (já tem retry com backoff em fetchConversas).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60; // 60s timeout

export async function GET(req: NextRequest) {
  const guardErr = guardCron(req);
  if (guardErr) return guardErr;

  const token = await getConfig("DATACRAZY_TOKEN");
  if (!token) {
    return NextResponse.json(
      { ok: false, message: "DATACRAZY_TOKEN não configurado" },
      { status: 200 }, // 200 pra cron não retry infinito
    );
  }

  const log = await prisma.btgSyncLog.create({
    data: { tipo: "datacrazy-poll", trigger: "cron" },
  });

  const erros: Array<{ etapa: string; motivo: string }> = [];
  let conversasVistas = 0;
  let mensagensNovas = 0;
  let conversasComMudanca = 0;

  // Iteramos por todos os vendedores configurados
  for (const [nome, config] of Object.entries(VENDEDORES_CONFIG)) {
    for (const instanceId of config.instanceIds) {
      try {
        // Busca últimas 2 páginas (200 conversas mais recentes) — o
        // suficiente pra cobrir uma janela de 5min mesmo num dia
        // movimentado.
        const conversas = await fetchConversas(instanceId, token, 2);
        conversasVistas += conversas.length;

        // Filtra: atividade nos últimos 30min. Grupos seguem por outro
        // caminho — só processamos grupos com mapeamento explícito em
        // `GrupoCliente` (Eduardo vincula manualmente; matching por nome
        // de grupo seria frágil e a API não expõe remetente em grupo).
        const cutoff = Date.now() - 30 * 60 * 1000;
        const ativas = conversas.filter((c) => {
          const t = c.lastMessageDate ?? c.updatedAt ?? c.lastMessage?.createdAt;
          if (!t) return false;
          return new Date(t).getTime() >= cutoff;
        });

        // Tratamento de grupos: olha mapeamento manual em GrupoCliente.
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

        // Daqui em diante: apenas chats individuais.
        const ativasIndividuais = ativas.filter(
          (c) => (c as { isGroup?: boolean }).isGroup !== true,
        );

        for (const conv of ativasIndividuais) {
          const externalId = String(conv.id ?? conv._id ?? "");
          if (!externalId) continue;

          // Compara lastMessageAt no DB pra decidir se precisamos puxar msgs novamente
          const lastMsgRemote = new Date(
            conv.lastMessageDate ?? conv.updatedAt ?? conv.lastMessage?.createdAt,
          );
          const conversaExistente = await prisma.conversa.findUnique({
            where: { externalId },
            select: { lastMessageAt: true },
          });

          if (
            conversaExistente?.lastMessageAt &&
            conversaExistente.lastMessageAt.getTime() >= lastMsgRemote.getTime()
          ) {
            // já está em dia
            continue;
          }

          // Pega mensagens recentes (1 página = 50 msgs)
          let msgsRaw: Record<string, unknown>[] = [];
          try {
            msgsRaw = (await fetchMensagens(externalId, token, 1)) as Record<string, unknown>[];
          } catch (e) {
            erros.push({
              etapa: `fetchMensagens(${externalId})`,
              motivo: e instanceof Error ? e.message : "?",
            });
            continue;
          }

          // Extrai telefone: priorizar `contact.contactId` (formato real
          // que a Datacrazy retorna — ex: "557199752022" sem o "+" e às
          // vezes sem o "9" inicial). Cair pra `contact.phone`/`number`/
          // `conv.phone` se um dia eles começarem a expor. Pular IDs
          // especiais do WhatsApp tipo `@lid` (linked devices) — não são
          // número de telefone matchável.
          const contactObj = conv.contact as Record<string, unknown> | undefined;
          const rawContactId = contactObj?.contactId as string | undefined;
          const contactIdValido = rawContactId && !rawContactId.includes("@") ? rawContactId : undefined;

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
              const msgId = (m.id as string | undefined) ?? (m._id as string | undefined);
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

  await prisma.btgSyncLog.update({
    where: { id: log.id },
    data: {
      finalizado: new Date(),
      sucesso: erros.length === 0,
      contasProcessadas: conversasComMudanca,
      contasComErro: erros.length,
      resumo: `${conversasVistas} conversas vistas · ${conversasComMudanca} c/ delta · ${mensagensNovas} msgs novas`,
      erros: erros.length > 0 ? erros : undefined,
    },
  });

  return NextResponse.json({
    ok: erros.length === 0,
    conversasVistas,
    conversasComMudanca,
    mensagensNovas,
    erros: erros.slice(0, 20),
  });
}
