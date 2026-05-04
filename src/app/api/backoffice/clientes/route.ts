import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { NextRequest, NextResponse } from "next/server";

function calcularCortesABC(saldos: number[]): { corteA: number; corteB: number } {
  if (saldos.length === 0) return { corteA: Infinity, corteB: Infinity };
  const ord = [...saldos].sort((x, y) => y - x);
  const idxA = Math.max(0, Math.floor(ord.length * 0.2) - 1);
  const idxB = Math.max(0, Math.floor(ord.length * 0.5) - 1);
  return { corteA: ord[idxA] ?? Infinity, corteB: ord[idxB] ?? Infinity };
}

async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    return {
      error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }),
    };
  }
  if (session.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Apenas o login administrador pode importar ou exportar dados de clientes." },
        { status: 403 },
      ),
    };
  }
  return { session };
}

function clean(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length === 0 ? undefined : s;
}

function parseNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const n = parseFloat(
    String(v).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."),
  );
  return Number.isFinite(n) ? n : undefined;
}

const CLASSES_VALIDAS = new Set(["A", "B", "C"]);

type IncomingCliente = {
  nome?: unknown;
  numeroConta?: unknown;
  cpfCnpj?: unknown;
  saldo?: unknown;
  saldoConta?: unknown;
  email?: unknown;
  telefone?: unknown;
  profissao?: unknown;
  nicho?: unknown;
  classificacao?: unknown;
  receitaAnual?: unknown;
};

type ClienteLimpo = {
  nome: string;
  numeroConta?: string;
  cpfCnpj?: string;
  saldo?: number;
  saldoConta?: number;
  email?: string;
  telefone?: string;
  profissao?: string;
  nicho?: string;
  classificacao?: string;
  receitaAnual?: number;
};

async function findExisting(c: ClienteLimpo) {
  if (c.numeroConta) {
    const byConta = await prisma.clienteBackoffice.findFirst({
      where: { numeroConta: c.numeroConta },
    });
    if (byConta) return byConta;
  }
  if (c.cpfCnpj) {
    const byCpf = await prisma.clienteBackoffice.findFirst({
      where: { cpfCnpj: c.cpfCnpj },
    });
    if (byCpf) return byCpf;
  }
  return prisma.clienteBackoffice.findFirst({
    where: { nome: { equals: c.nome, mode: "insensitive" } },
  });
}

export async function GET() {
  try {
    const clientes = await prisma.clienteBackoffice.findMany({
      orderBy: [{ classificacao: "asc" }, { saldo: "desc" }],
    });
    return NextResponse.json({ clientes, total: clientes.length });
  } catch (error) {
    console.error("Erro ao buscar clientes:", error);
    return NextResponse.json({ error: "Erro ao buscar clientes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    const body = await request.json();
    const recebidos = (body?.clientes || []) as IncomingCliente[];

    if (!Array.isArray(recebidos) || recebidos.length === 0) {
      return NextResponse.json({ error: "Nenhum dado recebido" }, { status: 400 });
    }

    const limpos: ClienteLimpo[] = recebidos
      .map((c): ClienteLimpo | null => {
        const nome = clean(c.nome);
        if (!nome) return null;
        const classe = clean(c.classificacao)?.toUpperCase();
        return {
          nome,
          numeroConta: clean(c.numeroConta),
          cpfCnpj: clean(c.cpfCnpj)?.replace(/\D/g, "") || undefined,
          saldo: parseNumber(c.saldo),
          saldoConta: parseNumber(c.saldoConta),
          email: clean(c.email),
          telefone: clean(c.telefone),
          profissao: clean(c.profissao),
          nicho: clean(c.nicho),
          classificacao: classe && CLASSES_VALIDAS.has(classe) ? classe : undefined,
          receitaAnual: parseNumber(c.receitaAnual),
        };
      })
      .filter((c): c is ClienteLimpo => c !== null);

    if (limpos.length === 0) {
      return NextResponse.json(
        { error: "Nenhum cliente válido encontrado. A planilha precisa ter coluna 'nome'." },
        { status: 400 },
      );
    }

    const pareados = await Promise.all(
      limpos.map(async (input) => ({ input, existente: await findExisting(input) })),
    );

    const saldosEfetivos = pareados.map(
      (p) => p.input.saldo ?? p.existente?.saldo ?? 0,
    );
    const { corteA, corteB } = calcularCortesABC(saldosEfetivos);

    let criados = 0;
    let atualizados = 0;
    let duplicadosResolvidos = 0;

    for (const { input, existente } of pareados) {
      const saldoFinal = input.saldo ?? existente?.saldo ?? 0;
      const classeAuto: string =
        saldoFinal >= corteA ? "A" : saldoFinal >= corteB ? "B" : "C";

      if (existente) {
        const update: Record<string, unknown> = {};
        if (input.nome !== undefined) update.nome = input.nome;
        if (input.numeroConta !== undefined) update.numeroConta = input.numeroConta;
        if (input.cpfCnpj !== undefined) update.cpfCnpj = input.cpfCnpj;
        if (input.saldo !== undefined) update.saldo = input.saldo;
        if (input.saldoConta !== undefined) update.saldoConta = input.saldoConta;
        if (input.email !== undefined) update.email = input.email;
        if (input.telefone !== undefined) update.telefone = input.telefone;
        if (input.profissao !== undefined) update.profissao = input.profissao;
        if (input.nicho !== undefined) update.nicho = input.nicho;
        if (input.receitaAnual !== undefined) update.receitaAnual = input.receitaAnual;

        if (input.classificacao) {
          update.classificacao = input.classificacao;
          update.classificacaoManual = true;
        } else if (!existente.classificacaoManual) {
          update.classificacao = classeAuto;
        }

        await prisma.clienteBackoffice.update({
          where: { id: existente.id },
          data: update,
        });
        atualizados++;
        if (
          input.numeroConta &&
          existente.numeroConta &&
          input.numeroConta !== existente.numeroConta
        ) {
          duplicadosResolvidos++;
        }
      } else {
        await prisma.clienteBackoffice.create({
          data: {
            nome: input.nome,
            numeroConta: input.numeroConta ?? "",
            cpfCnpj: input.cpfCnpj ?? null,
            saldo: input.saldo ?? 0,
            saldoConta: input.saldoConta ?? 0,
            email: input.email ?? null,
            telefone: input.telefone ?? null,
            profissao: input.profissao ?? null,
            nicho: input.nicho ?? null,
            receitaAnual: input.receitaAnual ?? 0,
            classificacao: input.classificacao ?? classeAuto,
            classificacaoManual: !!input.classificacao,
          },
        });
        criados++;
      }
    }

    const partes = [`${criados} novos`, `${atualizados} atualizados`];
    if (duplicadosResolvidos > 0) {
      partes.push(`${duplicadosResolvidos} pareados por CPF/nome`);
    }
    partes.push("ABC recalculado");

    return NextResponse.json({
      message: partes.join(" · "),
      total: limpos.length,
      criados,
      atualizados,
      duplicadosResolvidos,
    });
  } catch (error) {
    console.error("Erro ao importar clientes:", error);
    return NextResponse.json({ error: "Erro ao processar dados" }, { status: 500 });
  }
}

export async function DELETE() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  try {
    await prisma.clienteBackoffice.deleteMany();
    return NextResponse.json({ message: "Dados removidos com sucesso" });
  } catch (error) {
    console.error("Erro ao remover clientes:", error);
    return NextResponse.json({ error: "Erro ao remover dados" }, { status: 500 });
  }
}
