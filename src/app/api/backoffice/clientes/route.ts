import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { type FonteImport } from "@/lib/backoffice/field-source-policy";
import { upsertPorPolitica } from "@/lib/backoffice/upsert-cliente";
import { gateSanidadeSaldoCc } from "@/lib/backoffice/import-sanity";
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

// Para colunas Int? — XLSX pode trazer com decimal (ex.: "12,0" de planilhas
// que formatam tudo como número). Math.trunc é conservador (não arredonda).
function parseInteger(v: unknown): number | undefined {
  const n = parseNumber(v);
  return n === undefined ? undefined : Math.trunc(n);
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

// Histórico: estes campos viviam em breakdownProdutos (Json). A migration
// multi_fonte_btg_apelido promoveu todos para colunas reais (Float/Int/
// DateTime/String). Agora cada um vai pro top-level de ClienteLimpo e é
// gravado direto pela FIELD_SOURCE_POLICY no upsertPorPolitica.
//
// breakdownProdutos (Json) é preservado no schema só pra compat com o
// shape escrito pelo btg-import (API BTG, não XLSX) que ainda popula um
// array de produtos. Esse caminho NÃO passa por aqui.

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
  // Detalhamento financeiro (colunas reais pós-migration multi_fonte)
  fundos?: unknown;
  rendaFixa?: unknown;
  rendaVariavel?: unknown;
  previdencia?: unknown;
  derivativos?: unknown;
  valorEmTransito?: unknown;
  criptoativos?: unknown;
  plDeclarado?: unknown;
  aportes?: unknown;
  retiradas?: unknown;
  qtdAtivos?: unknown;
  qtdFundos?: unknown;
  qtdRendaFixa?: unknown;
  qtdRendaVariavel?: unknown;
  qtdPrevidencia?: unknown;
  qtdDerivativos?: unknown;
  qtdValorEmTransito?: unknown;
  qtdCriptoativos?: unknown;
  qtdAportes?: unknown;
  primeiroAporte?: unknown;
  ultimoAporte?: unknown;
  carteiraAdministrada?: unknown;
  termoMarcacaoCurva?: unknown;
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
  // Detalhamento financeiro — colunas reais pós-migration multi_fonte.
  fundos?: number;
  rendaFixa?: number;
  rendaVariavel?: number;
  previdencia?: number;
  derivativos?: number;
  valorEmTransito?: number;
  criptoativos?: number;
  plDeclarado?: number;
  aportes?: number;
  retiradas?: number;
  qtdAtivos?: number;
  qtdFundos?: number;
  qtdRendaFixa?: number;
  qtdRendaVariavel?: number;
  qtdPrevidencia?: number;
  qtdDerivativos?: number;
  qtdValorEmTransito?: number;
  qtdCriptoativos?: number;
  qtdAportes?: number;
  primeiroAporte?: Date;
  ultimoAporte?: Date;
  carteiraAdministrada?: string;
  termoMarcacaoCurva?: string;
  // Preservado por compat com o caminho legacy (POST update/create) que
  // ainda referencia. Nunca mais setado aqui — fica undefined.
  breakdownProdutos?: Record<string, string | number | null>;
};

/**
 * Detecta o tipo de relatório que veio no payload baseado no perfil das
 * linhas. Cobre 3 relatórios BTG que o Eduardo usa rotineiramente:
 *
 * - `primario`: Base BTG completa (47 colunas — patrimônio, assessor,
 *   suitability, breakdown financeiro). Cria + atualiza.
 * - `update_saldo`: "Saldo em CC (D 0)" — 3 colunas: Conta, Nome, Saldo.
 *   Aqui o campo `saldo` recebido NA VERDADE é `saldoConta` (saldo em
 *   conta corrente, não PL). NUNCA cria — sem match vira órfão.
 * - `update_cadastral`: "Informações" — 28 colunas com telefone, CPF,
 *   endereço, perfil suitability, status conta. NUNCA cria.
 *
 * Critério: olhar quais campos a maioria das linhas traz, sem mexer no
 * frontend (mantém HEADER_MAP atual). A heurística é deliberadamente
 * conservadora — se em dúvida, cai no `primario` (comportamento antigo).
 */
