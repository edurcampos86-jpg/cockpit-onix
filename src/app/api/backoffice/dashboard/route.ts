import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Limite de "órfão" (sem contato) por classe
const LIMITE_ORFAO: Record<string, number> = {
  A: 45, // A sem contato há mais de 45 dias = órfão
  B: 90,
  C: 210,
};

// Meta anual de toques (Supernova 12-4-2 para A)
const META_TOQUES_ANUAL: Record<string, number> = {
  A: 18, // 12 + 4 + 2
  B: 6,
  C: 2,
};

export async function GET() {
  try {
    const clientes = await prisma.clienteBackoffice.findMany();
    const agora = Date.now();
    const inicioAno = new Date(new Date().getFullYear(), 0, 1);

    const interacoes = await prisma.interacaoCliente.findMany({
      where: { data: { gte: inicioAno } },
    });

    // Contagem por classe
    const porClasse: Record<string, { total: number; aum: number; receita: number }> = {
      A: { total: 0, aum: 0, receita: 0 },
      B: { total: 0, aum: 0, receita: 0 },
      C: { total: 0, aum: 0, receita: 0 },
    };

    let orfaos: typeof clientes = [];
    let aVencer: typeof clientes = [];

    for (const c of clientes) {
      const classe = c.classificacao;
      if (porClasse[classe]) {
        porClasse[classe].total++;
        porClasse[classe].aum += c.saldo;
        porClasse[classe].receita += c.receitaAnual;
      }

      const limite = LIMITE_ORFAO[classe] ?? 180;
      const diasSemContato = c.ultimoContatoAt
        ? Math.floor((agora - c.ultimoContatoAt.getTime()) / (1000 * 60 * 60 * 24))
        : Infinity;

      if (diasSemContato > limite) orfaos.push(c);
      if (
        c.proximoContatoAt &&
        c.proximoContatoAt.getTime() - agora < 7 * 24 * 60 * 60 * 1000 &&
        c.proximoContatoAt.getTime() > agora
      ) {
        aVencer.push(c);
      }
    }

    // Promessa de serviço: % de clientes de cada classe atingindo meta de toques no ano
    const toquesPorCliente = new Map<string, number>();
    for (const i of interacoes) {
      toquesPorCliente.set(i.clienteId, (toquesPorCliente.get(i.clienteId) ?? 0) + 1);
    }

    const mesAtual = new Date().getMonth() + 1; // 1-12
    const promessa: Record<string, { esperado: number; emDia: number; total: number }> = {
      A: { esperado: 0, emDia: 0, total: 0 },
      B: { esperado: 0, emDia: 0, total: 0 },
      C: { esperado: 0, emDia: 0, total: 0 },
    };

    for (const c of clientes) {
      const classe = c.classificacao;
      if (!promessa[classe]) continue;
      promessa[classe].total++;
      const metaAno = META_TOQUES_ANUAL[classe] ?? 2;
      const metaProporcional = Math.ceil((metaAno * mesAtual) / 12);
      promessa[classe].esperado = metaAno;
      const toques = toquesPorCliente.get(c.id) ?? 0;
      if (toques >= metaProporcional) promessa[classe].emDia++;
    }

    // Ordenar órfãos: A primeiro, depois maior saldo
    const prioridadeClasse: Record<string, number> = { A: 0, B: 1, C: 2 };
    orfaos = orfaos
      .sort(
        (a, b) =>
          (prioridadeClasse[a.classificacao] ?? 3) - (prioridadeClasse[b.classificacao] ?? 3) ||
          b.saldo - a.saldo
      )
      .slice(0, 50);

    aVencer = aVencer
      .sort((a, b) => (a.proximoContatoAt?.getTime() ?? 0) - (b.proximoContatoAt?.getTime() ?? 0))
      .slice(0, 30);

    return NextResponse.json({
      resumo: {
        totalClientes: clientes.length,
        aumTotal: clientes.reduce((s, c) => s + c.saldo, 0),
        receitaTotal: clientes.reduce((s, c) => s + c.receitaAnual, 0),
        orfaosTotal: orfaos.length,
      },
      porClasse,
      promessa,
      orfaos,
      aVencer,
    });
  } catch (error) {
    console.error("Erro no dashboard:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
