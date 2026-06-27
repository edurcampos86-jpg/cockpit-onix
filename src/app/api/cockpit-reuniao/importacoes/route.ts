import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-helpers";
import { cockpitReuniaoHabilitado } from "@/lib/cockpit-reuniao/flag";
import { rbacEnforcementHabilitado, assertClienteVisivel } from "@/lib/rbac";

/**
 * GET /api/cockpit-reuniao/importacoes?clienteId=...
 *
 * Lista o histórico de importações de reunião de um cliente (mais recentes
 * primeiro). Read-only. Resolve o nome de quem importou (Pessoa.userId), com
 * fallback para o e-mail do User. Gate: autenticado + flag COCKPIT_REUNIAO.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await cockpitReuniaoHabilitado())) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const clienteId = req.nextUrl.searchParams.get("clienteId");
  if (!clienteId) {
    return NextResponse.json({ error: "clienteId ausente." }, { status: 400 });
  }

  // RBAC — Camada 2 (escopo). Cliente fora do escopo = 404 (NÃO lista vazia, que
  // disfarçaria como "sem importações" e vazaria a existência). Checagem ANTES do
  // findMany. Flag RBAC_ENFORCEMENT (default OFF) → idêntico a hoje.
  if (await rbacEnforcementHabilitado()) {
    const { visivel } = await assertClienteVisivel(clienteId, ctx);
    if (!visivel) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }
  }

  const imports = await prisma.reuniaoImport.findMany({
    where: { clienteId },
    orderBy: { importadoEm: "desc" },
    select: {
      id: true,
      fonte: true,
      nomeArquivo: true,
      tamanhoBytes: true,
      b2Key: true,
      importadoEm: true,
      importadoPor: true,
      reuniaoEstruturadaId: true,
    },
  });

  // Resolve nomes de quem importou (best-effort, 1 query).
  const userIds = [...new Set(imports.map((i) => i.importadoPor).filter(Boolean))] as string[];
  const nomePorUser = new Map<string, string>();
  if (userIds.length) {
    const pessoas = await prisma.pessoa.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, nomeCompleto: true },
    });
    for (const p of pessoas) {
      if (p.userId && p.nomeCompleto) nomePorUser.set(p.userId, p.nomeCompleto);
    }
    const faltam = userIds.filter((id) => !nomePorUser.has(id));
    if (faltam.length) {
      const users = await prisma.user.findMany({
        where: { id: { in: faltam } },
        select: { id: true, email: true },
      });
      for (const u of users) if (u.email) nomePorUser.set(u.id, u.email);
    }
  }

  return NextResponse.json({
    imports: imports.map((i) => ({
      id: i.id,
      fonte: i.fonte,
      nomeArquivo: i.nomeArquivo,
      tamanhoBytes: i.tamanhoBytes,
      temPdf: Boolean(i.b2Key),
      importadoEm: i.importadoEm.toISOString(),
      importadoPorNome: i.importadoPor ? (nomePorUser.get(i.importadoPor) ?? null) : null,
      reuniaoEstruturadaId: i.reuniaoEstruturadaId,
    })),
  });
}
