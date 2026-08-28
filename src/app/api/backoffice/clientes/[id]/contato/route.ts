import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardaRegistroRico } from "@/lib/clientes-registro/guarda";
import { avancaUltimoContato, destinosDoContato } from "@/lib/clientes-registro/propagacao";

/**
 * PATCH /api/backoffice/clientes/[id]/contato
 *
 * Ajuste MANUAL da data de contato, com histórico. É o caminho para lançar a
 * conversa que aconteceu fora do sistema (corredor, aniversário, ligação no
 * celular pessoal) sem inventar uma interação que não tem assunto nem duração.
 *
 * Body: { ultimoContatoAt?: ISO|null, proximoContatoAt?: ISO|null,
 *         motivo?: string, escopo?: "individual" | "grupo", grupoId?: string }
 *
 * ── A regra da propagação ──
 * `escopo: "individual"` (o default) escreve NESTA conta e em mais nenhuma,
 * mesmo que ela pertença a um grupo. `escopo: "grupo"` escreve nos membros com
 * `viaGrupo=true`. A decisão inteira está em `destinosDoContato`, testada
 * isolada — aqui só há I/O.
 *
 * ── Ajuste manual não quita a cadência ──
 * Mover `ultimoContatoAt` à mão registra que houve contato; NÃO empurra
 * `proximoContatoAt` sozinho. Quem quiser mover o relógio da cadência manda
 * `proximoContatoAt` explícito no corpo — e aí é uma decisão declarada, não um
 * efeito colateral. Mesma régua da rota de ligação (Eduardo, 22/08/2026): só
 * reunião completa quita.
 *
 * ── Por que não regride ──
 * `ultimoContatoAt` só anda para a frente. Lançar hoje uma conversa de duas
 * semanas atrás não pode apagar o registro de ontem — e lançar atrasado é
 * justamente para o que esta rota existe. A tentativa de regressão não é erro:
 * grava no histórico e não move o campo, e a resposta diz quais contas não
 * andaram.
 *
 * Tudo numa transação: a escrita do campo e a linha de histórico contam a mesma
 * verdade ou nenhuma das duas acontece.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guarda = await guardaRegistroRico(id);
    if (guarda.erro) return guarda.erro;

    const body = (await req.json()) as {
      ultimoContatoAt?: string | null;
      proximoContatoAt?: string | null;
      motivo?: string;
      escopo?: string;
      grupoId?: string;
    };

    // `undefined` = "não mexi neste campo"; `null` = "apaga". São diferentes, e
    // tratar os dois como iguais apagaria a data de quem só quis mudar a outra.
    const querUltimo = body.ultimoContatoAt !== undefined;
    const querProximo = body.proximoContatoAt !== undefined;
    if (!querUltimo && !querProximo) {
      return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });
    }

    const lidoUltimo = parseData(body.ultimoContatoAt);
    const lidoProximo = parseData(body.proximoContatoAt);
    if (lidoUltimo === "invalida" || lidoProximo === "invalida") {
      return NextResponse.json({ error: "Data inválida" }, { status: 400 });
    }
    // Depois da guarda acima, "invalida" está fora — mas o narrowing não
    // atravessa o loop abaixo, então as duas viram Date|null|undefined aqui.
    const novoUltimo: Date | null | undefined = lidoUltimo;
    const novoProximo: Date | null | undefined = lidoProximo;

    const cliente = await prisma.clienteBackoffice.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!cliente) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

    // ── Escopo: individual (default) ou grupo ──
    const escopo = body.escopo === "grupo" ? "grupo" : "individual";
    let destinos;

    if (escopo === "grupo") {
      if (!body.grupoId) {
        return NextResponse.json({ error: "grupoId é obrigatório no escopo grupo" }, { status: 400 });
      }
      const membros = await prisma.clienteGrupoMembro.findMany({
        where: { grupoId: body.grupoId },
        select: { clienteId: true, viaGrupo: true },
        orderBy: { adicionadoEm: "asc" },
      });
      if (membros.length === 0) {
        return NextResponse.json({ error: "Grupo não encontrado ou sem membros" }, { status: 404 });
      }
      // O cliente da URL precisa estar no grupo: sem isso, o id da rota vira
      // decorativo e qualquer conta visível serviria de porta para escrever
      // num grupo inteiro.
      if (!membros.some((m) => m.clienteId === id)) {
        return NextResponse.json({ error: "Cliente não pertence a este grupo" }, { status: 400 });
      }
      destinos = destinosDoContato({ tipo: "grupo", grupoId: body.grupoId, membros });
    } else {
      destinos = destinosDoContato({ tipo: "individual", clienteId: id });
    }

    const atualizados: string[] = [];
    const naoRegrediram: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (const destino of destinos) {
        const atual = await tx.clienteBackoffice.findUnique({
          where: { id: destino.clienteId },
          select: { ultimoContatoAt: true, proximoContatoAt: true },
        });
        if (!atual) continue;

        const dados: { ultimoContatoAt?: Date | null; proximoContatoAt?: Date | null } = {};

        if (querUltimo) {
          if (novoUltimo == null) {
            dados.ultimoContatoAt = null;
          } else if (avancaUltimoContato(atual.ultimoContatoAt, novoUltimo)) {
            dados.ultimoContatoAt = novoUltimo;
          } else {
            naoRegrediram.push(destino.clienteId);
          }
        }

        if (querProximo) dados.proximoContatoAt = novoProximo ?? null;

        // Histórico SEMPRE, inclusive quando o campo não andou: "tentei lançar
        // e o sistema segurou" é informação, e some se só o caso feliz for logado.
        for (const campo of ["ultimoContatoAt", "proximoContatoAt"] as const) {
          const mexeu = campo === "ultimoContatoAt" ? querUltimo : querProximo;
          if (!mexeu) continue;
          await tx.registroContatoHistorico.create({
            data: {
              clienteId: destino.clienteId,
              campo,
              valorAnterior: atual[campo],
              valorNovo: dados[campo] ?? atual[campo],
              origem: destino.origem === "grupo" ? "grupo" : "manual",
              grupoId: destino.grupoId ?? null,
              motivo: body.motivo?.trim() || null,
              autorUserId: guarda.userId,
            },
          });
        }

        if (Object.keys(dados).length > 0) {
          await tx.clienteBackoffice.update({ where: { id: destino.clienteId }, data: dados });
          atualizados.push(destino.clienteId);
        }
      }
    });

    return NextResponse.json({
      escopo,
      atualizados,
      naoRegrediram,
      total: destinos.length,
      cadenciaQuitada: false,
    });
  } catch (error) {
    console.error("Erro ao ajustar contato do cliente:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

/** `undefined` passa direto; string vira Date; lixo vira "invalida". */
function parseData(v: string | null | undefined): Date | null | "invalida" | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "invalida" : d;
}

/**
 * GET — o extrato de mudanças de contato desta conta.
 *
 * É o que responde "por que a data do João mudou se eu não falei com ele?":
 * a linha vem com `origem: "grupo"` e o grupo que propagou.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guarda = await guardaRegistroRico(id);
    if (guarda.erro) return guarda.erro;

    const historico = await prisma.registroContatoHistorico.findMany({
      where: { clienteId: id },
      orderBy: { criadoEm: "desc" },
      take: 100,
    });
    return NextResponse.json({ historico });
  } catch (error) {
    console.error("Erro ao ler histórico de contato:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
