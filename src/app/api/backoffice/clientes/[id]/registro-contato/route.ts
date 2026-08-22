import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardaRegistroRico } from "@/lib/clientes-registro/guarda";
import { avancaUltimoContato, destinosDoContato } from "@/lib/clientes-registro/propagacao";

/**
 * POST /api/backoffice/clientes/[id]/registro-contato — a aba Ligação do drawer.
 *
 * Grava em `InteracaoCliente`, a tabela que JÁ registra os contatos do 12-4-2
 * (12 ligações, 4 reuniões, 2 revisões/ano para clientes A). Não nasce tabela
 * nova para isto: uma segunda tabela de contato partiria o histórico do cliente
 * em dois lugares e faria a cadência contar pela metade.
 *
 * Body: { assunto, resumo?, canal?, duracaoMin?, data?, tipo?,
 *         escopo?: "individual"|"grupo", grupoId? }
 *
 * A interação em si é sempre de UMA conta — quem falou, falou com alguém. O que
 * propaga é a DATA de contato: no escopo grupo, os membros com `viaGrupo=true`
 * recebem `ultimoContatoAt` e uma linha de histórico com `origem: "grupo"`,
 * sem ganharem uma interação fantasma que ninguém conduziu.
 *
 * ── Ligação NÃO quita a cadência 12-4-2 (decisão do Eduardo, 22/08/2026) ──
 * Esta rota move `ultimoContatoAt` (ligação É contato e tem de aparecer na
 * ficha) e NÃO move `proximoContatoAt`, o relógio da cadência. Só a rota de
 * reunião quita. Ver `quitaCadencia` em lib/clientes-registro/propagacao.ts:
 * antes desta regra uma ligação de 5 min tirava o cliente da fila de
 * acompanhamento exatamente como uma reunião de uma hora.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guarda = await guardaRegistroRico(id);
    if (guarda.erro) return guarda.erro;

    const body = (await req.json()) as {
      assunto?: string;
      resumo?: string;
      canal?: string;
      duracaoMin?: number | string;
      data?: string;
      tipo?: string;
      rcaNotas?: string;
      escopo?: string;
      grupoId?: string;
    };

    const assunto = body.assunto?.trim();
    if (!assunto) return NextResponse.json({ error: "Assunto é obrigatório" }, { status: 400 });

    const data = body.data ? new Date(body.data) : new Date();
    if (Number.isNaN(data.getTime())) {
      return NextResponse.json({ error: "Data inválida" }, { status: 400 });
    }

    const cliente = await prisma.clienteBackoffice.findUnique({
      where: { id },
      select: { id: true, classificacao: true, ultimoContatoAt: true },
    });
    if (!cliente) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

    // Aba Ligação: o tipo default é "ligacao". A aba Reunião tem rota própria —
    // uma reunião precisa de pauta e pendências, que este corpo não carrega.
    const tipo = body.tipo === "whatsapp" || body.tipo === "email" ? body.tipo : "ligacao";

    const duracao = Number(body.duracaoMin);
    const duracaoMin = Number.isFinite(duracao) && duracao > 0 ? Math.round(duracao) : null;

    let destinos;
    if (body.escopo === "grupo") {
      if (!body.grupoId) {
        return NextResponse.json({ error: "grupoId é obrigatório no escopo grupo" }, { status: 400 });
      }
      const membros = await prisma.clienteGrupoMembro.findMany({
        where: { grupoId: body.grupoId },
        select: { clienteId: true, viaGrupo: true },
        orderBy: { adicionadoEm: "asc" },
      });
      if (!membros.some((m) => m.clienteId === id)) {
        return NextResponse.json({ error: "Cliente não pertence a este grupo" }, { status: 400 });
      }
      destinos = destinosDoContato({ tipo: "grupo", grupoId: body.grupoId, membros });
    } else {
      destinos = destinosDoContato({ tipo: "individual", clienteId: id });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const interacao = await tx.interacaoCliente.create({
        data: {
          clienteId: id,
          tipo,
          canal: body.canal?.trim() || null,
          assunto,
          resumo: body.resumo?.trim() || null,
          rcaNotas: body.rcaNotas?.trim() || null,
          duracaoMin,
          data,
        },
      });

      const propagados: string[] = [];

      for (const destino of destinos) {
        const atual = await tx.clienteBackoffice.findUnique({
          where: { id: destino.clienteId },
          select: { ultimoContatoAt: true },
        });
        if (!atual) continue;

        const anda = avancaUltimoContato(atual.ultimoContatoAt, data);

        await tx.registroContatoHistorico.create({
          data: {
            clienteId: destino.clienteId,
            campo: "ultimoContatoAt",
            valorAnterior: atual.ultimoContatoAt,
            valorNovo: anda ? data : atual.ultimoContatoAt,
            origem: destino.origem === "grupo" ? "grupo" : "ligacao",
            grupoId: destino.grupoId ?? null,
            interacaoId: interacao.id,
            autorUserId: guarda.userId,
          },
        });

        if (!anda) continue;

        // Só `ultimoContatoAt`. `proximoContatoAt` fica onde está: ligação
        // registra o contato, não quita a cadência.
        await tx.clienteBackoffice.update({
          where: { id: destino.clienteId },
          data: { ultimoContatoAt: data },
        });
        propagados.push(destino.clienteId);
      }

      return { interacao, propagados };
    });

    return NextResponse.json(
      {
        interacao: resultado.interacao,
        contasComContatoAtualizado: resultado.propagados,
        // Explícito na resposta: a tela não precisa deduzir por que a data de
        // próximo contato não mudou.
        cadenciaQuitada: false,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Erro ao registrar contato:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
