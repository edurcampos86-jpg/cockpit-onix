import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { Plus, Search, Users, Building2, Briefcase, Archive } from "lucide-react";
import { getAuthContext, canManageTeam } from "@/lib/auth-helpers";
import {
  listPessoas,
  listFiliais,
  listDepartamentos,
  getTimeStats,
  labelCargo,
  labelTeamRole,
  pessoaIniciais,
  type PessoaStatusValue,
} from "@/lib/team";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Time — Cockpit Onix",
};

type SearchParams = Promise<{
  status?: string;
  filial?: string;
  departamento?: string;
  busca?: string;
}>;

export default async function TimePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const ctx = await getAuthContext();
  const canManage = canManageTeam(ctx);

  const status = (params.status as PessoaStatusValue | "todos") || "ativo";
  const filialId = params.filial || undefined;
  const departamentoId = params.departamento || undefined;
  const busca = params.busca || undefined;

  const [pessoas, filiais, departamentos, stats] = await Promise.all([
    listPessoas({ status, filialId, departamentoId, busca }),
    listFiliais(),
    listDepartamentos(),
    getTimeStats(),
  ]);

  const filialNomeById = Object.fromEntries(filiais.map((f) => [f.id, f.nome]));
  const departamentoNomeById = Object.fromEntries(
    departamentos.map((d) => [d.id, d.nome])
  );

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Time"
        description="Pessoas que constroem a Onix — perfil, hierarquia, acordos e reuniões"
      >
        {canManage ? (
          <Link
            href="/time/nova"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nova pessoa
          </Link>
        ) : null}
      </PageHeader>

      <div className="p-8 space-y-6 max-w-7xl">
        <ComoFunciona
          proposito="Central única de pessoas do time da Onix. Cada pessoa tem perfil de identificação, cargo, hierarquia e — em fases futuras — PAT, numerologia, acordo comercial e timeline de reuniões."
          comoUsar="Use os filtros para ver por filial, departamento ou status. Clique numa pessoa para abrir a ficha completa. Apenas admin cria, edita e arquiva."
          comoAjuda="Tira decisões sobre pessoas do achismo: quem está sob qual liderança, quem entrou quando, com que perfil, com qual acordo. Memória institucional do time."
        />

        {/* ── Estatísticas ── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <StatCard
            icon={Users}
            label="Ativos"
            value={stats.ativos}
            tone="primary"
          />
          <StatCard
            icon={Archive}
            label="Arquivados"
            value={stats.arquivados}
            tone="muted"
          />
          <StatCard
            icon={Building2}
            label="Filiais"
            value={filiais.length}
            tone="muted"
          />
          <StatCard
            icon={Briefcase}
            label="Departamentos"
            value={departamentos.length}
            tone="muted"
          />
        </div>

        {/* ── Filtros ── */}
        <form
          method="get"
          className="rounded-xl border border-border bg-card p-4 grid grid-cols-1 md:grid-cols-12 gap-3"
        >
          <div className="md:col-span-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              name="busca"
              defaultValue={busca}
              placeholder="Buscar por nome, apelido, email ou CPF…"
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <select
            name="status"
            defaultValue={status}
            className="md:col-span-2 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="ativo">Ativos</option>
            <option value="arquivado">Arquivados</option>
            <option value="todos">Todos</option>
          </select>

          <select
            name="filial"
            defaultValue={filialId ?? ""}
            className="md:col-span-3 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Todas as filiais</option>
            {filiais.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
                {f.isMatriz ? " (matriz)" : ""}
              </option>
            ))}
          </select>

          <select
            name="departamento"
            defaultValue={departamentoId ?? ""}
            className="md:col-span-2 px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Todos os deptos</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>

          <button
            type="submit"
            className="md:col-span-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Filtrar
          </button>
        </form>

        {/* ── Listagem ── */}
        {pessoas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-12 text-center">
            <Users className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhuma pessoa encontrada com os filtros atuais.
            </p>
            {canManage && (
              <Link
                href="/time/nova"
                className="inline-flex items-center gap-2 mt-4 text-sm text-primary hover:underline"
              >
                <Plus className="h-4 w-4" />
                Cadastrar a primeira pessoa
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pessoas.map((p) => {
              const isArquivado = p.status === "arquivado";
              return (
                <Link
                  key={p.id}
                  href={`/time/${p.id}`}
                  className={cn(
                    "rounded-xl border border-border bg-card p-4 hover:border-primary/40 hover:bg-card/80 transition-all",
                    isArquivado && "opacity-60"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {p.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.fotoUrl}
                        alt={p.nomeCompleto}
                        className="h-12 w-12 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                        {pessoaIniciais(p.nomeCompleto)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold text-foreground truncate">
                        {p.apelido || p.nomeCompleto}
                      </h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {labelCargo(p.cargoFamilia)}
                        {p.cargoTitulo ? ` • ${p.cargoTitulo}` : ""}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[10px]">
                        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {filialNomeById[p.filialId] ?? "—"}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {departamentoNomeById[p.departamentoId] ?? "—"}
                        </span>
                        {p.teamRole !== "colaborador" && (
                          <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">
                            {labelTeamRole(p.teamRole)}
                          </span>
                        )}
                        {isArquivado && (
                          <span className="px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-medium">
                            Arquivado
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "primary" | "muted";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      <div
        className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
          tone === "primary" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground leading-none">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </div>
    </div>
  );
}
