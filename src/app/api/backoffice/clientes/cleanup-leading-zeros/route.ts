import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * POST /api/backoffice/clientes/cleanup-leading-zeros
 *
 * Conserta duplicação criada por imports anteriores que persistiram
 * `numeroConta` sem zeros à esquerda (ex.: "2870286"), enquanto o BTG
 * exporta com 9 dígitos zerados ("002870286") — o que fez o `findExisting`
 * não parear, criando dois registros do mesmo cliente.
 *
 * Comportamento:
 *  1. Lista todos os "antigos" (numeroConta NÃO começa com "0").
 *  2. Pra cada antigo, tenta achar o "novo" correspondente pelo
 *     numeroConta padronizado (padStart 9 com "0").
 *  3. Se achar: migra `proximaReuniaoAt`, `ultimaReuniaoAt`, `ultimoContatoAt`,
 *     `observacoes`, `perfilEmocional`, `classificacaoManual` (quando o novo
 *     ainda não tem) — depois deleta o antigo.
 *  4. Se não achar par: apenas normaliza o numeroConta do antigo
 *     (padStart 9) — não deleta.
 *
 * Retorna sumário detalhado. Requer admin.
 *
 * GET retorna preview (dry-run) — sem mudanças.
 */

async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }
  if (session.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Apenas o login administrador pode executar esta limpeza." },
        { status: 403 },
      ),
    };
  }
  return { session };
}

function normalizarConta(conta: string | null): string | null {
  if (!conta) return null;
  return /^\d+$/.test(conta) ? conta.padStart(9, "0") : conta;
}

interface PreviewSummary {
  antigos_total: number;
  novos_total: number;
  pares_encontrados: number;
  antigos_sem_par: number;
  campos_a_migrar: {
    proximaReuniaoAt: number;
    ultimaReuniaoAt: number;
    ultimoContatoAt: number;
    observacoes: number;
    perfilEmocional: number;
    classificacaoManual: number;
  };
}

async function levantarPreview(): Promise<PreviewSummary> {
  const todos = await prisma.clienteBackoffice.findMany({
    select: {
      id: true,
      numeroConta: true,
      proximaReuniaoAt: true,
      ultimaReuniaoAt: true,
      ultimoContatoAt: true,
      observacoes: true,
      perfilEmocional: true,
      classificacaoManual: true,
    },
  });

  const antigos = todos.filter((c) => c.numeroConta && !c.numeroConta.startsWith("0"));
  const novos = todos.filter((c) => c.numeroConta && c.numeroConta.startsWith("0"));
  const novosByConta = new Map(novos.map((n) => [n.numeroConta, n]));

  const summary: PreviewSummary = {
    antigos_total: antigos.length,
    novos_total: novos.length,
    pares_encontrados: 0,
    antigos_sem_par: 0,
    campos_a_migrar: {
      proximaReuniaoAt: 0,
      ultimaReuniaoAt: 0,
      ultimoContatoAt: 0,
      observacoes: 0,
      perfilEmocional: 0,
      classificacaoManual: 0,
    },
  };

  for (const antigo of antigos) {
    const padded = normalizarConta(antigo.numeroConta);
    if (!padded) continue;
    const novo = novosByConta.get(padded);
    if (!novo) {
      summary.antigos_sem_par++;
      continue;
    }
    summary.pares_encontrados++;
    if (antigo.proximaReuniaoAt && !novo.proximaReuniaoAt) summary.campos_a_migrar.proximaReuniaoAt++;
    if (antigo.ultimaReuniaoAt && !novo.ultimaReuniaoAt) summary.campos_a_migrar.ultimaReuniaoAt++;
    if (antigo.ultimoContatoAt && !novo.ultimoContatoAt) summary.campos_a_migrar.ultimoContatoAt++;
    if (antigo.observacoes && !novo.observacoes) summary.campos_a_migrar.observacoes++;
    if (antigo.perfilEmocional && !novo.perfilEmocional) summary.campos_a_migrar.perfilEmocional++;
    if (antigo.classificacaoManual && !novo.classificacaoManual) summary.campos_a_migrar.classificacaoManual++;
  }

  return summary;
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  try {
    const preview = await levantarPreview();
    return NextResponse.json({ preview, dryRun: true });
  } catch (error) {
    console.error("[cleanup-leading-zeros] erro no preview:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 },
    );
  }
}

