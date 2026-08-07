/**
 * GET /api/backoffice/recon-identidade
 *
 * Métricas de identidade do cliente (as mesmas 9 de `scripts/recon-identidade.ts`),
 * para consulta pelo navegador sem terminal. Auth: admin.
 *
 * A lógica NÃO mora aqui: script e rota consomem
 * `src/lib/backoffice/recon-identidade.ts`, que é a fonte única da semântica
 * de cada número. Esta rota só autentica, chama a coleta e serializa.
 *
 * ── SOMENTE LEITURA ──────────────────────────────────────────────────────
 * Apenas GET. Nenhuma chamada a create/update/upsert/delete/executeRaw aqui
 * nem no módulo de coleta — só `count`, `GROUP BY` e `SELECT`.
 *
 * ── NENHUM DADO PESSOAL NA RESPOSTA ──────────────────────────────────────
 * Só contagens agregadas. Nenhum cpfCnpj, e-mail, telefone, nome ou id de
 * cliente atravessa esta rota — nem em amostra, nem em mensagem de erro.
 *
 * ── SOBRE O GATE DE AUTORIZAÇÃO ──────────────────────────────────────────
 * Usa `isAdmin(ctx)` de `@/lib/auth-helpers`, o mesmo helper de todas as
 * rotas admin de backoffice (ex.: api/admin/backups/route.ts:18). Ele resolve
 * `User.role === "admin" || Pessoa.teamRole === "admin"` (src/lib/rbac-papeis.ts:28).
 *
 * ATENÇÃO — esse helper NÃO é o campo `Papel.adminGlobal`. São conceitos
 * distintos e desconectados hoje: `adminGlobal` só é lido dentro de
 * src/lib/rbac.ts:49, para escopo de CGE, e não participa de `isAdmin()`.
 * Gatear literalmente por `Papel.adminGlobal` deixaria a rota inacessível na
 * prática, porque `Pessoa.papelId` é nullable e as Pessoas existentes seguem
 * sem papel por decisão da Fase 1 do RBAC (prisma/schema.prisma:1566-1568).
 * Se a intenção for mesmo o campo, a troca é de uma linha — ver o corpo do PR.
 */
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { coletarReconIdentidade } from "@/lib/backoffice/recon-identidade";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET() {
  // Os números só valem se refletirem o banco AGORA — um recon servido de
  // cache responderia a pergunta de ontem com cara de resposta de hoje.
  noStore();

  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const metricas = await coletarReconIdentidade(prisma);
    return NextResponse.json({
      geradoEm: new Date().toISOString(),
      somenteLeitura: true,
      metricas,
    });
  } catch (e) {
    // A mensagem do driver pode conter a connection string (logo, credencial).
    // Ela vai para o log do servidor; o cliente recebe só o código.
    console.error("[recon-identidade] falha ao coletar métricas:", e);
    return NextResponse.json({ error: "erro ao coletar metricas" }, { status: 500 });
  }
}
