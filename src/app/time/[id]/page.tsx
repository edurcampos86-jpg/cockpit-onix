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
} from "@/lib/team";
import { cn } from "@/lib/utils";
import { NumerologiaSection } from "../_components/numerologia-section";
import { AcordoComercialSection } from "../_components/acordo-comercial-section";
import { ConviteSection } from "../_components/convite-section";

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

  const isArquivado = pessoa.status === "arquivado";

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
          <Row icon={Mail} label="Email" value={pessoa.email} />
          <Row icon={Phone} label="Telefone" value={pessoa.telefone || "—"} />
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
        </Section>

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

        {/* ── Numerologia (admin only) ── */}
        {isAdmin(ctx) && <NumerologiaSection pessoaId={pessoa.id} />}

        {/* ── Acordo comercial — admin sempre vê; pessoa só vê o próprio ── */}
        {(isAdmin(ctx) || ctx.pessoa?.id === pessoa.id) && (
          <AcordoComercialSection
            pessoaId={pessoa.id}
            modo={isAdmin(ctx) ? "admin" : "propria"}
          />
        )}

        {/* ── Próximas fases (placeholders) ── */}
        <section className="rounded-xl border border-dashed border-border bg-card/40 p-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">
            Em fases futuras nesta ficha
          </h2>
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
            <li>PAT (perfil comportamental Criativa Humana) com histórico — Fase 3</li>
            <li>Timeline de reuniões 1:1 com extração IA de resumo + próximos passos — Fase 4</li>
          </ul>
        </section>
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
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-sm text-foreground truncate">{value}</div>
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
