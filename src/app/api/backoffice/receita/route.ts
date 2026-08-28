import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { randomUUID, createHash } from "crypto";

/**
 * ── GATE DE ESCRITA ──────────────────────────────────────────────────────
 *
 * A #404 fechou o `DELETE`, que era o buraco mais fundo. Ficaram abertos os
 * outros dois caminhos de MUTAÇÃO da mesma tabela, e eles não são pequenos:
 *
 *   POST  → `createMany` de lançamentos de receita: qualquer logado injeta
 *           números na única base de receita do grupo.
 *   PATCH → `recomputeReceitaClientes()`, que rodava um `update` em CADA
 *           `ClienteBackoffice` reescrevendo `receitaAnual`.
 *
 * Fechar só o `DELETE` deixava a tela parecendo protegida enquanto duas portas
 * seguiam abertas ao lado. O gate é o mesmo predicado e a mesma resposta 403 da
 * #404; o que mudou é que ele passou a morar numa função.
 *
 * O `PATCH` NÃO EXISTE MAIS — e por um motivo mais forte que o gate: ele
 * escrevia receita da Onix em `receitaAnual`, que é a renda DECLARADA do
 * cliente. O campo é do cliente; a receita da Onix mora em
 * `ComissaoMensalCliente`. Ver o bloco no fim deste arquivo.
 *
 * `GET` fica aberto a qualquer logado, de propósito: a tela
 * `/empresas/investimentos/receita` é leitura, e fechá-la apagaria capacidade
 * real de quem precisa consultar sem poder mexer — mesmo critério registrado
 * para `/integracoes` no AGENTS.md.
 */
