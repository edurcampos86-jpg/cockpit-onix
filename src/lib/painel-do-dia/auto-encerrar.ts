import "server-only";
import { prisma } from "@/lib/prisma";
import { construirIndice, casarCliente } from "./auto-encerrar-core";
import type { EventoAgenda } from "./types";

/**
 * Auto-encerramento pós-reunião.
 *
 * Para cada evento do cache de agenda do Outlook (ms-calendar) que terminou
 * há 30-120 min, cria uma PainelSugestao do tipo "encerrar-reuniao".
 *
 * A decisão de a qual cliente a reunião pertence vive em
 * ./auto-encerrar-core (puro e testado). Aqui fica só o IO.
 *
 * NÃO está agendada. É disparada sob demanda pelo workflow_dispatch de
 * .github/workflows/cron.yml.
 *
 * A janela de 30-120 min é deliberadamente estreita: a sugestão só faz
 * sentido logo após a reunião. Isso também significa que não existe
 * histórico a recuperar — rodar hoje não traz reuniões de ontem.
 */

const LIMIAR_MIN_MIN = 30; // evento terminou há >= 30min
const LIMIAR_MIN_MAX = 120; // <= 2h (evita gerar sugestão tarde demais)

export async function processarAutoEncerramento(userId: string): Promise<{
  sugestoesCriadas: number;
  eventosAvaliados: number;
  identificadoresAmbiguos: number;
}> {
  const cache = await prisma.painelCacheExterno.findFirst({
    where: { userId, source: "ms-calendar" },
  });
  if (!cache) {
    return { sugestoesCriadas: 0, eventosAvaliados: 0, identificadoresAmbiguos: 0 };
  }

  const eventos = (cache.payload as EventoAgenda[] | undefined) ?? [];
  const agora = Date.now();

  const clientes = await prisma.clienteBackoffice.findMany({
    select: {
      id: true,
      nome: true,
      email: true,
      telefone: true,
      cpfCnpj: true,
      numeroConta: true,
    },
  });
  const { indice, ambiguos } = construirIndice(clientes);

  let criadas = 0;
  let avaliados = 0;

  for (const ev of eventos) {
    if (!ev.fim || !ev.inicio) continue;
    const fim = new Date(ev.fim).getTime();
    const desdeFim = (agora - fim) / (60 * 1000);
    if (desdeFim < LIMIAR_MIN_MIN || desdeFim > LIMIAR_MIN_MAX) continue;
    avaliados++;

    const matchedCliente = casarCliente(ev, indice);

    // Sem cliente identificado, só vale sugerir se a reunião foi longa.
    const duracaoMin =
      (new Date(ev.fim).getTime() - new Date(ev.inicio).getTime()) / 60_000;
    if (!matchedCliente && duracaoMin < 30) continue;

    // Dedup por evento: rodar duas vezes na mesma janela não duplica.
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

  return {
    sugestoesCriadas: criadas,
    eventosAvaliados: avaliados,
    identificadoresAmbiguos: ambiguos,
  };
}
