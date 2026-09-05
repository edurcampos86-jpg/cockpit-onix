import "server-only";

import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth-helpers";
import { rbacEnforcementHabilitado, resolverCgesVisiveis } from "@/lib/rbac";
import { cockpitReuniaoHabilitado } from "@/lib/cockpit-reuniao/flag";
import { escopoDeReunioes } from "@/lib/reunioes/escopo-reuniao-sessao";
import { filtrarReunioesPorEscopo } from "@/lib/reunioes/escopo-reuniao";
import { casarClientePorParticipantes } from "@/lib/reunioes/casar-cliente";
import {
  estadoDaConciliacao,
  montarMetricasConciliacao,
  ordenarConciliacao,
  type PlaudConciliacaoItem,
  type PlaudConciliacaoPayload,
} from "@/lib/reunioes/conciliacao";

/**
 * Leitura isolada da Fase 0 da Mesa Plaud.
 *
 * Não reutiliza nem altera `/api/meetings`: a flag OFF precisa preservar o
 * fluxo legado, e a mesa não deve mandar transcrição completa na listagem.
 */
export async function carregarMesaConciliacao(
  ctx: AuthContext,
  limite: number,
): Promise<PlaudConciliacaoPayload> {
  const escopo = await escopoDeReunioes(ctx);

  // O `take` acontece antes do filtro de vendedor, igual ao endpoint legado.
  // Por isso os números dizem "nesta lista", nunca "total".
  const recebidas = await prisma.meeting.findMany({
    where: { source: "plaud" },
    orderBy: { createdAt: "desc" },
    take: limite + 1,
    select: {
      id: true,
      title: true,
      date: true,
      duration: true,
      participants: true,
      vendedor: true,
      createdAt: true,
    },
  });

  const filtradas = filtrarReunioesPorEscopo(recebidas, escopo);
  const visiveis = filtradas.slice(0, limite);
  const idsVisiveis = visiveis.map((m) => m.id);

  // Não carrega o texto: só os IDs que possuem transcrição.
  const comTranscricao = idsVisiveis.length
    ? await prisma.meeting.findMany({
        where: {
          id: { in: idsVisiveis },
          AND: [{ transcription: { not: null } }, { transcription: { not: "" } }],
        },
        select: { id: true },
      })
    : [];
  const idsComTranscricao = new Set(comTranscricao.map((m) => m.id));

  // Candidatos também respeitam o recorte de clientes da sessão. Uma reunião
  // visível não pode revelar o nome de cliente fora do CGE permitido.
  const cges = (await rbacEnforcementHabilitado()) ? await resolverCgesVisiveis(ctx) : null;
  const candidatos = await prisma.clienteBackoffice.findMany({
    where: cges === null ? undefined : { assessorCge: { in: cges } },
    select: { id: true, nome: true, nomeCompleto: true, apelido: true },
  });

  const cockpitLigado = await cockpitReuniaoHabilitado();
  const items: PlaudConciliacaoItem[] = visiveis.map((m) => {
    const participantes = (m.participants ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    const casamento = casarClientePorParticipantes(participantes, candidatos);
    const temTranscricao = idsComTranscricao.has(m.id);
    const estado = estadoDaConciliacao(casamento, temTranscricao);
    const cliente =
      casamento.tipo === "casou"
        ? {
            id: casamento.clienteId,
            nome: casamento.nome,
            evidencia: `Nome exato nos participantes: ${casamento.participante}`,
          }
        : null;
    const podeAbrirPreview = Boolean(cliente && temTranscricao && cockpitLigado);
    const previewUrl = podeAbrirPreview
      ? `/empresas/investimentos/clientes/${encodeURIComponent(cliente!.id)}` +
        `?aba=cockpit-reuniao&importarReuniao=${encodeURIComponent(m.id)}`
      : null;

    return {
      id: m.id,
      titulo: m.title,
      data: m.date.toISOString(),
      duracaoMin: m.duration,
      participantes,
      vendedor: m.vendedor,
      recebidoEm: m.createdAt.toISOString(),
      temTranscricao,
      estado,
      clienteSugerido: cliente,
      clienteAmbiguo: casamento.tipo === "ambiguo" ? casamento.participante : null,
      podeAbrirPreview,
      previewUrl,
    };
  });

  const ordenados = ordenarConciliacao(items);
  return {
    items: ordenados,
    metricas: montarMetricasConciliacao(ordenados),
    janela: {
      limite,
      truncada: filtradas.length > limite,
      descricao: `Janela de origem: até ${limite} gravações Plaud recentes; a lista aplica seu escopo de acesso`,
    },
  };
}
