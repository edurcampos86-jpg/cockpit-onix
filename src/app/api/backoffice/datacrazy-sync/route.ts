import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getConfig } from "@/lib/config-db";
import { fetchConversas, VENDEDORES_CONFIG } from "@/lib/datacrazy";
import { listarArquivos, filtrarArquivosPorPeriodo } from "@/lib/plaud";

/**
 * POST /api/backoffice/datacrazy-sync
 *
 * Match clientes (por telefone ou nome) com:
 * - Conversas Datacrazy (WhatsApp) → atualiza ultimoContatoAt
 * - Arquivos Plaud (reuniões gravadas, últimos 90 dias) → atualiza ultimaReuniaoAt
 *   (e ultimoContatoAt se for mais recente)
 *
 * Persiste no ClienteBackoffice. Não cria InteracaoCliente automática (evita
 * duplicatas; isso fica pra outro endpoint dedicado se quisermos depois).
 *
 * Query opcional: ?clienteId=xxx pra processar 1 só.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Não autenticado" }, { status: 401 });
  }

  const clienteIdFiltro = req.nextUrl.searchParams.get("clienteId");

  const log = await prisma.btgSyncLog.create({
    data: { tipo: "datacrazy", trigger: "manual", userId: session.userId },
  });

  const clientes = await prisma.clienteBackoffice.findMany({
    where: clienteIdFiltro ? { id: clienteIdFiltro } : {},
    select: { id: true, nome: true, telefone: true, ultimoContatoAt: true, ultimaReuniaoAt: true },
  });

  // Mapas: clienteId → data ISO mais recente encontrada por canal
  const whatsappMap = new Map<string, Date>();
  const reuniaoMap = new Map<string, Date>();
  let datacrazyOk = false;
  let plaudOk = false;
  const erros: Array<{ etapa: string; motivo: string }> = [];

  // ── Datacrazy WhatsApp ────────────────────────────────────────────────
  const dctoken = await getConfig("DATACRAZY_TOKEN");
  if (dctoken) {
    try {
      const config = VENDEDORES_CONFIG["Eduardo Campos"];
      if (config) {
        for (const instanceId of config.instanceIds) {
          const conversas = await fetchConversas(instanceId, dctoken, 3);
          for (const conv of conversas) {
            const phone = conv.contact?.phone ?? conv.contact?.number ?? conv.phone ?? "";
            const name = (conv.contact?.name ?? conv.contactName ?? conv.name ?? "").toLowerCase().trim();
            const lastMsgRaw = conv.lastMessageDate ?? conv.updatedAt ?? conv.lastMessage?.createdAt;
            if (!lastMsgRaw) continue;
            const lastMsg = new Date(lastMsgRaw);
            if (isNaN(lastMsg.getTime())) continue;

            const phoneDigits = phone.replace(/\D/g, "");
            for (const c of clientes) {
              const cTel = (c.telefone || "").replace(/\D/g, "");
              const cNome = c.nome.toLowerCase().trim();
              const matchTel = cTel && phoneDigits && (phoneDigits.includes(cTel) || cTel.includes(phoneDigits));
              const matchNome = cNome && name && (name.includes(cNome) || cNome.includes(name));
              if (matchTel || matchNome) {
                const cur = whatsappMap.get(c.id);
                if (!cur || lastMsg > cur) whatsappMap.set(c.id, lastMsg);
              }
            }
          }
        }
        datacrazyOk = true;
      }
    } catch (e) {
      erros.push({ etapa: "datacrazy", motivo: e instanceof Error ? e.message : "?" });
    }
  } else {
    erros.push({ etapa: "datacrazy", motivo: "DATACRAZY_TOKEN não configurado" });
  }

  // ── Plaud Reuniões ────────────────────────────────────────────────────
  const plaudtoken = await getConfig("PLAUD_TOKEN");
  if (plaudtoken) {
    try {
      const todos = await listarArquivos(plaudtoken);
      const agora = new Date();
      const inicio = new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000);
      const recentes = filtrarArquivosPorPeriodo(todos, inicio, agora);

      for (const arq of recentes) {
        const fnLC = arq.filename.toLowerCase();
        const dataArq = new Date(arq.start_time);
        if (isNaN(dataArq.getTime())) continue;

        for (const c of clientes) {
          const partes = c.nome.toLowerCase().split(/\s+/).filter((p) => p.length > 2);
          const match = partes.some((p) => fnLC.includes(p));
          if (match) {
            const cur = reuniaoMap.get(c.id);
            if (!cur || dataArq > cur) reuniaoMap.set(c.id, dataArq);
          }
        }
      }
      plaudOk = true;
    } catch (e) {
      erros.push({ etapa: "plaud", motivo: e instanceof Error ? e.message : "?" });
    }
  } else {
    erros.push({ etapa: "plaud", motivo: "PLAUD_TOKEN não configurado" });
  }

  // ── Persistir no ClienteBackoffice ────────────────────────────────────
  let atualizados = 0;
  let comWhatsapp = 0;
  let comReuniao = 0;
  const now = new Date();

  for (const c of clientes) {
    const wa = whatsappMap.get(c.id);
    const reu = reuniaoMap.get(c.id);
    if (!wa && !reu) continue;

    if (wa) comWhatsapp++;
    if (reu) comReuniao++;

    // ultimoContatoAt = max(wa, reu, ultimoContatoAt atual)
    const candidatos = [wa, reu, c.ultimoContatoAt].filter((d): d is Date => d instanceof Date || (typeof d === "string" && !isNaN(new Date(d).getTime())));
    const novoUltimo = candidatos
      .map((d) => (d instanceof Date ? d : new Date(d)))
      .reduce((max, cur) => (cur > max ? cur : max), new Date(0));

    // ultimaReuniaoAt = max(reu, ultimaReuniaoAt atual)
    let novaReuniao: Date | undefined;
    if (reu) {
      const atual = c.ultimaReuniaoAt instanceof Date ? c.ultimaReuniaoAt : (c.ultimaReuniaoAt ? new Date(c.ultimaReuniaoAt) : null);
      novaReuniao = atual && atual > reu ? atual : reu;
    }

    try {
      await prisma.clienteBackoffice.update({
        where: { id: c.id },
        data: {
          ultimoContatoAt: novoUltimo > new Date(0) ? novoUltimo : undefined,
          ultimaReuniaoAt: novaReuniao,
          ultimaSyncDatacrazy: now,
        },
      });
      atualizados++;
    } catch (e) {
      erros.push({ etapa: "update", motivo: `${c.id}: ${e instanceof Error ? e.message : "?"}` });
    }
  }

  await prisma.btgSyncLog.update({
    where: { id: log.id },
    data: {
      finalizado: new Date(),
      sucesso: erros.length === 0,
      contasProcessadas: atualizados,
      contasComErro: erros.length,
      resumo: `${atualizados} cliente(s) atualizado(s) · ${comWhatsapp} c/ WhatsApp · ${comReuniao} c/ reunião · datacrazy=${datacrazyOk} plaud=${plaudOk}`,
      erros: erros.length > 0 ? erros : undefined,
    },
  });

  return NextResponse.json({
    success: erros.length === 0 || atualizados > 0,
    message: `${atualizados} cliente(s) atualizado(s). WhatsApp: ${comWhatsapp}, Reunião: ${comReuniao}.${erros.length > 0 ? ` ${erros.length} erro(s).` : ""}`,
    atualizados,
    comWhatsapp,
    comReuniao,
    fontes: { datacrazy: datacrazyOk, plaud: plaudOk },
    erros: erros.slice(0, 20),
  });
}