type Modo = "primario" | "update_saldo" | "update_cadastral";

function detectarModo(clientes: ClienteLimpo[]): Modo {
  const validas = clientes.filter((c) => c.numeroConta);
  if (validas.length === 0) return "primario";
  const total = validas.length;

  let apenas3 = 0; // só { nome, numeroConta, saldo }
  let cadastraisSemFinanceiro = 0;
  let temFinanceiroForte = 0;

  for (const c of validas) {
    const definidos = (Object.keys(c) as (keyof ClienteLimpo)[]).filter(
      (k) => c[k] !== undefined,
    );
    const extras = definidos.filter((k) => k !== "nome" && k !== "numeroConta");
    if (extras.length === 1 && extras[0] === "saldo") apenas3++;

    const temFinanceiro =
      c.assessorNome !== undefined ||
      c.receitaAnual !== undefined ||
      c.breakdownProdutos !== undefined ||
      c.saldoConta !== undefined;
    const temCadastral =
      c.telefone !== undefined ||
      c.endereco !== undefined ||
      c.pendenciaCadastral !== undefined ||
      c.ativacaoConta !== undefined ||
      c.perfilInvestidor !== undefined;
    if (
      temCadastral &&
      !temFinanceiro &&
      c.saldo === undefined &&
      c.classificacao === undefined
    ) {
      cadastraisSemFinanceiro++;
    }
    if (temFinanceiro) temFinanceiroForte++;
  }

  if (apenas3 / total > 0.8) return "update_saldo";
  if (
    cadastraisSemFinanceiro / total > 0.5 &&
    temFinanceiroForte / total < 0.1
  ) {
    return "update_cadastral";
  }
  return "primario";
}

