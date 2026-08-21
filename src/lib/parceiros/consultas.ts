import "server-only";
import { prisma } from "@/lib/prisma";

/* ──────────────────────────────────────────────────────────────
 * Leituras de Parceiros — o único lugar do app que fala com o banco sobre
 * `Parceiro`, `ParceiroCliente` e `AcordoComercialParceiro`.
 *
 * `server-only` no topo pelo mesmo motivo de `lib/team.ts`: garante em tempo
 * de build que nenhuma dessas consultas — e nenhum objeto do Prisma — atravesse
 * para o cliente. Um import acidental num componente `"use client"` quebra o
 * build em vez de vazar dado.
 *
 * ── VIGENTE = `dataFim IS NULL`, SEMPRE ──────────────────────────────────
 * Nunca comparar com `now()`. `TIMESTAMP(3)` arredonda para cima em 75,8% das
 * escritas (medido), e a linha recém-gravada cairia no futuro — sumindo da
 * própria tela que acabou de criá-la.
 * ────────────────────────────────────────────────────────────── */

export type ParceiroDaLista = {
  id: string;
  nome: string;
  tipo: string;
  ativo: boolean;
  contratoAssinadoEm: Date | null;
  clientesVigentes: number;
  acordosVigentes: number;
};

/**
 * Lista para a tabela. Traz as CONTAGENS de vigentes, não as linhas: a tela
 * mostra números, e trazer os vínculos inteiros para contá-los no JS cresceria
 * com a carteira.
 */
export async function listarParceiros(opcoes?: {
  incluirInativos?: boolean;
  busca?: string;
}): Promise<ParceiroDaLista[]> {
  const busca = opcoes?.busca?.trim();
  const parceiros = await prisma.parceiro.findMany({
    where: {
      ...(opcoes?.incluirInativos ? {} : { ativo: true }),
      ...(busca ? { nome: { contains: busca, mode: "insensitive" } } : {}),
    },
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      tipo: true,
      ativo: true,
      contratoAssinadoEm: true,
      _count: {
        select: {
          clientes: { where: { dataFim: null } },
          acordos: { where: { dataFim: null } },
        },
      },
    },
  });

  return parceiros.map((p) => ({
    id: p.id,
    nome: p.nome,
    tipo: p.tipo,
    ativo: p.ativo,
    contratoAssinadoEm: p.contratoAssinadoEm,
    clientesVigentes: p._count.clientes,
    acordosVigentes: p._count.acordos,
  }));
}

/**
 * Ficha completa de um parceiro. `null` quando não existe — quem chama decide
 * se isso vira 404.
 */
export async function obterParceiro(id: string) {
  return prisma.parceiro.findUnique({
    where: { id },
    select: {
      id: true,
      nome: true,
      tipo: true,
      ativo: true,
      contratoAssinadoEm: true,
      criadoEm: true,
      clienteBackoffice: {
        select: { id: true, nome: true, numeroConta: true },
      },
      // Vigentes primeiro (dataFim null), depois o histórico do mais recente
      // para o mais antigo. Mesma ordenação do acordo comercial da Pessoa.
      acordos: {
        orderBy: [
          { dataFim: { sort: "asc", nulls: "first" } },
          { dataInicio: "desc" },
        ],
        select: {
          id: true,
          tipoProduto: true,
          percentual: true,
          dataInicio: true,
          dataFim: true,
          criadoPor: true,
        },
      },
      clientes: {
        orderBy: [
          { dataFim: { sort: "asc", nulls: "first" } },
          { dataInicio: "desc" },
        ],
        select: {
          id: true,
          dataInicio: true,
          dataFim: true,
          cliente: {
            select: { id: true, nome: true, numeroConta: true, saldo: true },
          },
        },
      },
    },
  });
}

/** Já existe parceiro com este nome? Usado para não criar o mesmo duas vezes. */
export async function parceiroPorNome(nome: string) {
  return prisma.parceiro.findFirst({
    where: { nome: { equals: nome.trim(), mode: "insensitive" } },
    select: { id: true, nome: true },
  });
}
