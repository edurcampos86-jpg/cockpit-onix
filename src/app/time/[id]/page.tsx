import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Pencil,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Building2,
  Briefcase,
  UserCog,
  Users,
  Archive,
  Cake,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getAuthContext, canManageTeam, isAdmin } from "@/lib/auth-helpers";
import {
  getPessoa,
  labelCargo,
  labelTeamRole,
  labelMotivoSaida,
  pessoaIniciais,
  formatCpf,
  getCarteiraBtg,
  deveTerCodigoBtg,
} from "@/lib/team";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/painel-utils";
import { isEmailCorporativo } from "@/lib/dominios-corporativos";
import { NumerologiaSection } from "../_components/numerologia-section";
import { AcordoComercialSection } from "../_components/acordo-comercial-section";
import { ConviteSection } from "../_components/convite-section";
import { PatSection } from "../_components/pat-section";
import { ReunioesSection } from "../_components/reunioes-section";
import { AlertasBanner } from "../_components/alertas-banner";
import { CompatibilidadeSection } from "../_components/compatibilidade-section";
import { MeuTelefoneForm } from "../_components/meu-telefone-form";

export const metadata = {
  title: "Ficha — Time — Cockpit Onix",
};

export default async function PessoaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  const canManage = canManageTeam(ctx);

  const pessoa = await getPessoa(id);
  if (!pessoa) notFound();

  // Carteira só é consultada quando há código E quem olha pode ver — evita a
  // query para as pessoas sem vínculo com o BTG (imobiliária, corretora).
  const carteira =
    canManage && pessoa.codigoAssessorBtg
      ? await getCarteiraBtg(pessoa.codigoAssessorBtg)
      : null;

  const isArquivado = pessoa.status === "arquivado";
  // Só na PRÓPRIA ficha, e só enquanto a pessoa está ativa.
  const ehMinhaFicha = ctx.pessoa?.id === pessoa.id && !isArquivado;

  return (
    <div className="min-h-screen">
      <PageHeader
        title={pessoa.apelido || pessoa.nomeCompleto}
        description={
          pessoa.cargoTitulo ||
          `${labelCargo(pessoa.cargoFamilia)} • ${pessoa.departamento.nome}`
        }
      >
        <Link
          href="/time"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Time
        </Link>
        {canManage && (
          <Link
            href={`/time/${pessoa.id}/editar`}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Editar
          </Link>
        )}
      </PageHeader>

      <div className="p-8 max-w-5xl space-y-6">
        {/* ── Banner de alertas ── */}
        <AlertasBanner pessoaId={pessoa.id} />

        {/* ── Cabeçalho da ficha ── */}
        <section
          className={cn(
            "rounded-xl border border-border bg-card p-6 flex items-start gap-5",
            isArquivado && "opacity-75"
          )}
        >
          {pessoa.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pessoa.fotoUrl}
              alt={pessoa.nomeCompleto}
              className="h-20 w-20 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="h-20 w-20 rounded-full bg-primary/15 text-primary flex items-center justify-center text-2xl font-bold shrink-0">
              {pessoaIniciais(pessoa.nomeCompleto)}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-foreground">{pessoa.nomeCompleto}</h2>
            {pessoa.apelido && (
              <p className="text-sm text-muted-foreground">conhecido(a) como “{pessoa.apelido}”</p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Badge tone="primary">{labelCargo(pessoa.cargoFamilia)}</Badge>
              {pessoa.cargoTitulo && <Badge>{pessoa.cargoTitulo}</Badge>}
              {pessoa.teamRole !== "colaborador" && (
                <Badge tone="primary">{labelTeamRole(pessoa.teamRole)}</Badge>
              )}
              {isArquivado && <Badge tone="destructive">Arquivado</Badge>}
            </div>
          </div>
        </section>

        {/* ── Identificação ── */}
        <Section title="Identificação" icon={Mail}>
          <Row
            icon={Mail}
            label="Email"
            value={pessoa.email}
            // O e-mail dá o login e some na saída — quando é conta pessoal,
            // nenhuma das duas coisas vale.
            aviso={
              isEmailCorporativo(pessoa.email)
                ? undefined
                : "Conta pessoal — não é revogada na saída"
            }
          />
          {!ehMinhaFicha && (
            <Row
              icon={Phone}
              label="Telefone"
              value={pessoa.telefone || "—"}
              aviso={pessoa.telefone ? undefined : "Sem telefone — não recebe alertas no WhatsApp"}
            />
          )}
          <Row icon={MapPin} label="Cidade" value={pessoa.cidade || "—"} />
          <Row
            icon={Cake}
            label="Nascimento"
            value={
              pessoa.dataNascimento
                ? new Date(pessoa.dataNascimento).toLocaleDateString("pt-BR")
                : "—"
            }
          />
          {canManage && <Row label="CPF" value={formatCpf(pessoa.cpf)} />}
          {/* Self-service: o dono da ficha edita o próprio telefone sem depender
              do admin. É o que viabiliza "cada um preenche o seu" — 17 das 19
              pessoas ativas estão sem número. */}
          {ehMinhaFicha && <MeuTelefoneForm defaultValue={pessoa.telefone} />}
        </Section>

        {/* ── Carteira BTG ──
            Aparece para quem TEM código ou para quem DEVERIA ter (sócio e
            assessor de investimentos). Imobiliária, corretora, qualidade e
            administrativo não têm vínculo com o BTG: para elas a seção não
            existe, porque ausência de código ali é o estado certo, não
            pendência.
            Gated por canManage pelo mesmo motivo do CPF acima — é dado
            financeiro de carteira alheia. */}
        {canManage && (pessoa.codigoAssessorBtg || deveTerCodigoBtg(pessoa.cargoFamilia)) && (
          <Section title="Carteira BTG" icon={Wallet}>
            {!pessoa.codigoAssessorBtg ? (
              // Sem código, TUDO nesta seção fica indisponível — e o motivo
              // precisa estar na tela. Uma seção vazia faria parecer carteira
              // zerada, que é diagnóstico oposto: aqui não se sabe.
              <div className="md:col-span-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <div className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                  Sem código BTG vinculado
                </div>
                <p className="mt-1 text-[11px] text-amber-700/90 dark:text-amber-400/90">
                  Clientes, PL sob gestão, ticket médio e a régua de reunião desta
                  pessoa não podem ser calculados — todos dependem do código do
                  assessor para casar com a base do BTG. Não é carteira vazia: é
                  carteira desconhecida.
                </p>
                {canManage && (
                  <Link
                    href={`/time/${pessoa.id}/editar`}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 dark:text-amber-300 hover:underline"
                  >
                    <Pencil className="h-3 w-3" />
                    Preencher em Cargo &amp; vínculo Onix
                  </Link>
                )}
              </div>
            ) : null}
            {pessoa.codigoAssessorBtg && (
              <Row
                label="Código do assessor"
                value={pessoa.codigoAssessorBtg}
                // Quem atribuiu esta carteira, e quando. Um código errado
                // transfere 141 clientes para a pessoa errada sem nenhum outro
                // sinal na tela.
                aviso={
                  pessoa.codigoAssessorBtgEditadoEm
                    ? `Preenchido em ${new Date(pessoa.codigoAssessorBtgEditadoEm).toLocaleDateString("pt-BR")}${
                        pessoa.codigoAssessorBtgEditadoPor === "seed"
                          ? " pela Base BTG (seed)"
                          : ""
                      }`
                    : undefined
                }
              />
            )}
            {pessoa.codigoAssessorBtg && carteira ? (
              <>
                <Row label="Clientes" value={String(carteira.clientes)} />
                <Row label="PL sob gestão" value={formatBRL(carteira.pl)} />
                <Row label="Ticket médio" value={formatBRL(carteira.ticketMedio)} />
                <Row
                  label="Por classe"
                  value={`A ${carteira.porClasse.A} · B ${carteira.porClasse.B} · C ${carteira.porClasse.C}`}
                />
                <Row
                  label="Sem próxima reunião"
                  value={
                    carteira.semReuniaoAgendada === 0
                      ? "nenhum"
                      : `${carteira.semReuniaoAgendada} de ${carteira.clientes}`
                  }
                />
              </>
            ) : pessoa.codigoAssessorBtg ? (
              // Código preenchido e zero clientes é sinal, não vazio: ou o
              // código está errado, ou a Base BTG ainda não foi importada.
              <Row
                label="Clientes"
                value="Nenhum cliente com esse código — confira o número ou reimporte a Base BTG"
              />
            ) : null}
          </Section>
        )}

        {/* ── Vínculo Onix ── */}
        <Section title="Vínculo Onix" icon={Calendar}>
          <Row
            icon={Calendar}
            label="Entrada"
            value={new Date(pessoa.dataEntrada).toLocaleDateString("pt-BR")}
          />
          {isArquivado && (
            <>
              <Row
                icon={Archive}
                label="Saída"
                value={
                  pessoa.dataSaida
                    ? new Date(pessoa.dataSaida).toLocaleDateString("pt-BR")
                    : "—"
                }
              />
              <Row
                label="Motivo"
                value={labelMotivoSaida(pessoa.motivoSaida)}
              />
            </>
          )}
          <Row
            icon={UserCog}
            label="Nível de acesso"
            value={labelTeamRole(pessoa.teamRole)}
          />
          <Row
            label="Acesso ao Cockpit"
            value={pessoa.user ? "Sim — login ativo" : "Ainda não convidado"}
          />
        </Section>

        {/* ── Hierarquia ── */}
        <Section title="Hierarquia organizacional" icon={Building2}>
          <Row icon={Building2} label="Filial" value={pessoa.filial.nome} />
          <Row
            icon={Briefcase}
            label="Departamento"
            value={pessoa.departamento.nome}
          />
          <Row
            icon={Users}
            label="Equipe"
            value={pessoa.equipe?.nome || "— sem equipe —"}
          />
          <Row
            icon={UserCog}
            label="Reporta a"
            value={
              pessoa.lideradoPor
                ? pessoa.lideradoPor.apelido || pessoa.lideradoPor.nomeCompleto
                : "Eduardo Campos (topo)"
            }
          />
        </Section>

        {/* ── Lidera ── */}
        {pessoa.lidera.length > 0 && (
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Lidera ({pessoa.lidera.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {pessoa.lidera.map((p) => (
                <Link
                  key={p.id}
                  href={`/time/${p.id}`}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background/40 p-3 hover:border-primary/40 hover:bg-card transition-all"
                >
                  {p.fotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.fotoUrl}
                      alt={p.nomeCompleto}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                      {pessoaIniciais(p.nomeCompleto)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.apelido || p.nomeCompleto}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {labelCargo(p.cargoFamilia)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Observações (admin only) ── */}
        {canManage && pessoa.observacoes && (
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-2">
              Observações internas
            </h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {pessoa.observacoes}
            </p>
          </section>
        )}

        {/* ── Acesso ao Cockpit (admin only) ── */}
        {isAdmin(ctx) && (
          <ConviteSection
            pessoaId={pessoa.id}
            pessoaNome={pessoa.apelido || pessoa.nomeCompleto}
          />
        )}

        {/* ── PAT — admin + a própria pessoa (liderança NÃO vê) ── */}
        {(isAdmin(ctx) || ctx.pessoa?.id === pessoa.id) && (
          <PatSection
            pessoaId={pessoa.id}
            modo={isAdmin(ctx) ? "admin" : "propria"}
          />
        )}

        {/* ── Numerologia (admin only) ── */}
        {isAdmin(ctx) && <NumerologiaSection pessoaId={pessoa.id} />}

        {/* ── Acordo comercial — admin sempre vê; pessoa só vê o próprio ── */}
        {(isAdmin(ctx) || ctx.pessoa?.id === pessoa.id) && (
          <AcordoComercialSection
            pessoaId={pessoa.id}
            modo={isAdmin(ctx) ? "admin" : "propria"}
          />
        )}

        {/* ── Reuniões — admin sempre vê; pessoa só vê as que ela participou ── */}
        {(isAdmin(ctx) || ctx.pessoa?.id === pessoa.id) && (
          <ReunioesSection
            pessoaId={pessoa.id}
            modo={isAdmin(ctx) ? "admin" : "propria"}
          />
        )}

        {/* ── Compatibilidade via PAT (admin only) ── */}
        {isAdmin(ctx) && <CompatibilidadeSection pessoaId={pessoa.id} />}
      </div>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-primary" />}
        {title}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">{children}</div>
    </section>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  aviso,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  aviso?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-sm text-foreground truncate">{value}</div>
        {aviso && (
          <div className="text-[11px] text-amber-600 dark:text-amber-400">{aviso}</div>
        )}
      </div>
    </div>
  );
}

function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "primary" | "muted" | "destructive";
}) {
  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded text-[10px] font-medium",
        tone === "primary" && "bg-primary/15 text-primary",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "destructive" && "bg-destructive/15 text-destructive"
      )}
    >
      {children}
    </span>
  );
}