async function findExisting(c: ClienteLimpo) {
  if (c.numeroConta) {
    // Tenta variações: como veio, sem zeros à esquerda, e padronizado p/ 9 dígitos.
    // BTG exporta com 9 dígitos zerados ("002870286"); imports antigos persistiram sem zeros ("2870286").
    const variacoes = new Set<string>();
    variacoes.add(c.numeroConta);
    variacoes.add(c.numeroConta.replace(/^0+/, "") || "0");
    variacoes.add(c.numeroConta.padStart(9, "0"));
    const byConta = await prisma.clienteBackoffice.findFirst({
      where: { numeroConta: { in: Array.from(variacoes) } },
    });
    if (byConta) return byConta;
  }
  if (c.cpfCnpj) {
    const byCpf = await prisma.clienteBackoffice.findFirst({
      where: { cpfCnpj: c.cpfCnpj },
    });
    if (byCpf) return byCpf;
  }
  // Sem fallback por nome: homônimos (33 "Carlos", 23 "Luiz" etc.) faziam
  // múltiplos novos clientes parearem com o mesmo existente, sobrescrevendo
  // numeroConta repetidamente em vez de criar.
  return null;
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
        const numeroContaRaw = clean(c.numeroConta);
        // Normaliza: BTG usa 9 dígitos com zeros à esquerda. Persistir sempre
        // nesse formato pra evitar duplicação por "2870286" vs "002870286".
        const numeroConta = numeroContaRaw && /^\d+$/.test(numeroContaRaw)
          ? numeroContaRaw.padStart(9, "0")
          : numeroContaRaw;
        if (!nome && !numeroConta) return null;
        const classe = clean(c.classificacao)?.toUpperCase();
        const perfilSuit = clean(c.perfilInvestidor)?.toLowerCase();

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
          // Detalhamento financeiro — colunas reais pós-migration multi_fonte.
          fundos: parseNumber(c.fundos),
          rendaFixa: parseNumber(c.rendaFixa),
          rendaVariavel: parseNumber(c.rendaVariavel),
          previdencia: parseNumber(c.previdencia),
          derivativos: parseNumber(c.derivativos),
          valorEmTransito: parseNumber(c.valorEmTransito),
          criptoativos: parseNumber(c.criptoativos),
          plDeclarado: parseNumber(c.plDeclarado),
          aportes: parseNumber(c.aportes),
          retiradas: parseNumber(c.retiradas),
          qtdAtivos: parseInteger(c.qtdAtivos),
          qtdFundos: parseInteger(c.qtdFundos),
          qtdRendaFixa: parseInteger(c.qtdRendaFixa),
          qtdRendaVariavel: parseInteger(c.qtdRendaVariavel),
          qtdPrevidencia: parseInteger(c.qtdPrevidencia),
          qtdDerivativos: parseInteger(c.qtdDerivativos),
          qtdValorEmTransito: parseInteger(c.qtdValorEmTransito),
          qtdCriptoativos: parseInteger(c.qtdCriptoativos),
          qtdAportes: parseInteger(c.qtdAportes),
          primeiroAporte: parseDate(c.primeiroAporte),
          ultimoAporte: parseDate(c.ultimoAporte),
          carteiraAdministrada: clean(c.carteiraAdministrada),
          termoMarcacaoCurva: clean(c.termoMarcacaoCurva),
        };
      })
      .filter((c): c is ClienteLimpo => c !== null);

    if (limpos.length === 0) {
      return NextResponse.json(
        { error: "Nenhum cliente válido encontrado. A planilha precisa ter coluna 'Conta' ou 'Nome'." },
        { status: 400 },
      );
    }

    const modo = detectarModo(limpos);

    // Mapeia o `modo` (vocabulario legacy auto-detectado por detectarModo)
    // para a `fonte` da FIELD_SOURCE_POLICY. Se fonte != null, roda o
    // caminho novo (handleImportPorPoliticaPlain) que escreve os 37 campos
    // novos da migration multi_fonte e grava fonteUltimoUpdate por campo.
    // Se fonte == null (modo novo, futuro), cai no fallback legacy.
    const fontePorModo: Record<string, FonteImport | null> = {
      primario: "base_btg",
      update_saldo: "saldo_em_cc",
      update_cadastral: "informacoes",
    };
    const fonte: FonteImport | null = fontePorModo[modo] ?? null;

    // Caller pode declarar o que ACHA que está mandando (automação sempre
    // declara). Heurística divergente = arquivo errado/malformado — rejeita
    // inteiro em vez de importar no modo errado (pior caso: saldo CC
    // truncado detectado como `primario` CRIARIA clientes-fantasma).
    const fonteEsperada = clean(body?.fonteEsperada);
    if (fonteEsperada && fonteEsperada !== fonte) {
      return NextResponse.json(
        {
          error:
            `Gate de sanidade: o arquivo foi detectado como "${fonte ?? modo}", mas o ` +
            `caller declarou "${fonteEsperada}". Nada foi importado.`,
          modo,
          fonte,
          fonteEsperada,
        },
        { status: 422 },
      );
    }

    // Gate de sanidade pré-escrita do Saldo em CC: arquivo anômalo (truncado
    // ou com cabeçalho irreconhecível) é rejeitado INTEIRO — nunca parcial.
    if (fonte === "saldo_em_cc") {
      const gate = await gateSanidadeSaldoCc({
        recebidas: recebidos.length,
        validas: limpos.length,
        baseAtual: await prisma.clienteBackoffice.count(),
      });
      if (!gate.ok) {
        console.warn("[POST /clientes] gate de sanidade rejeitou:", gate.erro);
        return NextResponse.json({ error: gate.erro }, { status: 422 });
      }
    }

    const pareados = await Promise.all(
      limpos.map(async (input) => ({ input, existente: await findExisting(input) })),
    );

    // Recálculo ABC só faz sentido no modo `primario` — `update_saldo`
    // não traz PL Total (campo `saldo` lá é na verdade `saldoConta`) e
    // `update_cadastral` não traz nada financeiro.
    const saldosEfetivos =
      modo === "primario"
        ? pareados.map((p) => p.input.saldo ?? p.existente?.saldo ?? 0)
        : [];
    const { corteA, corteB } = calcularCortesABC(saldosEfetivos);

    let criados = 0;
    let atualizados = 0;
    let orfaos = 0;
    let duplicadosResolvidos = 0;
    const bloqueadosAgg: Record<string, number> = {};

    // Campos cadastrais — atualizados em `update_cadastral`. NÃO inclui
    // `nome` pra evitar regredir nome completo do BTG ("Cesar Henrique
    // Lisboa De Santana") por nome truncado do relatório Informações
    // ("Cesar").
    const CAMPOS_CADASTRAIS: (keyof ClienteLimpo)[] = [
      "cpfCnpj",
      "email",
      "telefone",
      "profissao",
      "nicho",
      "aniversario",
      "perfilInvestidor",
      "suitabilityValidoAte",
      "tipoInvestidor",
      "faixaCliente",
      "ativacaoConta",
      "pendenciaCadastral",
      "dataAberturaConta",
      "dataUltimaRevisaoCadastral",
      "dataProximaRevisaoCadastral",
      "tipoConta",
      "estadoCivil",
      "genero",
      "nacionalidade",
      "cpfConjuge",
      "endereco",
      "complemento",
      "cidade",
      "estado",
      "cep",
    ];

    if (fonte) {
      // ── CAMINHO NOVO: handleImportPorPoliticaPlain + FIELD_SOURCE_POLICY ──

      // Swap saldo→saldoConta: o XLSX oficial BTG "Saldo em CC (D 0)" usa
      // header literal "Saldo", que via HEADER_MAP cai em `saldo` (campo
      // PL). Em saldo_em_cc o significado real é saldoConta. Sem o swap,
      // a policy bloqueia (saldo só por base_btg) e nada é gravado.
      if (fonte === "saldo_em_cc") {
        for (const p of pareados) {
          if (p.input.saldo !== undefined && p.input.saldoConta === undefined) {
            p.input.saldoConta = p.input.saldo;
            p.input.saldo = undefined;
          }
        }
      }

      // Update-only modes: sem match = órfão. NUNCA cria (upsertPorPolitica
      // sempre criaria — filtra antes pra preservar a semântica legacy).
      let pareadosParaEnviar = pareados;
      if (fonte === "saldo_em_cc" || fonte === "informacoes") {
        for (const { existente } of pareados) {
          if (!existente) orfaos++;
        }
        pareadosParaEnviar = pareados.filter((p) => p.existente);
      }

      const resPolitica = await handleImportPorPoliticaPlain(
        fonte,
        pareadosParaEnviar.map((p) => p.input as unknown as IncomingCliente),
      );
      criados += resPolitica.criados;
      atualizados += resPolitica.atualizados;
      orfaos += resPolitica.descartesTotal; // sem numeroConta = órfão também
      for (const [campo, qtd] of Object.entries(resPolitica.camposBloqueados)) {
        bloqueadosAgg[campo] = (bloqueadosAgg[campo] ?? 0) + qtd;
      }

      // Contar duplicadosResolvidos: pareados com numeroConta diferente do
      // existente.numeroConta foram unificados via findExisting (CPF/nome).
      for (const { input, existente } of pareadosParaEnviar) {
        if (
          existente &&
          input.numeroConta &&
          existente.numeroConta &&
          input.numeroConta !== existente.numeroConta
        ) {
          duplicadosResolvidos++;
        }
      }

      // Recálculo ABC: só primario. updateMany agrupado por classe (3 queries
      // em vez de N loops).
      if (modo === "primario") {
        const itemsComId = resPolitica.items.filter((it) => it.id && it.acao !== "noop");
        const pareadosPorConta = new Map(
          pareadosParaEnviar.map((p) => [p.input.numeroConta ?? "", p]),
        );
        const idsA: string[] = [];
        const idsB: string[] = [];
        const idsC: string[] = [];
        const manuaisComInput: Array<{ id: string; classe: string }> = [];

        for (const item of itemsComId) {
          const p = pareadosPorConta.get(item.numeroConta);
          if (!p) continue;
          // Se input.classificacao foi enviado, vira manual (override)
          if (p.input.classificacao) {
            manuaisComInput.push({ id: item.id!, classe: p.input.classificacao });
            continue;
          }
          // Se existente já era manual, preserva (não recalcula)
          if (item.acao === "update" && p.existente?.classificacaoManual) continue;

          const saldoFinal = p.input.saldo ?? p.existente?.saldo ?? 0;
          const classe = saldoFinal >= corteA ? "A" : saldoFinal >= corteB ? "B" : "C";
          if (classe === "A") idsA.push(item.id!);
          else if (classe === "B") idsB.push(item.id!);
          else idsC.push(item.id!);
        }

        await Promise.all(
          [
            idsA.length &&
              prisma.clienteBackoffice.updateMany({
                where: { id: { in: idsA } },
                data: { classificacao: "A", classificacaoManual: false },
              }),
            idsB.length &&
              prisma.clienteBackoffice.updateMany({
                where: { id: { in: idsB } },
                data: { classificacao: "B", classificacaoManual: false },
              }),
            idsC.length &&
              prisma.clienteBackoffice.updateMany({
                where: { id: { in: idsC } },
                data: { classificacao: "C", classificacaoManual: false },
              }),
            ...manuaisComInput.map((m) =>
              prisma.clienteBackoffice.update({
                where: { id: m.id },
                data: { classificacao: m.classe, classificacaoManual: true },
              }),
            ),
          ].filter(Boolean),
        );
      }
    } else {
      // ── FALLBACK LEGACY (preservado intacto pra modos não mapeados) ──
      for (const { input, existente } of pareados) {
      // Modos de update-only NUNCA criam — sem match = órfão.
      if (!existente) {
        if (modo === "update_saldo" || modo === "update_cadastral") {
          orfaos++;
          continue;
        }
        // primario: cai pro create no else lá embaixo
      }
      const saldoFinal = input.saldo ?? existente?.saldo ?? 0;
      const classeAuto: string =
        saldoFinal >= corteA ? "A" : saldoFinal >= corteB ? "B" : "C";

      if (existente) {
        const update: Record<string, unknown> = {};
        const setIfDef = (k: keyof ClienteLimpo) => {
          if (input[k] !== undefined) update[k as string] = input[k];
        };

        if (modo === "update_saldo") {
          // Bug histórico: o header "Saldo" do XLSX "Saldo em CC" cai no
          // campo `saldo` (PL total). Aqui interpretamos como saldoConta.
          if (input.saldo !== undefined) update.saldoConta = input.saldo;
        } else if (modo === "update_cadastral") {
          for (const k of CAMPOS_CADASTRAIS) setIfDef(k);
        } else {
          // primario — comportamento atual completo
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
        }

        // Skip update vazio (modo update_saldo sem saldo na linha, etc.)
        if (Object.keys(update).length === 0) continue;

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
    }

    const rotuloModo =
      modo === "update_saldo"
        ? "Saldo em CC"
        : modo === "update_cadastral"
          ? "Informações cadastrais"
          : "Base BTG (completa)";

    const partes = [
      `Relatório: ${rotuloModo}`,
      `${criados} novos`,
      `${atualizados} atualizados`,
    ];
    if (orfaos > 0) {
      partes.push(`${orfaos} órfãos (sem match — verificar)`);
    }
    if (duplicadosResolvidos > 0) {
      partes.push(`${duplicadosResolvidos} pareados por CPF/nome`);
    }
    const qtdBloqueados = Object.keys(bloqueadosAgg).length;
    if (qtdBloqueados > 0) {
      partes.push(`${qtdBloqueados} campo(s) bloqueado(s) pela política`);
    }
    if (modo === "primario") {
      partes.push("ABC recalculado");
    }

    return NextResponse.json({
      message: partes.join(" · "),
      total: limpos.length,
      modo,
      fonte,
      rotuloModo,
      criados,
      atualizados,
      orfaos,
      duplicadosResolvidos,
      camposBloqueados: bloqueadosAgg,
    });
  } catch (error) {
    console.error("Erro ao importar clientes:", error);
    return NextResponse.json({ error: "Erro ao processar dados" }, { status: 500 });
  }
}

