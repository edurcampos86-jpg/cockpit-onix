/**
 * Parser básico de ICS (RFC 5545) — focado em eventos do Outlook publicados.
 * Lê só o que precisamos: DTSTART, DTEND, SUMMARY, ATTENDEE emails, UID.
 * Resolve line folding (linhas que continuam com espaço/tab).
 *
 * Uso:
 *   const events = await fetchIcsEvents("https://outlook.live.com/owa/calendar/.../calendar.ics");
 *   const futuros = events.filter(e => e.dtstart > new Date());
 */

export interface IcsEvent {
  uid: string;
  dtstart: Date;
  dtend: Date | null;
  summary: string;
  organizer: string | null; // email
  attendees: string[]; // emails
  location: string | null;
}

export async function fetchIcsEvents(icsUrl: string): Promise<IcsEvent[]> {
  const res = await fetch(icsUrl, {
    headers: { Accept: "text/calendar" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Falha ao baixar ICS: HTTP ${res.status}`);
  }
  const text = await res.text();
  return parseIcs(text);
}

export function parseIcs(text: string): IcsEvent[] {
  // Resolver line folding (RFC 5545 §3.1): linhas continuação começam com space ou tab
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith(" ") || raw.startsWith("\t")) {
      if (lines.length > 0) lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
  }

  const events: IcsEvent[] = [];
  let inEvent = false;
  let cur: Partial<IcsEvent> & { attendees: string[] } = { attendees: [] };

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      cur = { attendees: [] };
      continue;
    }
    if (line === "END:VEVENT") {
      inEvent = false;
      if (cur.uid && cur.dtstart && cur.summary) {
        events.push({
          uid: cur.uid,
          dtstart: cur.dtstart,
          dtend: cur.dtend ?? null,
          summary: cur.summary,
          organizer: cur.organizer ?? null,
          attendees: cur.attendees,
          location: cur.location ?? null,
        });
      }
      continue;
    }
    if (!inEvent) continue;

    // Separa propriedade (com possíveis params) do valor
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const propWithParams = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const propName = propWithParams.split(";")[0].toUpperCase();

    switch (propName) {
      case "UID":
        cur.uid = value;
        break;
      case "DTSTART": {
        const d = parseIcsDate(value, propWithParams);
        if (d) cur.dtstart = d;
        break;
      }
      case "DTEND": {
        const d = parseIcsDate(value, propWithParams);
        if (d) cur.dtend = d;
        break;
      }
      case "SUMMARY":
        cur.summary = unescapeIcsText(value);
        break;
      case "LOCATION":
        cur.location = unescapeIcsText(value);
        break;
      case "ORGANIZER": {
        const email = extractMailto(value);
        if (email) cur.organizer = email.toLowerCase();
        break;
      }
      case "ATTENDEE": {
        const email = extractMailto(value);
        if (email) cur.attendees.push(email.toLowerCase());
        break;
      }
    }
  }

  return events;
}

function parseIcsDate(value: string, propWithParams: string): Date | null {
  // Formatos comuns: 20260510T143000Z (UTC), 20260510T143000 (local), 20260510 (date-only)
  const v = value.trim();

  // Date-only (VALUE=DATE)
  if (/^\d{8}$/.test(v)) {
    const y = parseInt(v.slice(0, 4));
    const m = parseInt(v.slice(4, 6)) - 1;
    const d = parseInt(v.slice(6, 8));
    return new Date(Date.UTC(y, m, d));
  }

  // DateTime
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
  if (!match) return null;
  const [, yy, mm, dd, hh, mi, ss, z] = match;
  const y = parseInt(yy);
  const mo = parseInt(mm) - 1;
  const da = parseInt(dd);
  const ho = parseInt(hh);
  const mn = parseInt(mi);
  const se = parseInt(ss);
  if (z === "Z") {
    return new Date(Date.UTC(y, mo, da, ho, mn, se));
  }
  // TZID — sem suporte completo; trata como UTC pra evitar erros (Outlook geralmente publica em UTC)
  if (/TZID=/.test(propWithParams)) {
    return new Date(Date.UTC(y, mo, da, ho, mn, se));
  }
  return new Date(y, mo, da, ho, mn, se);
}

function extractMailto(value: string): string | null {
  const m = /mailto:([^,;\s]+)/i.exec(value);
  return m ? m[1] : null;
}

function unescapeIcsText(s: string): string {
  return s.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}
