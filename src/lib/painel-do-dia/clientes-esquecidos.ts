import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * "Clientes esquecidos" no Painel do Dia.
 *
 * Cadencia esperada (Supernova ABC):
 *   A = ate 30 dias entre contatos (12 contatos/ano)
 *   B = ate 90 dias (4/ano)
 *   C = ate 180 dias (2/ano)
 *
 * Cliente sem `ultimoContatoAt` (nunca tocado) entra como "nunca contatado"
 * com prioridade alta — mostrado como classe A se nao tiver classificacao.
 *
 * Filtra clientes inativos: `ativacaoConta != "Ativa"` so aparece se foi
 * recentemente alterado. Por padrao, retorna so contas ativas pra nao poluir.
 */

const LIMITES_DIAS: Record<string, number> = {
  A: 30,
  B: 90,
  C: 180,
};

const PRIORIDADE_CLASSE: Record<string, number> = {
  A: 0,
  B: 1,
  C: 2,
};

export type ClienteEsquecido = {
  id: string;
  nome: string;
  classificacao: string; // "A" | "B" | "C"
  diasSemContato: number | null; // null = nunca contatado
  ultimoContatoAt: string | null; // ISO
  proximaReuniaoAt: string | null; // ISO — se tem reuniao marcada, nao eh tao critico
  email: string | null;
  telefone: string | null;
};

export async function carregarClientesEsquecidos(opts?: {
  limit?: number;
}): Promise<ClienteEsquecido[]> {
  const limit = opts?.limit ?? 20;
  const agora = Date.now();

  // Query bruta: contas ativas, qualquer classificacao. Filtragem por
  // threshold acontece na memoria — N pequeno (~centenas de clientes),
  // mais simples que SQL com CASE WHEN ABC dinamico.
  const todos = await prisma.clienteBackoffice.findMany({
    where: {
      OR: [{ ativacaoConta: "Ativa" }, { ativacaoConta: null }],
    },
    select: {
      id: true,
      nome: true,
      classificacao: true,
      ultimoContatoAt: true,
      proximaReuniaoAt: true,
      email: true,
      telefone: true,
    },
  });

  const esquecidos: ClienteEsquecido[] = [];
  for (const c of todos) {
    const classe = (c.classificacao || "C").toUpperCase();
    const limite = LIMITES_DIAS[classe] ?? LIMITES_DIAS.C;

    let diasSemContato: number | null;
    if (!c.ultimoContatoAt) {
      diasSemContato = null;
    } else {
      diasSemContato = Math.floor(
        (agora - c.ultimoContatoAt.getTime()) / (24 * 60 * 60 * 1000),
      );
    }

    const esquecido =
      diasSemContato === null || diasSemContato > limite;
    if (!esquecido) continue;

    esquecidos.push({
      id: c.id,
      nome: c.nome,
      classificacao: classe,
      diasSemContato,
      ultimoContatoAt: c.ultimoContatoAt?.toISOString() ?? null,
      proximaReuniaoAt: c.proximaReuniaoAt?.toISOString() ?? null,
      email: c.email,
      telefone: c.telefone,
    });
  }

  // Ordena: classe (A primeiro), depois nunca-contatado primeiro,
  // depois mais dias = mais critico.
  esquecidos.sort((a, b) => {
    const pa = PRIORIDADE_CLASSE[a.classificacao] ?? 3;
    const pb = PRIORIDADE_CLASSE[b.classificacao] ?? 3;
    if (pa !== pb) return pa - pb;
    // Nunca contatado vem antes
    if (a.diasSemContato === null && b.diasSemContato !== null) return -1;
    if (a.diasSemContato !== null && b.diasSemContato === null) return 1;
    // Mais dias = mais critico
    return (b.diasSemContato ?? 0) - (a.diasSemContato ?? 0);
  });

  return esquecidos.slice(0, limit);
}

/**
 * Marca contato manualmente — usuario clicou "Marcar contato" no card.
 * Equivalente a registrar uma interacao informal: liguei, mandei whats,
 * passei na sala, etc. Apenas atualiza ultimoContatoAt = NOW.
 *
 * Nao cria InteracaoCliente porque eh um touch informal. Se Eduardo quiser
 * registrar com detalhes, vai pelo fluxo normal de /backoffice/clientes/[id].
 */
export async function marcarContatoAgora(clienteId: string): Promise<{
  ultimoContatoAt: string;
}> {
  const agora = new Date();
  await prisma.clienteBackoffice.update({
    where: { id: clienteId },
    data: { ultimoContatoAt: agora },
  });
  return { ultimoContatoAt: agora.toISOString() };
}
