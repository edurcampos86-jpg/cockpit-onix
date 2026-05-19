import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { FileText, Upload, AlertCircle, CheckCircle2, XCircle, Archive } from "lucide-react";
import { b2Configurado } from "@/lib/b2/client";
import { cn } from "@/lib/utils";

export const metadata = { title: "Contratos — Cockpit Onix" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ status?: string }>;

const TABS: Array<{
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "todos", label: "Todos", icon: FileText },
  { value: "pendente_revisao", label: "Pendentes", icon: AlertCircle },
  { value: "aprovado", label: "Aprovados", icon: CheckCircle2 },
  { value: "rejeitado", label: "Rejeitados", icon: XCircle },
  { value: "arquivado", label: "Arquivados", icon: Archive },
];

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");
  if (!isAdmin(ctx)) redirect("/");

  const params = await searchParams;
  const statusAtivo = params.status || "todos";

  const where = statusAtivo !== "todos" ? { status: statusAtivo } : {};

  const [contratos, stats] = await Promise.all([
    prisma.contratoArquivo.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      take: 100,
      include: {
        pessoa: { select: { id: true, apelido: true, nomeCompleto: true } },
        uploadedBy: { select: { id: true, name: true } },
        extracoes: {
          orderBy: { extraidoEm: "desc" },
          take: 1,
          select: { confianca: true, statusRevisao: true, erroExtracao: true },
        },
      },
    }),
    prisma.contratoArquivo.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const countPorStatus = Object.fromEntries(
    stats.map((s) => [s.status, s._count._all])
  );
  const total = Object.values(countPorStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen">
      <PageHeader title="Contratos" description="Cofre jurídico — PDFs no Backblaze B2 + extração via Claude">
        <Link
          href="/juridico/contratos/novo"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Upload className="h-4 w-4" />
          Novo contrato
        </Link>
      </PageHeader>

      <div className="p-8 space-y-6 max-w-7xl">
        <ComoFunciona
          proposito="Cofre oficial de contratos da Onix. PDFs vivem no Backblaze B2 (privado, criptografado). Claude extrai automaticamente CPF, nome, datas, tipo, %, regras de pagamento — você só revisa e aprova."
          comoUsar="Sobe o PDF em /juridico/contratos/novo. Claude processa em ~30s. Vai pra aba Pendentes pra revisar/aprovar. Após aprovado, o arquivo migra pra pasta da pessoa no B2."
          comoAjuda="Elimina a dependência do OneDrive 5.Jurídico. Tudo auditável, com hash SHA-256 evitando duplicata e relacionamento direto com AcordoComercial."
        />

        {!b2Configurado() && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 text-sm">
            <strong className="text-amber-900 dark:text-amber-200">⚠ B2 ainda não configurado.</strong>{" "}
            Defina <code>B2_ENDPOINT</code>, <code>B2_APPLICATION_KEY_ID</code> e{" "}
            <code>B2_APPLICATION_KEY</code> no Railway. Sem isso o upload retorna 503.
          </div>
        )}

        {/* Tabs por status */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const count = t.value === "todos" ? total : countPorStatus[t.value] ?? 0;
            const active = statusAtivo === t.value;
            const Icon = t.icon;
            return (
              <Link
                key={t.value}
                href={t.value === "todos" ? "/juridico/contratos" : `/juridico/contratos?status=${t.value}`}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card hover:bg-card/80"
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                <span className="text-xs text-muted-foreground">({count})</span>
              </Link>
            );
          })}
        </div>

        {/* Lista */}
        {contratos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
            <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhum contrato {statusAtivo !== "todos" ? `com status "${statusAtivo}"` : ""}.
            </p>
            <Link
              href="/juridico/contratos/novo"
              className="inline-flex items-center gap-2 mt-4 text-sm text-primary hover:underline"
            >
              <Upload className="h-4 w-4" />
              Subir primeiro PDF
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Arquivo</th>
                  <th className="px-4 py-2 font-medium">Pessoa</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Extração</th>
                  <th className="px-4 py-2 font-medium">Subido em</th>
                  <th className="px-4 py-2 font-medium">Por</th>
                </tr>
              </thead>
              <tbody>
                {contratos.map((c) => {
                  const extra = c.extracoes[0];
                  return (
                    <tr key={c.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2">
                        <Link
                          href={`/juridico/contratos/${c.id}`}
                          className="text-primary hover:underline truncate block max-w-[300px]"
                          title={c.nomeOriginal}
                        >
                          {c.nomeOriginal}
                        </Link>
                        <div className="text-[10px] text-muted-foreground">
                          {(Number(c.tamanhoBytes) / 1024).toFixed(0)} KB · {c.origemImportacao}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {c.pessoa ? c.pessoa.apelido || c.pessoa.nomeCompleto : "—"}
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {!extra && <span className="text-muted-foreground">processando…</span>}
                        {extra?.erroExtracao && (
                          <span className="text-destructive">erro: {extra.erroExtracao.slice(0, 40)}</span>
                        )}
                        {extra && !extra.erroExtracao && (
                          <span>
                            confiança{" "}
                            <strong
                              className={cn(
                                extra.confianca >= 0.8
                                  ? "text-green-600"
                                  : extra.confianca >= 0.6
                                    ? "text-amber-600"
                                    : "text-destructive"
                              )}
                            >
                              {(extra.confianca * 100).toFixed(0)}%
                            </strong>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {new Date(c.uploadedAt).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {c.uploadedBy.name}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pendente_revisao: {
      label: "Pendente",
      cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    },
    aprovado: {
      label: "Aprovado",
      cls: "bg-green-500/15 text-green-700 dark:text-green-300",
    },
    rejeitado: {
      label: "Rejeitado",
      cls: "bg-destructive/15 text-destructive",
    },
    arquivado: {
      label: "Arquivado",
      cls: "bg-muted text-muted-foreground",
    },
  };
  const m = map[status] || { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-block rounded px-2 py-0.5 text-[10px] font-medium", m.cls)}>
      {m.label}
    </span>
  );
}
