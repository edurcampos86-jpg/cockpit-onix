import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { proximoContatoPor } from "@/lib/cadencia";
import { guardaRegistroRico } from "@/lib/clientes-registro/guarda";
import { avancaUltimoContato } from "@/lib/clientes-registro/propagacao";

/**
 * POST /api/backoffice/clientes/[id]/registro-reuniao — a aba Reunião do drawer.
 *
 * Grava em `ReuniaoEstruturada`, que já é a reunião com conteúdo (pautas,
 * pendências por lado, próximos passos, data de retorno) e já tem tela própria
 * no Cockpit de Reunião. Tabela nova aqui criaria duas reuniões para o mesmo
 * encontro e quebraria o Cockpit, que está em produção.
 *
 * Body: { data, tipoCadencia?, pessoaId?, dataRetorno?,
 *         pautas?: string[], pendencias?: {assessor:string[],cliente:string[]},
 *         proximosPassos?: string[], tarefas?: [{titulo, responsavel, prazo?}] }
 *
 * Além da reunião, escreve na MESMA transação:
 *   • uma `InteracaoCliente` tipo "reuniao" ligada a ela — é o que faz a reunião
 *     contar no 12-4-2 sem a tela de cadência precisar saber que esta rota existe;
 *   • `ultimoContatoAt` / `ultimaReuniaoAt` (sem regredir) + histórico;
 *   • as `TarefaCliente` declaradas, com o lado responsável.
 *
 * A reunião NÃO propaga para o grupo. Reunião é evento com participantes: quem
 * não estava na sala não teve reunião, e marcar que teve zeraria o alerta de
 * quem está justamente vencido. Contato de grupo continua sendo o caminho do
 * PATCH /contato e do registro de ligação.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guarda = await guardaRegistroRico(id);
    if (guarda.erro) return guarda.erro;

    const body = (await req.json()) as {
      data?: string;
      tipoCadencia?: string;
      pessoaId?: string;
      dataRetorno?: string;
      pautas?: unknown;
      pendencias?: unknown;
      proximosPassos?: unknown;
      textoBruto?: string;
      tarefas?: { titulo?: string; responsavel?: string; prazo?: string; responsavelPessoaId?: string }[];
    };

    const data = body.data ? new Date(body.data) : new Date();
    if (Number.isNaN(data.getTime())) {
      return NextResponse.json({ error: "Data inválida" }, { status: 400 });
    }

    let dataRetorno: Date | null = null;
    if (body.dataRetorno) {
      const d = new Date(body.dataRetorno);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Data de retorno inválida" }, { status: 400 });
      }
      dataRetorno = d;
    }

    const cliente = await prisma.clienteBackoffice.findUnique({
      where: { id },
      select: { id: true, classificacao: true, ultimoContatoAt: true, ultimaReuniaoAt: true },
    });
    if (!cliente) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

    const pautas = listaDeTextos(body.pautas).map((texto) => ({ texto }));
    const pendencias = {
      assessor: listaDeTextos((body.pendencias as { assessor?: unknown } | undefined)?.assessor),
      cliente: listaDeTextos((body.pendencias as { cliente?: unknown } | undefined)?.cliente),
    };
    const proximosPassos = listaDeTextos(body.proximosPassos).map((texto) => ({
      texto,
      concluido: false,
    }));

    const resultado = await prisma.$transaction(async (tx) => {
      const reuniao = await tx.reuniaoEstruturada.create({
        data: {
          clienteId: id,
          pessoaId: body.pessoaId || null,
          data,
          tipoCadencia: body.tipoCadencia?.trim() || null,
          dataRetorno,
          pautas: pautas.length ? pautas : undefined,
          pendencias: pendencias.assessor.length || pendencias.cliente.length ? pendencias : undefined,
          proximosPassos: proximosPassos.length ? proximosPassos : undefined,
          textoBruto: body.textoBruto?.trim() || null,
        },
      });

      // A interação é o que faz esta reunião entrar na contagem de cadência.
      // Ligada à reunião por `reuniaoEstruturadaId`, e não solta: é essa FK que
      // permite, depois, contar UMA reunião onde há duas linhas.
      const interacao = await tx.interacaoCliente.create({
        data: {
          clienteId: id,
          tipo: "reuniao",
          canal: null,
          assunto: pautas[0]?.texto ?? "Reunião",
          resumo: body.textoBruto?.trim() || null,
          data,
          pessoaId: body.pessoaId || null,
          reuniaoEstruturadaId: reuniao.id,
        },
      });

      const tarefas = [];
      for (const t of body.tarefas ?? []) {
        const titulo = t?.titulo?.trim();
        if (!titulo) continue;
        let prazo: Date | null = null;
        if (t.prazo) {
          const p = new Date(t.prazo);
          prazo = Number.isNaN(p.getTime()) ? null : p;
        }
        tarefas.push(
          await tx.tarefaCliente.create({
            data: {
              clienteId: id,
              reuniaoId: reuniao.id,
              titulo,
              // Qualquer coisa que não seja "cliente" é do assessor: o lado que
              // some é o do cliente, e o default tem que ser o que dá trabalho
              // a nós, nunca o que cobra dele por engano.
              responsavel: t.responsavel === "cliente" ? "cliente" : "assessor",
              responsavelPessoaId: t.responsavelPessoaId || null,
              prazo,
              criadoPor: guarda.userId,
            },
          }),
        );
      }

      const andaContato = avancaUltimoContato(cliente.ultimoContatoAt, data);
      const andaReuniao = avancaUltimoContato(cliente.ultimaReuniaoAt, data);

      await tx.registroContatoHistorico.create({
        data: {
          clienteId: id,
          campo: "ultimoContatoAt",
          valorAnterior: cliente.ultimoContatoAt,
          valorNovo: andaContato ? data : cliente.ultimoContatoAt,
          origem: "reuniao",
          interacaoId: interacao.id,
          autorUserId: guarda.userId,
        },
      });

      if (andaContato || andaReuniao) {
        await tx.clienteBackoffice.update({
          where: { id },
          data: {
            ...(andaContato
              ? { ultimoContatoAt: data, proximoContatoAt: proximoContatoPor(cliente.classificacao, data) }
              : {}),
            ...(andaReuniao ? { ultimaReuniaoAt: data } : {}),
          },
        });
      }

      return { reuniao, interacao, tarefas };
    });

    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    console.error("Erro ao registrar reunião:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

/**
 * Lista de textos vinda do corpo, defensiva.
 *
 * Aceita `["a","b"]` e `[{texto:"a"}]` — a segunda forma é como o Cockpit de
 * Reunião já grava, e o drawer novo não pode obrigar o front a converter.
 * Vazio e não-array degradam para `[]`, nunca lançam.
 */
function listaDeTextos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((i) => {
      if (typeof i === "string") return i.trim();
      if (i && typeof i === "object" && "texto" in i) {
        const t = (i as { texto?: unknown }).texto;
        return typeof t === "string" ? t.trim() : "";
      }
      return "";
    })
    .filter((s) => s.length > 0);
}
