export const dynamic = "force-dynamic";

import Link from "next/link";
import { Handshake, Plus, Search, UserPlus, FileSignature } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { requireLideranca, canManageTeam } from "@/lib/auth-helpers";
import { listarParceiros } from "@/lib/parceiros/consultas";
import { COLUNAS_PARCEIROS } from "@/lib/parceiros/colunas";
import { cn } from "@/lib/utils";

export const metadata = { title: "Parceiros — Cockpit Onix" };

/* ──────────────────────────────────────────────────────────────
 * Lista de Parceiros — quem indica cliente para a Onix sem ser do time.
 *
 * RBAC: `requireLideranca` para VER (a tela leva a acordo de comissão) e
 * `canManageTeam` (admin) para CRIAR. Mesma régua do acordo comercial da
 * Pessoa — ver src/app/time/[id]/page.tsx.
 * ────────────────────────────────────────────────────────────── */

type SearchParams = Promise<{ busca?: string; inativos?: string }>;

const RELACAO: Record<string, string> = {
  socio: "Sócio",
  contabil: "Contabilidade",
  outro: "Outro",
};

function labelRelacao(tipo: string): string {
  return RELACAO[tipo] ?? tipo.replace(/_/g, " ");
}

function formatarData(d: Date | null): string {
  return d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
}

export default async function ParceirosPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireLideranca();
  const podeGerenciar = canManageTeam(ctx);
  const params = await searchParams;

  const busca = params.busca?.trim() || undefined;
  const incluirInativos = params.inativos === "1";
  const parceiros = await listarParceiros({ busca, incluirInativos });

  const buscando = Boolean(busca);
  const vazio = parceiros.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parceiros"
        description="Quem indica clientes para a Onix sem fazer parte do time"
      >
        {podeGerenciar && (
          <Link
            href="/time/parceiros/novo"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--parceiro-borda)] bg-[var(--parceiro-faixa)] px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-[var(--parceiro-borda)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
          >
            <Plus className="h-4 w-4 text-[var(--parceiro-ouro)]" aria-hidden />
            Cadastrar parceiro
          </Link>
        )}
      </PageHeader>

      <div className="px-8 space-y-6">
        {/* Busca — form GET: o estado da tela mora na URL, então é
            compartilhável e sobrevive a recarregar a página. */}
        <form className="flex flex-wrap items-center gap-3" role="search">
          <div className="relative flex-1 min-w-[16rem]">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              name="busca"
              defaultValue={busca ?? ""}
              placeholder="Buscar por nome"
              aria-label="Buscar parceiro por nome"
              className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              name="inativos"
              value="1"
              defaultChecked={incluirInativos}
              className="size-4 accent-[var(--parceiro-ouro)]"
            />
            Mostrar inativos
          </label>
          <button
            type="submit"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
          >
            Filtrar
          </button>
        </form>

        {vazio ? (
          <EstadoVazio buscando={buscando} podeGerenciar={podeGerenciar} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--parceiro-borda)] bg-[var(--parceiro-superficie)]">
            <table className="w-full text-sm">
              {/* Todas as colunas entram aqui, inclusive as invisíveis: é o
                  colgroup que RESERVA a largura da comissão. Ligar a coluna
                  depois não empurra nenhuma outra de lugar. */}
              <colgroup>
                {COLUNAS_PARCEIROS.map((c) => (
                  <col
                    key={c.chave}
                    data-coluna={c.chave}
                    data-reservada={c.visivel ? undefined : "1"}
                    style={c.largura === "auto" ? undefined : { width: c.largura }}
                  />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-[var(--parceiro-borda)] bg-[var(--parceiro-faixa)]">
                  {COLUNAS_PARCEIROS.map((c) => (
                    <th
                      key={c.chave}
                      scope="col"
                      // Coluna reservada sai INTEIRA da árvore de acessibilidade
                      // — cabeçalho e célula. Anunciar um cabeçalho cuja célula
                      // está escondida daria 6 colunas no head e 5 no corpo para
                      // quem navega por leitor de tela.
                      aria-hidden={c.visivel ? undefined : true}
                      className={cn(
                        "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-foreground",
                        c.alinhamento === "direita" ? "text-right" : "text-left",
                      )}
                    >
                      {/* Coluna reservada não anuncia rótulo — nem visualmente
                          nem para leitor de tela. Ela só guarda o espaço. */}
                      {c.visivel ? c.rotulo : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parceiros.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-border/60 last:border-0 hover:bg-[var(--parceiro-faixa)]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/time/parceiros/${p.id}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
                      >
                        {p.nome}
                      </Link>
                      {!p.ativo && (
                        <span className="ml-2 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {labelRelacao(p.tipo)}
                    </td>
                    <td className="px-4 py-3">
                      {p.contratoAssinadoEm ? (
                        <span className="inline-flex items-center gap-1.5 text-foreground">
                          <FileSignature
                            className="h-3.5 w-3.5 text-[var(--parceiro-ouro)]"
                            aria-hidden
                          />
                          {formatarData(p.contratoAssinadoEm)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Sem contrato</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {p.clientesVigentes}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-foreground">
                      {p.acordosVigentes}
                    </td>
                    {/* Coluna reservada: sem conteúdo, com o espaço garantido
                        pelo colgroup. Ver src/lib/parceiros/colunas.ts. */}
                    <td className="px-4 py-3" aria-hidden />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Estado vazio ─────────────────────────────────────────────────────────
 * Dois vazios diferentes, e tratá-los igual seria o erro: "nada encontrado
 * para esta busca" é um beco sem saída se a tela mandar cadastrar, e "nenhum
 * parceiro ainda" é a primeira vez de alguém no módulo — é onde a tela
 * explica o que é um parceiro.
 * ──────────────────────────────────────────────────────────────────────── */

function EstadoVazio({
  buscando,
  podeGerenciar,
}: {
  buscando: boolean;
  podeGerenciar: boolean;
}) {
  if (buscando) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--parceiro-borda)] bg-[var(--parceiro-faixa)] p-10 text-center">
        <Search className="mx-auto h-6 w-6 text-[var(--parceiro-ouro)]" aria-hidden />
        <p className="mt-3 text-base font-medium text-foreground">
          Nenhum parceiro com esse nome
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Confira a grafia ou marque “Mostrar inativos” — parceiros arquivados
          ficam fora da lista por padrão.
        </p>
        <Link
          href="/time/parceiros"
          className="mt-4 inline-block rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
        >
          Limpar busca
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-[var(--parceiro-borda)] bg-[var(--parceiro-faixa)] p-10 text-center">
      <Handshake className="mx-auto h-7 w-7 text-[var(--parceiro-ouro)]" aria-hidden />
      <h2 className="mt-3 text-lg font-semibold text-foreground">
        Nenhum parceiro cadastrado ainda
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
        Parceiro é quem traz cliente para a Onix sem fazer parte do time — o
        contador que indica a família, o sócio de outra empresa do grupo. Aqui
        ficam a relação com a casa, os clientes que vieram por ele e o acordo de
        cada produto.
      </p>
      {podeGerenciar && (
        <Link
          href="/time/parceiros/novo"
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[var(--parceiro-borda)] bg-[var(--parceiro-superficie)] px-4 py-2 text-sm font-medium text-foreground hover:bg-[var(--parceiro-borda)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
        >
          <UserPlus className="h-4 w-4 text-[var(--parceiro-ouro)]" aria-hidden />
          Cadastrar o primeiro
        </Link>
      )}
    </div>
  );
}
