/* ──────────────────────────────────────────────────────────────
 * Microcopy por cluster PAT — Círculo de Introduções (INDICACOES_V2).
 *
 * Módulo PURO (sem prisma, sem "use client"): o `page.tsx` (server) resolve o
 * cluster pelo e-mail da sessão e passa o objeto pronto como prop — o client
 * nunca vê o mapa de e-mails.
 *
 * Os 4 clusters vêm da análise dos 16 PATs do time (jul-ago/2026):
 *   cluster1 — comunicadores sociais de impacto (manchete, emoção, ação-já)
 *   cluster2 — executivos velozes (número na frente, telegráfico, só exceção)
 *   cluster3 — analíticos de precisão (factual, critérios, sem apelo)
 *   cluster4 — cuidadores sensoriais (acolhedor, passo a passo, sem pressão)
 *
 * O que varia por cluster é SÓ o que está em `MicrocopyIndicacoes` — descrição
 * do header, empty state global e CTA principal. Estrutura, densidade e ordem
 * de seções não variam (decisão da spec de UX: zero fork estrutural).
 *
 * E-mails: os conhecidos vêm dos seeds do repo
 * (`scripts/seed-pessoas-onix-capital.ts`, `scripts/seed-novos-times-onix.ts`,
 * `scripts/seed-adriely.ts`). Quem não tem e-mail rastreável no repo (Felipe
 * Pugas, Thais Mascarenhas) fica FORA do mapa e cai no fallback cluster1 —
 * revisão semestral já agendada no Calendar.
 * ────────────────────────────────────────────────────────────── */

export type ClusterPat = "cluster1" | "cluster2" | "cluster3" | "cluster4";

export interface MicrocopyIndicacoes {
  descricaoHeader: string;
  emptyGlobal: string;
  ctaPrincipal: string;
}

export const MICROCOPY_INDICACOES: Record<ClusterPat, MicrocopyIndicacoes> = {
  cluster1: {
    descricaoHeader:
      "Cada convite — treino, praia, mesa, teatro — aproxima alguém do círculo. Veja quem está a um passo de entrar e chame agora.",
    emptyGlobal:
      "O quadro está vazio e o sábado é seu. Quem dos seus clientes A conhece alguém que deveria estar aqui? Um nome agora vale mais que dez amanhã.",
    ctaPrincipal: "Trazer um nome",
  },
  cluster2: {
    descricaoHeader:
      "Funil de introduções: placar semanal, conversão e pipeline em R$. Só cartão parado exige sua ação.",
    emptyGlobal:
      "0 introduções no funil. O placar da semana está aberto — registre a primeira.",
    ctaPrincipal: "Registrar +1",
  },
  cluster3: {
    descricaoHeader:
      "Registro de cada introdução com origem, data de entrada, etapa atual e dias sem movimento — tudo conferível no cartão.",
    emptyGlobal:
      "Nenhum registro no quadro. Ao criar uma introdução, data de entrada e etapa inicial são gravadas automaticamente; só o nome é obrigatório.",
    ctaPrincipal: "Registrar introdução",
  },
  cluster4: {
    descricaoHeader:
      "Acompanhe cada pessoa apresentada à Onix, um passo de cada vez. O quadro mostra o que já foi feito e qual é o próximo passo de cada uma.",
    emptyGlobal:
      "Tudo pronto para começar. Toque no botão e preencha um campo de cada vez — só o nome é obrigatório, o resto pode vir depois.",
    ctaPrincipal: "Começar uma introdução",
  },
};

export const CLUSTER_FALLBACK: ClusterPat = "cluster1";

/**
 * E-mail da sessão → cluster. 14 dos 16 PATs mapeados; Felipe Pugas e Thais
 * Mascarenhas não têm e-mail conhecido no repo e caem no fallback.
 */
export const CLUSTER_POR_EMAIL: Record<string, ClusterPat> = {
  // cluster1 — Eduardo, Gustavo Nascimento (Felipe Pugas: sem e-mail no repo)
  "eduardo.rodrigues@onixcapital.com.br": "cluster1",
  "gustavo.nascimento@onixcapital.com.br": "cluster1",
  // cluster2 — Maxsuel, Vinicius, Thiago Vergal, Rafaela, Victor
  "maxsuel@onixcapital.com.br": "cluster2",
  "vinicius.assis@onixcapital.com.br": "cluster2",
  "tvergal@gmail.com": "cluster2",
  "rafaela@onixcapital.com.br": "cluster2",
  "victor.marques@onixcapital.com.br": "cluster2",
  // cluster3 — Matheus, Pedro, Gustavo Diniz, Daniel (Thais: sem e-mail no repo)
  "matheus@oniximob.com": "cluster3",
  "pedro@onixcapital.com.br": "cluster3",
  "gustavo.diniz@onixcapital.com.br": "cluster3",
  "daniel@onixcapital.com.br": "cluster3",
  // cluster4 — Adriely (e-mail setorial), Rosilene, Renan
  "qualidade@onixcapital.com.br": "cluster4",
  "rose.oliveira@onxcorretora.com.br": "cluster4",
  "renan@oniximob.com": "cluster4",
};

/** Cluster do e-mail da sessão; desconhecido ou ausente ⇒ fallback cluster1. */
export function clusterDe(email: string | null | undefined): ClusterPat {
  if (!email) return CLUSTER_FALLBACK;
  return CLUSTER_POR_EMAIL[email.trim().toLowerCase()] ?? CLUSTER_FALLBACK;
}