export async function POST() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    const antigos = await prisma.clienteBackoffice.findMany({
      where: { NOT: { numeroConta: { startsWith: "0" } } },
    });
    const novos = await prisma.clienteBackoffice.findMany({
      where: { numeroConta: { startsWith: "0" } },
      select: {
        id: true,
        numeroConta: true,
        proximaReuniaoAt: true,
        ultimaReuniaoAt: true,
        ultimoContatoAt: true,
        observacoes: true,
        perfilEmocional: true,
        classificacaoManual: true,
      },
    });
    const novosByConta = new Map(novos.map((n) => [n.numeroConta, n]));

    let pares_encontrados = 0;
    let migrados = 0;
    let deletados = 0;
    let antigos_sem_par_normalizados = 0;
    let antigos_sem_par_pulados = 0;
    const erros: Array<{ id: string; conta: string; motivo: string }> = [];

    for (const antigo of antigos) {
      const padded = normalizarConta(antigo.numeroConta);
      if (!padded) {
        antigos_sem_par_pulados++;
        continue;
      }
      const novo = novosByConta.get(padded);

      if (novo) {
        pares_encontrados++;
        const patch: Record<string, unknown> = {};
        if (antigo.proximaReuniaoAt && !novo.proximaReuniaoAt) patch.proximaReuniaoAt = antigo.proximaReuniaoAt;
        if (antigo.ultimaReuniaoAt && !novo.ultimaReuniaoAt) patch.ultimaReuniaoAt = antigo.ultimaReuniaoAt;
        if (antigo.ultimoContatoAt && !novo.ultimoContatoAt) patch.ultimoContatoAt = antigo.ultimoContatoAt;
        if (antigo.observacoes && !novo.observacoes) patch.observacoes = antigo.observacoes;
        if (antigo.perfilEmocional && !novo.perfilEmocional) patch.perfilEmocional = antigo.perfilEmocional;
        if (antigo.classificacaoManual && !novo.classificacaoManual) {
          patch.classificacaoManual = true;
          patch.classificacao = antigo.classificacao;
        }

        try {
          if (Object.keys(patch).length > 0) {
            await prisma.clienteBackoffice.update({ where: { id: novo.id }, data: patch });
            migrados++;
          }
          await prisma.clienteBackoffice.delete({ where: { id: antigo.id } });
          deletados++;
        } catch (e) {
          erros.push({
            id: antigo.id,
            conta: antigo.numeroConta,
            motivo: e instanceof Error ? e.message : "erro desconhecido",
          });
        }
      } else {
        // Sem par: só normaliza o numeroConta pra prevenir nova duplicação
        // se a coluna padronizada não estiver em uso por outro cliente
        const colisao = await prisma.clienteBackoffice.findFirst({
          where: { numeroConta: padded, NOT: { id: antigo.id } },
        });
        if (colisao) {
          antigos_sem_par_pulados++;
          continue;
        }
        try {
          await prisma.clienteBackoffice.update({
            where: { id: antigo.id },
            data: { numeroConta: padded },
          });
          antigos_sem_par_normalizados++;
        } catch (e) {
          erros.push({
            id: antigo.id,
            conta: antigo.numeroConta,
            motivo: e instanceof Error ? e.message : "erro desconhecido",
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `${deletados} antigos deletados, ${migrados} migrações, ${antigos_sem_par_normalizados} órfãos normalizados, ${erros.length} erros.`,
      pares_encontrados,
      migrados,
      deletados,
      antigos_sem_par_normalizados,
      antigos_sem_par_pulados,
      erros: erros.slice(0, 20),
      total_erros: erros.length,
    });
  } catch (error) {
    console.error("[cleanup-leading-zeros] erro:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro" },
      { status: 500 },
    );
  }
}
