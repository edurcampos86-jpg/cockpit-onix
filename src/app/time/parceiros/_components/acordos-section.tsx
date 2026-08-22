import { Percent, History, Plus, XCircle, Info } from "lucide-react";
import { criarAcordoForm, encerrarAcordoForm } from "@/app/actions/parceiros";
import { TIPOS_PRODUTO } from "@/lib/parceiros/vocabulario";
import { ConfirmarAcao } from "./confirmar-acao";

/* ──────────────────────────────────────────────────────────────
 * Acordos do parceiro — uma linha por tipo de produto, cada uma datada.
 *
 * Espelha `time/_components/acordo-comercial-section.tsx` (Pessoa) de
 * propósito: quem já mexeu no acordo de uma pessoa do time reconhece a tela.
 * A diferença é a que o negócio impõe — a Pessoa tem UM acordo vigente, o
 * parceiro tem um POR PRODUTO, vários ao mesmo tempo.
 * ────────────────────────────────────────────────────────────── */

type Acordo = {
  id: string;
  tipoProduto: string;
  percentual: { toString(): string };
  dataInicio: Date;
  dataFim: Date | null;
};

const NOME_PRODUTO: Record<string, string> = {
  assessoria: "Assessoria",
  seguro_resgatavel: "Seguro resgatável",
  seguro_risco: "Seguro de risco",
  previdencia: "Previdência",
  consorcio: "Consórcio",
  imobiliaria: "Imobiliária",
};

function nomeProduto(chave: string): string {
  return NOME_PRODUTO[chave] ?? chave.replace(/_/g, " ");
}

