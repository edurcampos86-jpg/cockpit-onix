import "server-only";
import { prisma } from "@/lib/prisma";
import { hojeBahia } from "./agregador";

/**
 * Boot do Dia — heurística noturna que sugere as 3 Prioridades do Dia.
 *
 * Regras (ordem decrescente de peso):
 *   1. Ação em Q1 (Crítico & Urgente) atrasada
 *   2. Ação importante=true com vence=hoje
 *   3. Cliente classe A sem contato há >=25 dias (cadência Supernova mensal)
 *   4. Cliente classe B sem contato há >=55 dias
 *   5. Follow-up criado via modal de encerramento nos últimos 2 dias e ainda aberto
 */
export type BootCandidato = {
  texto: string;
  motivo: string;
  peso: number;
};

export async function gerarCandidatos(userId: string): Promise<BootCandidato[]> {
  const hoje = hojeBahia();
  const inicioHoje = new Date(`${hoje}T03:00:00.000Z`); // 00:00 Bahia = 03:00 UTC

  const [acoes, clientes] = await Promise.all([
    prisma.acaoPainel.findMany({
      where: { userId, concluida: false },
      include: { clienteVinculado: { select: { nome: true, classificacao: true } } },
    }),
    prisma.clienteBackoffice.findMany({
      where: {
        OR: [{ classificacao: "A" }, { classificacao: "B" }],
      },
      select: {
        id: true,
        nome: true,
        classificacao: true,
        ultimoContatoAt: true,
      },
    }),
  ]);

  const candidatos: BootCandidato[] = [];

  // Regra 1 + 2: ações urgentes
  for (const a of acoes) {
    const vence = a.vence;
    const atrasada = vence && vence < inicioHoje;
    const venceHoje =
      vence &&
      vence.toISOString().slice(0, 10) === hoje;

    if (atrasada && a.quadrante === "Q1") {
      candidatos.push({
        texto: a.titulo,
        motivo: "Q1 atrasada (crítico e urgente)",
        peso: 100,
      });
    } else if (atrasada) {
      candidatos.push({
        texto: a.titulo,
        motivo: `atrasada (vencia ${vence!.toISOString().slice(0, 10)})`,
        peso: 80,
      });
    } else if (venceHoje && a.importante) {
      candidatos.push({
        texto: a.titulo,
        motivo: "vence hoje e marcada como importante",
        peso: 75,
      });
    } else if (venceHoje) {
      candidatos.push({
        texto: a.titulo,
        motivo: "vence hoje",
        peso: 60,
      });
    }
  }

  // Regra 3 + 4: clientes fora da cadência Supernova
  const agora = Date.now();
  const DIA = 24 * 60 * 60 * 1000;
  for (const c of clientes) {
    if (!c.ultimoContatoAt) continue;
    const diasSemContato = (agora - c.ultimoContatoAt.getTime()) / DIA;
    if (c.classificacao === "A" && diasSemContato >= 25) {
      candidatos.push({
        texto: `Contatar ${c.nome} (cliente A)`,
        motivo: `${Math.floor(diasSemContato)} dias sem contato — cadência A = 30d`,
        peso: 70,
      });
    } else if (c.classificacao === "B" && diasSemContato >= 55) {
      candidatos.push({
        texto: `Contatar ${c.nome} (cliente B)`,
        motivo: `${Math.floor(diasSemContato)} dias sem contato — cadência B = 60d`,
        peso: 50,
      });
    }
  }

  // Ordena por peso e dedupica por texto
  const visto = new Set<string>();
  return candidatos
    .sort((a, b) => b.peso - a.peso)
    .filter((c) => {
      if (visto.has(c.texto)) return false;
      visto.add(c.texto);
      return true;
    });
}

/**
 * Aplica candidatos aos slots vazios do dia corrente. Respeita:
 *  - prioridades já preenchidas manualmente (não sobrescreve)
 *  - marca sugeridaPorBoot=true para diferenciar no UI
 */
export async function aplicarBoot(userId: string): Promise<{
  criadas: number;
  jaExistentes: number;
}> {
  const data = hojeBahia();
  const candidatos = await gerarCandidatos(userId);
  if (candidatos.length === 0) return { criadas: 0, jaExistentes: 0 };

  const existentes = await prisma.painelPrioridade.findMany({
    where: { userId, data },
    select: { posicao: true },
  });
  const ocupadas = new Set(existentes.map((p) => p.posicao));

  let criadas = 0;
  for (const posicao of [1, 2, 3] as const) {
    if (ocupadas.has(posicao)) continue;
    const candidato = candidatos[criadas];
    if (!candidato) break;
    await prisma.painelPrioridade.create({
      data: {
        userId,
        data,
        posicao,
        texto: candidato.texto,
        concluida: false,
        sugeridaPorBoot: true,
        bootMotivo: candidato.motivo,
      },
    });
    criadas++;
  }

  return { criadas, jaExistentes: existentes.length };
}
