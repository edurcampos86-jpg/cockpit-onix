import Link from "next/link";
import { IdCard, Link2, Unlink, ExternalLink } from "lucide-react";
import { ligarPessoaForm } from "@/app/actions/parceiros";
import type { PessoaVinculavel } from "@/lib/parceiros/consultas";
import { ConfirmarAcao } from "./confirmar-acao";

/* ──────────────────────────────────────────────────────────────
 * "Também é do time" — o elo com `Pessoa`.
 *
 * O que aparece aqui é HERDADO por leitura: e-mail, telefone e cargo vivem em
 * `Pessoa` e continuam vivendo lá. Copiar para `Parceiro` criaria a segunda
 * grafia do mesmo humano, que é exatamente o problema que o elo resolve.
 * ────────────────────────────────────────────────────────────── */

type PessoaLigada = {
  id: string;
  nomeCompleto: string;
  apelido: string | null;
  email: string;
  telefone: string | null;
  cargoFamilia: string;
  cargoTitulo: string | null;
  status: string;
};

export function PessoaSection({
  parceiroId,
  parceiroNome,
  pessoa,
  candidatos,
  podeGerenciar,
}: {
  parceiroId: string;
  parceiroNome: string;
  pessoa: PessoaLigada | null;
  candidatos: PessoaVinculavel[];
  podeGerenciar: boolean;
}) {
  return (
    <section className="rounded-xl border border-[var(--parceiro-borda)] bg-[var(--parceiro-superficie)] p-6">
      <header className="mb-1 flex items-center gap-2">
        <IdCard className="h-4 w-4 text-[var(--parceiro-ouro)]" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Também é do time</h2>
      </header>

      {pessoa ? (
        <>
          <p className="mb-3 text-xs text-muted-foreground">
            Os dados abaixo vêm da ficha do time e são atualizados lá — aqui é só
            leitura, para não existirem duas versões da mesma pessoa.
          </p>
          <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Nome no time</dt>
              <dd className="text-sm text-foreground">{pessoa.nomeCompleto}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Cargo</dt>
              <dd className="text-sm text-foreground">
                {pessoa.cargoTitulo?.trim() || pessoa.cargoFamilia.replace(/_/g, " ")}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">E-mail</dt>
              <dd className="text-sm text-foreground break-all">{pessoa.email}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Telefone</dt>
              <dd className="text-sm text-foreground">{pessoa.telefone ?? "—"}</dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href={`/time/${pessoa.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
            >
              Abrir ficha no time
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
            {podeGerenciar && (
              <ConfirmarAcao
                titulo={`Desligar ${parceiroNome} do cadastro do time?`}
                consequencia="O parceiro continua existindo, com os acordos e os clientes dele. Só deixa de puxar e-mail, telefone e cargo da ficha do time — e volta a ser um nome digitado à mão."
                rotuloGatilho="Desligar do time"
                rotuloConfirmar="Desligar"
                action={ligarPessoaForm}
                campos={{ parceiroId, pessoaId: "" }}
                destrutivo
                iconeGatilho={<Unlink className="h-3.5 w-3.5" aria-hidden />}
              />
            )}
          </div>

          {pessoa.status !== "ativo" && (
            <p className="mt-3 text-xs text-muted-foreground">
              A ficha no time está <strong className="text-foreground">arquivada</strong>. O
              vínculo continua registrado — quem saiu do time pode seguir indicando.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Este parceiro não está ligado a ninguém do time. Ligar evita o mesmo
            nome cadastrado duas vezes e traz e-mail, telefone e cargo sem
            redigitar.
          </p>

          {podeGerenciar && candidatos.length > 0 && (
            <form action={ligarPessoaForm} className="mt-4 flex flex-wrap items-end gap-3">
              <input type="hidden" name="parceiroId" value={parceiroId} />
              <div className="space-y-1.5">
                <label htmlFor="pessoaId" className="block text-xs font-medium text-muted-foreground">
                  Quem do time é este parceiro?
                </label>
                <select
                  id="pessoaId"
                  name="pessoaId"
                  required
                  defaultValue=""
                  className="max-w-xs rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
                >
                  <option value="" disabled>
                    Escolher pessoa…
                  </option>
                  {candidatos.map((c) => (
                    <option key={c.id} value={c.id} disabled={c.jaEhParceiro}>
                      {c.nome} · {c.cargo}
                      {c.jaEhParceiro ? " (já é parceiro)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--parceiro-borda)] bg-[var(--parceiro-faixa)] px-3 py-2 text-sm font-medium text-foreground hover:bg-[var(--parceiro-borda)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
              >
                <Link2 className="h-4 w-4 text-[var(--parceiro-ouro)]" aria-hidden />
                Ligar ao time
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
