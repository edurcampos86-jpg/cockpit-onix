/**
 * GET /api/juridico/contratos
 *
 * Lista paginada de contratos. Query params:
 *   - status?: pendente_revisao | aprovado | arquivado | rejeitado
 *   - pessoaId?: filtra por pessoa
 *   - page?: default 1
 *   - limit?: default 20, max 100
 *
 * Auth: admin. RBAC granular vem na Fase 1B.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const STATUS_VALIDOS = ["pendente_revisao", "aprovado", "arquivado", "rejeitado"] as const;

export async function GET(req: Request) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam && (STATUS_VALIDOS as readonly string[]).includes(statusParam)
      ? statusParam
      : undefined;
  const pessoaId = url.searchParams.get("pessoaId") || undefined;
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10))
  );

  const where = {
    ...(status ? { status } : {}),
    ...(pessoaId ? { pessoaId } : {}),
  };

  const [total, contratos] = await Promise.all([
    prisma.contratoArquivo.count({ where }),
    prisma.contratoArquivo.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        pessoa: { select: { id: true, nomeCompleto: true, apelido: true, cpf: true } },
        uploadedBy: { select: { id: true, name: true, email: true } },
        extracoes: {
          orderBy: { extraidoEm: "desc" },
          take: 1,
          select: {
            id: true,
            confianca: true,
            statusRevisao: true,
            extraidoEm: true,
            erroExtracao: true,
            dadosExtraidos: true,
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    contratos: contratos.map((c) => ({
      id: c.id,
      nomeOriginal: c.nomeOriginal,
      tamanhoBytes: Number(c.tamanhoBytes),
      status: c.status,
      origemImportacao: c.origemImportacao,
      uploadedAt: c.uploadedAt.toISOString(),
      uploadedBy: c.uploadedBy,
      pessoa: c.pessoa,
      extracaoAtual: c.extracoes[0] ?? null,
    })),
  });
}
