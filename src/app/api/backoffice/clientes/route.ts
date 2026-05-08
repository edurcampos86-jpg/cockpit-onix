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

function cleanCpfCnpj(v: unknown): string | undefined {
  const digits = clean(v)?.replace(/\D/g, "");
  if (!digits) return undefined;
  // Aceita só CPF (11 dígitos) ou CNPJ (14 dígitos) — descarta RG/CNH/etc.
  if (digits.length === 11 || digits.length === 14) return digits;
  return undefined;
}

function parseNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const n = parseFloat(
    String(v).replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."),
  );
  return Number.isFinite(n) ? n : undefined;
}

function parseDate(v: unknown): Date | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? undefined : v;
  const s = String(v).trim();
  // dd/mm/yyyy
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (br) {
    const d = new Date(Date.UTC(+br[3], +br[2] - 1, +br[1]));
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const CLASSES_VALIDAS = new Set(["A", "B", "C"]);

// Campos que vão pro Json breakdownProdutos (não viram colunas).
const BREAKDOWN_KEYS = [
  "fundos",
  "rendaFixa",
  "rendaVariavel",
  "previdencia",
  "derivativos",
  "valorEmTransito",
  "criptoativos",
  "qtdAtivos",
  "qtdFundos",
  "qtdRendaFixa",
  "qtdRendaVariavel",
  "qtdPrevidencia",
  "qtdDerivativos",
  "qtdValorEmTransito",
  "qtdCriptoativos",
  "qtdAportes",
  "aportes",
  "retiradas",
  "plDeclarado",
] as const;
const BREAKDOWN_DATE_KEYS = ["primeiroAporte", "ultimoAporte"] as const;
const BREAKDOWN_TEXT_KEYS = ["carteiraAdministrada", "termoMarcacaoNaCurva"] as const;

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
  aniversario?: unknown;
  perfilInvestidor?: unknown;
  suitabilityValidoAte?: unknown;
  tipoInvestidor?: unknown;
  faixaCliente?: unknown;
  ativacaoConta?: unknown;
  pendenciaCadastral?: unknown;
  dataAberturaConta?: unknown;
  dataUltimaRevisaoCadastral?: unknown;
  dataProximaRevisaoCadastral?: unknown;
  idClienteBtg?: unknown;
  tipoConta?: unknown;
  estadoCivil?: unknown;
  genero?: unknown;
  nacionalidade?: unknown;
  cpfConjuge?: unknown;
  endereco?: unknown;
  complemento?: unknown;
  cidade?: unknown;
  estado?: unknown;
  cep?: unknown;
  assessorNome?: unknown;
  assessorCge?: unknown;
  assessorEmail?: unknown;
  tipoParceiro?: unknown;
  escritorio?: unknown;
  codigoEscritorio?: unknown;
  // Detalhamento financeiro (consolidado em breakdownProdutos)
  [k: string]: unknown;
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
  aniversario?: Date;
  perfilInvestidor?: string;
  suitabilityValidoAte?: Date;
  tipoInvestidor?: string;
  faixaCliente?: string;
  ativacaoConta?: string;
  pendenciaCadastral?: string;
  dataAberturaConta?: Date;
  dataUltimaRevisaoCadastral?: Date;
  dataProximaRevisaoCadastral?: Date;
  idClienteBtg?: string;
  tipoConta?: string;
  estadoCivil?: string;
  genero?: string;
  nacionalidade?: string;
  cpfConjuge?: string;
  endereco?: string;
  complemento?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  assessorNome?: string;
  assessorCge?: string;
  assessorEmail?: string;
  tipoParceiro?: string;
  escritorio?: string;
  codigoEscritorio?: string;
  breakdownProdutos?: Record<string, string | number | null>;
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
        const numeroConta = clean(c.numeroConta);
        if (!nome && !numeroConta) return null;
        const classe = clean(c.classificacao)?.toUpperCase();
        const perfilSuit = clean(c.perfilInvestidor)?.toLowerCase();

        // Consolida detalhamento financeiro em breakdownProdutos
        const breakdown: Record<string, string | number | null> = {};
        for (const k of BREAKDOWN_KEYS) {
          const n = parseNumber(c[k]);
          if (n !== undefined) breakdown[k] = n;
        }
        for (const k of BREAKDOWN_DATE_KEYS) {
          const d = parseDate(c[k]);
          if (d) breakdown[k] = d.toISOString().slice(0, 10);
        }
        for (const k of BREAKDOWN_TEXT_KEYS) {
          const s = clean(c[k]);
          if (s) breakdown[k] = s;
        }

        return {
          nome: nome ?? `Conta ${numeroConta}`,
          numeroConta,
          cpfCnpj: cleanCpfCnpj(c.cpfCnpj),
          saldo: parseNumber(c.saldo),
          saldoConta: parseNumber(c.saldoConta),
          email: clean(c.email),
          telefone: clean(c.telefone),
          profissao: clean(c.profissao),
          nicho: clean(c.nicho),
          classificacao: classe && CLASSES_VALIDAS.has(classe) ? classe : undefined,
          receitaAnual: parseNumber(c.receitaAnual),
          aniversario: parseDate(c.aniversario),
          perfilInvestidor: perfilSuit,
          suitabilityValidoAte: parseDate(c.suitabilityValidoAte),
          tipoInvestidor: clean(c.tipoInvestidor),
          faixaCliente: clean(c.faixaCliente),
          ativacaoConta: clean(c.ativacaoConta),
          pendenciaCadastral: clean(c.pendenciaCadastral),
          dataAberturaConta: parseDate(c.dataAberturaConta),
          dataUltimaRevisaoCadastral: parseDate(c.dataUltimaRevisaoCadastral),
          dataProximaRevisaoCadastral: parseDate(c.dataProximaRevisaoCadastral),
          idClienteBtg: clean(c.idClienteBtg),
          tipoConta: clean(c.tipoConta)?.toUpperCase(),
          estadoCivil: clean(c.estadoCivil),
          genero: clean(c.genero),
          nacionalidade: clean(c.nacionalidade),
          cpfConjuge: clean(c.cpfConjuge)?.replace(/\D/g, "") || undefined,
          endereco: clean(c.endereco),
          complemento: clean(c.complemento),
          cidade: clean(c.cidade),
          estado: clean(c.estado),
          cep: clean(c.cep)?.replace(/\D/g, "") || undefined,
          assessorNome: clean(c.assessorNome),
          assessorCge: clean(c.assessorCge),
          assessorEmail: clean(c.assessorEmail),
          tipoParceiro: clean(c.tipoParceiro),
          escritorio: clean(c.escritorio),
          codigoEscritorio: clean(c.codigoEscritorio),
          breakdownProdutos: Object.keys(breakdown).length > 0 ? breakdown : undefined,
        };
      })
      .filter((c): c is ClienteLimpo => c !== null);

    if (limpos.length === 0) {
      return NextResponse.json(
        { error: "Nenhum cliente válido encontrado. A planilha precisa ter coluna 'Conta' ou 'Nome'." },
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
        const setIfDef = (k: keyof ClienteLimpo) => {
          if (input[k] !== undefined) update[k as string] = input[k];
        };
        setIfDef("nome");
        setIfDef("numeroConta");
        setIfDef("cpfCnpj");
        setIfDef("saldo");
        setIfDef("saldoConta");
        setIfDef("email");
        setIfDef("telefone");
        setIfDef("profissao");
        setIfDef("nicho");
        setIfDef("receitaAnual");
        setIfDef("aniversario");
        setIfDef("perfilInvestidor");
        setIfDef("suitabilityValidoAte");
        setIfDef("tipoInvestidor");
        setIfDef("faixaCliente");
        setIfDef("ativacaoConta");
        setIfDef("pendenciaCadastral");
        setIfDef("dataAberturaConta");
        setIfDef("dataUltimaRevisaoCadastral");
        setIfDef("dataProximaRevisaoCadastral");
        setIfDef("idClienteBtg");
        setIfDef("tipoConta");
        setIfDef("estadoCivil");
        setIfDef("genero");
        setIfDef("nacionalidade");
        setIfDef("cpfConjuge");
        setIfDef("endereco");
        setIfDef("complemento");
        setIfDef("cidade");
        setIfDef("estado");
        setIfDef("cep");
        setIfDef("assessorNome");
        setIfDef("assessorCge");
        setIfDef("assessorEmail");
        setIfDef("tipoParceiro");
        setIfDef("escritorio");
        setIfDef("codigoEscritorio");
        if (input.breakdownProdutos !== undefined) update.breakdownProdutos = input.breakdownProdutos;

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
            aniversario: input.aniversario ?? null,
            perfilInvestidor: input.perfilInvestidor ?? null,
            suitabilityValidoAte: input.suitabilityValidoAte ?? null,
            tipoInvestidor: input.tipoInvestidor ?? null,
            faixaCliente: input.faixaCliente ?? null,
            ativacaoConta: input.ativacaoConta ?? null,
            pendenciaCadastral: input.pendenciaCadastral ?? null,
            dataAberturaConta: input.dataAberturaConta ?? null,
            dataUltimaRevisaoCadastral: input.dataUltimaRevisaoCadastral ?? null,
            dataProximaRevisaoCadastral: input.dataProximaRevisaoCadastral ?? null,
            idClienteBtg: input.idClienteBtg ?? null,
            tipoConta: input.tipoConta ?? null,
            estadoCivil: input.estadoCivil ?? null,
            genero: input.genero ?? null,
            nacionalidade: input.nacionalidade ?? null,
            cpfConjuge: input.cpfConjuge ?? null,
            endereco: input.endereco ?? null,
            complemento: input.complemento ?? null,
            cidade: input.cidade ?? null,
            estado: input.estado ?? null,
            cep: input.cep ?? null,
            assessorNome: input.assessorNome ?? null,
            assessorCge: input.assessorCge ?? null,
            assessorEmail: input.assessorEmail ?? null,
            tipoParceiro: input.tipoParceiro ?? null,
            escritorio: input.escritorio ?? null,
            codigoEscritorio: input.codigoEscritorio ?? null,
            breakdownProdutos: input.breakdownProdutos ?? undefined,
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
