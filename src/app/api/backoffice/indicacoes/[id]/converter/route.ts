import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { rbacEnforcementHabilitado, clienteVisivelPorAssessorCge } from "@/lib/rbac";
import { getAuthContext } from "@/lib/auth-helpers";

/**
 * PATCH /api/backoffice/indicacoes/[id]/converter
 *
 * Fecha o elo Indicacao → ClienteBackoffice: grava `clienteConvertidoId` e
 * move o status para "convertida".
 *
 * Por que não estender o PATCH genérico de ../route.ts: aquele endpoint copia
 * campos do body sem autenticação nem validação (é edição de texto de um board
 * interno). Este cria um VÍNCULO entre duas entidades e é o único caminho pelo
 * qual um cliente passa a ter origem rastreável — precisa de sessão, de
 * checagem de escopo RBAC sobre o cliente alvo e de auditoria. Misturar os dois
 * rebaixaria esta garantia ao nível do mais fraco.
 *
 * Body: { clienteId: string | null }
 *   - string → vincula ao cliente e marca status "convertida"
 *   - null   → DESFAZ o vínculo e devolve o status para "reuniao"
 *
 * O caminho de desfazer existe porque um vínculo errado (dois prospects
 * homônimos, clique na linha errada) seria, sem ele, corrigível só por acesso
 * direto ao banco. E limpar o ponteiro deixando status "convertida" recriaria
 * exatamente o buraco que esta PR fecha — uma conversão que ninguém consegue
 * rastrear —, então os dois campos andam juntos. "reuniao" é o estágio
 * imediatamente anterior na régua declarada em `Indicacao.status`
 * (prisma/schema.prisma): a indicação volta a estar em andamento.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;
  let body: { clienteId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const clienteIdRaw = body.clienteId;
  if (clienteIdRaw !== null && typeof clienteIdRaw !== "string") {
    return NextResponse.json(
      { error: "clienteId deve ser string (vincular) ou null (desfazer)" },
      { status: 400 },
    );
  }
  const clienteId = typeof clienteIdRaw === "string" ? clienteIdRaw.trim() || null : null;

  try {
    const indicacao = await prisma.indicacao.findUnique({
      where: { id },
      select: { id: true, nomeIndicado: true, status: true, clienteConvertidoId: true },
    });
    if (!indicacao) {
      return NextResponse.json({ error: "Indicação não encontrada" }, { status: 404 });
    }

    // Só quando vincula: o cliente alvo precisa existir E estar no escopo do
    // usuário. Fora do escopo devolve 404 (não pode ver ⇒ não pode vincular),
    // igual à rota de apelido — 403 vazaria a existência do cliente.
    let clienteAlvo: { id: string; numeroConta: string; nome: string } | null = null;
    if (clienteId) {
      const cliente = await prisma.clienteBackoffice.findUnique({
        where: { id: clienteId },
        select: { id: true, numeroConta: true, nome: true, assessorCge: true },
      });
      if (!cliente) {
        return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
      }
      if (await rbacEnforcementHabilitado()) {
        const ctx = await getAuthContext();
        if (!(await clienteVisivelPorAssessorCge(cliente.assessorCge, ctx))) {
          return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
        }
      }
      clienteAlvo = { id: cliente.id, numeroConta: cliente.numeroConta, nome: cliente.nome };
    }

    const atualizada = await prisma.indicacao.update({
      where: { id },
      data: {
        clienteConvertidoId: clienteId,
        status: clienteId ? "convertida" : "reuniao",
      },
      select: {
        id: true,
        nomeIndicado: true,
        status: true,
        clienteConvertidoId: true,
        indicadorId: true,
      },
    });

    // Auditoria leve: BtgSyncLog, mesma escolha (e mesma dívida) da rota de
    // apelido — AuditLog ainda não existe no schema. Best-effort.
    void prisma.btgSyncLog
      .create({
        data: {
          tipo: "indicacao_converter",
          trigger: "manual",
          userId: session.userId,
          finalizado: new Date(),
          sucesso: true,
          resumo: clienteAlvo
            ? `Indicação "${indicacao.nomeIndicado}" (${indicacao.id}) → cliente ${clienteAlvo.numeroConta} (${clienteAlvo.nome}); status "${indicacao.status}" → "convertida"`
            : `Indicação "${indicacao.nomeIndicado}" (${indicacao.id}) desvinculada do cliente ${indicacao.clienteConvertidoId ?? "—"}; status "${indicacao.status}" → "reuniao"`,
        },
      })
      .catch((e) => console.warn("[indicacao converter] audit log falhou:", e));

    return NextResponse.json({ success: true, indicacao: atualizada });
  } catch (error) {
    console.error("[PATCH indicacao converter] erro:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao converter indicação" },
      { status: 500 },
    );
  }
}
