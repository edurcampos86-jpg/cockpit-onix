import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardaFlag } from "@/lib/clientes-registro/guarda";
import { getAuthContext } from "@/lib/auth-helpers";
import { assertClienteVisivel, rbacEnforcementHabilitado } from "@/lib/rbac";
import { campoDe, registrarProveniencia } from "@/lib/clientes-registro/proveniencia";
import { valorEfetivo } from "@/lib/clientes-registro/sugestoes";

/**
 * PATCH /api/backoffice/sugestoes/[id] — aceitar, editar-e-aceitar, ou descartar.
 *
 * Body: { acao: "aceitar" | "descartar", valorEditado?: string }
 *
 * É a única porta pela qual texto extraído de transcrição chega a campo de
 * cliente. Uma sugestão por chamada, de propósito: um "aceitar todas" faria o
 * revisor aprovar em bloco o que ele só precisa conferir uma vez para descobrir
 * que a máquina ouviu "Jorge" onde o cliente disse "George".
 *
 * "Editar" não é uma ação separada: editar e aceitar É aceitar, com o texto
 * corrigido em `valorEditado`. Guardar os dois valores é o que permite medir
 * depois quanto a extração acerta sem revisão.
 *
 * Escreve na MESMA transação: o campo de destino, o selo de origem
 * (`CampoProveniencia`) e o status da sugestão. Fora da transação, uma falha no
 * meio deixaria o campo com valor novo e selo dizendo que veio de outro lugar —
 * e selo errado é pior que selo nenhum, porque afirma com confiança.
 *
 * Idempotente por status: sugestão já decidida responde 409 em vez de aplicar
 * duas vezes (um duplo-clique gravaria a mesma meta duas vezes).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guarda = await guardaFlag();
    if (guarda.erro) return guarda.erro;

    const body = (await req.json()) as { acao?: string; valorEditado?: string };
    const acao = body.acao;
    if (acao !== "aceitar" && acao !== "descartar") {
      return NextResponse.json({ error: 'acao deve ser "aceitar" ou "descartar"' }, { status: 400 });
    }

    const sugestao = await prisma.sugestaoExtraida.findUnique({ where: { id } });
    if (!sugestao) return NextResponse.json({ error: "Sugestão não encontrada" }, { status: 404 });

    // RBAC pelo CLIENTE da sugestão. A rota não é por cliente na URL, então o
    // escopo tem que ser conferido aqui — senão o id da sugestão viraria um
    // caminho lateral para escrever em conta fora do escopo de quem chamou.
    if (await rbacEnforcementHabilitado()) {
      const ctx = await getAuthContext();
      const { visivel } = await assertClienteVisivel(sugestao.clienteId, ctx);
      if (!visivel) return NextResponse.json({ error: "Sugestão não encontrada" }, { status: 404 });
    }

    if (sugestao.status !== "pendente") {
      return NextResponse.json(
        { error: "Sugestão já decidida", status: sugestao.status },
        { status: 409 },
      );
    }

    const editado = body.valorEditado?.trim();

    if (acao === "descartar") {
      const atualizada = await prisma.sugestaoExtraida.update({
        where: { id },
        data: { status: "descartada", decididoPor: guarda.userId, decididoEm: new Date() },
      });
      // Descarte NÃO escreve campo nem selo: a ficha continua exatamente como
      // estava, e é isso que faz descartar ser barato de clicar.
      return NextResponse.json({ sugestao: atualizada, campoEscrito: null });
    }

    const valor = valorEfetivo({
      valorSugerido: sugestao.valorSugerido,
      valorEditado: editado ?? sugestao.valorEditado,
    });
    // Origem "manual" quando o revisor reescreveu o texto: o que está no campo
    // passou a ser dele. Só o que foi aceito sem alteração continua "ia" —
    // senão o selo diria "sugerido pela IA" sobre uma frase que a IA não escreveu.
    const origem = editado ? "manual" : "ia";

    const resultado = await prisma.$transaction(async (tx) => {
      let campoSelo: string;

      switch (sugestao.destino) {
        case "perfilEmocional":
        case "observacoes": {
          await tx.clienteBackoffice.update({
            where: { id: sugestao.clienteId },
            data: { [sugestao.destino]: valor },
          });
          campoSelo = campoDe.cliente(sugestao.destino);
          break;
        }

        case "descoberta": {
          // Upsert: a aba Descoberta pode nunca ter sido aberta, e nesse caso a
          // linha de PerfilDescoberta ainda não existe.
          await tx.perfilDescoberta.upsert({
            where: { clienteId: sugestao.clienteId },
            create: { clienteId: sugestao.clienteId, [sugestao.campo]: valor },
            update: { [sugestao.campo]: valor },
          });
          campoSelo = campoDe.descoberta(sugestao.campo);
          break;
        }

        case "meta": {
          const meta = await tx.metaCliente.create({
            data: { clienteId: sugestao.clienteId, titulo: valor },
          });
          campoSelo = campoDe.meta(meta.id);
          break;
        }

        case "eventoVida": {
          // Evento sem data declarada usa a data da reunião: é quando o cliente
          // contou. Data inventada seria pior — o lembrete dispararia errado.
          const reuniao = await tx.reuniaoEstruturada.findUnique({
            where: { id: sugestao.reuniaoId },
            select: { data: true },
          });
          const evento = await tx.eventoVida.create({
            data: {
              clienteId: sugestao.clienteId,
              tipo: "outro",
              titulo: valor,
              data: reuniao?.data ?? new Date(),
              // `lembrar` fica false: um evento cuja data é a da reunião, e não
              // a do fato, não pode virar alerta no calendário de ninguém.
              lembrar: false,
            },
          });
          campoSelo = campoDe.eventoVida(evento.id);
          break;
        }

        case "tarefa": {
          const tarefa = await tx.tarefaCliente.create({
            data: {
              clienteId: sugestao.clienteId,
              reuniaoId: sugestao.reuniaoId,
              sugestaoId: sugestao.id,
              titulo: valor,
              responsavel: "assessor",
              criadoPor: guarda.userId,
            },
          });
          // Tarefa não é campo da ficha: não recebe selo de origem, porque não
          // há campo cuja origem alguém vá consultar depois.
          const atualizadaTarefa = await tx.sugestaoExtraida.update({
            where: { id },
            data: {
              status: "aceita",
              valorEditado: editado ?? null,
              decididoPor: guarda.userId,
              decididoEm: new Date(),
            },
          });
          return { sugestao: atualizadaTarefa, campoEscrito: `tarefa:${tarefa.id}` };
        }

        default:
          // Destino que não está no catálogo não chega aqui pela extração (a
          // régua recusa antes), mas uma linha antiga poderia. Recusar é o
          // comportamento certo: melhor sugestão travada que escrita às cegas.
          throw new Error(`destino não suportado: ${sugestao.destino}`);
      }

      await registrarProveniencia(tx, {
        clienteId: sugestao.clienteId,
        campo: campoSelo,
        origem,
        valor,
        reuniaoId: sugestao.reuniaoId,
        sugestaoId: sugestao.id,
        autorUserId: guarda.userId,
      });

      const atualizada = await tx.sugestaoExtraida.update({
        where: { id },
        data: {
          status: "aceita",
          valorEditado: editado ?? null,
          decididoPor: guarda.userId,
          decididoEm: new Date(),
        },
      });

      return { sugestao: atualizada, campoEscrito: campoSelo };
    });

    return NextResponse.json(resultado);
  } catch (error) {
    console.error("Erro ao decidir sugestão:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