async function exigirAdmin(): Promise<NextResponse | null> {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

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

const norm = (s: string | null | undefined) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

/** GET /api/backoffice/receita -> sumário + últimos lotes (com filtros) */
export async function GET(req: NextRequest) {
  try {
    const total = await prisma.receitaItem.count();
    if (total === 0) {
      return NextResponse.json({ total: 0, faturamentoTotal: 0, liquidoTotal: 0, porParceiro: [], porProduto: [], porCliente: [], porMes: [], filtros: { clientes: [], assessores: [], anos: [] } });
    }
    const sp = req.nextUrl.searchParams;
    const fCliente = sp.get("cliente") || "";
    const fAssessor = sp.get("assessor") || "";
    const fAno = sp.get("ano") || "";
    const fTrimestre = sp.get("trimestre") || ""; // "1".."4"
    const fMes = sp.get("mes") || ""; // "1".."12"

    const where: Record<string, unknown> = {};
    if (fCliente) where.nomeCliente = fCliente;
    if (fAssessor) where.assessor = fAssessor;
    if (fAno) {
      const y = parseInt(fAno, 10);
      let mIni = 0, mFim = 12;
      if (fMes) { mIni = parseInt(fMes, 10) - 1; mFim = mIni + 1; }
      else if (fTrimestre) { mIni = (parseInt(fTrimestre, 10) - 1) * 3; mFim = mIni + 3; }
      where.data = { gte: new Date(Date.UTC(y, mIni, 1)), lt: new Date(Date.UTC(y, mFim, 1)) };
    }

    const all = await prisma.receitaItem.findMany({ where, orderBy: { data: "desc" } });

    // listas para o seletor (sempre baseadas no dataset completo)
    const allMeta = await prisma.receitaItem.findMany({ select: { nomeCliente: true, assessor: true, data: true } });
    const setCli = new Set<string>();
    const setAss = new Set<string>();
    const setAno = new Set<number>();
    for (const r of allMeta) {
      if (r.nomeCliente) setCli.add(r.nomeCliente);
      if (r.assessor) setAss.add(r.assessor);
      setAno.add(r.data.getFullYear());
    }
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
      filtros: {
        clientes: Array.from(setCli).sort(),
        assessores: Array.from(setAss).sort(),
        anos: Array.from(setAno).sort((a, b) => b - a),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

/** POST /api/backoffice/receita -> importa lote */
export async function POST(req: NextRequest) {
  const negado = await exigirAdmin();
  if (negado) return negado;
  try {
    const { rows, replace } = (await req.json()) as { rows: RowIn[]; replace?: boolean };
    void replace;
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "Nenhuma linha enviada" }, { status: 400 });
    }
    const loteId = randomUUID();

    const data = rows.map((r) => {
      const faturamento = num(r.faturamento);
      const imposto = num(r.imposto);
      const faturamentoLiquido = r.faturamentoLiquido != null ? num(r.faturamentoLiquido) : faturamento - imposto;
      const dt = toDate(r.data);
      const fingerprint = [
        dt.toISOString().slice(0, 10),
        faturamento.toFixed(4),
        imposto.toFixed(4),
        faturamentoLiquido.toFixed(4),
        (r.assessor || "").trim(),
        (r.parceiro || "").trim(),
        (r.produto || "").trim(),
        (r.categoria || "").trim(),
        (r.nomeCliente || "").trim(),
      ].join("|");
      const hash = createHash("sha1").update(fingerprint).digest("hex");
      return {
        data: dt,
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
        hash,
      };
    });

    // dedupe interno do próprio lote
    const seen = new Set<string>();
    const uniq = data.filter((d) => (seen.has(d.hash) ? false : (seen.add(d.hash), true)));

    const result = await prisma.receitaItem.createMany({ data: uniq, skipDuplicates: true });
    const inseridos = result.count;
    const ignorados = data.length - inseridos;
    const totalAgora = await prisma.receitaItem.count();

    return NextResponse.json({
      success: true,
      message: `${inseridos} novo(s) · ${ignorados} duplicado(s) ignorado(s) · base com ${totalAgora} lançamentos ·`,
      loteId,
      inseridos,
      ignorados,
      total: totalAgora
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

/**
 * DELETE /api/backoffice/receita -> apaga TODOS os lançamentos de receita.
 *
 * SOMENTE ADMIN. Não é um delete por id: é `deleteMany({})`, a tabela inteira,
 * e o handler não recebe argumento nenhum — uma requisição sem corpo zera o
 * snapshot de receita do grupo. É também o ÚNICO caminho de apagamento total
 * desta tabela; o POST de importação só cria (`createMany` com
 * `skipDuplicates`), nunca limpa antes.
 *
 * Até aqui a única barreira era o proxy exigir sessão (`src/proxy.ts`), e a
 * página que expõe o botão (`/empresas/investimentos/receita`) não tem gate de
 * papel: qualquer uma das 22 pessoas logadas abria a tela e apagava. O
 * `confirm()` do navegador não é barreira — some com uma chamada direta.
 *
 * 403 e não 404: a rota é conhecida e o próprio menu leva até ela; esconder a
 * existência dela não protege nada, e um 404 aqui só faria o operador legítimo
 * achar que a rota sumiu. O 404 mudo é para item fora de escopo, onde o próprio
 * "sem permissão" confirmaria que aquele id existe — não é o caso.
 */
export async function DELETE() {
  const negado = await exigirAdmin();
  if (negado) return negado;

  try {
    const r = await prisma.receitaItem.deleteMany({});
    return NextResponse.json({ success: true, deleted: r.count });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

/*
 * ── POR QUE NÃO EXISTE MAIS UM `PATCH` AQUI ──────────────────────────────
 * Ele chamava `recomputeReceitaClientes()`: somava `faturamentoLiquido` dos
 * últimos 12 meses por nome e ESCREVIA em `ClienteBackoffice.receitaAnual`.
 *
 * Esse campo é a renda anual DECLARADA do cliente, vinda do Base BTG — a
 * `FIELD_SOURCE_POLICY` declara `base_btg` como dono único, e o `PATCH`
 * passava por cima. As duas grandezas nem se comparam: em 28/08/2026 a renda
 * declarada somava R$ 10,5 bilhões em 2.706 clientes; a receita da Onix nos
 * mesmos clientes seria alguns milhões. Na primeira importação de receita que
 * rodasse, o KPI despencaria mil vezes, sem explicação.
 *
 * A receita da Onix tem lugar próprio desde a #408: `ComissaoMensalCliente`,
 * por competência mensal, com `fonte` distinguindo estimado de realizado.
 * Quando o Financeiro existir, o `PATCH` nasce de novo — apontando para lá, e
 * com propósito. Ressuscitá-lo apontando para `receitaAnual` seria refazer
 * exatamente este defeito.
 */
