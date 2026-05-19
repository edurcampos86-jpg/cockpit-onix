import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { cn } from "@/lib/utils";

export const metadata = { title: "Auditoria de Contratos — Cockpit Onix" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  contratoId?: string;
  usuarioId?: string;
  acao?: string;
  page?: string;
}>;

const PAGE_SIZE = 100;

export default async function AuditoriaContratosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");
  if (!isAdmin(ctx)) redirect("/");

  const params = await searchParams;
  const filtros = {
    ...(params.contratoId ? { contratoArquivoId: params.contratoId } : {}),
    ...(params.usuarioId ? { usuarioId: params.usuarioId } : {}),
    ...(params.acao ? { acao: params.acao } : {}),
  };
  const page = Math.max(1, parseInt(params.page || "1", 10));

  const [total, logs, acoesGroup] = await Promise.all([
    prisma.contratoAcessoLog.count({ where: filtros }),
    prisma.contratoAcessoLog.findMany({
      where: filtros,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        usuario: { select: { id: true, name: true, email: true } },
        contratoArquivo: {
          select: {
            id: true,
            nomeOriginal: true,
            pessoa: { select: { apelido: true, nomeCompleto: true } },
          },
        },
      },
    }),
    prisma.contratoAcessoLog.groupBy({
      by: ["acao"],
      where: filtros,
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Auditoria de Contratos"
        description="Log imutável de todo acesso, visualização, aprovação e tentativa sobre PDFs do cofre."
      />

      <div className="p-8 space-y-6 max-w-7xl">
        <ComoFunciona
          proposito="Trilha de auditoria do módulo Jurídico. Cada visualização, aprovação, rejeição, tentativa de impressão ou download deixa registro com nome, IP, timestamp e user-agent."
          comoUsar="Filtre por contrato, usuário ou ação na URL (ex: ?acao=visualizou). Use pra investigar incidentes ou montar relatórios LGPD."
          comoAjuda="Sem exceções: até admin é logado. Se houver suspeita de vazamento, esta tela responde 'quem viu o quê, quando, de onde'."
        />

        {/* Resumo por ação */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          {acoesGroup.map((g) => (
            <div key={g.acao} className="rounded-lg border border-border bg-card p-3">
              <div className="text-xs text-muted-foreground">{g.acao}</div>
              <div className="text-lg font-semibold">{g._count._all}</div>
            </div>
          ))}
        </div>

        {/* Filtros ativos */}
        {Object.keys(filtros).length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm flex items-center justify-between">
            <div>
              <strong>Filtros ativos:</strong>{" "}
              {Object.entries(filtros).map(([k, v]) => (
                <span key={k} className="font-mono text-xs">
                  {k}={String(v)} ·{" "}
                </span>
              ))}
            </div>
            <Link
              href="/admin/auditoria/contratos"
              className="text-primary hover:underline text-xs"
            >
              Limpar
            </Link>
          </div>
        )}

        {/* Tabela */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Quando</th>
                <th className="px-3 py-2 font-medium">Usuário</th>
                <th className="px-3 py-2 font-medium">Ação</th>
                <th className="px-3 py-2 font-medium">Contrato</th>
                <th className="px-3 py-2 font-medium">IP</th>
                <th className="px-3 py-2 font-medium">User-Agent</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                    {new Date(l.timestamp).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-3 py-1.5">
                    <div>{l.usuario.name}</div>
                    <div className="text-[10px] text-muted-foreground">{l.usuario.email}</div>
                  </td>
                  <td className="px-3 py-1.5">
                    <AcaoBadge acao={l.acao} />
                  </td>
                  <td className="px-3 py-1.5">
                    <Link
                      href={`/juridico/contratos/${l.contratoArquivo.id}`}
                      className="text-primary hover:underline truncate block max-w-[300px]"
                      title={l.contratoArquivo.nomeOriginal}
                    >
                      {l.contratoArquivo.nomeOriginal}
                    </Link>
                    {l.contratoArquivo.pessoa && (
                      <div className="text-[10px] text-muted-foreground">
                        {l.contratoArquivo.pessoa.apelido ||
                          l.contratoArquivo.pessoa.nomeCompleto}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px]">{l.ipAddress || "—"}</td>
                  <td className="px-3 py-1.5 text-[10px] text-muted-foreground truncate max-w-[200px]" title={l.userAgent || ""}>
                    {l.userAgent?.slice(0, 30) || "—"}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-muted-foreground">
                    Nenhum acesso registrado com esses filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">
              {total} acessos · página {page} de {totalPages}
            </div>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={{ query: { ...params, page: String(page - 1) } }}
                  className="rounded border border-border px-3 py-1 hover:bg-muted"
                >
                  ← Anterior
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={{ query: { ...params, page: String(page + 1) } }}
                  className="rounded border border-border px-3 py-1 hover:bg-muted"
                >
                  Próxima →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AcaoBadge({ acao }: { acao: string }) {
  const map: Record<string, string> = {
    visualizou: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    subiu: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    aprovou: "bg-green-500/15 text-green-700 dark:text-green-300",
    rejeitou: "bg-destructive/15 text-destructive",
    reextraiu: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    tentou_baixar: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    tentou_imprimir: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  };
  const cls = map[acao] || "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-block rounded px-1.5 py-0.5 text-[10px] font-medium", cls)}>
      {acao}
    </span>
  );
}
