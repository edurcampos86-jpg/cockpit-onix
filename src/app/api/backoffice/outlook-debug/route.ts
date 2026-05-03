import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getConfig } from "@/lib/config-db";

/**
 * GET /api/backoffice/outlook-debug
 *
 * Baixa o ICS, extrai os primeiros 2-3 VEVENTs futuros em formato cru
 * pra inspecionar quais propriedades vêm (ATTENDEE, ORGANIZER, SUMMARY...).
 * Outlook publicado às vezes remove dados sensíveis por privacidade.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Não autenticado" }, { status: 401 });
  }

  const url = await getConfig("OUTLOOK_ICS_URL");
  if (!url) return NextResponse.json({ success: false, message: "OUTLOOK_ICS_URL não setada" });

  const res = await fetch(url, { headers: { Accept: "text/calendar" }, cache: "no-store" });
  const text = await res.text();

  // Resolver line folding
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith(" ") || raw.startsWith("\t")) {
      if (lines.length > 0) lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
  }

  // Encontra os primeiros 3 VEVENTs futuros e retorna seu conteúdo bruto
  const events: string[][] = [];
  let cur: string[] | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = [];
    else if (line === "END:VEVENT") {
      if (cur) {
        // Verifica se é futuro
        const dtstart = cur.find((l) => l.startsWith("DTSTART"));
        if (dtstart) {
          const m = /:(\d{8})/.exec(dtstart);
          if (m) {
            const yyyy = parseInt(m[1].slice(0, 4));
            const mm = parseInt(m[1].slice(4, 6)) - 1;
            const dd = parseInt(m[1].slice(6, 8));
            const d = new Date(Date.UTC(yyyy, mm, dd));
            if (d > new Date()) events.push(cur);
          }
        }
        cur = null;
      }
    } else if (cur) cur.push(line);
    if (events.length >= 3) break;
  }

  // Conta propriedades em TODOS os VEVENTs pra ver quais existem
  const propCount: Record<string, number> = {};
  let veventCount = 0;
  let inEvent = false;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { inEvent = true; veventCount++; continue; }
    if (line === "END:VEVENT") { inEvent = false; continue; }
    if (!inEvent) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const prop = line.slice(0, colon).split(";")[0].toUpperCase();
    propCount[prop] = (propCount[prop] || 0) + 1;
  }

  return NextResponse.json({
    icsBytes: text.length,
    totalLinhas: lines.length,
    totalVEVENTs: veventCount,
    propriedadesEncontradas: propCount,
    sampleEventosFuturos: events.map((ev) => ev.slice(0, 30)),
  });
}