/**
 * Caminho novo: import respeitando FIELD_SOURCE_POLICY. Cada linha vai pelo
 * upsertPorPolitica, que (a) bloqueia campos que a fonte nao pode escrever,
 * (b) preserva valores existentes quando o campo vem vazio, e (c) registra
 * `fonteUltimoUpdate` por campo pra auditoria. Devolve breakdown completo
 * em objeto plano (sem NextResponse) pra ser composto com agregados do POST
 * principal (orfaos calculados antes, ABC calculado depois).
 *
 * `items` traz `{ numeroConta, acao, id }` pra cada linha persistida — o
 * caller usa pra recalcular ABC com updateMany agrupado por classe.
 */
interface ResultadoImportPorPolitica {
  criados: number;
  atualizados: number;
  noop: number;
  descartes: Array<{ idxBatch: number; motivo: string; amostra: string }>;
  descartesTotal: number;
  camposBloqueados: Record<string, number>;
  items: Array<{ numeroConta: string; acao: "create" | "update" | "noop"; id?: string }>;
}

async function handleImportPorPoliticaPlain(
  fonte: FonteImport,
  recebidos: IncomingCliente[],
): Promise<ResultadoImportPorPolitica> {
  // Parse + normalizacao — reaproveita parseNumber/parseDate/clean ja
  // existentes no escopo do modulo, mas filtra so os campos que a policy
  // pode escrever (passa o resto adiante; o upsertPorPolitica vai bloquear).
  const linhas = recebidos.map((c) => normalizeIncoming(c));
  const descartes: Array<{ idxBatch: number; motivo: string; amostra: string }> = [];
  const bloqueadosAgg: Record<string, number> = {};
  const items: ResultadoImportPorPolitica["items"] = [];
  let criados = 0;
  let atualizados = 0;
  let noop = 0;

  for (let idx = 0; idx < linhas.length; idx++) {
    const linha = linhas[idx];
    if (!linha.numeroConta) {
      // Sem conta nao da pra upsert. Se tiver so nome, vira descarte —
      // diferente do fluxo legacy onde "Conta XXX" era criado.
      descartes.push({
        idxBatch: idx,
        motivo: "sem numeroConta (chave de identidade)",
        amostra: JSON.stringify({ nome: linha.nome }).slice(0, 200),
      });
      continue;
    }
    try {
      const res = await upsertPorPolitica({
        numeroConta: linha.numeroConta,
        dadosImportados: linha.payload,
        fonte,
      });
      items.push({ numeroConta: linha.numeroConta, acao: res.acao, id: res.id });
      if (res.acao === "create") criados++;
      else if (res.acao === "update") atualizados++;
      else noop++;
      for (const b of res.camposBloqueados) {
        bloqueadosAgg[b.campo] = (bloqueadosAgg[b.campo] ?? 0) + 1;
      }
    } catch (e) {
      descartes.push({
        idxBatch: idx,
        motivo: `prisma upsert falhou: ${e instanceof Error ? e.message : "erro"}`,
        amostra: JSON.stringify({ numeroConta: linha.numeroConta, nome: linha.nome }).slice(0, 200),
      });
    }
  }

  console.log("[POST /clientes fonte=" + fonte + "] batch", {
    fonte,
    recebidas: recebidos.length,
    processadas: linhas.length,
    criados,
    atualizados,
    noop,
    descartesTotal: descartes.length,
    camposBloqueados: bloqueadosAgg,
  });
  if (descartes.length > 0) {
    console.warn("[POST /clientes fonte=" + fonte + "] descartes", descartes);
  }

  return {
    criados,
    atualizados,
    noop,
    descartes,
    descartesTotal: descartes.length,
    camposBloqueados: bloqueadosAgg,
    items,
  };
}

