/**
 * Bateria de testes pra parser financeiro + (opcional) check de
 * reconciliação contra o endpoint /api/backoffice/btg-reconcile.
 *
 * Como rodar:
 *   tsx scripts/recon-btg.ts                       # só testes de parser
 *   RECON_URL=http://localhost:3000 tsx scripts/recon-btg.ts   # + recon live
 *
 * Sai com código 1 se algum teste falhar OU se a reconciliação ao vivo
 * acusar divergência > 0,01%. Pensado pra rodar em CI ou cron pós-import.
 */
import { parseValorFinanceiro, temPendenciaCadastral } from "../src/lib/backoffice/parse-financeiro";

interface TestCase {
  desc: string;
  input: unknown;
  expected: number | undefined;
}

const PARSER_CASES: TestCase[] = [
  // ── happy path ────────────────────────────────────────────────────────
  { desc: "número JS positivo", input: 1234.56, expected: 1234.56 },
  { desc: "número JS negativo", input: -50, expected: -50 },
  { desc: "número JS zero", input: 0, expected: 0 },
  { desc: "string pt-BR sem símbolo", input: "1.234,56", expected: 1234.56 },
  { desc: "string pt-BR com R$", input: "R$ 1.234,56", expected: 1234.56 },
  { desc: "string en-US", input: "1,234.56", expected: 1234.56 },
  { desc: "inteiro pt-BR", input: "1234", expected: 1234 },
  { desc: "milhar sem decimal", input: "1.234.567", expected: 1234567 },
  { desc: "decimal curto en-US", input: "12.34", expected: 12.34 },
  { desc: "decimal pequeno", input: "0.99", expected: 0.99 },
  { desc: "milhar único pt-BR sem decimal", input: "12.345", expected: 12345 },
  { desc: "BTG number-as-string", input: "3145724.32", expected: 3145724.32 },

  // ── negativos em todos os formatos que o BTG produz ───────────────────
  { desc: "negativo simples pt-BR", input: "-1.234,56", expected: -1234.56 },
  { desc: "negativo com R$ antes do menos", input: "R$ -1.234,56", expected: -1234.56 },
  { desc: "negativo com menos antes do R$", input: "-R$ 1.234,56", expected: -1234.56 },
  { desc: "contábil parens", input: "(1.234,56)", expected: -1234.56 },
  { desc: "contábil parens com R$", input: "(R$ 1.234,56)", expected: -1234.56 },
  { desc: "sinal no fim", input: "1.234,56-", expected: -1234.56 },
  { desc: "negativo pequeno", input: "-0,99", expected: -0.99 },

  // ── vazios e inválidos viram undefined (NÃO 0) ────────────────────────
  { desc: "string vazia", input: "", expected: undefined },
  { desc: "só espaços", input: "   ", expected: undefined },
  { desc: "null", input: null, expected: undefined },
  { desc: "undefined", input: undefined, expected: undefined },
  { desc: "traço único", input: "-", expected: undefined },
  { desc: "em-dash", input: "—", expected: undefined },
  { desc: "texto lixo", input: "ABC123", expected: undefined },
  { desc: "NaN literal", input: NaN, expected: undefined },
  { desc: "Infinity literal", input: Infinity, expected: undefined },
];

const PENDENCIA_CASES: Array<{ input: string | null; expected: boolean }> = [
  { input: null, expected: false },
  { input: "", expected: false },
  { input: "Não", expected: false },
  { input: "nao", expected: false },
  { input: "Sem pendência", expected: false },
  { input: "ok", expected: false },
  { input: "Sim", expected: true },
  { input: "Validar suitability", expected: true },
  { input: "Aguardando documento", expected: true },
];

function aprox(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

function fmt(v: unknown): string {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "number" && Number.isNaN(v)) return "NaN";
  return JSON.stringify(v);
}

