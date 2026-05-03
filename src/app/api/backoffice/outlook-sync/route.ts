import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getConfig } from "@/lib/config-db";
import { fetchIcsEvents } from "@/lib/outlook-ics";

/**
 * POST /api/backoffice/outlook-sync
 *
 * Lê o calendário Outlook publicado (ICS) e atualiza ClienteBackoffice.proximaReuniaoAt
 * com a data do próximo evento futuro onde o email do cliente aparece como attendee
 * ou organizer.
 *
 * Config necessário (Config table no DB ou env):
 * - OUTLOOK_ICS_URL — URL pública do calendário do Eduardo (ex: https://outlook.office365.com/owa/calendar/.../calendar.ics)
 *
 * Lookahead default: 60 dias.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Não autenticado" }, { status: 401 });
  }

  const lookaheadDias = Math.min(parseInt(req.nextUrl.searchParams.get("dias") || "60", 10), 365);

  const log = await prisma.btgSyncLog.create({
    data: { tipo: "outlook", trigger: "manual", userId: session.userId, resumo: `lookahead=${lookaheadDias}d` },
  });

  const icsUrl = await getConfig("OUTLOOK_ICS_URL");
  if (!icsUrl) {
    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: { finalizado: new Date(), sucesso: false, resumo: "OUTLOOK_ICS_URL não configurada" },
    });
    return NextResponse.json(
      { success: false, message: "OUTLOOK_ICS_URL não configurada. No Outlook → Configurações → Calendário → Calendários compartilhados → Publicar calendário, copie a URL ICS e cole no Railway como variável OUTLOOK_ICS_URL (ou no Config table do banco)." },
      { status: 400 },
    );
  }

  let events;
  try {
    events = await fetchIcsEvents(icsUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "?";
    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: { finalizado: new Date(), sucesso: false, resumo: `Erro fetch ICS: ${msg}` },
    });
    return NextResponse.json({ success: false, message: `Erro lendo ICS: ${msg}` }, { status: 502 });
  }

  const agora = new Date();
  const limite = new Date(agora.getTime() + lookaheadDias * 24 * 60 * 60 * 1000);

  // Eventos futuros dentro do horizonte
  const futuros = events.filter((e) => e.dtstart >= agora && e.dtstart <= limite);

  // Mapa email -> data do próximo evento (mínimo)
  const emailParaProximo = new Map<string, { data: Date; resumo: string }>();
  for (const ev of futuros) {
    const emails = new Set<string>(ev.attendees);
    if (ev.organizer) emails.add(ev.organizer);
    for (const email of emails) {
      const cur = emailParaProximo.get(email);
      if (!cur || ev.dtstart < cur.data) {
        emailParaProximo.set(email, { data: ev.dtstart, resumo: ev.summary });
      }
    }
  }

  // Busca clientes com email
  const clientes = await prisma.clienteBackoffice.findMany({
    where: { email: { not: null } },
    select: { id: true, email: true, nome: true },
  });

  let atualizados = 0;
  let limpos = 0;
  const erros: Array<{ etapa: string; motivo: string }> = [];

  for (const c of clientes) {
    const emailLC = (c.email || "").toLowerCase().trim();
    if (!emailLC) continue;
    const proxEvento = emailParaProximo.get(emailLC);
    try {
      if (proxEvento) {
        await prisma.clienteBackoffice.update({
          where: { id: c.id },
          data: { proximaReuniaoAt: proxEvento.data },
        });
        atualizados++;
      } else {
        // Limpa proximaReuniaoAt se estava no passado (data já passou e nenhum evento novo)
        // Comentado pra não apagar reuniões registradas manualmente — ativar se quiser comportamento estrito
        // await prisma.clienteBackoffice.update({ where: { id: c.id }, data: { proximaReuniaoAt: null } });
        // limpos++;
      }
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
      resumo: `${atualizados} cliente(s) com próxima reunião · ${futuros.length} eventos futuros (${lookaheadDias}d) · ${events.length} eventos no calendário · ${emailParaProximo.size} emails únicos como participante`,
      erros: erros.length > 0 ? erros : undefined,
    },
  });

  return NextResponse.json({
    success: true,
    message: `${atualizados} cliente(s) com próxima reunião agendada. ${futuros.length} eventos futuros, ${emailParaProximo.size} participantes únicos.`,
    atualizados,
    limpos,
    eventosFuturos: futuros.length,
    eventosTotal: events.length,
    emailsUnicos: emailParaProximo.size,
    lookaheadDias,
    erros: erros.slice(0, 20),
  });
}
