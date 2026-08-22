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
      // A pessoa do time, quando o parceiro é do time. O que a ficha mostra
      // daqui é HERDADO por leitura, nunca copiado para `Parceiro` — copiar
      // criaria a segunda grafia que este elo existe para acabar.
      pessoa: {
        select: {
          id: true,
          nomeCompleto: true,
          apelido: true,
          email: true,
          telefone: true,
          cargoFamilia: true,
          cargoTitulo: true,
          status: true,
        },
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
          percentual: true,
          dataInicio: true,
          dataFim: true,
          criadoPor: true,
          incluiDescendentes: true,
          empresa: { select: { id: true, nome: true, tipo: true, parentId: true } },
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

export type CandidatoCliente = {
  id: string;
  nome: string;
  numeroConta: string;
  saldo: number;
  parceiroAtual: string | null;
};

/**
 * Candidatos a vincular, por nome ou número da conta.
 *
 * Traz junto o parceiro vigente de cada um: a tela precisa MOSTRAR que o
 * cliente já tem dono antes do clique, e não depois — a #310 recusaria o
 * INSERT, mas com uma violação de unique em vez de um nome.
 */
export async function buscarClientesParaVincular(
  termo: string,
  limite = 8,
): Promise<CandidatoCliente[]> {
  const t = termo.trim();
  if (t.length < 3) return [];

  const clientes = await prisma.clienteBackoffice.findMany({
    where: {
      OR: [
        { nome: { contains: t, mode: "insensitive" } },
        { numeroConta: { contains: t } },
      ],
    },
    orderBy: { nome: "asc" },
    take: limite,
    select: {
      id: true,
      nome: true,
      numeroConta: true,
      saldo: true,
      parceirosVinculo: {
        where: { dataFim: null },
        select: { parceiro: { select: { nome: true } } },
      },
    },
  });

  return clientes.map((c) => ({
    id: c.id,
    nome: c.nome,
    numeroConta: c.numeroConta,
    saldo: c.saldo,
    parceiroAtual: c.parceirosVinculo[0]?.parceiro.nome ?? null,
  }));
}

/**
 * Quem trouxe ESTE cliente, e desde quando. `null` quando não veio por
 * parceiro — que é o caso da maioria e não é uma falta.
 *
 * Devolve o vínculo VIGENTE (`dataFim: null`). O histórico de quem já trouxe
 * o cliente antes fica na ficha do parceiro, não na do cliente: na ficha do
 * cliente a pergunta é "de quem ele é hoje".
 */
export async function parceiroVigenteDoCliente(clienteId: string) {
  const vinculo = await prisma.parceiroCliente.findFirst({
    where: { clienteId, dataFim: null },
    select: {
      dataInicio: true,
      parceiro: {
        select: { id: true, nome: true, tipo: true, ativo: true },
      },
    },
  });
  return vinculo;
}

export type PessoaVinculavel = {
  id: string;
  nome: string;
  cargo: string;
  jaEhParceiro: boolean;
};

/**
 * Pessoas do time que podem ser ligadas a um parceiro.
 *
 * Traz TAMBÉM as que já são parceiro, marcadas — some-las esconderia o motivo
 * de a pessoa procurada não aparecer na lista, que é a pergunta seguinte de
 * quem não a encontra. `@unique` no campo impede o vínculo duplo de qualquer
 * jeito; aqui o trabalho é explicar, não bloquear.
 */
export async function listarPessoasParaVinculo(): Promise<PessoaVinculavel[]> {
  const pessoas = await prisma.pessoa.findMany({
    where: { status: "ativo" },
    orderBy: { nomeCompleto: "asc" },
    select: {
      id: true,
      nomeCompleto: true,
      apelido: true,
      cargoFamilia: true,
      cargoTitulo: true,
      parceiro: { select: { id: true } },
    },
  });

  return pessoas.map((p) => ({
    id: p.id,
    nome: p.apelido?.trim() || p.nomeCompleto,
    cargo: p.cargoTitulo?.trim() || p.cargoFamilia.replace(/_/g, " "),
    jaEhParceiro: p.parceiro !== null,
  }));
}

export type NoHierarquia = {
  id: string;
  nome: string;
  tipo: string;
  parentId: string | null;
  /** Profundidade na árvore — vira indentação no seletor. */
  nivel: number;
};

/**
 * Os nós da hierarquia Onix Co, já ordenados como árvore para caber num
 * `<select>`.
 *
 * A ordenação é feita aqui, e não no SQL, porque "ordem de árvore" não é
 * `ORDER BY` — é percurso. São dezenas de linhas; carregar todas e percorrer
 * em memória é mais barato que uma recursiva, e não esconde a lógica no banco.
 */
export async function listarNosHierarquia(): Promise<NoHierarquia[]> {
  const nos = await prisma.empresa.findMany({
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, tipo: true, parentId: true },
  });

  const porPai = new Map<string | null, typeof nos>();
  for (const n of nos) {
    const chave = n.parentId ?? null;
    const lista = porPai.get(chave) ?? [];
    lista.push(n);
    porPai.set(chave, lista);
  }

  const saida: NoHierarquia[] = [];
  const visitados = new Set<string>();
  const descer = (paiId: string | null, nivel: number) => {
    for (const n of porPai.get(paiId) ?? []) {
      // Guarda contra ciclo: `Empresa.parentId` não tem trigger anti-ciclo (o
      // que existe é o da árvore de Parceiro). Sem isto, um ciclo em produção
      // viraria recursão infinita numa tela de cadastro.
      if (visitados.has(n.id)) continue;
      visitados.add(n.id);
      saida.push({ ...n, nivel });
      descer(n.id, nivel + 1);
    }
  };
  descer(null, 0);

  // Nós órfãos (pai inexistente) entram no fim em vez de sumir: some-los
  // esconderia justamente o nó que precisa de conserto.
  for (const n of nos) {
    if (!visitados.has(n.id)) saida.push({ ...n, nivel: 0 });
  }
  return saida;
}
