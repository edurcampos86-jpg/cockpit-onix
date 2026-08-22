import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { requireAdmin } from "@/lib/auth-helpers";
import { criarParceiroForm } from "@/app/actions/parceiros";
import { TIPOS_PARCEIRO } from "@/lib/parceiros/vocabulario";
import { listarPessoasParaVinculo } from "@/lib/parceiros/consultas";

export const metadata = { title: "Novo parceiro — Cockpit Onix" };

/* ──────────────────────────────────────────────────────────────
 * Cadastro em TRÊS PASSOS, contados de fora: abrir → preencher → salvar.
 *
 * Só dois campos são obrigatórios (nome e relação) porque cadastrar parceiro
 * não é o momento de fechar acordo: acordo tem data de vigência própria e
 * costuma vir semanas depois. Pedir percentual aqui obrigaria a inventar um
 * número para poder salvar — e número inventado em campo de comissão não se
 * distingue de número combinado.
 *
 * Server Component puro: sem `useState`, sem hidratação. O erro volta pela
 * querystring (ver `criarParceiroForm`).
 * ────────────────────────────────────────────────────────────── */

const RELACOES: { valor: string; rotulo: string; ajuda: string }[] = [
  {
    valor: "socio",
    rotulo: "Sócio",
    ajuda: "Sócio de uma das empresas do grupo",
  },
  {
    valor: "contabil",
    rotulo: "Contabilidade",
    ajuda: "Escritório contábil que indica clientes",
  },
  {
    valor: "outro",
    rotulo: "Outro",
    ajuda: "Qualquer outra relação — dá para detalhar depois",
  },
];

type SearchParams = Promise<{ erro?: string; nome?: string }>;

export default async function NovoParceiroPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const { erro, nome } = await searchParams;
  const pessoas = await listarPessoasParaVinculo();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cadastrar parceiro"
        description="Dois campos agora; acordo e clientes entram depois, na ficha"
      />

      <div className="px-8 space-y-6">
        <Link
          href="/time/parceiros"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar para parceiros
        </Link>

        {erro && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <span>{erro}</span>
          </div>
        )}

        <form
          action={criarParceiroForm}
          className="max-w-xl space-y-5 rounded-xl border border-[var(--parceiro-borda)] bg-[var(--parceiro-superficie)] p-6"
        >
          {/* ── É alguém do time? ──────────────────────────────────────────
              Vem ANTES do nome de propósito: escolhida a pessoa, o nome é
              herdado dela e o campo abaixo perde a razão de existir. Perguntar
              o nome primeiro convidaria a digitar antes de saber que não
              precisava. */}
          <div className="space-y-1.5">
            <label htmlFor="pessoaId" className="text-sm font-medium text-foreground">
              É alguém do time? <span className="text-muted-foreground">(opcional)</span>
            </label>
            <select
              id="pessoaId"
              name="pessoaId"
              defaultValue=""
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
            >
              <option value="">Não é do time — vou digitar o nome</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id} disabled={p.jaEhParceiro}>
                  {p.nome} · {p.cargo}
                  {p.jaEhParceiro ? " (já é parceiro)" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Escolhendo aqui, o nome vem da ficha do time e e-mail, telefone e
              cargo passam a ser lidos de lá — sem segunda versão da mesma pessoa.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="nome" className="text-sm font-medium text-foreground">
              Nome do parceiro
            </label>
            <input
              id="nome"
              name="nome"
              maxLength={120}
              defaultValue={nome ?? ""}
              autoComplete="off"
              placeholder="Como você chama essa pessoa no dia a dia"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
            />
            <p className="text-xs text-muted-foreground">
              É o nome que vai aparecer na ficha dos clientes que ele trouxer.
              Deixe em branco se escolheu alguém do time acima.
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">
              Relação com a Onix
            </legend>
            <div className="space-y-2">
              {RELACOES.map((r) => (
                <label
                  key={r.valor}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 hover:border-[var(--parceiro-borda)] has-checked:border-[var(--parceiro-ouro)] has-checked:bg-[var(--parceiro-faixa)]"
                >
                  <input
                    type="radio"
                    name="tipo"
                    value={r.valor}
                    required
                    defaultChecked={r.valor === "outro"}
                    className="mt-0.5 size-4 accent-[var(--parceiro-ouro)]"
                  />
                  <span>
                    <span className="block text-sm font-medium text-foreground">
                      {r.rotulo}
                    </span>
                    <span className="block text-xs text-muted-foreground">{r.ajuda}</span>
                  </span>
                </label>
              ))}
            </div>
            {/* A lista é REFERÊNCIA, não trava: `vocabulario.ts` aceita valor
                fora dela de propósito. Se aparecer uma relação nova, ela entra
                no vocabulário — não vira um "outro" sem nome. */}
            <p className="text-xs text-muted-foreground">
              {TIPOS_PARCEIRO.length} relações conhecidas hoje. Aparecendo uma nova,
              a gente acrescenta.
            </p>
          </fieldset>

          <div className="space-y-1.5">
            <label
              htmlFor="contratoAssinadoEm"
              className="text-sm font-medium text-foreground"
            >
              Contrato assinado em <span className="text-muted-foreground">(opcional)</span>
            </label>
            <input
              id="contratoAssinadoEm"
              name="contratoAssinadoEm"
              type="date"
              className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
            />
            <p className="text-xs text-muted-foreground">
              Pode ficar em branco agora e ser preenchido quando o contrato voltar
              assinado.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="rounded-lg border border-[var(--parceiro-borda)] bg-[var(--parceiro-faixa)] px-4 py-2 text-sm font-semibold text-foreground hover:bg-[var(--parceiro-borda)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--parceiro-ouro)]"
            >
              Salvar parceiro
            </button>
            <Link
              href="/time/parceiros"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
