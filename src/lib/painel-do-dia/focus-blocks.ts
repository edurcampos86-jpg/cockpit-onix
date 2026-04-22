import "server-only";
import { prisma } from "@/lib/prisma";
import type { EventoAgenda } from "./types";

/**
 * Sug 2 — Deep Work blocks.
 *
 * Encontra uma janela livre na "golden window" (08:30-11:30 e 14:00-16:30)
 * e agenda um bloco de foco. Stack:
 *  - Google Calendar OAuth (refreshToken do usuário) se ativo
 *  - Fallback: enfileira SyncRequest do tipo "focus-block" + escreve
 *    uma AcaoPainel temporária `pending-cowork` pro cowork aplicar no
 *    Outlook na próxima sincronia
 */

type GoldenWindow = { startHour: number; startMin: number; endHour: number; endMin: number };

// Janelas ideais de deep work (horário local Bahia)
const GOLDEN_WINDOWS: GoldenWindow[] = [
  { startHour: 8, startMin: 30, endHour: 11, endMin: 30 },
  { startHour: 14, startMin: 0, endHour: 16, endMin: 30 },
];

// Max 3h/dia de foco pra evitar fatigue
const MAX_FOCO_MIN_POR_DIA = 180;

function bahiaIsoToUtc(data: string, hora: number, minuto: number): Date {
  // Bahia = UTC-3, sem horário de verão
  const utc = new Date(`${data}T${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}:00-03:00`);
  return utc;
}

/**
 * Verifica se [start, end] colide com algum evento existente na agenda.
 */
function temColisao(
  start: Date,
  end: Date,
  eventos: Array<{ inicio: Date; fim: Date }>
): boolean {
  for (const ev of eventos) {
    // intervalos sobrepõem se max(start) < min(end)
    if (start < ev.fim && end > ev.inicio) return true;
  }
  return false;
}

/**
 * Encontra próxima janela livre de pelo menos `duracaoMin` dentro das golden
 * windows do dia. Retorna {start, end} em UTC.
 */
export async function encontrarJanelaLivre(
  userId: string,
  data: string,
  duracaoMin: number
): Promise<{ start: Date; end: Date } | null> {
  // Lê agenda do cache externo (cowork)
  const cache = await prisma.painelCacheExterno.findFirst({
    where: { userId, source: "ms-calendar" },
  });
  const eventosRaw = (cache?.payload as EventoAgenda[] | undefined) ?? [];
  const eventos = eventosRaw
    .filter((e) => e.inicio?.slice(0, 10) === data)
    .map((e) => ({
      inicio: new Date(e.inicio),
      fim: new Date(e.fim),
    }));

  // Soma blocos de foco já criados hoje
  const focosHoje = await prisma.painelPrioridade.findMany({
    where: {
      userId,
      data,
      focusBlockEventId: { not: null },
      focusBlockStart: { not: null },
      focusBlockEnd: { not: null },
    },
    select: { tempoEstimadoMin: true, focusBlockStart: true, focusBlockEnd: true },
  });
  const somaFocoAtual = focosHoje.reduce((s, f) => s + (f.tempoEstimadoMin ?? 0), 0);
  if (somaFocoAtual + duracaoMin > MAX_FOCO_MIN_POR_DIA) {
    throw new Error(
      `Limite de foco diário (${MAX_FOCO_MIN_POR_DIA}min) seria estourado. Já tem ${somaFocoAtual}min.`
    );
  }
  focosHoje.forEach((f) => {
    if (f.focusBlockStart && f.focusBlockEnd) {
      eventos.push({ inicio: f.focusBlockStart, fim: f.focusBlockEnd });
    }
  });

  // Varre as golden windows em passos de 15 min
  for (const gw of GOLDEN_WINDOWS) {
    const inicio = bahiaIsoToUtc(data, gw.startHour, gw.startMin);
    const fim = bahiaIsoToUtc(data, gw.endHour, gw.endMin);
    let candidatoStart = new Date(inicio);
    while (candidatoStart.getTime() + duracaoMin * 60_000 <= fim.getTime()) {
      const candidatoEnd = new Date(candidatoStart.getTime() + duracaoMin * 60_000);
      if (!temColisao(candidatoStart, candidatoEnd, eventos)) {
        return { start: candidatoStart, end: candidatoEnd };
      }
      // avança 15min
      candidatoStart = new Date(candidatoStart.getTime() + 15 * 60_000);
    }
  }

  return null;
}

