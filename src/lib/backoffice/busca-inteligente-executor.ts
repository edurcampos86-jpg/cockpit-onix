import { prisma } from "@/lib/prisma";
import type { FiltrosBusca } from "./busca-inteligente-schema";

/**
 * Executor da busca inteligente: aplica FiltrosBusca (já validados) sobre
 * ClienteBackoffice via Prisma e devolve uma lista minimizada.
 *
 * Pré-condição: filtros já passaram por validarFiltros — em particular
 * `limite` já está clampado a [1, LIMITE_MAX] e os tipos numéricos são
 * `number` finito. Aqui assumimos input limpo.
 *
 * Princípio de privacidade: SELECT explícito de 6 campos. Nunca devolver
 * o registro inteiro — minimiza superfície de exposição se a rota
 * vazar em algum log/erro.
 */

export interface ClienteResultado {
  id: string;
  nome: string;
  apelido: string | null;
  saldoConta: number;
  saldo: number;
  updatedAt: string; // ISO
}

const DIA_MS = 86_400_000;

function montarWhere(filtros: FiltrosBusca) {
  // Construir condições só se o filtro estiver presente — não enviar
  // chaves vazias pro Prisma (evita "where: {}" inesperado).
  const where: Record<string, unknown> = {};

  // saldoConta range
  if (filtros.saldoCcMin !== undefined || filtros.saldoCcMax !== undefined) {
    const cond: Record<string, number> = {};
    if (filtros.saldoCcMin !== undefined) cond.gte = filtros.saldoCcMin;
    if (filtros.saldoCcMax !== undefined) cond.lte = filtros.saldoCcMax;
    where.saldoConta = cond;
  }

  // saldo (PL) range
  if (filtros.plMin !== undefined || filtros.plMax !== undefined) {
    const cond: Record<string, number> = {};
    if (filtros.plMin !== undefined) cond.gte = filtros.plMin;
    if (filtros.plMax !== undefined) cond.lte = filtros.plMax;
    where.saldo = cond;
  }

  // semMovimentacaoDias → updatedAt mais antigo que o cutoff
  if (filtros.semMovimentacaoDias !== undefined) {
    const cutoff = new Date(Date.now() - filtros.semMovimentacaoDias * DIA_MS);
    where.updatedAt = { lt: cutoff };
  }

  // nomeContem: OR entre nome e apelido, case-insensitive
  if (filtros.nomeContem) {
    where.OR = [
      { nome: { contains: filtros.nomeContem, mode: "insensitive" } },
      { apelido: { contains: filtros.nomeContem, mode: "insensitive" } },
    ];
  }

  return where;
}

function montarOrderBy(filtros: FiltrosBusca) {
  // Default: saldoConta desc (cliente provavelmente quer "maiores saldos")
  const ordem = filtros.ordem ?? "desc";
  switch (filtros.ordenarPor) {
    case "pl":
      return { saldo: ordem } as const;
    case "nome":
      // Para nome, default 'asc' faz mais sentido se o usuário não pediu —
      // mas se ele pediu 'desc' explicitamente, respeitamos.
      return { nome: filtros.ordem ?? "asc" } as const;
    case "saldoCc":
    default:
      return { saldoConta: ordem } as const;
  }
}

export async function buscarClientes(
  filtros: FiltrosBusca,
): Promise<{ resultados: ClienteResultado[]; total: number }> {
  const where = montarWhere(filtros);
  const orderBy = montarOrderBy(filtros);
  const take = filtros.limite ?? 20;

  // Roda count + findMany em paralelo (count usa o mesmo where).
  const [resultados, total] = await Promise.all([
    prisma.clienteBackoffice.findMany({
      where,
      orderBy,
      take,
      select: {
        id: true,
        nome: true,
        apelido: true,
        saldoConta: true,
        saldo: true,
        updatedAt: true,
      },
    }),
    prisma.clienteBackoffice.count({ where }),
  ]);

  return {
    resultados: resultados.map((c) => ({
      id: c.id,
      nome: c.nome,
      apelido: c.apelido,
      saldoConta: c.saldoConta,
      saldo: c.saldo,
      updatedAt: c.updatedAt.toISOString(),
    })),
    total,
  };
}
