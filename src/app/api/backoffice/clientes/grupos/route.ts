import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardaFlag } from "@/lib/clientes-registro/guarda";

/**
 * GET  /api/backoffice/clientes/grupos — lista os grupos de atendimento.
 * POST /api/backoffice/clientes/grupos — cria um grupo com seus membros.
 *
 * Body do POST:
 *   { nome, descricao?, membros: [{ clienteId, viaGrupo? }] }
 *
 * `viaGrupo` default `true`: quem monta um grupo de atendimento está dizendo
 * que falar com um é falar com todos. `false` é a exceção declarada — o filho
 * que exige contato próprio, o sócio que não entra nas conversas.
 *
 * O grupo NÃO é criado vazio: um grupo sem membros não propaga nada e vira
 * lixo na lista. Quem quiser um grupo de uma conta só declara isso passando um
 * membro — explícito e reversível.
 *
 * Não confundir com `GrupoCliente` (grupo de WhatsApp da Datacrazy) nem com
 * `PessoaGrupo` (mesmo CPF/CNPJ). Este agrupa por DECISÃO DE ATENDIMENTO, que
 * é a única das três que a propagação de contato pode usar.
 */
export async function GET() {
  try {
    const guarda = await guardaFlag();
    if (guarda.erro) return guarda.erro;

    const grupos = await prisma.clienteGrupo.findMany({
      orderBy: { criadoEm: "desc" },
      include: {
        membros: {
          orderBy: { adicionadoEm: "asc" },
          select: {
            id: true,
            viaGrupo: true,
            cliente: { select: { id: true, nome: true, numeroConta: true, classificacao: true } },
          },
        },
      },
    });
    return NextResponse.json({ grupos, total: grupos.length });
  } catch (error) {
    console.error("Erro ao listar grupos de clientes:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const guarda = await guardaFlag();
    if (guarda.erro) return guarda.erro;

    const body = (await req.json()) as {
      nome?: string;
      descricao?: string;
      membros?: { clienteId?: string; viaGrupo?: boolean }[];
    };

    const nome = body.nome?.trim();
    if (!nome) return NextResponse.json({ error: "Nome do grupo é obrigatório" }, { status: 400 });

    const membrosBrutos = Array.isArray(body.membros) ? body.membros : [];
    // Dedup por clienteId ANTES de escrever: o @@unique(grupoId, clienteId)
    // rejeitaria a transação inteira, e o operador só teria clicado duas vezes
    // no mesmo nome numa lista longa.
    const porCliente = new Map<string, boolean>();
    for (const m of membrosBrutos) {
      const cid = typeof m?.clienteId === "string" ? m.clienteId.trim() : "";
      if (!cid) continue;
      // Numa repetição, `viaGrupo=false` vence: a exceção declarada não pode
      // ser apagada por uma segunda linha que veio com o default.
      const anterior = porCliente.get(cid);
      const atual = m.viaGrupo !== false;
      porCliente.set(cid, anterior === false ? false : atual);
    }

    if (porCliente.size === 0) {
      return NextResponse.json({ error: "Informe ao menos um membro" }, { status: 400 });
    }

    // Toda conta informada precisa existir. Sem esta conferência, a FK falharia
    // no meio da transação e a mensagem que chega na tela seria um erro do
    // Postgres, não "esta conta não existe".
    const ids = [...porCliente.keys()];
    const existentes = await prisma.clienteBackoffice.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (existentes.length !== ids.length) {
      const achados = new Set(existentes.map((c) => c.id));
      return NextResponse.json(
        { error: "Conta não encontrada", clientesInvalidos: ids.filter((i) => !achados.has(i)) },
        { status: 400 },
      );
    }

    const grupo = await prisma.clienteGrupo.create({
      data: {
        nome,
        descricao: body.descricao?.trim() || null,
        criadoPor: guarda.userId,
        membros: {
          create: ids.map((clienteId) => ({
            clienteId,
            viaGrupo: porCliente.get(clienteId) ?? true,
            adicionadoPor: guarda.userId,
          })),
        },
      },
      include: {
        membros: {
          select: {
            id: true,
            viaGrupo: true,
            cliente: { select: { id: true, nome: true, numeroConta: true } },
          },
        },
      },
    });

    return NextResponse.json(grupo, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar grupo de clientes:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
