import Link from "next/link";
import { Handshake, ArrowUpRight } from "lucide-react";

/* ──────────────────────────────────────────────────────────────
 * "Veio por" — a origem do relacionamento, na ficha do cliente.
 *
 * ── POR QUE UM CARD, SE O CABEÇALHO JÁ DIZ O NOME ────────────────────────
 * O cabeçalho responde de relance ("Parceiro Renan") e não cabe mais que
 * isso — ele divide a linha com conta e classe. Este card responde o que vem
 * depois da primeira olhada: DESDE QUANDO, que relação essa pessoa tem com a
 * casa, e como chegar na ficha dela. São perguntas diferentes, e empilhar as
 * duas no cabeçalho deixaria a linha ilegível.
 *
 * ── O QUE ESTE CARD NÃO MOSTRA, DE PROPÓSITO ─────────────────────────────
 * Percentual de comissão. `AcordoComercialParceiro.percentual` guarda "20" e
 * nada no banco diz "20% de quê" — a base é decisão do Financeiro. Um número
 * aqui seria lido como oficial e mudaria depois. Mesma decisão da coluna
 * reservada na lista de parceiros (src/lib/parceiros/colunas.ts).
 * ────────────────────────────────────────────────────────────── */

const RELACAO: Record<string, string> = {
  socio: "Sócio de uma empresa do grupo",
  contabil: "Escritório contábil",
  outro: "Parceiro comercial",
};

export function OrigemParceiroCard({
  parceiro,
  desde,
  podeAbrirFicha,
}: {
  parceiro: { id: string; nome: string; tipo: string; ativo: boolean };
  desde: Date;
  /** Só liderança alcança /time/parceiros — sem isso o link vira beco. */
  podeAbrirFicha: boolean;
}) {
  return (
    <section className="rounded-xl border border-[var(--parceiro-borda)] bg-[var(--parceiro-faixa)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Handshake
            className="mt-0.5 h-5 w-5 shrink-0 text-[var(--parceiro-ouro)]"
            aria-hidden
          />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Veio por {parceiro.nome}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {RELACAO[parceiro.tipo] ?? "Parceiro comercial"} · desde{" "}
              <span className="tabular-nums">
                {desde.toLocaleDateString("pt-BR", { timeZone: "UTC" })}
              </span>
              {!parceiro.ativo && " · parceria inativa"}
            </p>
            <p className="mt-2 max-w-prose text-xs text-muted-foreground">
              Guardar de quem veio o cliente muda como a conversa começa: dá para
              agradecer a indicação pelo nome certo e para saber quem mais o
              conhece antes da primeira reunião.
            </p>
          </div>
        </div>

        {podeAbrirFicha && (
          <Link
            href={`/time/parceiros/${parceiro.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--parceiro-borda)] bg-[var(--parceiro-superficie)] px-3 py-1.5 text-xs font-medium text-foreground hover:bg-[var(--parceiro-borda)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
          >
            Abrir ficha do parceiro
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
      </div>
    </section>
  );
}
