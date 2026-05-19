import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/layout/page-header";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { ContratoActions } from "./_components/contrato-actions";

export const metadata = { title: "Contrato — Cockpit Onix" };
export const dynamic = "force-dynamic";

export default async function ContratoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");
  if (!isAdmin(ctx)) redirect("/");

  const { id } = await params;

  const contrato = await prisma.contratoArquivo.findUnique({
    where: { id },
    include: {
      pessoa: {
        select: { id: true, apelido: true, nomeCompleto: true, cpf: true, email: true },
      },
      uploadedBy: { select: { id: true, name: true, email: true } },
      acordoComercial: { select: { id: true, tipo: true } },
      extracoes: {
        orderBy: { extraidoEm: "desc" },
        include: { revisadoPor: { select: { id: true, name: true } } },
      },
    },
  });

  if (!contrato) notFound();

  const ultimaExtracao = contrato.extracoes[0];
  const dados = (ultimaExtracao?.dadosCorrigidos ??
    ultimaExtracao?.dadosExtraidos ??
    null) as Record<string, unknown> | null;

  return (
    <div className="min-h-screen">
      <PageHeader title={contrato.nomeOriginal} description="Detalhe do contrato no cofre B2">
        <Link
          href="/juridico/contratos"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
      </PageHeader>

      <div className="p-8 max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna esquerda: PDF inline + meta */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="border-b border-border bg-muted/30 px-4 py-2 flex items-center justify-between">
              <span className="text-sm font-medium">Visualizar PDF</span>
              <a
                href={`/api/juridico/contratos/${contrato.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Abrir em nova aba
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <iframe
              src={`/api/juridico/contratos/${contrato.id}/pdf`}
              title={contrato.nomeOriginal}
              className="w-full h-[800px] bg-muted"
            />
            <div className="border-t border-border bg-amber-50 dark:bg-amber-950/20 px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
              ⚠ Sem watermark nem audit log nessa fase. Fase 1B adiciona
              proteção visual + log de acesso + 2FA gate.
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Meta label="Hash SHA-256" value={contrato.hashSha256} mono />
              <Meta
                label="Tamanho"
                value={`${(Number(contrato.tamanhoBytes) / 1024).toFixed(0)} KB`}
              />
              <Meta label="B2 key" value={contrato.b2Key} mono />
              <Meta label="Status" value={contrato.status} />
              <Meta label="Origem" value={contrato.origemImportacao} />
              <Meta
                label="Subido em"
                value={`${new Date(contrato.uploadedAt).toLocaleString("pt-BR")} por ${contrato.uploadedBy.name}`}
              />
              {contrato.pessoa && (
                <Meta
                  label="Pessoa vinculada"
                  value={contrato.pessoa.apelido || contrato.pessoa.nomeCompleto}
                />
              )}
              {contrato.acordoComercial && (
                <Meta
                  label="Acordo comercial"
                  value={`${contrato.acordoComercial.tipo}`}
                />
              )}
            </div>
            {contrato.observacoes && (
              <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                <strong>Observações:</strong> {contrato.observacoes}
              </div>
            )}
          </div>
        </div>

        {/* Coluna direita: extração + ações */}
        <div className="space-y-4">
          <ContratoActions
            contratoId={contrato.id}
            statusAtual={contrato.status}
          />

          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Extração Claude</h3>
            {!ultimaExtracao && (
              <p className="text-xs text-muted-foreground">
                Aguardando processamento…
                <br />
                Pode demorar até 60s na primeira execução. Recarregue a página.
              </p>
            )}
            {ultimaExtracao?.erroExtracao && (
              <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-xs text-destructive">
                <strong>Erro:</strong> {ultimaExtracao.erroExtracao}
              </div>
            )}
            {ultimaExtracao && !ultimaExtracao.erroExtracao && dados && (
              <DadosExtraidosView dados={dados} confianca={ultimaExtracao.confianca} />
            )}
          </div>

          {contrato.extracoes.length > 1 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold mb-2 text-muted-foreground">
                Histórico ({contrato.extracoes.length} extrações)
              </h3>
              <ul className="text-xs space-y-1">
                {contrato.extracoes.map((e) => (
                  <li key={e.id} className="text-muted-foreground">
                    {new Date(e.extraidoEm).toLocaleString("pt-BR")} ·{" "}
                    {e.erroExtracao ? "erro" : `${(e.confianca * 100).toFixed(0)}%`} ·{" "}
                    {e.statusRevisao}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={mono ? "font-mono text-[11px] break-all" : ""}>{value}</div>
    </div>
  );
}

function DadosExtraidosView({
  dados,
  confianca,
}: {
  dados: Record<string, unknown>;
  confianca: number;
}) {
  const corConfianca =
    confianca >= 0.8 ? "text-green-600" : confianca >= 0.6 ? "text-amber-600" : "text-destructive";

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">Confiança</span>
        <strong className={corConfianca}>{(confianca * 100).toFixed(0)}%</strong>
      </div>
      <pre className="bg-muted rounded-lg p-3 text-[10px] overflow-x-auto whitespace-pre-wrap font-mono">
        {JSON.stringify(dados, null, 2)}
      </pre>
    </div>
  );
}
