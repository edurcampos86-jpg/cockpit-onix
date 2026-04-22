import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizarTitulo } from "./agregador";
import type { EventoAgenda } from "./types";

/**
 * Sug 3 — Auto-encerramento pós-reunião.
 *
 * Roda a cada 15 min. Para cada evento na agenda MS Calendar cache que
 * terminou há 30-120 min:
 *  - Faz fuzzy match contra ClienteBackoffice.nome
 *  - Se match, cria PainelSugestao tipo "encerrar-reuniao" se ainda não existe
 *  - Payload inclui duração, clienteId, título original
 */

const LIMIAR_MIN_MIN = 30; // evento terminou há >= 30min
const LIMIAR_MIN_MAX = 120; // <= 2h (evita gerar sugestão tarde demais)

export async function processarAutoEncerramento(userId: string): Promise<{
  sugestoesCriadas: number;
  eventosAvaliados: number;
}> {
  const cache = await prisma.painelCacheExterno.findFirst({
    where: { userId, source: "ms-calendar" },
  });
  if (!cache) return { sugestoesCriadas: 0, eventosAvaliados: 0 };

  const eventos = (cache.payload as EventoAgenda[] | undefined) ?? [];
  const agora = Date.now();

  // Lista clientes com nome > 3 chars (dedup fuzzy)
  const clientes = await prisma.clienteBackoffice.findMany({
    select: { id: true, nome: true },
  });
  const indiceNome = new Map<string, { id: string; nome: string }>();
  for (const c of clientes) {
    const chave = normalizarTitulo(c.nome);
    if (chave.length >= 3) indiceNome.set(chave, c);
  }

  let criadas = 0;
  let avaliados = 0;

  for (const ev of eventos) {
    if (!ev.fim || !ev.inicio) continue;
    const fim = new Date(ev.fim).getTime();
    const desdeFim = (agora - fim) / (60 * 1000);
    if (desdeFim < LIMIAR_MIN_MIN || desdeFim > LIMIAR_MIN_MAX) continue;
    avaliados++;

    // Fuzzy match: verifica se o título do evento contém o nome de algum cliente
    const tituloNorm = normalizarTitulo(ev.titulo);
    let matchedCliente: { id: string; nome: string } | undefined;
    for (const [nomeNorm, cli] of indiceNome) {
      if (tituloNorm.includes(nomeNorm)) {
        matchedCliente = cli;
        break;
      }
    }

    // Sem cliente match → só gera sugestão se tiver duração relevante
    const duracaoMin =
      (new Date(ev.fim).getTime() - new Date(ev.inicio).getTime()) / 60_000;
    if (!matchedCliente && duracaoMin < 30) continue;

    // Dedup: ja existe sugestão para esse eventoCalId?
    const ja = await prisma.painelSugestao.findFirst({
      where: {
        userId,
        tipo: "encerrar-reuniao",
        eventoCalId: ev.id,
      },
    });
    if (ja) continue;

    const titulo = matchedCliente
      ? `Encerrar reunião com ${matchedCliente.nome}`
      : `Encerrar reunião: ${ev.titulo}`;

    await prisma.painelSugestao.create({
      data: {
        userId,
        tipo: "encerrar-reuniao",
        titulo,
        descricao: `Reunião "${ev.titulo}" terminou há ${Math.floor(desdeFim)} min. Registrar toque?`,
        payload: {
          eventoTitulo: ev.titulo,
          eventoInicio: ev.inicio,
          eventoFim: ev.fim,
          duracaoMin: Math.round(duracaoMin),
          clienteMatchedNome: matchedCliente?.nome,
        },
        clienteId: matchedCliente?.id,
        eventoCalId: ev.id,
      },
    });
    criadas++;
  }

  return { sugestoesCriadas: criadas, eventosAvaliados: avaliados };
}