async function rodarTestesParser(): Promise<{ ok: number; fail: number }> {
  let ok = 0;
  let fail = 0;
  console.log("\n— parseValorFinanceiro —");
  for (const tc of PARSER_CASES) {
    const got = parseValorFinanceiro(tc.input);
    const passou =
      tc.expected === undefined
        ? got === undefined
        : typeof got === "number" && aprox(got, tc.expected);
    if (passou) {
      ok++;
      console.log(`  ✓ ${tc.desc} (${fmt(tc.input)} → ${fmt(got)})`);
    } else {
      fail++;
      console.error(`  ✗ ${tc.desc}: esperado ${fmt(tc.expected)}, recebeu ${fmt(got)} (entrada ${fmt(tc.input)})`);
    }
  }
  console.log("\n— temPendenciaCadastral —");
  for (const tc of PENDENCIA_CASES) {
    const got = temPendenciaCadastral(tc.input);
    const passou = got === tc.expected;
    if (passou) {
      ok++;
      console.log(`  ✓ "${tc.input ?? "<null>"}" → ${got}`);
    } else {
      fail++;
      console.error(`  ✗ "${tc.input ?? "<null>"}": esperado ${tc.expected}, recebeu ${got}`);
    }
  }
  return { ok, fail };
}

async function rodarReconLive(baseUrl: string): Promise<boolean> {
  console.log(`\n— recon live (${baseUrl}/api/backoffice/btg-reconcile) —`);
  try {
    const res = await fetch(`${baseUrl}/api/backoffice/btg-reconcile`);
    const data = (await res.json()) as {
      success?: boolean;
      reconciliacao?: {
        aumBtg: number;
        aumDb: number;
        saldoContaBtg: number;
        saldoContaDb: number;
        contasBtg: number;
        contasDb: number;
        divergPctAum: number;
        divergPctSaldoConta: number;
        divergPctContas: number;
        divergeAcima: boolean;
        somenteNoBtg?: string[];
        somenteNoDb?: string[];
      };
      resumo?: string;
      message?: string;
    };
    if (!res.ok) {
      console.error(`  ✗ HTTP ${res.status}: ${data.message ?? "sem mensagem"}`);
      return false;
    }
    const r = data.reconciliacao;
    if (!r) {
      console.error("  ✗ resposta sem campo `reconciliacao`");
      return false;
    }
    console.log(`  contas: BTG=${r.contasBtg}, DB=${r.contasDb} (Δ ${(r.divergPctContas * 100).toFixed(3)}%)`);
    console.log(`  AUM:    BTG=${r.aumBtg.toLocaleString("pt-BR")}, DB=${r.aumDb.toLocaleString("pt-BR")} (Δ ${(r.divergPctAum * 100).toFixed(3)}%)`);
    console.log(`  saldo:  BTG=${r.saldoContaBtg.toLocaleString("pt-BR")}, DB=${r.saldoContaDb.toLocaleString("pt-BR")} (Δ ${(r.divergPctSaldoConta * 100).toFixed(3)}%)`);
    if (r.somenteNoBtg && r.somenteNoBtg.length > 0) {
      console.log(`  só no BTG: ${r.somenteNoBtg.slice(0, 10).join(", ")}${r.somenteNoBtg.length > 10 ? "..." : ""}`);
    }
    if (r.somenteNoDb && r.somenteNoDb.length > 0) {
      console.log(`  só no DB:  ${r.somenteNoDb.slice(0, 10).join(", ")}${r.somenteNoDb.length > 10 ? "..." : ""}`);
    }
    if (r.divergeAcima) {
      console.error(`\n  ✗ DIVERGÊNCIA acima do limite (0,01%): bloqueia publicação`);
      return false;
    }
    console.log("\n  ✓ recon dentro do limite (0,01%)");
    return true;
  } catch (e) {
    console.error(`  ✗ falha ao chamar /btg-reconcile: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

(async () => {
  const { ok, fail } = await rodarTestesParser();
  console.log(`\nParser: ${ok} passou, ${fail} falhou`);

  let reconOk = true;
  if (process.env.RECON_URL) {
    reconOk = await rodarReconLive(process.env.RECON_URL.replace(/\/$/, ""));
  } else {
    console.log("\n(skip recon live: defina RECON_URL=http://localhost:3000 pra rodar)");
  }

  if (fail > 0 || !reconOk) {
    process.exit(1);
  }
})();