/**
 * Converte uma linha bruta (IncomingCliente) num payload chave-valor
 * pronto pra upsertPorPolitica. Aplica parseNumber/parseDate/clean nos
 * tipos esperados. Mantem EXATAMENTE os mesmos campos que o fluxo legacy
 * preenchia — quem decide se escreve eh a policy.
 */
function normalizeIncoming(c: IncomingCliente): { numeroConta: string; nome: string | undefined; payload: Record<string, unknown> } {
  const numeroConta = clean(c.numeroConta) ?? "";
  const nome = clean(c.nome);
  const payload: Record<string, unknown> = {
    nome,
    nomeCompleto: clean(c.nomeCompleto),
    cpfCnpj: cleanCpfCnpj(c.cpfCnpj),
    saldo: parseNumber(c.saldo),
    saldoConta: parseNumber(c.saldoConta),
    email: clean(c.email),
    telefone: clean(c.telefone),
    profissao: clean(c.profissao),
    nicho: clean(c.nicho),
    receitaAnual: parseNumber(c.receitaAnual),
    aniversario: parseDate(c.aniversario),
    perfilInvestidor: clean(c.perfilInvestidor)?.toLowerCase(),
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
    // Breakdown financeiro (agora colunas)
    fundos: parseNumber(c.fundos),
    rendaFixa: parseNumber(c.rendaFixa),
    rendaVariavel: parseNumber(c.rendaVariavel),
    previdencia: parseNumber(c.previdencia),
    derivativos: parseNumber(c.derivativos),
    valorEmTransito: parseNumber(c.valorEmTransito),
    criptoativos: parseNumber(c.criptoativos),
    plDeclarado: parseNumber(c.plDeclarado),
    aportes: parseNumber(c.aportes),
    retiradas: parseNumber(c.retiradas),
    primeiroAporte: parseDate(c.primeiroAporte),
    ultimoAporte: parseDate(c.ultimoAporte),
    qtdAportes: parseIntSafe(c.qtdAportes),
    qtdAtivos: parseIntSafe(c.qtdAtivos),
    qtdFundos: parseIntSafe(c.qtdFundos),
    qtdRendaFixa: parseIntSafe(c.qtdRendaFixa),
    qtdRendaVariavel: parseIntSafe(c.qtdRendaVariavel),
    qtdPrevidencia: parseIntSafe(c.qtdPrevidencia),
    qtdDerivativos: parseIntSafe(c.qtdDerivativos),
    qtdValorEmTransito: parseIntSafe(c.qtdValorEmTransito),
    qtdCriptoativos: parseIntSafe(c.qtdCriptoativos),
    carteiraAdministrada: clean(c.carteiraAdministrada),
    termoMarcacaoCurva: clean(c.termoMarcacaoCurva),
    contaCorrenteBase: parseNumber(c.contaCorrenteBase),
    dataVinculoAssessor: parseDate(c.dataVinculoAssessor),
    dataVinculoEscritorio: parseDate(c.dataVinculoEscritorio),
    documento: clean(c.documento),
    numeroDocumento: clean(c.numeroDocumento),
    dataEmissaoDocumento: parseDate(c.dataEmissaoDocumento),
    perfilAcesso: clean(c.perfilAcesso),
    statusToken: clean(c.statusToken),
    idade: parseIntSafe(c.idade),
  };
  return { numeroConta, nome, payload };
}

