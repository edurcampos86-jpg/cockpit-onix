import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { b2BackupsConfigurado } from "@/lib/b2/client";
import { pgDumpAvailable } from "@/lib/backup/postgres-dump";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { BackupActions } from "./_components/backup-actions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Backups — Cockpit Onix" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function BackupsPage() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");
  if (!isAdmin(ctx)) redirect("/");

  const [historico, ultimoBanco, ultimoRestoreTest, pgDump] = await Promise.all([
    prisma.backupExecucao.findMany({
      orderBy: { executadoEm: "desc" },
      take: 50,
    }),
    prisma.backupExecucao.findFirst({
      where: { tipo: "banco", sucesso: true },
      orderBy: { executadoEm: "desc" },
    }),
    prisma.backupExecucao.findFirst({
      where: { tipo: "restore_test" },
      orderBy: { executadoEm: "desc" },
    }),
    pgDumpAvailable(),
  ]);

  const horasUltimoBanco = ultimoBanco
    ? Math.round((Date.now() - ultimoBanco.executadoEm.getTime()) / 1000 / 3600)
    : null;

  const diasUltimoRestoreTest = ultimoRestoreTest
    ? Math.round((Date.now() - ultimoRestoreTest.executadoEm.getTime()) / 1000 / 86400)
    : null;

  return (
    <div className="min-h-screen">
      <PageHeader title="Backups" description="Status, histórico e ações manuais do backup do Cockpit." />
      <div className="p-8 space-y-6 max-w-6xl">
        <ComoFunciona
          proposito="Pipeline completo de backup do Postgres + restore test mensal. Dumps vão pro Backblaze B2 (bucket onix-cockpit-backups), retenção 30 daily + 12 monthly + 5 yearly (GFS)."
          comoUsar="Backup automático em dois destinos: GitHub Actions → R2 (diário 03h Bahia, cifrado, restore drill semanal) e app → B2 (diário 04h Bahia via cron.yml, retenção GFS, restore test mensal). 'Rodar agora' dispara um backup B2 manual."
          comoAjuda="Backup que não foi testado não é backup. O restore test é a única garantia real de que o pipeline funciona. Se o sanity check falhar, Slack + WhatsApp alertam imediatamente."
        />

        {/* Status checks */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatusCard
            label="B2 Backups"
            ok={b2BackupsConfigurado()}
            detalhe={b2BackupsConfigurado() ? "configurado" : "B2_APPLICATION_KEY_ID_BACKUPS ausente"}
          />
          <StatusCard
            label="pg_dump no runtime"
            ok={pgDump.ok}
            detalhe={pgDump.ok ? pgDump.version || "OK" : pgDump.erro || "ausente"}
          />
          <StatusCard
            label="Último backup"
            ok={horasUltimoBanco != null && horasUltimoBanco < 30}
            detalhe={
              horasUltimoBanco != null
                ? `${horasUltimoBanco}h atrás (${ultimoBanco?.tamanhoBytes ? (Number(ultimoBanco.tamanhoBytes) / 1024 / 1024).toFixed(1) + " MB" : "?"})`
                : "nunca executado"
            }
          />
        </div>

        <BackupActions disabled={!b2BackupsConfigurado() || !pgDump.ok} />

        {/* Restore test */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-2">Último restore test</h3>
          {ultimoRestoreTest ? (
            <div className="text-sm space-y-1">
              <div>
                <span
                  className={cn(
                    "inline-block rounded px-2 py-0.5 text-xs font-medium mr-2",
                    ultimoRestoreTest.sucesso
                      ? "bg-green-500/15 text-green-700 dark:text-green-300"
                      : "bg-destructive/15 text-destructive"
                  )}
                >
                  {ultimoRestoreTest.sucesso ? "OK" : "FAILED"}
                </span>
                <span className="text-muted-foreground">
                  {diasUltimoRestoreTest} dias atrás (
                  {new Date(ultimoRestoreTest.executadoEm).toLocaleString("pt-BR")})
                </span>
              </div>
              {ultimoRestoreTest.erro && (
                <div className="text-xs text-destructive">{ultimoRestoreTest.erro}</div>
              )}
              {ultimoRestoreTest.metadata != null && (
                <pre className="text-[10px] bg-muted rounded p-2 mt-2 overflow-x-auto">
                  {JSON.stringify(ultimoRestoreTest.metadata, null, 2)}
                </pre>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nunca rodou. Aguarda o cron mensal (1º do mês, 05h Bahia).
            </p>
          )}
        </div>

        {/* Histórico */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-4 py-2 text-sm font-medium">
            Histórico ({historico.length})
          </div>
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Quando</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Tamanho</th>
                <th className="px-3 py-2 font-medium">Duração</th>
                <th className="px-3 py-2 font-medium">Destino</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h) => (
                <tr key={h.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                    {new Date(h.executadoEm).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-3 py-1.5">{h.tipo}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={cn(
                        "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                        h.sucesso
                          ? "bg-green-500/15 text-green-700 dark:text-green-300"
                          : "bg-destructive/15 text-destructive"
                      )}
                    >
                      {h.sucesso ? "OK" : "FAILED"}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {h.tamanhoBytes ? `${(Number(h.tamanhoBytes) / 1024 / 1024).toFixed(1)} MB` : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">
                    {h.duracaoSegundos != null ? `${h.duracaoSegundos}s` : "—"}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[10px] text-muted-foreground truncate max-w-[400px]" title={h.destino}>
                    {h.destino}
                  </td>
                </tr>
              ))}
              {historico.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-muted-foreground">
                    Nenhum backup registrado ainda.
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

function StatusCard({ label, ok, detalhe }: { label: string; ok: boolean; detalhe: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2 mt-1">
        <span
          className={cn(
            "inline-block h-2 w-2 rounded-full",
            ok ? "bg-green-500" : "bg-destructive"
          )}
        />
        <span className="text-sm font-medium">{ok ? "OK" : "Falha"}</span>
      </div>
      <div className="text-xs text-muted-foreground mt-1">{detalhe}</div>
    </div>
  );
}
