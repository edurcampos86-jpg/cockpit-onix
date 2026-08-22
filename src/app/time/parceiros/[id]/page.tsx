export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, FileSignature, Archive, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { requireLideranca, canManageTeam } from "@/lib/auth-helpers";
import { obterParceiro } from "@/lib/parceiros/consultas";
import { alternarAtivoForm, salvarContratoForm } from "@/app/actions/parceiros";
import { ConfirmarAcao } from "../_components/confirmar-acao";
import { AcordosSection } from "../_components/acordos-section";
import { ClientesSection } from "../_components/clientes-section";

/* ──────────────────────────────────────────────────────────────
 * Ficha do parceiro. Nesta PR ela responde três perguntas:
 * quem é, se o contrato está assinado, e se ainda está ativo.
 *
 * Acordos por produto e vínculo de clientes entram em PRs próprias — cada uma
 * é uma decisão de negócio diferente, com regra própria de escrita.
 * ────────────────────────────────────────────────────────────── */

const RELACAO: Record<string, string> = {
  socio: "Sócio",
  contabil: "Contabilidade",
  outro: "Outro",
};

function dataBr(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
}

/** `Date` → `AAAA-MM-DD` para `<input type="date">`, sem escorregar de fuso. */
function paraInputDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function ParceiroPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    novo?: string;
    acordo?: string;
    erroAcordo?: string;
    vinculo?: string;
    erroVinculo?: string;
    buscaCliente?: string;
  }>;
}) {
  const ctx = await requireLideranca();
  const podeGerenciar = canManageTeam(ctx);
  const { id } = await params;
  const { novo, acordo, erroAcordo, vinculo, erroVinculo, buscaCliente } =
    await searchParams;

  const parceiro = await obterParceiro(id);
  if (!parceiro) notFound();

  const clientesVigentes = parceiro.clientes.filter((c) => c.dataFim === null);
  const acordosVigentes = parceiro.acordos.filter((a) => a.dataFim === null);

  return (
    <div className="space-y-6">
      <PageHeader
        title={parceiro.nome}
        description={`${RELACAO[parceiro.tipo] ?? parceiro.tipo} · ${
          clientesVigentes.length
        } cliente(s) · ${acordosVigentes.length} acordo(s) vigente(s)`}
      />

      <div className="px-8 space-y-6">
        <Link
          href="/time/parceiros"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar para parceiros
        </Link>

        {novo === "1" && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-lg border border-[var(--parceiro-borda)] bg-[var(--parceiro-faixa)] px-4 py-3 text-sm text-foreground"
          >
            <CheckCircle2 className="h-4 w-4 text-[var(--parceiro-ouro)]" aria-hidden />
            Parceiro cadastrado. O próximo passo é registrar o acordo e vincular os
            clientes que vieram por ele.
          </div>
        )}

        {!parceiro.ativo && (
          <div
            role="status"
            className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
          >
            Este parceiro está <strong className="text-foreground">inativo</strong>. O
            histórico continua aqui; ele só não aparece na lista padrão.
          </div>
        )}

        {erroVinculo && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
          >
            {erroVinculo}
          </div>
        )}

        {vinculo === "criado" && (
          <div
            role="status"
            className="rounded-lg border border-[var(--parceiro-borda)] bg-[var(--parceiro-faixa)] px-4 py-3 text-sm text-foreground"
          >
            Cliente vinculado. O nome do parceiro já aparece na ficha dele.
          </div>
        )}

        {vinculo === "ja" && (
          <div
            role="status"
            className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
          >
            Esse cliente já estava vinculado aqui — nada mudou.
          </div>
        )}

        {vinculo === "encerrado" && (
          <div
            role="status"
            className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
          >
            Vínculo encerrado. O período anterior continua registrado no histórico.
          </div>
        )}

        {erroAcordo && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
          >
            {erroAcordo}
          </div>
        )}

        {acordo === "salvo" && (
          <div
            role="status"
            className="rounded-lg border border-[var(--parceiro-borda)] bg-[var(--parceiro-faixa)] px-4 py-3 text-sm text-foreground"
          >
            Acordo registrado. O que valia antes naquele produto foi encerrado e
            continua no histórico.
          </div>
        )}

        {acordo === "encerrado" && (
          <div
            role="status"
            className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
          >
            Acordo encerrado. Nada foi apagado — a combinação anterior segue no
            histórico do produto.
          </div>
        )}

        <AcordosSection
          parceiroId={parceiro.id}
          parceiroNome={parceiro.nome}
          acordos={parceiro.acordos}
          podeGerenciar={podeGerenciar}
        />

        <ClientesSection
          parceiroId={parceiro.id}
          parceiroNome={parceiro.nome}
          vinculos={parceiro.clientes}
          podeGerenciar={podeGerenciar}
          buscaCliente={buscaCliente}
        />

        {/* ── Contrato ─────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-[var(--parceiro-borda)] bg-[var(--parceiro-superficie)] p-6">
          <header className="mb-4 flex items-center gap-2">
            <FileSignature className="h-4 w-4 text-[var(--parceiro-ouro)]" aria-hidden />
            <h2 className="text-sm font-semibold text-foreground">Contrato</h2>
          </header>

          {parceiro.contratoAssinadoEm ? (
            <p className="text-sm text-foreground">
              Assinado em{" "}
              <strong className="tabular-nums">{dataBr(parceiro.contratoAssinadoEm)}</strong>.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ainda sem contrato assinado. Dá para vincular clientes e registrar o
              acordo assim mesmo — a data entra quando o documento voltar.
            </p>
          )}

          {podeGerenciar && (
            <form action={salvarContratoForm} className="mt-4 flex flex-wrap items-end gap-3">
              <input type="hidden" name="parceiroId" value={parceiro.id} />
              <div className="space-y-1.5">
                <label
                  htmlFor="contratoAssinadoEm"
                  className="block text-xs font-medium text-muted-foreground"
                >
                  Data de assinatura
                </label>
                <input
                  id="contratoAssinadoEm"
                  name="contratoAssinadoEm"
                  type="date"
                  defaultValue={paraInputDate(parceiro.contratoAssinadoEm)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg border border-[var(--parceiro-borda)] bg-[var(--parceiro-faixa)] px-3 py-2 text-sm font-medium text-foreground hover:bg-[var(--parceiro-borda)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
              >
                Salvar data
              </button>
              <span className="text-xs text-muted-foreground">
                Deixar em branco limpa a data.
              </span>
            </form>
          )}
        </section>

        {/* ── Estado ───────────────────────────────────────────────────── */}
        {podeGerenciar && (
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-1 text-sm font-semibold text-foreground">
              Estado do cadastro
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Inativar não apaga nada: os vínculos e o histórico de acordo
              continuam registrados.
            </p>
            {parceiro.ativo ? (
              <ConfirmarAcao
                titulo={`Inativar ${parceiro.nome}?`}
                consequencia={`Ele sai da lista padrão de parceiros. Os ${clientesVigentes.length} cliente(s) vinculados continuam como estão, e o histórico fica guardado — dá para reativar depois.`}
                rotuloGatilho="Inativar parceiro"
                rotuloConfirmar="Inativar"
                action={alternarAtivoForm}
                campos={{ parceiroId: parceiro.id, ativar: "0" }}
                destrutivo
                iconeGatilho={<Archive className="h-3.5 w-3.5" aria-hidden />}
              />
            ) : (
              <ConfirmarAcao
                titulo={`Reativar ${parceiro.nome}?`}
                consequencia="Ele volta a aparecer na lista padrão de parceiros."
                rotuloGatilho="Reativar parceiro"
                rotuloConfirmar="Reativar"
                action={alternarAtivoForm}
                campos={{ parceiroId: parceiro.id, ativar: "1" }}
                iconeGatilho={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
