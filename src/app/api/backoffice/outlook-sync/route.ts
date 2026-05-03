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

  // Busca todos os clientes (não só com email — vamos fazer match por SUMMARY também)
  const clientes = await prisma.clienteBackoffice.findMany({
    select: { id: true, email: true, nome: true },
  });

  // Pra cada cliente, achar próximo evento que cite o nome dele em SUMMARY ou tenha o email
  // (Outlook ICS publicado não expõe ATTENDEE/ORGANIZER por privacy — usa SUMMARY)
  let atualizados = 0;
  let matchPorNome = 0;
  let matchPorEmail = 0;
  const erros: Array<{ etapa: string; motivo: string }> = [];

  // Sobrenomes muito comuns que isoladamente causam falsos positivos
  const sobrenomesComuns = new Set([
    "silva", "santos", "souza", "souza", "oliveira", "pereira", "ferreira", "alves",
    "lima", "gomes", "ribeiro", "carvalho", "araujo", "araújo", "almeida", "rodrigues",
    "nascimento", "barbosa", "rocha", "dias", "moreira", "nunes", "marques", "cardoso",
    "teixeira", "correia", "fernandes", "azevedo", "martins", "freitas", "barros",
    "pinto", "moura", "cavalcanti", "andrade", "costa", "junior", "neto", "filho",
    "de", "da", "do", "dos", "das",
  ]);

  for (const c of clientes) {
    const emailLC = (c.email || "").toLowerCase().trim();
    const palavras = c.nome.toLowerCase().split(/\s+/).filter((p) => p.length > 2);
    // Palavras "fortes" do nome: não-comuns e com 4+ caracteres
    const palavrasFortes = palavras.filter((p) => p.length >= 4 && !sobrenomesComuns.has(p));
    if (!emailLC && palavrasFortes.length === 0) continue;

    // Procura próximo evento que matcha
    let proxima: { data: Date; resumo: string; via: "email" | "nome" } | null = null;
    for (const ev of futuros) {
      const summaryLC = ev.summary.toLowerCase();
      const descLower = (ev.location || "").toLowerCase();

      // Match por email (se aparecer em algum lugar do summary/location/etc — raro mas possível)
      let matched: "email" | "nome" | null = null;
      if (emailLC && (summaryLC.includes(emailLC) || descLower.includes(emailLC))) {
        matched = "email";
      } else if (ev.attendees.includes(emailLC) || ev.organizer === emailLC) {
        matched = "email";
      } else {
        // Match por nome: exige PELO MENOS 2 palavras fortes distintas no SUMMARY,
        // OU 1 palavra forte que tenha 6+ chars (nome incomum, baixa colisão).
        const fortesNoSummary = palavrasFortes.filter((p) => summaryLC.includes(p));
        const matchForte = fortesNoSummary.length >= 2 ||
          (fortesNoSummary.length === 1 && fortesNoSummary[0].length >= 6);
        if (matchForte) matched = "nome";
      }

      if (matched && (!proxima || ev.dtstart < proxima.data)) {
        proxima = { data: ev.dtstart, resumo: ev.summary, via: matched };
      }
    }

    if (proxima) {
      try {
        await prisma.clienteBackoffice.update({
          where: { id: c.id },
          data: { proximaReuniaoAt: proxima.data },
        });
        atualizados++;
        if (proxima.via === "email") matchPorEmail++;
        else matchPorNome++;
      } catch (e) {
        erros.push({ etapa: "update", motivo: `${c.id}: ${e instanceof Error ? e.message : "?"}` });
      }
    }
  }

  await prisma.btgSyncLog.update({
    where: { id: log.id },
    data: {
      finalizado: new Date(),
      sucesso: erros.length === 0,
      contasProcessadas: atualizados,
      contasComErro: erros.length,
      resumo: `${atualizados} cliente(s) c/ próxima reunião · match: ${matchPorNome} por nome no título, ${matchPorEmail} por email · ${futuros.length}/${events.length} eventos futuros (${lookaheadDias}d)`,
      erros: erros.length > 0 ? erros : undefined,
    },
  });

  return NextResponse.json({
    success: true,
    message: `${atualizados} cliente(s) com próxima reunião agendada. Match: ${matchPorNome} pelo nome no título, ${matchPorEmail} pelo email. ${futuros.length} eventos futuros (${lookaheadDias}d).`,
    atualizados,
    matchPorNome,
    matchPorEmail,
    eventosFuturos: futuros.length,
    eventosTotal: events.length,
    lookaheadDias,
    erros: erros.slice(0, 20),
  });
}