/**
 * Agenda um focus block. Tenta Google Calendar OAuth primeiro; se falhar
 * ou não houver token, enfileira pro cowork criar no Outlook.
 */
export async function agendarFocusBlock(params: {
  userId: string;
  prioridadeId: string;
  titulo: string;
  duracaoMin: number;
  data: string;
}): Promise<{
  provider: "google" | "pending-cowork";
  eventoId: string;
  start: string;
  end: string;
}> {
  const janela = await encontrarJanelaLivre(
    params.userId,
    params.data,
    params.duracaoMin
  );
  if (!janela) {
    throw new Error(
      "Sem janela livre nas horas de foco (08:30-11:30 ou 14:00-16:30). Reorganize a agenda ou reduza o tempo estimado."
    );
  }

  // Tenta Google Calendar OAuth — esperado fallar hoje já que o roadmap
  // marca escopo calendar.readonly. Se evoluir, plugamos aqui.
  const googleOk = false; // TODO: ativar quando escopo calendar.write estiver OK

  if (googleOk) {
    // placeholder — quando tivermos OAuth write, chamar Graph/Calendar API
    const eventoId = `google-pending`;
    await prisma.painelPrioridade.update({
      where: { id: params.prioridadeId },
      data: {
        focusBlockEventId: eventoId,
        focusBlockProvider: "google",
        focusBlockStart: janela.start,
        focusBlockEnd: janela.end,
      },
    });
    return {
      provider: "google",
      eventoId,
      start: janela.start.toISOString(),
      end: janela.end.toISOString(),
    };
  }

  // Fallback: enfileira cowork. Criamos uma AcaoPainel "pending-cowork"
  // que o Chrome MCP vai ler e aplicar como evento de foco no Outlook.
  const syncReq = await prisma.syncRequest.create({
    data: {
      userId: params.userId,
      sources: "microsoft",
      status: "pending",
    },
  });

  // Guardamos o id do SyncRequest como ponteiro do evento pendente
  const eventoId = `pending-cowork:${syncReq.id}`;
  await prisma.painelPrioridade.update({
    where: { id: params.prioridadeId },
    data: {
      focusBlockEventId: eventoId,
      focusBlockProvider: "pending-cowork",
      focusBlockStart: janela.start,
      focusBlockEnd: janela.end,
    },
  });

  return {
    provider: "pending-cowork",
    eventoId,
    start: janela.start.toISOString(),
    end: janela.end.toISOString(),
  };
}

export async function removerFocusBlock(params: {
  userId: string;
  prioridadeId: string;
  provider: "google" | "ms-calendar" | "pending-cowork";
  eventoId: string;
}): Promise<void> {
  // Se o provider é pending-cowork, cancelamos o SyncRequest se ainda pending
  if (params.provider === "pending-cowork") {
    const syncId = params.eventoId.replace(/^pending-cowork:/, "");
    if (syncId) {
      await prisma.syncRequest
        .updateMany({
          where: { id: syncId, userId: params.userId, status: "pending" },
          data: { status: "error", error: "focus block cancelado pelo usuario" },
        })
        .catch(() => void 0);
    }
  }
  // TODO: se Google OAuth ativo, deletar via Graph

  await prisma.painelPrioridade.update({
    where: { id: params.prioridadeId },
    data: {
      focusBlockEventId: null,
      focusBlockProvider: null,
      focusBlockStart: null,
      focusBlockEnd: null,
    },
  });
}
