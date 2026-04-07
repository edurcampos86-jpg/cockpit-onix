import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

interface RowIn {
  data?: string | number | Date | null;
  faturamento?: number | string | null;
  imposto?: number | string | null;
  faturamentoLiquido?: number | string | null;
  assessor?: string | null;
  parceiro?: string | null;
  departamento?: string | null;
  classificacao?: string | null;
  categoria?: string | null;
  produto?: string | null;
  nomeCliente?: string | null;
}

const num = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^\d.,-]/g, "").replace(",", "."));
    return isNaN(n) ? 0 : n;
  }
  return 0;
};

const toDate = (v: unknown): Date => {
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Excel serial date
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d;
  }
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
};

/** GET /api/backoffice/receita -> sumário + últimos lotes */
export async function GET() {
  try {
    const total = await prisma.receitaItem.count();
    if (total === 0) {
      return NextResponse.json({ total: 0, faturamentoTotal: 0, liquidoTotal: 0, porParceiro: [], porProduto: [], porCliente: [], porMes: [] });
    }
    const all = await prisma.receitaItem.findMany({ orderBy: { data: "desc" } });
    const faturamentoTotal = all.reduce((s, r) => s + r.faturamento, 0);
    const liquidoTotal = all.reduce((s, r) => s + r.faturamentoLiquido, 0);

    const groupSum = (key: keyof typeof all[number]) => {
      const m = new Map<string, { label: string; faturamento: number; liquido: number; count: number }>();
      for (const r of all) {
        const k = (r[key] as string) || "(sem)";
        const cur = m.get(k) || { label: k, faturamento: 0, liquido: 0, count: 0 };
        cur.faturamento += r.faturamento;
        cur.liquido += r.faturamentoLiquido;
        cur.count++;
        m.set(k, cur);
      }
      return Array.from(m.values()).sort((a, b) => b.liquido - a.liquido);
    };

    const porMesMap = new Map<string, { mes: string; faturamento: number; liquido: number }>();
    for (const r of all) {
      const k = `${r.data.getFullYear()}-${String(r.data.getMonth() + 1).padStart(2, "0")}`;
      const cur = porMesMap.get(k) || { mes: k, faturamento: 0, liquido: 0 };
      cur.faturamento += r.faturamento;
      cur.liquido += r.faturamentoLiquido;
      porMesMap.set(k, cur);
    }

    return NextResponse.json({
      total,
      faturamentoTotal,
      liquidoTotal,
      porParceiro: groupSum("parceiro").slice(0, 20),
      porProduto: groupSum("produto").slice(0, 20),
      porCliente: groupSum("nomeCliente").slice(0, 20),
      porMes: Array.from(porMesMap.values()).sort((a, b) => a.mes.localeCompare(b.mes)),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

/** POST /api/backoffice/receita -> importa lote */
export async function POST(req: NextRequest) {
  try {
    const { rows, replace } = (await req.json()) as { rows: RowIn[]; replace?: boolean };
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "Nenhuma linha enviada" }, { status: 400 });
    }
    const loteId = randomUUID();

    if (replace) {
      await prisma.receitaItem.deleteMany({});
    }

    const data = rows.map((r) => {
      const faturamento = num(r.faturamento);
      const imposto = num(r.imposto);
      const faturamentoLiquido = r.faturamentoLiquido != null ? num(r.faturamentoLiquido) : faturamento - imposto;
      return {
        data: toDate(r.data),
        faturamento,
        imposto,
        faturamentoLiquido,
        assessor: r.assessor || null,
        parceiro: r.parceiro || null,
        departamento: r.departamento || null,
        classificacao: r.classificacao || null,
        categoria: r.categoria || null,
        produto: r.produto || null,
        nomeCliente: r.nomeCliente || null,
        loteId,
      };
    });

    await prisma.receitaItem.createMany({ data });

    return NextResponse.json({
      success: true,
      message: `${data.length} lançamento(s) importado(s)${replace ? " (substituindo dados anteriores)" : ""}`,
      loteId,
      total: data.length,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

/** DELETE /api/backoffice/receita -> limpa tudo */
export async function DELETE() {
  try {
    const r = await prisma.receitaItem.deleteMany({});
    return NextResponse.json({ success: true, deleted: r.count });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
