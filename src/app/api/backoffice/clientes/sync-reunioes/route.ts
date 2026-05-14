import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";
import { google } from "googleapis";
import { getIntegrationConfig } from "@/lib/integrations/config";
import { listarArquivos, filtrarArquivosPorPeriodo } from "@/lib/plaud";

interface ReuniaoMatch {
  data: Date;
  fonte: "plaud" | "calendar";
}

// Remove acentos (combining diacritical marks: U+0300 to U+036F)
const DIACRITICOS = /[̀-ͯ]/g;

function normalizar(nome: string): string {
  return nome.toLowerCase().normalize("NFD").replace(DIACRITICOS, "").trim();
}

function nomeMatches(nomeCliente: string, texto: string): boolean {
  const nc = normalizar(nomeCliente);
  const t = normalizar(texto);
  if (!nc || !t) return false;
  const partes = nc.split(/\s+/).filter((p) => p.length > 2);
  // Match se o primeiro nome E (sobrenome ou inicial) aparecem, ou se o nome completo aparece
  if (t.includes(nc)) return true;
  if (partes.length >= 2) {
    const primeiro = partes[0];
    const ultimo = partes[partes.length - 1];
    return t.includes(primeiro) && t.includes(ultimo);
  }
  return partes.length === 1 && partes[0].length >= 4 && t.includes(partes[0]);
}

async function buscarReunioesPlaud(token: string) {
  const arquivos = await listarArquivos(token);
  const agora = new Date();
  const inicio = new Date(agora.getTime() - 365 * 24 * 60 * 60 * 1000);
  return filtrarArquivosPorPeriodo(arquivos, inicio, agora).map((a) => ({
    filename: a.filename,
    data: new Date(a.start_time),
  }));
}

async function buscarEventosCalendar() {
  const config = await getIntegrationConfig();
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REFRESH_TOKEN) {
    return { passados: [], futuros: [] };
  }
  const oauth2Client = new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: config.GOOGLE_REFRESH_TOKEN });
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const agora = new Date();
  const seisMesesAtras = new Date(agora.getTime() - 180 * 24 * 60 * 60 * 1000);
  const seisMesesFrente = new Date(agora.getTime() + 180 * 24 * 60 * 60 * 1000);

  // Eventos passados
  const passadosRes = await calendar.events.list({
    calendarId: "primary",
    timeMin: seisMesesAtras.toISOString(),
    timeMax: agora.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 1000,
  });

  const futurosRes = await calendar.events.list({
    calendarId: "primary",
    timeMin: agora.toISOString(),
    timeMax: seisMesesFrente.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 500,
  });

  function mapEvent(ev: { summary?: string | null; description?: string | null; attendees?: Array<{ email?: string | null; displayName?: string | null }> | null; start?: { dateTime?: string | null; date?: string | null } | null }) {
    const dataStr = ev.start?.dateTime || ev.start?.date;
    if (!dataStr) return null;
    const texto = [
      ev.summary || "",
      ev.description || "",
      ...(ev.attendees || []).map((a) => `${a.displayName || ""} ${a.email || ""}`),
    ].join(" ");
    return { texto, data: new Date(dataStr) };
  }

  return {
    passados: (passadosRes.data.items || []).map(mapEvent).filter((e): e is { texto: string; data: Date } => e !== null),
    futuros: (futurosRes.data.items || []).map(mapEvent).filter((e): e is { texto: string; data: Date } => e !== null),
  };
}

/**
 * POST /api/backoffice/clientes/sync-reunioes
 *
 * Para cada cliente:
 *  - Última reunião = max(arquivo Plaud com nome do cliente, evento Calendar passado)
 *  - Próxima reunião = primeiro evento Calendar futuro com nome/email do cliente
 *
 * Atualiza ultimaReuniaoAt, ultimaReuniaoFonte, proximaReuniaoAt, proximaReuniaoFonte
 */
export async function POST() {
  try {
    const clientes = await prisma.clienteBackoffice.findMany({
      select: { id: true, nome: true, email: true },
    });

    const plaudToken = await getConfig("PLAUD_TOKEN");
    const plaudReunioes = plaudToken
      ? await buscarReunioesPlaud(plaudToken).catch((e) => {
          console.error("[sync-reunioes] Plaud erro:", e);
          return [] as Array<{ filename: string; data: Date }>;
        })
      : [];

    const { passados, futuros } = await buscarEventosCalendar().catch((e) => {
      console.error("[sync-reunioes] Calendar erro:", e);
      return { passados: [], futuros: [] };
    });

    let atualizados = 0;

    for (const cliente of clientes) {
      const matchesEmail = (texto: string): boolean =>
        !!cliente.email && texto.toLowerCase().includes(cliente.email.toLowerCase());

      // Última reunião
      const candidatosPlaud: ReuniaoMatch[] = plaudReunioes
        .filter((r) => nomeMatches(cliente.nome, r.filename))
        .map((r) => ({ data: r.data, fonte: "plaud" as const }));

      const candidatosPassadosCal: ReuniaoMatch[] = passados
        .filter((e) => nomeMatches(cliente.nome, e.texto) || matchesEmail(e.texto))
        .map((e) => ({ data: e.data, fonte: "calendar" as const }));

      const candidatosUltima = [...candidatosPlaud, ...candidatosPassadosCal].sort(
        (a, b) => b.data.getTime() - a.data.getTime()
      );
      const ultima = candidatosUltima[0] || null;

      // Próxima reunião (somente do Calendar)
      const candidatosFuturos = futuros
        .filter((e) => nomeMatches(cliente.nome, e.texto) || matchesEmail(e.texto))
        .sort((a, b) => a.data.getTime() - b.data.getTime());
      const proxima = candidatosFuturos[0] || null;

      const updateData: {
        ultimaReuniaoAt?: Date | null;
        ultimaReuniaoFonte?: string | null;
        proximaReuniaoAt?: Date | null;
        proximaReuniaoFonte?: string | null;
      } = {};

      updateData.ultimaReuniaoAt = ultima?.data ?? null;
      updateData.ultimaReuniaoFonte = ultima?.fonte ?? null;
      updateData.proximaReuniaoAt = proxima?.data ?? null;
      updateData.proximaReuniaoFonte = proxima ? "calendar" : null;

      if (ultima || proxima) atualizados++;

      await prisma.clienteBackoffice.update({
        where: { id: cliente.id },
        data: updateData,
      });
    }

    return NextResponse.json({
      success: true,
      message: `${atualizados} cliente(s) com reunião encontrada de ${clientes.length} total.`,
      atualizados,
      total: clientes.length,
      fontes: {
        plaud: !!plaudToken && plaudReunioes.length > 0,
        calendar: passados.length > 0 || futuros.length > 0,
      },
    });
  } catch (error) {
    console.error("[sync-reunioes] erro geral:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}
