export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { AlertasClient } from "./alertas-client";

export const metadata = {
  title: "Alertas de Pipeline — Onix Corretora",
};

const THRESHOLD_PARADO_H = 48;
const THRESHOLD_ALTO_TICKET = 500_000;

type Prioridade = "alta" | "media" | "baixa";

function classificarPrioridade(valor: number, horasParado: number): Prioridade {
  if (valor >= THRESHOLD_ALTO_TICKET) return "alta";
  if (horasParado > 96 || valor >= 200_000) return "media";
  return "baixa";
}

export type AlertaParado = {
  id: string;
  tipo: "parado_48h" | "alto_ticket";
  prioridade: Prioridade;
  nomeCliente: string;
  valor: number;
  responsavel: string;
  etapa: string;
  ultimaAtividade: string;
  diasParado: number;
  horasParado: number;
  ultimaResolucao: { acaoTomada: string; resolvidoEm: string } | null;
};

export type AlertaAdormecido = {
  id: string;
  tipo: "reativacao_60d";
  prioridade: Prioridade;
  nomeCliente: string;
  valor: number;
  responsavel: string;
  motivoPerda: string | null;
  dataPerda: string | null;
  dataRecontato: string | null;
  diasAteRecontato: number | null;
  recontatoVencido: boolean;
  ultimaResolucao: { acaoTomada: string; resolvidoEm: string } | null;
};

// Templates de reativação por motivo
const TEMPLATES_REATIVACAO: Record<string, string> = {
  preco:
    "Ola [CLIENTE], tudo bem? Faz um tempo que conversamos sobre [PRODUTO]. Queria te contar que tivemos algumas mudancas nas condicoes que podem fazer sentido pra voce agora. Posso te mandar os detalhes?",
  timing:
    "Ola [CLIENTE], como voce esta? Da ultima vez que conversamos, o momento nao era o ideal. Queria saber se as coisas mudaram do seu lado e se faz sentido retomarmos aquela conversa. O que acha?",
  concorrencia:
    "Ola [CLIENTE], tudo bem? Sei que voce optou por outra solucao na epoca. Queria saber como esta sendo a experiencia e se posso te ajudar com algo complementar. Estamos com novidades que podem agregar.",
  atendimento:
    "Ola [CLIENTE], queria primeiro pedir desculpas se a experiencia anterior nao foi ideal. Fizemos melhorias no nosso processo e gostaria de mostrar como podemos te atender melhor. Posso te ligar 5 minutos?",
  outro:
    "Ola [CLIENTE], tudo bem? Faz um tempo que conversamos e queria retomar o contato. Temos novidades que podem ser interessantes pra voce. Posso te mandar mais detalhes?",
};

export default async function AlertasPage() {
  const agora = new Date();
  const threshold48h = new Date(agora.getTime() - THRESHOLD_PARADO_H * 60 * 60 * 1000);

  // Buscar negócios parados
  const parados = await prisma.negocioPipeline.findMany({
    where: {
      ativo: true,
      etapa: { not: "Adormecido" },
      ultimaAtividade: { lt: threshold48h },
    },
    include: {
      resolucoes: { orderBy: { resolvidoEm: "desc" }, take: 1 },
    },
    orderBy: { ultimaAtividade: "asc" },
  });

  const alertasParados: AlertaParado[] = parados.map((n) => {
    const horasParado = (agora.getTime() - n.ultimaAtividade.getTime()) / (1000 * 60 * 60);
    const diasParado = Math.floor(horasParado / 24);
    return {
      id: n.id,
      tipo: n.valor >= THRESHOLD_ALTO_TICKET ? "alto_ticket" : "parado_48h",
      prioridade: classificarPrioridade(n.valor, horasParado),
      nomeCliente: n.nomeCliente,
      valor: n.valor,
      responsavel: n.responsavel,
      etapa: n.etapa,
      ultimaAtividade: n.ultimaAtividade.toISOString(),
      diasParado,
      horasParado: Math.floor(horasParado),
      ultimaResolucao: n.resolucoes[0]
        ? {
            acaoTomada: n.resolucoes[0].acaoTomada,
            resolvidoEm: n.resolucoes[0].resolvidoEm.toISOString(),
          }
        : null,
    };
  });

  // Buscar negócios adormecidos
  const adormecidos = await prisma.negocioPipeline.findMany({
    where: {
      OR: [{ etapa: "Adormecido" }, { motivoPerda: { not: null } }],
    },
    include: {
      resolucoes: { orderBy: { resolvidoEm: "desc" }, take: 1 },
    },
    orderBy: { dataRecontato: "asc" },
  });

  const alertasAdormecidos: AlertaAdormecido[] = adormecidos.map((n) => {
    const recontatoVencido = !!(n.dataRecontato && n.dataRecontato <= agora);
    const diasAteRecontato = n.dataRecontato
      ? Math.ceil((n.dataRecontato.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    return {
      id: n.id,
      tipo: "reativacao_60d",
      prioridade: recontatoVencido ? "alta" : "media",
      nomeCliente: n.nomeCliente,
      valor: n.valor,
      responsavel: n.responsavel,
      motivoPerda: n.motivoPerda,
      dataPerda: n.dataPerda?.toISOString() ?? null,
      dataRecontato: n.dataRecontato?.toISOString() ?? null,
      diasAteRecontato,
      recontatoVencido,
      ultimaResolucao: n.resolucoes[0]
        ? {
            acaoTomada: n.resolucoes[0].acaoTomada,
            resolvidoEm: n.resolucoes[0].resolvidoEm.toISOString(),
          }
        : null,
    };
  });

  // Contadores
  const totalParados = alertasParados.length;
  const totalAlta = alertasParados.filter((a) => a.prioridade === "alta").length;
  const totalMedia = alertasParados.filter((a) => a.prioridade === "media").length;
  const totalBaixa = alertasParados.filter((a) => a.prioridade === "baixa").length;
  const totalAdormecidos = alertasAdormecidos.length;
  const totalRecontatoVencido = alertasAdormecidos.filter((a) => a.recontatoVencido).length;

  return (
    <AlertasClient
      alertasParados={alertasParados}
      alertasAdormecidos={alertasAdormecidos}
      contadores={{
        totalParados,
        totalAlta,
        totalMedia,
        totalBaixa,
        totalAdormecidos,
        totalRecontatoVencido,
      }}
      templatesReativacao={TEMPLATES_REATIVACAO}
    />
  );
}
