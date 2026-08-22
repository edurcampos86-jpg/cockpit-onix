import Link from "next/link";
import { Users, Search, UserMinus, History, ExternalLink } from "lucide-react";
import { vincularClienteForm, desvincularClienteForm } from "@/app/actions/parceiros";
import { buscarClientesParaVincular } from "@/lib/parceiros/consultas";
import { ConfirmarAcao } from "./confirmar-acao";

/* ──────────────────────────────────────────────────────────────
 * Clientes que vieram por este parceiro.
 *
 * A busca é um form GET que devolve para a própria ficha (`?buscaCliente=`):
 * sem estado no cliente, sem hidratação, e o resultado é uma URL que se
 * compartilha. Cada candidato já mostra se JÁ TEM parceiro — a #310 recusaria
 * o vínculo de qualquer jeito, mas aqui a pessoa lê o nome de quem tem o
 * cliente antes de clicar, em vez de um erro depois.
 * ────────────────────────────────────────────────────────────── */

type Vinculo = {
  id: string;
  dataInicio: Date;
  dataFim: Date | null;
  cliente: { id: string; nome: string; numeroConta: string; saldo: number };
};

function dataBr(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

/** Sem "AUM": na tela é o que o cliente tem na Onix, escrito assim. */
function reais(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export async function ClientesSection({
  parceiroId,
  parceiroNome,
  vinculos,
  podeGerenciar,
  buscaCliente,
}: {
  parceiroId: string;
  parceiroNome: string;
  vinculos: Vinculo[];
  podeGerenciar: boolean;
  buscaCliente?: string;
}) {
  const vigentes = vinculos.filter((v) => v.dataFim === null);
  const encerrados = vinculos.filter((v) => v.dataFim !== null);
  const total = vigentes.reduce((s, v) => s + v.cliente.saldo, 0);

  const candidatos =
    podeGerenciar && buscaCliente ? await buscarClientesParaVincular(buscaCliente) : [];
  const buscou = Boolean(buscaCliente && buscaCliente.trim().length >= 3);

  return (
    <section className="rounded-xl border border-[var(--parceiro-borda)] bg-[var(--parceiro-superficie)] p-6">
      <header className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--parceiro-ouro)]" aria-hidden />
          <h2 className="text-sm font-semibold text-foreground">
            Clientes que vieram por {parceiroNome}
          </h2>
        </div>
        {vigentes.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {vigentes.length} cliente(s) ·{" "}
            <strong className="tabular-nums text-foreground">{reais(total)}</strong> na Onix
          </span>
        )}
      </header>
      <p className="mb-4 text-xs text-muted-foreground">
        Cada cliente tem um parceiro de cada vez. Trocar exige encerrar o vínculo
        atual antes — assim o período de cada um fica registrado, e o que já foi
        apurado não muda de dono depois.
      </p>

      {vigentes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background/40 p-6 text-center">
          <p className="text-sm font-medium text-foreground">
            Nenhum cliente vinculado ainda
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {podeGerenciar
              ? "Busque abaixo pelo nome ou pelo número da conta para trazer o primeiro."
              : "Quando houver clientes vinculados, eles aparecem aqui."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {vigentes.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/empresas/investimentos/clientes/${v.cliente.id}`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
                >
                  {v.cliente.nome}
                  <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden />
                </Link>
                <p className="text-xs text-muted-foreground">
                  Conta {v.cliente.numeroConta} · desde {dataBr(v.dataInicio)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm tabular-nums text-muted-foreground">
                  {reais(v.cliente.saldo)}
                </span>
                {podeGerenciar && (
                  <ConfirmarAcao
                    titulo={`Encerrar o vínculo com ${v.cliente.nome}?`}
                    consequencia={`O cliente deixa de contar como trazido por ${parceiroNome} a partir de hoje. O período que já passou continua registrado, e a ficha do cliente para de mostrar o nome dele. Dá para vincular a outro parceiro depois.`}
                    rotuloGatilho="Encerrar"
                    rotuloConfirmar="Encerrar vínculo"
                    action={desvincularClienteForm}
                    campos={{ parceiroId, vinculoId: v.id, clienteId: v.cliente.id }}
                    destrutivo
                    iconeGatilho={<UserMinus className="h-3.5 w-3.5" aria-hidden />}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {podeGerenciar && (
        <div className="mt-4 rounded-lg border border-border bg-card p-4">
          <form className="flex flex-wrap items-end gap-3" role="search">
            <div className="space-y-1.5">
              <label
                htmlFor="buscaCliente"
                className="block text-xs font-medium text-muted-foreground"
              >
                Vincular cliente
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  id="buscaCliente"
                  name="buscaCliente"
                  type="search"
                  defaultValue={buscaCliente ?? ""}
                  placeholder="Nome ou número da conta"
                  className="w-72 rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
                />
              </div>
            </div>
            <button
              type="submit"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
            >
              Buscar
            </button>
            <span className="text-xs text-muted-foreground">Mínimo de 3 letras.</span>
          </form>

          {buscou && candidatos.length === 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Nenhum cliente encontrado com “{buscaCliente}”. O cadastro do cliente
              vem da base do backoffice — esta tela não cria cliente.
            </p>
          )}

          {candidatos.length > 0 && (
            <ul className="mt-3 space-y-2">
              {candidatos.map((c) => {
                const ocupado = c.parceiroAtual !== null && c.parceiroAtual !== parceiroNome;
                const jaEhDaqui = c.parceiroAtual === parceiroNome;
                return (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        Conta {c.numeroConta} · {reais(c.saldo)}
                        {ocupado && (
                          <>
                            {" · "}
                            <span className="text-foreground">
                              já está com {c.parceiroAtual}
                            </span>
                          </>
                        )}
                        {jaEhDaqui && " · já vinculado aqui"}
                      </p>
                    </div>
                    {/* Candidato indisponível não vira um traço mudo: a linha
                        diz o que fazer para ele ficar disponível. */}
                    {ocupado ? (
                      <span className="text-xs text-muted-foreground">
                        Encerre o vínculo com {c.parceiroAtual} primeiro
                      </span>
                    ) : jaEhDaqui ? (
                      <span className="text-xs text-muted-foreground">
                        Já está na lista acima
                      </span>
                    ) : (
                      <form action={vincularClienteForm}>
                        <input type="hidden" name="parceiroId" value={parceiroId} />
                        <input type="hidden" name="clienteId" value={c.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-[var(--parceiro-borda)] bg-[var(--parceiro-faixa)] px-3 py-1.5 text-xs font-medium text-foreground hover:bg-[var(--parceiro-borda)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
                        >
                          Vincular
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {encerrados.length > 0 && (
        <details className="mt-4">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
            <History className="h-3.5 w-3.5" aria-hidden />
            Vínculos encerrados ({encerrados.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {encerrados.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-4 py-2.5 text-sm text-muted-foreground"
              >
                <span>{v.cliente.nome}</span>
                <span className="tabular-nums">
                  {dataBr(v.dataInicio)} a {v.dataFim ? dataBr(v.dataFim) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
