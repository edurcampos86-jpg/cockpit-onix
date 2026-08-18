export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthContext } from "@/lib/auth-helpers";
import { rbacEnforcementHabilitado, resolverCgesVisiveis } from "@/lib/rbac";
import { painelAberturaCapitalHabilitado } from "@/lib/backoffice/painel-abertura-flag";
import { classificarEstadoAtencao, type EstadoAtencao } from "@/lib/painel-atencao/core";
import {
  derivarDatasDirecionais,
  resolverLimiarVacuoDias,
} from "@/lib/painel-atencao/service";
import { derivarPendenciasGlobais } from "@/lib/cockpit-reuniao/pendencias-globais";
import { resumirAuditoria } from "@/lib/integracoes-auditadas";
import { hojeBahia } from "@/lib/painel-do-dia/agregador";
import {
  montarCartoes,
  montarNumeros,
  montarSaudeImports,
  ARQUIVOS_IMPORT,
} from "@/lib/backoffice/painel-abertura";

/**
 * Tela de abertura da Onix Capital — a primeira que o Eduardo abre de manhã.
 *
 * Gated por `PAINEL_ABERTURA_CAPITAL` (default OFF → `notFound()`: sem
 * superfície nova, sem consulta a mais rodando).
 *
 * NÃO calcula métrica nova: agrega o que já existe, reusando as mesmas
 * funções e os mesmos limiares das telas de origem. O que exigiria um limiar
 * inventado ficou de fora, e está declarado em `painel-abertura.ts`.
 *
 * RBAC: escopo por `assessorCge` no padrão de `investimentos/page.tsx:18-24`.
 * Todas as consultas de cliente passam por ele — inclusive as somas, para que
 * o Felipe veja o total DA CARTEIRA DELE e não o da casa.
 */
