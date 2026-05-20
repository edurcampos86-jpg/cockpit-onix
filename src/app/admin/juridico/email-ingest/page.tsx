import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { BackfillButton } from "./_components/backfill-button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Ingestão de Contratos por Email — Cockpit Onix" };
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  processado: {
    label: "Processado",
    cls: "bg-green-500/15 text-green-700 dark:text-green-300",
  },
  duplicata_hash: {
    label: "Duplicata (hash)",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  ignorado_remetente: {
    label: "Remetente fora da lista",
    cls: "bg-muted text-muted-foreground",
  },
  ignorado_sem_anexo_pdf: {
    label: "Sem PDF",
    cls: "bg-muted text-muted-foreground",
  },
  erro: {
    label: "Erro",
    cls: "bg-destructive/15 text-destructive",
  },
};

export default async function EmailIngestPage() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");
  if (!isAdmin(ctx)) redirect("/");

  const [stats, ultimos, conectados] = await Promise.all([
    prisma.ingestaoEmail.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.ingestaoEmail.findMany({
      orderBy: { processadoEm: "desc" },
      take: 100,
    }),
    prisma.userGoogleAuth.findMany({
      select: {
        userId: true,
        googleEmail: true,
        lastUsedAt: true,
        lastErrorAt: true,
        lastError: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  const statsMap = Object.fromEntries(stats.map((s) => [s.status, s._count._all]));
  const total = Object.values(statsMap).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Ingestão por Email"
        description="Captura contratos PDF de emails do Clicksign, DocuSign, Adobe Sign etc."
      />
      <div className="p-8 space-y-6 max-w-6xl">
        <ComoFunciona
          proposito="Como o tenant Microsoft 365 da Onix é gerenciado pelo BTG e bloqueia Microsoft Graph, ingerimos contratos pelo canal email. Toda vez que uma plataforma de assinatura dispara o PDF assinado, o cron pega via Gmail API e processa pelo cofre."
          comoUsar="O cron roda automaticamente a cada 30min. Pra o passivo (contratos antigos), use 'Backfill manual' abaixo — busca emails históricos das mesmas plataformas, idempotente (não duplica)."
          comoAjuda="Fontes que monitoramos: Clicksign, DocuSign, Adobe Sign, Signaturit, ZapSign. Pra adicionar uma fonte nova, basta setar JURIDICO_REMETENTES_CSV no Railway (sem deploy)."
        />

        {/* Status das contas Gmail conectadas */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Contas Gmail conectadas</h3>
          {conectados.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Nenhuma conta. Vai em{" "}
              <Link href="/integracoes" className="text-primary hover:underline">
                /integracoes
              </Link>{" "}
              pra conectar.
            </div>
          ) : (
            <ul className="space-y-2">
              {conectados.map((c) => (
                <li key={c.userId} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{c.user?.name ?? c.userId}</span>{" "}
                    <span className="text-muted-foreground">({c.googleEmail})</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.lastErrorAt ? (
                      <span className="text-destructive">
                        ⚠ {c.lastError?.slice(0, 60)}
                      </span>
                    ) : c.lastUsedAt ? (
                      `usado ${new Date(c.lastUsedAt).toLocaleString("pt-BR")}`
                    ) : (
                      "nunca usado"
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Total processados" value={total} />
          <Kpi label="Sucessos" value={statsMap.processado ?? 0} cor="green" />
          <Kpi label="Duplicatas" value={statsMap.duplicata_hash ?? 0} cor="amber" />
          <Kpi
            label="Ignorados"
            value={(statsMap.ignorado_sem_anexo_pdf ?? 0) + (statsMap.ignorado_remetente ?? 0)}
          />
          <Kpi label="Erros" value={statsMap.erro ?? 0} cor="red" />
        </div>

        {/* Backfill action */}
        <BackfillButton />

        {/* Histórico */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-4 py-2 text-sm font-medium">
            Últimos {ultimos.length} emails consultados
          </div>
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Quando</th>
                <th className="px-3 py-2 font-medium">Remetente</th>
                <th className="px-3 py-2 font-medium">Assunto</th>
                <th className="px-3 py-2 font-medium">Anexo</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Contrato</th>
              </tr>
            </thead>
            <tbody>
              {ultimos.map((e) => {
                const s = STATUS_LABELS[e.status] || {
                  label: e.status,
                  cls: "bg-muted text-muted-foreground",
                };
                return (
                  <tr key={e.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                      {new Date(e.processadoEm).toLocaleString("pt-BR")}
                    </td>
                    <td className="px-3 py-1.5 truncate max-w-[250px]" title={e.remetente}>
                      {e.remetente}
                    </td>
                    <td className="px-3 py-1.5 truncate max-w-[300px]" title={e.assunto ?? ""}>
                      {e.assunto || "—"}
                    </td>
                    <td className="px-3 py-1.5 truncate max-w-[180px]" title={e.nomeAnexoPdf ?? ""}>
                      {e.nomeAnexoPdf || "—"}
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={cn(
                          "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                          s.cls,
                        )}
                        title={e.motivo ?? ""}
                      >
                        {s.label}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      {e.contratoArquivoId ? (
                        <Link
                          href={`/juridico/contratos/${e.contratoArquivoId}`}
                          className="text-primary hover:underline"
                        >
                          abrir →
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
              {ultimos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-muted-foreground">
                    Nenhum email processado ainda. O cron roda a cada 30min, ou use o backfill acima.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  cor,
}: {
  label: string;
  value: number;
  cor?: "green" | "amber" | "red";
}) {
  const corMap = {
    green: "text-green-700 dark:text-green-300",
    amber: "text-amber-700 dark:text-amber-300",
    red: "text-destructive",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-bold mt-1", cor ? corMap[cor] : "")}>{value}</div>
    </div>
  );
}
