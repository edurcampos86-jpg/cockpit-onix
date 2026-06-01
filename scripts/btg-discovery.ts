/**
 * Descoberta Entrega A — dumpa o payload INTEIRO de getAccountInformation e
 * getSuitabilityInfo pra 2-3 contas reais, pra mapear o que a Partner API
 * realmente devolve vs as colunas do arquivo Base.
 *
 * Rodar com creds de prod:
 *   railway run -s cockpit-onix npx tsx scripts/btg-discovery.ts
 *
 * NÃO commitar a saída (contém dados cadastrais reais). Output vai pra
 * scripts/_btg-discovery-output.json (gitignored).
 */
import * as fs from "fs";
import * as path from "path";
import * as btg from "../src/lib/integrations/btg";

function asArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const k of ["data", "accounts", "balances", "result", "items", "content"]) {
      if (Array.isArray(obj[k])) return obj[k] as unknown[];
    }
  }
  return [];
}

function pickAccountNumber(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const p = item as Record<string, unknown>;
  for (const k of ["accountNumber", "AccountNumber", "account", "numeroConta", "Conta"]) {
    const v = p[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

async function main() {
  const out: Record<string, unknown> = {};

  console.log("== token ==");
  const conn = await btg.testConnection();
  console.log(conn.message);
  out.connection = conn;

  console.log("\n== listAllAccounts ==");
  const accRes = await btg.listAllAccounts();
  console.log("status", accRes.status);
  const accounts = asArray(accRes.body).map(pickAccountNumber).filter((x): x is string => !!x);
  console.log("total contas:", accounts.length);
  out.totalAccounts = accounts.length;
  out.accountListShape = Object.keys((accRes.body as Record<string, unknown>) ?? {}).slice(0, 10);
  // amostra do shape de UM item da base de contas (pode trazer dados úteis)
  out.accountListSampleItem = asArray(accRes.body)[0] ?? null;

  const sample = accounts.slice(0, 3);
  console.log("amostra:", sample);
  out.sampleAccounts = sample;

  out.perAccount = [];
  for (const conta of sample) {
    console.log(`\n== conta ${conta} ==`);
    const info = await btg.getAccountInformation(conta);
    await new Promise((r) => setTimeout(r, 1200)); // respeitar 55/min
    const suit = await btg.getSuitabilityInfo(conta);
    await new Promise((r) => setTimeout(r, 1200));
    const suitFull = await btg.getSuitability(conta);
    await new Promise((r) => setTimeout(r, 1200));
    console.log("  accountInformation status", info.status);
    console.log("  suitabilityInfo status", suit.status);
    console.log("  suitability status", suitFull.status);
    (out.perAccount as unknown[]).push({
      conta,
      accountInformation: { status: info.status, body: info.body },
      suitabilityInfo: { status: suit.status, body: suit.body },
      suitability: { status: suitFull.status, body: suitFull.body },
    });
  }

  const outPath = path.resolve(process.cwd(), "scripts/_btg-discovery-output.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("\n>> escrito em", outPath);
}

main().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
