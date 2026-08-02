import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import {
  Plus,
  Search,
  Users,
  Building2,
  Briefcase,
  Archive,
  AlertTriangle,
} from "lucide-react";
import { getAuthContext, canManageTeam } from "@/lib/auth-helpers";
import {
  listPessoas,
  listFiliais,
  listDepartamentos,
  getTimeStats,
  getCadenciaReuniaoPorAssessor,
  contarPendenciasCadastro,
  pendenciasDe,
  casaPendencia,
  isTipoPendencia,
  TIPOS_PENDENCIA,
  type TipoPendencia,
  labelCargo,
  labelTeamRole,
  pessoaIniciais,
  type PessoaStatusValue,
  type CadenciaCarteira,
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
  pendencia?: string;
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
  // `pendencia` aceita "1" (todas) ou um tipo específico. Valor desconhecido
  // vira "sem filtro" em vez de lista vazia — URL torta não deve parecer
  // "nenhuma pendência".
  const tipoPendencia: TipoPendencia | undefined = isTipoPendencia(params.pendencia)
    ? params.pendencia
    : undefined;

  const [todasPessoas, filiais, departamentos, stats, totalPendencias] = await Promise.all([
    listPessoas({ status, filialId, departamentoId, busca }),
    listFiliais(),
    listDepartamentos(),
    getTimeStats(),
    contarPendenciasCadastro(),
  ]);

  // Filtro em memória: `emailPessoal` depende de casar domínio, o que não se
  // expressa em SQL. Como a lista já vem recortada pelos outros filtros, o
  // custo é percorrer dezenas de linhas.
  const pessoas = tipoPendencia
    ? todasPessoas.filter((p) => casaPendencia(p, tipoPendencia))
    : todasPessoas;

  // Depende de `pessoas` (precisa dos códigos), por isso fora do Promise.all.
  // Uma query só para a listagem inteira — nunca uma por card.
  const cadenciaPorAssessor: Map<string, CadenciaCarteira> = canManage
    ? await getCadenciaReuniaoPorAssessor(pessoas.map((p) => p.codigoAssessorBtg))
    : new Map();

  // Ordenar por RISCO, não por nome: o card já mostra o número da régua, mas
  // com 16 assessores misturados a quem não tem carteira, quem está fora do
  // teto some no meio da grade. `sort` do JS é estável desde o ES2019, então
  // quem tem o mesmo risco preserva a ordem que veio do banco (status, nome).
  //
  // Sem canManage o mapa está vazio: todo mundo pontua 0 e a ordem alfabética
  // fica intacta.
  const pessoasOrdenadas = [...pessoas].sort((a, b) => {
    const ca = a.codigoAssessorBtg ? cadenciaPorAssessor.get(a.codigoAssessorBtg) : undefined;
    const cb = b.codigoAssessorBtg ? cadenciaPorAssessor.get(b.codigoAssessorBtg) : undefined;
    return (cb?.risco ?? 0) - (ca?.risco ?? 0) || (cb?.atencao ?? 0) - (ca?.atencao ?? 0);
  });
  const ordenadoPorRisco = pessoasOrdenadas.some((p) => {
    const c = p.codigoAssessorBtg ? cadenciaPorAssessor.get(p.codigoAssessorBtg) : undefined;
    return (c?.risco ?? 0) > 0 || (c?.atencao ?? 0) > 0;
  });

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
          {canManage ? (
            // Substitui "Departamentos" (número estático, que o Eduardo sabe de
            // cor) por um indicador que MUDA e cobra ação. Só para quem pode
            // editar — quem não pode não tem o que fazer com ele.
            <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
              <div
                className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                  totalPendencias.total > 0
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                )}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold text-foreground leading-none">
                  {totalPendencias.total}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {totalPendencias.total === 1
                    ? "Pendência de cadastro"
                    : "Pendências de cadastro"}
                </div>
                {totalPendencias.total > 0 && (
                  // Cada tipo é um LINK, não texto: com 17 telefones e 12
                  // códigos misturados, uma fila só não é fila, é ruído. Três
                  // filas separadas dão por onde começar e onde parar.
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] mt-1">
                    {[
                      { n: totalPendencias.semCodigoBtg, tipo: "codigo", label: "sem código BTG" },
                      { n: totalPendencias.semTelefone, tipo: "telefone", label: "sem telefone" },
                      { n: totalPendencias.emailPessoal, tipo: "email", label: "e-mail pessoal" },
                    ]
                      .filter((f) => f.n > 0)
                      .map((f) => (
                        <Link
                          key={f.tipo}
                          href={`/time?pendencia=${f.tipo}`}
                          className={cn(
                            "hover:underline",
                            tipoPendencia === f.tipo
                              ? "font-semibold text-amber-700 dark:text-amber-400"
                              : "text-muted-foreground/80"
                          )}
                        >
                          {f.n} {f.label}
                        </Link>
                      ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <StatCard
              icon={Briefcase}
              label="Departamentos"
              value={departamentos.length}
              tone="muted"
            />
          )}
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

          {canManage && (
            // Os outros filtros recortam por ORGANOGRAMA; este recorta por
            // TRABALHO A FAZER — e por QUAL trabalho, já que os três tipos de
            // pendência se resolvem de formas diferentes.
            <label className="md:col-span-12 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              Pendência de cadastro:
              <select
                name="pendencia"
                defaultValue={tipoPendencia ?? ""}
                className="px-3 py-1.5 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">qualquer (sem filtrar)</option>
                {TIPOS_PENDENCIA.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          )}
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
          <>
            {/* A ordem muda sozinha quando há carteira fora do teto. Sem esta
                linha, "por que o Fulano subiu?" não tem resposta na tela. */}
            {ordenadoPorRisco && (
              <p className="text-xs text-muted-foreground -mb-2">
                Ordenado por risco de cadência — carteiras com cliente fora do teto de
                reunião primeiro.
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pessoasOrdenadas.map((p) => {
              const isArquivado = p.status === "arquivado";
              // Uma regra só para os três badges, o contador e o filtro — se
              // divergirem, o número do topo deixa de bater com a lista.
              const pend = pendenciasDe(p);
              const cadencia = p.codigoAssessorBtg
                ? cadenciaPorAssessor.get(p.codigoAssessorBtg)
                : undefined;
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
                        {cadencia && cadencia.clientes > 0 && !isArquivado && (
                          // A régua de reunião por ASSESSOR: quem está
                          // deixando a própria carteira envelhecer. O mesmo
                          // cálculo que a tabela de clientes faz por cliente
                          // (cadencia-core), somado por carteira.
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded font-medium",
                              cadencia.risco > 0
                                ? "bg-destructive/15 text-destructive"
                                : cadencia.atencao > 0
                                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                  : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            )}
                            title={
                              `${cadencia.clientes} clientes · ${cadencia.risco} em risco · ` +
                              `${cadencia.atencao} em atenção · ${cadencia.ok} no prazo ` +
                              `(régua: A 90d · B 120d · C 180d, contada da última reunião)`
                            }
                          >
                            {cadencia.risco > 0
                              ? `${cadencia.risco} de ${cadencia.clientes} em risco`
                              : cadencia.atencao > 0
                                ? `${cadencia.atencao} de ${cadencia.clientes} em atenção`
                                : `carteira em dia (${cadencia.clientes})`}
                          </span>
                        )}
                        {p.codigoAssessorBtg && !cadencia && canManage && !isArquivado && (
                          // Código gravado e NENHUM cliente com ele na base.
                          // Antes isso só aparecia abrindo a ficha; é o estado
                          // de quem saiu da Onix (carteira migrada, código
                          // mantido) ou de código digitado errado. Nos dois
                          // casos a régua desta pessoa zera em silêncio.
                          <span
                            className="px-1.5 py-0.5 rounded bg-destructive/15 text-destructive font-medium"
                            title={`Código ${p.codigoAssessorBtg} não tem nenhum cliente na base — código errado, carteira migrada, ou Base BTG desatualizada`}
                          >
                            carteira não encontrada
                          </span>
                        )}
                        {pend.semCodigoBtg && (
                          // Sem código não há carteira nem régua de reunião
                          // para esta pessoa — os dois badges acima
                          // simplesmente não aparecem. Sem este aviso, a
                          // ausência deles é indistinguível de "carteira em
                          // dia".
                          <span
                            className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 font-medium"
                            title="Sem código de assessor BTG — carteira e régua de reunião não podem ser calculadas"
                          >
                            sem código BTG
                          </span>
                        )}
                        {pend.emailPessoal && (
                          // E-mail pessoal como identidade: não é revogado
                          // quando a pessoa sai, e é ele que dá o login. Marcar
                          // na LISTAGEM porque é uma pendência de saneamento —
                          // ninguém abre 20 fichas para descobrir quem está
                          // assim.
                          <span
                            className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 font-medium"
                            title="E-mail pessoal — não é revogado na saída e não casa com os relatórios do BTG"
                          >
                            e-mail pessoal
                          </span>
                        )}
                        {pend.semTelefone && (
                          // Sem telefone = não recebe alerta de carteira no
                          // WhatsApp. Marcar na LISTAGEM porque descobrir isso
                          // abrindo ficha por ficha só acontece depois que um
                          // alerta já se perdeu.
                          <span
                            className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 font-medium"
                            title="Sem telefone cadastrado — não recebe alertas no WhatsApp"
                          >
                            sem telefone
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
          </>
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