function dataBr(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** "20" e "20.0000" viram "20%"; "20.5000" vira "20,5%". */
function percentualBr(p: { toString(): string }): string {
  const n = Number(p.toString());
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;
}

export function AcordosSection({
  parceiroId,
  parceiroNome,
  acordos,
  podeGerenciar,
}: {
  parceiroId: string;
  parceiroNome: string;
  acordos: Acordo[];
  podeGerenciar: boolean;
}) {
  const vigentes = acordos.filter((a) => a.dataFim === null);
  const historico = acordos.filter((a) => a.dataFim !== null);
  const zerados = vigentes.filter((a) => Number(a.percentual.toString()) === 0);
  const produtosVigentes = new Set(vigentes.map((a) => a.tipoProduto));

  return (
    <section className="rounded-xl border border-[var(--parceiro-borda)] bg-[var(--parceiro-superficie)] p-6">
      <header className="mb-1 flex items-center gap-2">
        <Percent className="h-4 w-4 text-[var(--parceiro-ouro)]" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Acordo por produto</h2>
      </header>
      <p className="mb-4 text-xs text-muted-foreground">
        Cada produto tem a sua própria combinação, com a data em que passou a
        valer. Mudar um percentual não apaga o anterior: encerra o que valia e
        abre o novo, para o que já foi pago continuar batendo com o que estava
        combinado na época.
      </p>

      {vigentes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background/40 p-6 text-center">
          <p className="text-sm font-medium text-foreground">
            Nenhum acordo combinado ainda
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {podeGerenciar
              ? "Comece pelo produto que motivou a parceria. Os outros podem entrar depois, um de cada vez."
              : "Quando o acordo for registrado, ele aparece aqui."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {vigentes.map((a) => {
            const zero = Number(a.percentual.toString()) === 0;
            return (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {nomeProduto(a.tipoProduto)}
                    {zero && (
                      <span className="rounded border border-[var(--parceiro-borda)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                        Sem repasse
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Vale desde {dataBr(a.dataInicio)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-base font-semibold tabular-nums text-foreground">
                    {percentualBr(a.percentual)}
                  </span>
                  {podeGerenciar && (
                    <ConfirmarAcao
                      titulo={`Encerrar o acordo de ${nomeProduto(a.tipoProduto).toLowerCase()}?`}
                      consequencia={`${parceiroNome} deixa de ter combinação vigente nesse produto. O histórico continua guardado, e o que já foi apurado no período não muda. Para registrar que o produto não remunera, o certo é 0% — não encerrar.`}
                      rotuloGatilho="Encerrar"
                      rotuloConfirmar="Encerrar acordo"
                      action={encerrarAcordoForm}
                      campos={{ parceiroId, acordoId: a.id }}
                      destrutivo
                      iconeGatilho={<XCircle className="h-3.5 w-3.5" aria-hidden />}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── O 0% explicado ONDE ele aparece ────────────────────────────────
          A microcópia só existe quando há uma linha zerada na tela. Explicação
          permanente vira decoração e ninguém lê; explicação que aparece junto
          do caso responde a pergunta no momento em que ela nasce. */}
      {zerados.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--parceiro-borda)] bg-[var(--parceiro-faixa)] px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--parceiro-ouro)]" aria-hidden />
          <p className="text-xs text-foreground">
            <strong>
              {zerados.length === 1
                ? `${nomeProduto(zerados[0].tipoProduto)} está em 0% de propósito.`
                : "Os produtos em 0% estão assim de propósito."}
            </strong>{" "}
            {parceiroNome} não recebe repasse{" "}
            {zerados.length === 1 ? "nesse produto" : "nesses produtos"} porque já
            é remunerado por outro caminho — quem é sócio da empresa que vende já
            ganha ali, e um repasse aqui pagaria duas vezes pelo mesmo negócio.
            Deixar o produto fora da lista, em vez de gravar 0%, faria parecer que
            ninguém decidiu ainda.
          </p>
        </div>
      )}

      {podeGerenciar && (
        <details className="mt-4">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--parceiro-borda)] bg-[var(--parceiro-faixa)] px-3 py-2 text-xs font-medium text-foreground hover:bg-[var(--parceiro-borda)]">
            <Plus className="h-3.5 w-3.5 text-[var(--parceiro-ouro)]" aria-hidden />
            Registrar acordo de um produto
          </summary>
          <form
            action={criarAcordoForm}
            className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
          >
            <input type="hidden" name="parceiroId" value={parceiroId} />

            <div className="space-y-1.5">
              <label htmlFor="tipoProduto" className="block text-xs font-medium text-muted-foreground">
                Produto
              </label>
              <select
                id="tipoProduto"
                name="tipoProduto"
                required
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
              >
                {TIPOS_PRODUTO.map((p) => (
                  <option key={p} value={p}>
                    {nomeProduto(p)}
                    {produtosVigentes.has(p) ? " (já tem acordo vigente)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="percentual" className="block text-xs font-medium text-muted-foreground">
                Percentual
              </label>
              <input
                id="percentual"
                name="percentual"
                required
                inputMode="decimal"
                placeholder="20"
                className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm tabular-nums text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="dataInicio" className="block text-xs font-medium text-muted-foreground">
                Vale desde
              </label>
              <input
                id="dataInicio"
                name="dataInicio"
                type="date"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
              />
            </div>

            <button
              type="submit"
              className="rounded-lg border border-[var(--parceiro-borda)] bg-[var(--parceiro-faixa)] px-4 py-2 text-sm font-semibold text-foreground hover:bg-[var(--parceiro-borda)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
            >
              Salvar acordo
            </button>

            <p className="w-full text-xs text-muted-foreground">
              Escolher um produto que já tem acordo vigente <strong>encerra o
              anterior na data informada</strong> e abre o novo. Em branco, a data
              é hoje. Para registrar que o produto não remunera, grave{" "}
              <strong>0</strong>.
            </p>
          </form>
        </details>
      )}

      {historico.length > 0 && (
        <details className="mt-4">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <History className="h-3.5 w-3.5" aria-hidden />
            Combinações anteriores ({historico.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {historico.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-4 py-2.5 text-sm"
              >
                <span className="text-muted-foreground">
                  {nomeProduto(a.tipoProduto)} · {dataBr(a.dataInicio)} a{" "}
                  {a.dataFim ? dataBr(a.dataFim) : "—"}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {percentualBr(a.percentual)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
