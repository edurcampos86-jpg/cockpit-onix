import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardaRegistroRico } from "@/lib/clientes-registro/guarda";
import { montarBriefing } from "@/lib/clientes-registro/briefing";

/**
 * GET /api/backoffice/clientes/[id]/preparar-reuniao
 *
 * O briefing de preparação: momento de vida, pendências por responsável, pauta
 * sugerida e "como conduzir".
 *
 * Read-only. Nenhuma escrita, nenhum efeito colateral — abrir a aba antes da
 * reunião não pode mexer em data de contato nem marcar nada como lido.
 *
 * A agregação é a entrega: os quatro insumos já existem na ficha, em quatro
 * abas diferentes (ligações, reuniões estruturadas, tarefas, PAT). Preparar
 * reunião hoje significa abrir as quatro e reconciliar de cabeça.
 *
 * A montagem inteira é `montarBriefing`, pura e testada. Aqui só há busca — e
 * `agora` entra como parâmetro para o "há N dias" não depender do relógio de
 * quem calcula.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guarda = await guardaRegistroRico(id);
    if (guarda.erro) return guarda.erro;

    const cliente = await prisma.clienteBackoffice.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        numeroConta: true,
        classificacao: true,
        ultimoContatoAt: true,
        ultimaReuniaoAt: true,
        proximaReuniaoAt: true,
        // 20 interações e 10 reuniões: o briefing lê o que está VIVO. Histórico
        // completo é a aba RCA — aqui, mais linhas só empurram a pauta para
        // baixo da dobra.
        interacoes: { orderBy: { data: "desc" }, take: 20 },
        reunioesEstruturadas: { orderBy: { data: "desc" }, take: 10 },
        metas: { where: { status: "ativa" }, orderBy: { criadoEm: "desc" }, take: 10 },
        eventosVida: { orderBy: { data: "asc" }, take: 10 },
        tarefas: {
          where: { status: "aberta" },
          orderBy: [{ prazo: "asc" }, { criadoEm: "desc" }],
          include: { responsavelPessoa: { select: { nomeCompleto: true, apelido: true } } },
        },
        pats: {
          where: { vigente: true },
          select: {
            arquetipoCodigo: true,
            // O nome do arquétipo mora em `Arquetipo`, não no Pat: o Pat só
            // guarda o código (76) e a tabela guarda "Promocional de Ação
            // Livre". Sem o join, o "como conduzir" mostraria um número.
            arquetipo: { select: { nome: true } },
            perspectiva: true,
            orientacao: true,
            ambienteNome: true,
          },
          take: 1,
        },
      },
    });

    if (!cliente) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

    // Achata o join do arquétipo no shape que `montarBriefing` consome — a
    // função pura não conhece Prisma nem relação.
    const patLinha = cliente.pats[0];
    const patBriefing = patLinha
      ? {
          arquetipoCodigo: patLinha.arquetipoCodigo,
          arquetipoNome: patLinha.arquetipo?.nome ?? null,
          perspectiva: patLinha.perspectiva,
          orientacao: patLinha.orientacao,
          ambienteNome: patLinha.ambienteNome,
        }
      : null;

    const briefing = montarBriefing({
      agora: new Date(),
      interacoes: cliente.interacoes.map((i) => ({
        tipo: i.tipo,
        assunto: i.assunto,
        resumo: i.resumo,
        data: i.data.toISOString(),
      })),
      reunioes: cliente.reunioesEstruturadas.map((r) => ({
        id: r.id,
        data: r.data.toISOString(),
        tipoCadencia: r.tipoCadencia,
        pautas: r.pautas,
        pendencias: r.pendencias,
        proximosPassos: r.proximosPassos,
      })),
      tarefas: cliente.tarefas.map((t) => ({
        titulo: t.titulo,
        responsavel: t.responsavel,
        prazo: t.prazo ? t.prazo.toISOString() : null,
        responsavelNome:
          t.responsavelPessoa?.apelido?.trim() || t.responsavelPessoa?.nomeCompleto || null,
      })),
      pat: patBriefing,
      eventosVida: cliente.eventosVida.map((e) => ({
        titulo: e.titulo,
        data: e.data.toISOString(),
        tipo: e.tipo,
      })),
      metas: cliente.metas.map((m) => ({ titulo: m.titulo, status: m.status })),
    });

    return NextResponse.json({
      cliente: {
        id: cliente.id,
        nome: cliente.nome,
        numeroConta: cliente.numeroConta,
        classificacao: cliente.classificacao,
        proximaReuniaoAt: cliente.proximaReuniaoAt,
      },
      briefing,
      // O PAT vem junto para a tela poder mostrar de onde saiu o "como conduzir".
      // Orientação sem procedência vira palpite, e palpite ninguém segue.
      pat: patBriefing,
    });
  } catch (error) {
    console.error("Erro ao montar briefing de reunião:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
