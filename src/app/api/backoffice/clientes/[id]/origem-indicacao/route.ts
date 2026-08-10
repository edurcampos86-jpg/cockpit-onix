import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { rbacEnforcementHabilitado, clienteVisivelPorAssessorCge } from "@/lib/rbac";
import { getAuthContext } from "@/lib/auth-helpers";

/**
 * PATCH /api/backoffice/clientes/[id]/origem-indicacao
 *
 * Edita o campo manual `origemIndicacao` (+ auditoria origemIndicacaoEditadoEm
 * / origemIndicacaoEditadoPor). Clone estrutural de
 * ../apelido/route.ts — mesmas razões de existir como endpoint próprio:
 *   1. É campo MANUAL na FIELD_SOURCE_POLICY — semanticamente diferente de
 *      qualquer edição de cadastro, que vem de import BTG
 *   2. Não precisa de admin (qualquer assessor sabe de onde veio o cliente
 *      que ele atende — apenas autenticação + escopo RBAC)
 *   3. Validação específica: max 120 caracteres, trim, null = remover
 *
 * ESCOPO DO CAMPO — o ponto que dá sentido à PR inteira: aqui SÓ entram
 * origens que NÃO são indicação ("evento", "inbound", "prospecção fria").
 * Quando a origem é uma indicação, a verdade mora no elo
 * `Indicacao.clienteConvertidoId` (ver ../../../indicacoes/[id]/converter),
 * que preserva QUEM indicou — informação que texto livre não representa.
 * Gravar "indicação do Fulano" aqui criaria uma segunda cópia da mesma
 * informação, livre para divergir da primeira. Por isso a guarda abaixo
 * REJEITA texto com cara de indicação em vez de aceitar e confiar na
 * disciplina de quem digita.
 */

const MAX_LEN = 120;

/**
 * Detecta texto que deveria ser um elo, não uma string. Casa "indicação",
 * "indicacao", "indicado por", "indicou" — com e sem acento. Deliberadamente
 * estreito: pega o caso comum ("indicação do João") sem tentar adivinhar
 * intenção em frases livres, porque falso positivo aqui vira campo que o
 * assessor não consegue preencher.
 */
const PARECE_INDICACAO = /indica[cç][aã]o|indicad[oa]\s+por|indicou/i;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { id } = await params;
  let body: { origemIndicacao?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const raw = body.origemIndicacao;
  if (raw !== null && raw !== undefined && typeof raw !== "string") {
    return NextResponse.json(
      { error: "Origem deve ser string ou null" },
      { status: 400 },
    );
  }
  const trimmed = typeof raw === "string" ? raw.trim() : null;
  if (trimmed && trimmed.length > MAX_LEN) {
    return NextResponse.json(
      { error: `Origem muito longa (max ${MAX_LEN} caracteres)` },
      { status: 400 },
    );
  }
  if (trimmed && PARECE_INDICACAO.test(trimmed)) {
    return NextResponse.json(
      {
        error:
          "Origem por indicação não vai neste campo — registre a indicação e converta em PATCH /api/backoffice/indicacoes/[id]/converter, que guarda quem indicou.",
      },
      { status: 400 },
    );
  }
  const origemFinal = trimmed && trimmed.length > 0 ? trimmed : null;

  try {
    const anterior = await prisma.clienteBackoffice.findUnique({
      where: { id },
      select: { origemIndicacao: true, assessorCge: true, numeroConta: true },
    });
    if (!anterior) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    // RBAC — Camada 2 (escopo). Editar fora do escopo = 404 (não pode ver ⇒
    // não pode editar). Reusa o assessorCge já carregado — sem 2ª query.
    // Checagem ANTES do update. Flag RBAC_ENFORCEMENT (default OFF) → idêntico
    // ao comportamento de hoje.
    if (await rbacEnforcementHabilitado()) {
      const ctx = await getAuthContext();
      if (!(await clienteVisivelPorAssessorCge(anterior.assessorCge, ctx))) {
        return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
      }
    }

    const atualizado = await prisma.clienteBackoffice.update({
      where: { id },
      data: {
        origemIndicacao: origemFinal,
        origemIndicacaoEditadoEm: new Date(),
        origemIndicacaoEditadoPor: session.userId,
      },
      select: {
        id: true,
        numeroConta: true,
        nome: true,
        origemIndicacao: true,
        origemIndicacaoEditadoEm: true,
        origemIndicacaoEditadoPor: true,
      },
    });

    // Auditoria leve: usa BtgSyncLog porque AuditLog ainda não existe no
    // schema — mesma escolha (e mesma dívida) da rota de apelido.
    // Best-effort: não bloqueia a resposta se falhar.
    void prisma.btgSyncLog
      .create({
        data: {
          tipo: "origem_indicacao_edit",
          trigger: "manual",
          userId: session.userId,
          finalizado: new Date(),
          sucesso: true,
          resumo: `Origem cliente ${atualizado.numeroConta}: "${anterior.origemIndicacao ?? ""}" → "${origemFinal ?? ""}"`,
        },
      })
      .catch((e) => console.warn("[origem-indicacao] audit log falhou:", e));

    return NextResponse.json({ success: true, cliente: atualizado });
  } catch (error) {
    console.error("[PATCH origem-indicacao] erro:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar origem" },
      { status: 500 },
    );
  }
}