function parseIntSafe(v: unknown): number | undefined {
  const n = parseNumber(v);
  if (n === undefined) return undefined;
  return Math.round(n);
}

// Frase fixa exigida no body pra confirmar o wipe total — evita DELETE
// acidental (request sem corpo não apaga mais nada).
const CONFIRMACAO_DELETE_TOTAL = "REMOVER TODOS OS CLIENTES";

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  // Body é opcional no transporte, mas a confirmação é obrigatória.
  let body: { confirm?: string; force?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.confirm !== CONFIRMACAO_DELETE_TOTAL) {
    return NextResponse.json(
      {
        error: `Confirmação obrigatória: envie { "confirm": "${CONFIRMACAO_DELETE_TOTAL}" } no body para apagar TODOS os clientes.`,
      },
      { status: 400 },
    );
  }

  try {
    // Trava de dado: apagar clientes cascateia e destrói MovimentacaoBtg
    // (financeiro, insubstituível). Só prossegue se não houver movimentações
    // OU se vier force explícito — para o caso legítimo de reset.
    const movimentacoes = await prisma.movimentacaoBtg.count();
    if (movimentacoes > 0 && body.force !== true) {
      return NextResponse.json(
        {
          error: `Existem ${movimentacoes} movimentações BTG que seriam apagadas em cascata. Envie { "force": true } junto da confirmação para prosseguir.`,
          movimentacoes,
        },
        { status: 409 },
      );
    }

    await prisma.clienteBackoffice.deleteMany();
    return NextResponse.json({ message: "Dados removidos com sucesso" });
  } catch (error) {
    console.error("Erro ao remover clientes:", error);
    return NextResponse.json({ error: "Erro ao remover dados" }, { status: 500 });
  }
}
