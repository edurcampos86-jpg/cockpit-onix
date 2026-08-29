export const dynamic = "force-dynamic";

import Link from "next/link";
import { Upload, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { prisma } from "@/lib/prisma";
import {
  montarSerie,
  motivoDoMesVazio,
  fraseDoMotivo,
  diasDesde,
  type LinhaCompetencia,
  type ExecucaoSync,
} from "@/lib/financeiro/serie-competencia";

/**
 * A aba "Receita" da Onix Capital ABRE A LEITURA.
 *
 * ── O QUE ELA ERA, E POR QUE ISSO ERA UM DEFEITO ─────────────────────────
 * Até agosto de 2026 esta rota era o formulário de IMPORTAÇÃO: clicar em
 * "Receita" abria uma área de arrastar planilha. A única empresa do grupo com
 * dado financeiro real era a única cuja aba de receita não mostrava receita
 * nenhuma — pedir o extrato e receber o formulário de depósito.
 *
 * A importação não sumiu; virou botão, em `receita/importar`.
 *
 * ── DE ONDE VEM O NÚMERO ─────────────────────────────────────────────────
 * `ComissaoMensalCliente` — a comissão do BTG por cliente e por competência,
 * gravada pelo `btg-enrich` desde a #408 e, até esta tela, **lida por
 * ninguém**. É a receita real da Onix Capital.
 *
 * NÃO vem de `ClienteBackoffice.receitaAnual`, que é a renda DECLARADA do
 * cliente e somava R$ 10,5 bilhões em 2.706 clientes — a confusão que a #414
 * e a #421 desfizeram. E não vem de `ReceitaItem`, que está vazia.
 *
 * ── SOMA EM SQL, NÃO EM JS ───────────────────────────────────────────────
 * `sum()` no Postgres sobre `DECIMAL(14,2)` devolve NUMERIC exato. Trazer as
 * linhas e somar em JavaScript passaria por `float64` — e o erro apareceria
 * justamente no total, que é o número que alguém lê. É a mesma razão pela
 * qual a coluna é `Decimal` e não `Float`.
 */

const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const mesLegivel = (competencia: string) => {
  const [ano, mes] = competencia.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(mes) - 1]}/${ano.slice(2)}`;
};

/** Competência de hoje, em `"AAAA-MM"` e em UTC — o mesmo relógio do banco. */
function competenciaDeHoje(): string {
  const agora = new Date();
  return `${agora.getUTCFullYear()}-${String(agora.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function ReceitaCapitalPage() {
  let linhas: LinhaCompetencia[] = [];
  let execucoes: ExecucaoSync[] = [];
  let ultimaColeta: Date | null = null;
  let falhou = false;

  try {
    const cru = await prisma.$queryRaw<Array<{ competencia: string; valor: unknown; clientes: bigint }>>`
      SELECT "competencia",
             sum("comissao")            AS valor,
             count(DISTINCT "clienteId") AS clientes
      FROM "ComissaoMensalCliente"
      GROUP BY "competencia"
      ORDER BY "competencia"
    `;
    linhas = cru.map((l) => ({
      competencia: l.competencia,
      valor: Number(l.valor ?? 0),
      clientes: Number(l.clientes),
    }));

    /* AS EXECUÇÕES DA SINCRONIZAÇÃO — é o que transforma "sem dado" numa
     * frase. `tipo = 'enrich'` é a rotina que grava comissão; as outras
     * (import, movements, balances) não escrevem em `ComissaoMensalCliente` e
     * incluí-las diria que rodou quando nada de comissão rodou.
     *
     * A competência sai do `iniciado` em UTC, o mesmo fuso em que a
     * competência foi gravada. */
    const sync = await prisma.$queryRaw<Array<{ competencia: string; sucesso: boolean }>>`
      SELECT to_char("iniciado" AT TIME ZONE 'UTC', 'YYYY-MM') AS competencia,
             "sucesso"
      FROM "BtgSyncLog"
      WHERE "tipo" = 'enrich'
        AND "iniciado" >= (now() - interval '13 months')
    `;
    execucoes = sync.map((e) => ({ competencia: e.competencia, sucesso: e.sucesso }));

    const [ultima] = await prisma.$queryRaw<Array<{ quando: Date | null }>>`
      SELECT max("iniciado") AS quando
      FROM "BtgSyncLog"
      WHERE "tipo" = 'enrich' AND "sucesso" = true
    `;
    ultimaColeta = ultima?.quando ?? null;
  } catch {
    /* Banco fora do ar não pode virar "receita zero" na tela — é a mesma
     * distinção entre ausência de resposta e resposta zero que o
     * `contagem-tabelas.ts` carimba. A tela diz que não conseguiu perguntar. */
    falhou = true;
  }

  const hoje = competenciaDeHoje();
  const serie = montarSerie(linhas, hoje, 12);
  const maior = Math.max(1, ...serie.meses.map((m) => m.valor));
  const diasSemColeta = diasDesde(ultimaColeta, new Date());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receita — Onix Capital"
        description="Comissão do BTG por mês, como ela chega na sincronização diária"
      />

      <div className="px-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Últimos 12 meses, até {mesLegivel(competenciaDeHoje())}.
          </p>
          <Link
            href="/empresas/investimentos/receita/importar"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <Upload className="h-4 w-4" />
            Importar relatório
          </Link>
        </div>

        {falhou ? (
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-6">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Não consegui perguntar ao banco.</p>
              <p className="text-sm text-muted-foreground">
                Isto não quer dizer que a receita seja zero — quer dizer que não há resposta.
                Recarregue em instantes.
              </p>
            </div>
          </div>
        ) : serie.mesesComDado === 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-6">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Nenhum mês com comissão registrada.</p>
              <p className="text-sm text-muted-foreground">
                A comissão chega pela sincronização do BTG, que grava um valor por cliente e por
                mês. Nenhum dos últimos 12 meses tem linha — ou a sincronização ainda não rodou,
                ou rodou e não trouxe comissão.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Total em 12 meses
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{moeda(serie.total)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Soma dos {serie.mesesComDado} meses com dado — os meses sem dado não entram
                  como zero.
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Último mês com dado
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">
                  {serie.ultimaComDado ? mesLegivel(serie.ultimaComDado) : "—"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {moeda(serie.meses.find((m) => m.competencia === serie.ultimaComDado)?.valor ?? 0)}
                </p>
              </div>
              {/* A ÚLTIMA COLETA, e não a contagem de buracos.
                *
                * A comissão está gravada por cliente e por mês desde a #408 e
                * nenhuma tela lia até a #430. Se a sincronização parar, ninguém
                * percebe: não há alarme, só uma tabela que deixa de crescer.
                * É dividendo que cai na conta sem aviso — e deixa de cair sem
                * aviso também.
                *
                * `null` é ausência de resposta, não "hoje": quando nunca houve
                * coleta bem-sucedida, o card DIZ isso em vez de mostrar 0. */}
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Última coleta do BTG
                </p>
                <p
                  className={`mt-1 text-2xl font-semibold tabular-nums ${
                    diasSemColeta !== null && diasSemColeta > 2 ? "text-amber-600" : ""
                  }`}
                >
                  {diasSemColeta === null
                    ? "nunca"
                    : diasSemColeta === 0
                      ? "hoje"
                      : `há ${diasSemColeta} ${diasSemColeta === 1 ? "dia" : "dias"}`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {diasSemColeta === null
                    ? "Nenhuma sincronização de comissão bem-sucedida registrada."
                    : `${serie.meses.length - serie.mesesComDado} dos 12 meses sem dado.`}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Mês</th>
                    <th className="px-4 py-3 text-right font-medium">Comissão</th>
                    <th className="px-4 py-3 text-right font-medium">Clientes</th>
                    <th className="px-4 py-3 text-right font-medium">vs. mês anterior</th>
                    <th className="w-40 px-4 py-3 font-medium">&nbsp;</th>
                  </tr>
                </thead>
                <tbody>
                  {serie.meses.map((m) => (
                    <tr key={m.competencia} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5 font-medium">{mesLegivel(m.competencia)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {m.presente ? (
                          moeda(m.valor)
                        ) : (
                          /* O motivo, e não só o buraco. Quem abre em janeiro e
                           * vê dezembro vazio não sabe se o BTG não mandou ou se
                           * a sincronização caiu — é linha em branco no extrato:
                           * o susto não é o valor, é não saber o que houve. */
                          <span className="text-muted-foreground">
                            {fraseDoMotivo(motivoDoMesVazio(m.competencia, execucoes, hoje))}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {m.presente ? m.clientes : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {m.variacao === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={m.variacao >= 0 ? "text-emerald-600" : "text-rose-600"}>
                            {m.variacao >= 0 ? "+" : ""}
                            {(m.variacao * 100).toFixed(1)}%
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {m.presente ? (
                          <div className="h-2 rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full bg-foreground/70"
                              style={{ width: `${Math.round((m.valor / maior) * 100)}%` }}
                            />
                          </div>
                        ) : (
                          <div className="h-2 rounded-full border border-dashed border-border" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              A barra tracejada marca mês sem coleta, e a coluna do valor diz o motivo:
              “sincronização não rodou” é falha de agendamento, “sincronização falhou” é erro a
              investigar, e <strong>“sincronizou, sem comissão” é fato do negócio, não defeito</strong>.
              Um mês ausente não vira base de comparação para o seguinte — senão a tela mostraria
              alta de 100% logo depois de uma falha.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
