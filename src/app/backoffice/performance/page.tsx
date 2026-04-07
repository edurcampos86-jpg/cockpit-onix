export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { ReferenciaLivro } from "@/components/backoffice/referencia-livro";
import { PerformanceDashboard } from "@/components/backoffice/performance-dashboard";
import { REF_KPI_EXCELENCIA } from "@/lib/backoffice/referencias";

interface PerfData {
  kpis: {
    totalClientes: number;
    clientesA: number;
    clientesB: number;
    clientesC: number;
    aumTotal: number;
    receitaAnual: number;
    interacoes30d: number;
    interacoesAno: number;
    reuniaoesAno: number;
    revisoesAno: number;
    indicacoesRecebidasAno: number;
    indicacoesConvertidasAno: number;
    taxaConversaoIndicacoes: number;
    cumprimentoPromessaA: number;
    metasAtivas: number;
    metasAtingidas: number;
  };
  topClientes: Array<{ id: string; nome: string; classificacao: string; saldo: number; receitaAnual: number }>;
  porMes: Array<{ mes: string; ligacoes: number; reunioes: number; revisoes: number }>;
}

export default async function PerformancePage() {
  const vazio: PerfData = {
    kpis: {
      totalClientes: 0,
      clientesA: 0,
      clientesB: 0,
      clientesC: 0,
      aumTotal: 0,
      receitaAnual: 0,
      interacoes30d: 0,
      interacoesAno: 0,
      reuniaoesAno: 0,
      revisoesAno: 0,
      indicacoesRecebidasAno: 0,
      indicacoesConvertidasAno: 0,
      taxaConversaoIndicacoes: 0,
      cumprimentoPromessaA: 0,
      metasAtivas: 0,
      metasAtingidas: 0,
    },
    topClientes: [],
    porMes: [],
  };

  let data = vazio;

  try {
    const agora = new Date();
    const inicioAno = new Date(agora.getFullYear(), 0, 1);
    const inicio30d = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [clientes, interacoesAno, indicacoesAno, metas] = await Promise.all([
      prisma.clienteBackoffice.findMany({
        select: {
          id: true,
          nome: true,
          classificacao: true,
          saldo: true,
          receitaAnual: true,
          ultimoContatoAt: true,
        },
      }),
      prisma.interacaoCliente.findMany({
        where: { data: { gte: inicioAno } },
        select: { tipo: true, data: true },
      }),
      prisma.indicacao.findMany({
        where: { criadoEm: { gte: inicioAno } },
        select: { status: true },
      }),
      prisma.metaCliente.findMany({ select: { status: true } }),
    ]);

    const clientesA = clientes.filter((c) => c.classificacao === "A");
    const clientesB = clientes.filter((c) => c.classificacao === "B");
    const clientesC = clientes.filter((c) => c.classificacao === "C");

    // Cumprimento da promessa: % de A com último contato nos últimos 45 dias
    const limiteA = new Date(agora.getTime() - 45 * 24 * 60 * 60 * 1000);
    const aEmDia = clientesA.filter((c) => c.ultimoContatoAt && c.ultimoContatoAt >= limiteA).length;
    const cumprimento = clientesA.length > 0 ? Math.round((aEmDia / clientesA.length) * 100) : 0;

    // Interações
    const interacoes30d = interacoesAno.filter((i) => i.data >= inicio30d).length;
    const reuniaoesAno = interacoesAno.filter((i) => i.tipo === "reuniao").length;
    const revisoesAno = interacoesAno.filter((i) => i.tipo === "revisao").length;

    // Indicações
    const convertidas = indicacoesAno.filter((i) => i.status === "convertida").length;
    const taxaConv = indicacoesAno.length > 0
      ? Math.round((convertidas / indicacoesAno.length) * 100)
      : 0;

    // Metas
    const metasAtivas = metas.filter((m) => m.status === "ativa").length;
    const metasAtingidas = metas.filter((m) => m.status === "atingida").length;

    // Top 10 clientes por saldo
    const topClientes = [...clientes]
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 10)
      .map((c) => ({
        id: c.id,
        nome: c.nome,
        classificacao: c.classificacao,
        saldo: c.saldo,
        receitaAnual: c.receitaAnual,
      }));

    // Interações por mês (12 meses)
    const meses: Record<string, { ligacoes: number; reunioes: number; revisoes: number }> = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      meses[k] = { ligacoes: 0, reunioes: 0, revisoes: 0 };
    }
    for (const it of interacoesAno) {
      const d = new Date(it.data);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!meses[k]) continue;
      if (it.tipo === "ligacao") meses[k].ligacoes++;
      else if (it.tipo === "reuniao") meses[k].reunioes++;
      else if (it.tipo === "revisao") meses[k].revisoes++;
    }
    const porMes = Object.entries(meses).map(([mes, v]) => ({ mes, ...v }));

    data = {
      kpis: {
        totalClientes: clientes.length,
        clientesA: clientesA.length,
        clientesB: clientesB.length,
        clientesC: clientesC.length,
        aumTotal: clientes.reduce((s, c) => s + c.saldo, 0),
        receitaAnual: clientes.reduce((s, c) => s + c.receitaAnual, 0),
        interacoes30d,
        interacoesAno: interacoesAno.length,
        reuniaoesAno,
        revisoesAno,
        indicacoesRecebidasAno: indicacoesAno.length,
        indicacoesConvertidasAno: convertidas,
        taxaConversaoIndicacoes: taxaConv,
        cumprimentoPromessaA: cumprimento,
        metasAtivas,
        metasAtingidas,
      },
      topClientes,
      porMes,
    };
  } catch {
    // tabelas podem não existir ainda
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance & Excelência Operacional"
        description="O painel de voo do assessor Supernova: cumprimento, conversão e crescimento."
      />
      <div className="px-8 space-y-6">
        <ReferenciaLivro
          referencias={REF_KPI_EXCELENCIA}
          titulo="O painel de excelência da equipe Supernova"
        />
        <PerformanceDashboard data={data} />
      </div>
    </div>
  );
}
