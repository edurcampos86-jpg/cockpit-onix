import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizarTitulo } from "./agregador";
import type { EventoAgenda } from "./types";

/**
 * Auto-encerramento pós-reunião.
 *
 * Para cada evento do cache de agenda do Outlook (ms-calendar) que terminou
 * há 30-120 min:
 *  - tenta casar o título contra ClienteBackoffice.nome
 *  - se ainda não houver sugestão para aquele evento, cria uma PainelSugestao
 *    do tipo "encerrar-reuniao"
 *
 * NÃO está agendada. É disparada sob demanda pelo workflow_dispatch de
 * .github/workflows/cron.yml — ver o comentário lá sobre o que falta para
 * colocá-la num schedule.
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
  nomesAmbiguos: number;
}> {
  const cache = await prisma.painelCacheExterno.findFirst({
    where: { userId, source: "ms-calendar" },
  });
  if (!cache) return { sugestoesCriadas: 0, eventosAvaliados: 0, nomesAmbiguos: 0 };

  const eventos = (cache.payload as EventoAgenda[] | undefined) ?? [];
  const agora = Date.now();

  const clientes = await prisma.clienteBackoffice.findMany({
    select: { id: true, nome: true },
  });

  // Índice nome-normalizado → cliente. Nomes que normalizam para a mesma
  // chave (homônimos) são marcados como ambíguos e NÃO entram no índice:
  // atribuir a sugestão ao cliente errado é pior do que não atribuir a
  // ninguém, ainda mais numa base com ~480 contas onde homônimo é esperado.
  // Sem isso, o último cliente lido silenciosamente vencia os anteriores.
  const indiceNome = new Map<string, { id: string; nome: string }>();
  const ambiguos = new Set<string>();
  for (const c of clientes) {
    const chave = normalizarTitulo(c.nome);
    if (chave.length < 3) continue;
    if (indiceNome.has(chave)) {
      ambiguos.add(chave);
      indiceNome.delete(chave);
      continue;
    }
    if (!ambiguos.has(chave)) indiceNome.set(chave, c);
  }

  let criadas = 0;
  let avaliados = 0;

  for (const ev of eventos) {
    if (!ev.fim || !ev.inicio) continue;
    const fim = new Date(ev.fim).getTime();
    const desdeFim = (agora - fim) / (60 * 1000);
    if (desdeFim < LIMIAR_MIN_MIN || desdeFim > LIMIAR_MIN_MAX) continue;
    avaliados++;

    // Casamento por substring: o título do evento contém o nome do cliente.
    const tituloNorm = normalizarTitulo(ev.titulo);
    let matchedCliente: { id: string; nome: string } | undefined;
    for (const [nomeNorm, cli] of indiceNome) {
      if (tituloNorm.includes(nomeNorm)) {
        matchedCliente = cli;
        break;
      }
    }

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
    nomesAmbiguos: ambiguos.size,
  };
}
