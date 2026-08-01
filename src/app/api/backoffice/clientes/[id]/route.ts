import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";
import {
  rbacEnforcementHabilitado,
  clienteVisivelPorAssessorCge,
  assertClienteVisivel,
} from "@/lib/rbac";
import { getAuthContext } from "@/lib/auth-helpers";

// Mesmo padrão de guarda admin das demais rotas de clientes (clientes/route.ts,
// cleanup-leading-zeros). Sessão obrigatória + role admin.
async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    return {
      error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }),
    };
  }
  if (session.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Apenas o login administrador pode remover clientes." },
        { status: 403 },
      ),
    };
  }
  return { session };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const cliente = await prisma.clienteBackoffice.findUnique({
      where: { id },
      include: {
        interacoes: { orderBy: { data: "desc" }, take: 50 },
        metas: { orderBy: { criadoEm: "desc" } },
        eventosVida: { orderBy: { data: "asc" } },
      },
    });
    if (!cliente) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

    // RBAC — Camada 2 (escopo). Flag RBAC_ENFORCEMENT (default OFF) → idêntico a
    // hoje. ON → cliente fora do escopo responde o MESMO 404 do "não existe"
    // (não vaza existência). Reusa o assessorCge já carregado — sem 2ª query.
    if (await rbacEnforcementHabilitado()) {
      const ctx = await getAuthContext();
      if (!(await clienteVisivelPorAssessorCge(cliente.assessorCge, ctx))) {
        return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
      }
    }

    return NextResponse.json(cliente);
  } catch (error) {
    console.error("Erro ao buscar cliente:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // RBAC — Camada 2 (escopo). Editar fora do escopo = 404 (não pode ver ⇒ não
    // pode editar). Flag RBAC_ENFORCEMENT (default OFF) → idêntico a hoje. O
    // PATCH não carrega o cliente, então usa a variante com query mínima
    // (assertClienteVisivel), que trata inexistente como não-visível (mesmo 404).
    if (await rbacEnforcementHabilitado()) {
      const ctx = await getAuthContext();
      const { visivel } = await assertClienteVisivel(id, ctx);
      if (!visivel) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    }

    const body = await req.json();

    // Campos permitidos para atualização
    const data: Record<string, unknown> = {};
    const allowed = [
      "nome",
      "email",
      "telefone",
      "aniversario",
      "profissao",
      "nicho",
      "perfilEmocional",
      "observacoes",
      "classificacao",
      "classificacaoManual",
      "receitaAnual",
      // Marcação manual de honorário fixo (toggle na tabela de clientes).
      // Entra na mesma allowlist de propósito: herda o guard de RBAC do PATCH
      // (assertClienteVisivel) — quem não enxerga o cliente recebe 404 antes de
      // chegar aqui, logo não alterna o fee de quem não é da sua carteira.
      "feeFixo",
      // Teto manual de dias entre reuniões, sobrepondo a régua da classe
      // (A=90/B=120/C=180 em cadencia-core.ts). Mesma allowlist pelo mesmo
      // motivo do feeFixo: herda o guard de RBAC do PATCH.
      "cadenciaReuniaoDiasOverride",
      "ultimoContatoAt",
      "proximoContatoAt",
    ];
    for (const key of allowed) {
      if (key in body) {
        if (
          (key === "aniversario" || key === "ultimoContatoAt" || key === "proximoContatoAt") &&
          body[key]
        ) {
          data[key] = new Date(body[key]);
        } else {
          data[key] = body[key];
        }
      }
    }

    // `feeFixo` é NOT NULL no banco: um valor não-booleano (ex.: a string
    // "true") explodiria no Prisma e viraria 500. Rejeita como 400 explícito.
    if ("feeFixo" in body && typeof body.feeFixo !== "boolean") {
      return NextResponse.json(
        { error: "feeFixo deve ser booleano." },
        { status: 400 },
      );
    }

    // Rastro do Fee Fixo — mesmo padrão de apelidoEditadoEm/Por. Carimbado
    // aqui (e não pelo cliente) pra que o "quem/quando" venha da sessão e não
    // do corpo da request. O proxy já exige sessão nesta rota; o `if` cobre o
    // caso degenerado de cookie válido cujo usuário sumiu.
    if ("feeFixo" in body) {
      const session = await getSession();
      if (session) {
        data.feeFixoEditadoEm = new Date();
        data.feeFixoEditadoPor = session.userId;
      }
    }

    // Teto manual de reunião: aceita inteiro positivo, ou null para voltar à
    // régua da classe. Validado explicitamente porque um valor inválido aqui
    // não estoura — ele SILENCIA um alerta de risco de evasão. `0` ou negativo
    // viraria teto degenerado; string viraria erro do Prisma como 500.
    if ("cadenciaReuniaoDiasOverride" in body) {
      const v = body.cadenciaReuniaoDiasOverride;
      if (v !== null && (!Number.isInteger(v) || v <= 0 || v > 3650)) {
        return NextResponse.json(
          {
            error:
              "cadenciaReuniaoDiasOverride deve ser inteiro entre 1 e 3650, ou null para usar a régua da classe.",
          },
          { status: 400 },
        );
      }
      data.cadenciaReuniaoDiasOverride = v;

      // Rastro obrigatório: afrouxar o teto é a única edição desta tabela que
      // APAGA um alerta de evasão. Se um cliente for perdido, "quem afrouxou a
      // régua e quando" precisa ter resposta. Carimbado da SESSÃO, nunca do
      // corpo da request.
      const session = await getSession();
      if (session) {
        data.cadenciaReuniaoEditadoEm = new Date();
        data.cadenciaReuniaoEditadoPor = session.userId;
      }
    }

    // Se mudou classificação manualmente, trava recálculo automático
    if ("classificacao" in body && !("classificacaoManual" in body)) {
      data.classificacaoManual = true;
    }

    const cliente = await prisma.clienteBackoffice.update({ where: { id }, data });
    return NextResponse.json(cliente);
  } catch (error) {
    console.error("Erro ao atualizar cliente:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const { id } = await params;
    await prisma.clienteBackoffice.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro ao remover cliente:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