export default async function AberturaPage() {
  if (!(await painelAberturaCapitalHabilitado())) notFound();

  let cges: string[] | null = null;
  if (await rbacEnforcementHabilitado()) {
    cges = await resolverCgesVisiveis(await getAuthContext());
  }
  // `cges === null` → sem filtro (admin, sem papel, ou enforcement OFF).
  const whereCliente = cges === null ? {} : { assessorCge: { in: cges } };
  const whereViaCliente = cges === null ? {} : { cliente: { assessorCge: { in: cges } } };

  const agora = new Date();
  const hoje = hojeBahia();
  // Limites do dia em America/Bahia (UTC-3, sem horário de verão desde 2019).
  const inicioDoDia = new Date(`${hoje}T00:00:00.000-03:00`);
  const fimDoDia = new Date(`${hoje}T23:59:59.999-03:00`);

  const [
    clientes,
    limiarVacuoDias,
    reunioesComPendencia,
    suitabilityVencido,
    somaSaldo,
    movimentacoes,
    agendaDoDia,
    ultimaAuditoria,
    linhasImport,
  ] = await Promise.all([
    prisma.clienteBackoffice.findMany({
      where: whereCliente,
      select: { id: true, nome: true, classificacao: true },
    }),
    resolverLimiarVacuoDias(),
    prisma.reuniaoEstruturada.findMany({
      where: whereViaCliente,
      select: {
        id: true,
        data: true,
        dataRetorno: true,
        pendencias: true,
        cliente: { select: { id: true, nome: true } },
      },
    }),
    // "Vencido" é definido pela data no próprio dado — sem limiar escolhido
    // por mim. "Vencendo em N dias" exigiria escolher o N, e por isso ficou de
    // fora (ver painel-abertura.ts).
    prisma.clienteBackoffice.count({
      where: { ...whereCliente, suitabilityValidoAte: { lt: agora } },
    }),
    prisma.clienteBackoffice.aggregate({
      where: whereCliente,
      _sum: { saldoConta: true },
      _count: { _all: true },
    }),
    prisma.movimentacaoBtg.groupBy({
      by: ["tipo"],
      where: { ...whereViaCliente, data: { gte: inicioDoDia, lte: fimDoDia } },
      _sum: { valor: true },
      _count: { _all: true },
    }),
    prisma.reuniaoCliente.findMany({
      where: { ...whereViaCliente, startAt: { gte: inicioDoDia, lte: fimDoDia } },
      orderBy: { startAt: "asc" },
      select: {
        id: true,
        startAt: true,
        titulo: true,
        realizada: true,
        source: true,
        cliente: { select: { id: true, nome: true } },
      },
    }),
    prisma.btgSyncLog.findFirst({
      where: { tipo: "integration-audit" },
      orderBy: { iniciado: "desc" },
      select: {
        iniciado: true,
        finalizado: true,
        sucesso: true,
        contasProcessadas: true,
        contasComErro: true,
        resumo: true,
      },
    }),
    prisma.btgSyncLog.findMany({
      where: { tipo: { in: ARQUIVOS_IMPORT.map((a) => a.tipo) } },
      orderBy: { iniciado: "desc" },
      take: 30,
      select: {
        tipo: true,
        iniciado: true,
        sucesso: true,
        contasProcessadas: true,
        resumo: true,
      },
    }),
  ]);

  // ── Atenção: mesma classificação do painel por assessor, mesmo limiar ──
  const ids = clientes.map((c) => c.id);
  const datas = await derivarDatasDirecionais(ids);
  const totais: Record<EstadoAtencao, number> = {
    "em-dia": 0,
    "no-vacuo": 0,
    esquecido: 0,
    "sem-contato": 0,
  };
  let comMensagem = 0;
  for (const c of clientes) {
    const d = datas.get(c.id);
    if (d?.eu || d?.cliente) comMensagem++;
    const r = classificarEstadoAtencao({
      ultimoEuFalei: d?.eu ?? null,
      ultimoClienteFalou: d?.cliente ?? null,
      classificacao: c.classificacao,
      limiarVacuoDias,
      now: agora.getTime(),
    });
    totais[r.estado]++;
  }

  const pendencias = derivarPendenciasGlobais(
    reunioesComPendencia.map((r) => ({
      reuniaoId: r.id,
      clienteId: r.cliente.id,
      clienteNome: r.cliente.nome,
      data: r.data.toISOString(),
      dataRetorno: r.dataRetorno ? r.dataRetorno.toISOString() : null,
      pendencias: r.pendencias,
    })),
    agora.toISOString(),
  );

  const cartoes = montarCartoes({
    totais,
    limiarVacuoDias,
    pendenciasAbertas: pendencias.totalAbertas,
    pendenciasAtrasadas: pendencias.totalAtrasadas,
    suitabilityVencido,
    assessorPlugado: comMensagem > 0,
  });

  // Entradas e saídas do dia: o sinal do `valor` é quem separa. Somamos por
  // sinal em vez de por `tipo`, porque `tipo` é string livre vinda do BTG e
  // uma etiqueta nova apareceria como "nem entrada nem saída" em silêncio.
  let entradasHoje = 0;
  let saidasHoje = 0;
  let movimentacoesHoje = 0;
  for (const m of movimentacoes) {
    const v = m._sum.valor ?? 0;
    movimentacoesHoje += m._count._all;
    if (v >= 0) entradasHoje += v;
    else saidasHoje += v;
  }

  const numeros = montarNumeros({
    totalEmConta: somaSaldo._sum.saldoConta ?? 0,
    clientesComSaldo: somaSaldo._count._all,
    entradasHoje,
    saidasHoje,
    movimentacoesHoje,
  });

  const integracoes = resumirAuditoria(ultimaAuditoria, agora);
  const saudeImports = montarSaudeImports(linhasImport, agora);

  const moeda = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const hora = (d: Date) =>
    d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Bahia",
    });
  const dataCurta = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Bahia",
    });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Abertura — Onix Capital"
        description={
          cges === null
            ? "Visão da casa inteira"
            : `Sua carteira — ${clientes.length} cliente(s)`
        }
      />

      <div className="px-8 space-y-8 pb-10">
        {/* 1. Precisa de atenção hoje */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Precisa de atenção hoje
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cartoes.map((c) => (
              <Link key={c.chave} href={c.href} className="group">
                <Card
                  className={
                    c.alerta
                      ? "h-full border-red-300 transition-colors hover:border-red-400 dark:border-red-900"
                      : "h-full transition-colors hover:border-foreground/25"
                  }
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {c.rotulo}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div
                      className={`text-3xl font-semibold tabular-nums ${
                        c.alerta ? "text-red-600 dark:text-red-400" : ""
                      }`}
                    >
                      {c.valor}
                    </div>
                    <p className="text-xs text-muted-foreground">{c.legenda}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          {comMensagem === 0 && (
            <p className="text-xs text-muted-foreground">
              Nenhum cliente desta carteira tem mensagem ingerida — os estados de
              contato ficam de fora em vez de pintar todo mundo de esquecido.
            </p>
          )}
        </section>

        {/* 2. Agenda do dia */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Agenda do dia
          </h2>
          <Card>
            <CardContent className="pt-6">
              {agendaDoDia.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma reunião com cliente registrada para hoje.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {agendaDoDia.map((r) => (
                    <li key={r.id} className="flex items-center gap-4 py-2.5 text-sm">
                      <span className="w-14 shrink-0 font-medium tabular-nums">
                        {hora(r.startAt)}
                      </span>
                      <Link
                        href={`/empresas/investimentos/clientes/${r.cliente.id}`}
                        className="font-medium hover:underline"
                      >
                        {r.cliente.nome}
                      </Link>
                      <span className="truncate text-muted-foreground">
                        {r.titulo ?? "—"}
                      </span>
                      {r.realizada && (
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          realizada
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* 3. Números da empresa */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Números da empresa
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {numeros.map((n) => (
              <Card key={n.rotulo} className="h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {n.rotulo}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="text-2xl font-semibold tabular-nums">
                    {n.formato === "moeda" ? moeda(n.valor) : n.valor}
                  </div>
                  <p className="text-xs text-muted-foreground">{n.legenda}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Não há <strong>variação do saldo do dia</strong>: o banco guarda só o
            saldo de agora, sem série histórica. O que aparece acima é fluxo
            (entradas e saídas registradas hoje), que é outra coisa.
          </p>
        </section>

        {/* 4. Saúde dos dados */}
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Saúde dos dados
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Integrações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      integracoes.ok ? "bg-emerald-500" : "bg-red-500"
                    }`}
                  />
                  <span className="font-medium">
                    {integracoes.ok ? "Auditor em dia" : "Auditor com pendência"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {integracoes.ultima
                    ? `Última checagem ${dataCurta(integracoes.ultima)} · ${integracoes.idadeMinutos} min atrás`
                    : "O auditor nunca rodou"}
                </p>
                {integracoes.resumo && (
                  <p className="text-xs text-muted-foreground">{integracoes.resumo}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Último import de cada arquivo</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5 text-sm">
                  {saudeImports.map((f) => (
                    <li key={f.rotulo} className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                            f.ultima === null
                              ? "bg-muted-foreground/40"
                              : f.ok
                                ? "bg-emerald-500"
                                : "bg-red-500"
                          }`}
                        />
                        <span className="font-medium">{f.rotulo}</span>
                        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                          {f.ultima ? `${dataCurta(f.ultima)} · ${f.idadeHoras}h` : "—"}
                        </span>
                      </div>
                      <p className="pl-4 text-xs text-muted-foreground">{f.detalhe}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
