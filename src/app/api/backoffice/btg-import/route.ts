import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import * as btg from "@/lib/integrations/btg";

/**
 * POST /api/backoffice/btg-import
 *
 * Importa todos os clientes Onix usando a Base de Contas BTG como fonte da verdade.
 * Fluxo: listAllAccounts -> listAllBalances -> getPartnerPositions -> per-account getAccountInformation (rate-limited 55/min).
 * Faz upsert em ClienteBackoffice por numeroConta preservando campos editados manualmente.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Não autenticado" }, { status: 401 });
  }

  const log = await prisma.btgSyncLog.create({
    data: { tipo: "import", trigger: "manual", userId: session.userId },
  });

  // 1. Lista canônica de contas
  const accountsRes = await btg.listAllAccounts();
  if (accountsRes.status !== 200) {
    const msg = extractErrorMessage(accountsRes.body) || `HTTP ${accountsRes.status}`;
    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: {
        finalizado: new Date(),
        sucesso: false,
        resumo: `Falha em listAllAccounts: ${msg}`,
        erros: [{ etapa: "listAllAccounts", motivo: msg, sample: accountsRes.raw.slice(0, 500) }],
      },
    });
    return NextResponse.json(
      {
        success: false,
        message: `BTG listAllAccounts retornou ${accountsRes.status}: ${msg}`,
        bodyShape: shapeOf(accountsRes.body),
        sample: accountsRes.raw.slice(0, 1000),
      },
      { status: 502 },
    );
  }

  const contas = parseAccountList(accountsRes.body);
  if (contas.length === 0) {
    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: {
        finalizado: new Date(),
        sucesso: false,
        resumo: "Lista de contas vazia ou shape desconhecido",
        erros: [{ etapa: "parseAccountList", bodyShape: shapeOf(accountsRes.body), sample: accountsRes.raw.slice(0, 500) }],
      },
    });
    return NextResponse.json(
      {
        success: false,
        message: "Não foi possível extrair lista de contas do BTG",
        bodyShape: shapeOf(accountsRes.body),
        sample: accountsRes.raw.slice(0, 1000),
      },
      { status: 502 },
    );
  }

  // 2. Saldos (tolerante)
  const saldosMap = new Map<string, { saldo: number; saldoConta: number }>();
  let balancesShape = "";
  let balancesSample = "";
  try {
    const balancesRes = await btg.listAllBalances();
    balancesShape = shapeOf(balancesRes.body);
    balancesSample = balancesRes.raw.slice(0, 500);
    if (balancesRes.status === 200) {
      for (const b of parseBalanceList(balancesRes.body)) {
        saldosMap.set(normalizeAccount(b.numeroConta), { saldo: b.saldoTotal, saldoConta: b.saldoConta });
      }
      console.log(`[btg-import] listAllBalances parseou ${saldosMap.size} contas. Shape: ${balancesShape}`);
    } else {
      console.warn(`[btg-import] listAllBalances ${balancesRes.status}: ${balancesSample}`);
    }
  } catch (e) {
    console.warn(`[btg-import] listAllBalances erro:`, e);
  }

  // 3. Posições (tolerante — fornece breakdown + AUM por conta)
  const posicoesMap = new Map<string, { aum: number; positionDate: Date | null; breakdown: unknown }>();
  try {
    const posRes = await btg.getPartnerPositions();
    if (posRes.status === 200) {
      for (const p of parsePartnerPositions(posRes.body)) {
        posicoesMap.set(normalizeAccount(p.numeroConta), {
          aum: p.aum,
          positionDate: p.positionDate,
          breakdown: p.breakdown,
        });
      }
    } else {
      console.warn(`[btg-import] getPartnerPositions ${posRes.status}: ${posRes.raw.slice(0, 200)}`);
    }
  } catch (e) {
    console.warn(`[btg-import] getPartnerPositions erro:`, e);
  }

  // 4. Upsert por conta — usa só Base de Contas + Saldo + Posição (rápido).
  // Dados Cadastrais (60 req/min, demorado) ficam no /btg-enrich pra evitar timeout.
  const erros: Array<{ conta: string; etapa: string; motivo: string }> = [];
  let criados = 0;
  let atualizados = 0;

  for (const conta of contas) {
    const numeroConta = normalizeAccount(conta.numeroConta);
    try {
      const saldos = saldosMap.get(numeroConta) || { saldo: 0, saldoConta: 0 };
      const posicao = posicoesMap.get(numeroConta);
      const aum = posicao?.aum ?? saldos.saldo;

      const existente = await prisma.clienteBackoffice.findFirst({
        where: { numeroConta },
        select: { id: true },
      });

      if (existente) {
        await prisma.clienteBackoffice.update({
          where: { id: existente.id },
          data: {
            saldo: aum,
            saldoConta: saldos.saldoConta,
            breakdownProdutos: (posicao?.breakdown as never) ?? undefined,
            positionDate: posicao?.positionDate ?? undefined,
            ultimaSyncBtg: new Date(),
          },
        });
        atualizados++;
      } else {
        await prisma.clienteBackoffice.create({
          data: {
            numeroConta,
            nome: `Cliente ${numeroConta}`,
            saldo: aum,
            saldoConta: saldos.saldoConta,
            breakdownProdutos: (posicao?.breakdown as never) ?? undefined,
            positionDate: posicao?.positionDate ?? undefined,
            ultimaSyncBtg: new Date(),
          },
        });
        criados++;
      }
    } catch (e) {
      erros.push({ conta: numeroConta, etapa: "upsert", motivo: e instanceof Error ? e.message : "erro desconhecido" });
    }
  }

  const totalAum = Array.from(posicoesMap.values()).reduce((s, p) => s + p.aum, 0);

  await prisma.btgSyncLog.update({
    where: { id: log.id },
    data: {
      finalizado: new Date(),
      sucesso: erros.length === 0,
      contasProcessadas: criados + atualizados,
      contasComErro: erros.length,
      resumo: `${criados} criado(s), ${atualizados} atualizado(s), ${erros.length} erro(s). Saldos parseados: ${saldosMap.size}/${contas.length} (shape: ${balancesShape}). AUM total: R$ ${totalAum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      erros: erros.length > 0 ? erros : undefined,
    },
  });

  return NextResponse.json({
    success: true,
    message: `${criados} cliente(s) criado(s), ${atualizados} atualizado(s), ${erros.length} erro(s). Saldos parseados: ${saldosMap.size}/${contas.length}. AUM total: R$ ${totalAum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    criados,
    atualizados,
    totalContas: contas.length,
    totalAum,
    saldosParseados: saldosMap.size,
    balancesShape,
    balancesSample: saldosMap.size === 0 ? balancesSample : undefined,
    erros: erros.slice(0, 50),
  });
}

// ===== PARSERS DEFENSIVOS =====

interface ParsedAccount { numeroConta: string }
interface ParsedBalance { numeroConta: string; saldoTotal: number; saldoConta: number }
interface ParsedPosition { numeroConta: string; aum: number; positionDate: Date | null; breakdown: unknown }
interface ParsedCadastral {
  nome: string | null;
  cpfCnpj: string | null;
  email: string | null;
  telefone: string | null;
  coHolders: unknown;
  usuariosBtg: unknown;
}

function asArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const k of ["data", "accounts", "balances", "positions", "result", "items", "content"]) {
      if (Array.isArray(obj[k])) return obj[k] as unknown[];
    }
  }
  return [];
}

function parseAccountList(body: unknown): ParsedAccount[] {
  return asArray(body)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const p = item as Record<string, unknown>;
      const conta = pickString(p, ["accountNumber", "AccountNumber", "account", "numeroConta", "Conta"]);
      return conta ? { numeroConta: conta } : null;
    })
    .filter((x): x is ParsedAccount => x !== null);
}

function parseBalanceList(body: unknown): ParsedBalance[] {
  return asArray(body)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const p = item as Record<string, unknown>;
      const conta = pickString(p, ["accountNumber", "AccountNumber", "account", "numeroConta"]);
      if (!conta) return null;
      const saldoConta = pickNumber(p, ["availableBalance", "cashBalance", "AvailableBalance", "CashBalance", "balance", "Balance", "saldo"]) ?? 0;
      const saldoTotal = pickNumber(p, ["totalBalance", "TotalBalance", "totalAmount", "TotalAmmount", "TotalAmount"]) ?? saldoConta;
      return { numeroConta: conta, saldoTotal, saldoConta };
    })
    .filter((x): x is ParsedBalance => x !== null);
}

function parsePartnerPositions(body: unknown): ParsedPosition[] {
  return asArray(body)
    .map((item): ParsedPosition | null => {
      if (!item || typeof item !== "object") return null;
      const p = item as Record<string, unknown>;
      const conta = pickString(p, ["accountNumber", "AccountNumber", "account", "numeroConta"]);
      if (!conta) return null;
      const aum = pickNumber(p, ["TotalAmmount", "TotalAmount", "totalAmount", "AUM", "total", "GrossValue"]) ?? 0;
      const dateStr = pickString(p, ["PositionDate", "positionDate", "date", "Date"]);
      const positionDate = dateStr ? safeDate(dateStr) : null;
      return { numeroConta: conta, aum, positionDate, breakdown: p };
    })
    .filter((x): x is ParsedPosition => x !== null);
}

function parseAccountInformation(body: unknown): ParsedCadastral {
  if (!body || typeof body !== "object") {
    return { nome: null, cpfCnpj: null, email: null, telefone: null, coHolders: null, usuariosBtg: null };
  }
  const p = body as Record<string, unknown>;
  const holder = (p.holder ?? p.Holder) as Record<string, unknown> | undefined;
  const coHolders = (p.coHolders ?? p.CoHolders) as unknown[] | undefined;
  const users = (p.users ?? p.Users) as Array<Record<string, unknown>> | undefined;

  const nome = holder ? pickString(holder, ["name", "Name"]) : null;
  const cpfCnpj = holder ? pickString(holder, ["taxIdentification", "TaxIdentification", "cpf", "cnpj"]) : null;

  const owner = users?.find((u) => u.isOwner === true) || users?.[0];
  const email = owner ? pickString(owner, ["userEmail", "email", "Email"]) : null;
  const telefone = owner ? pickString(owner, ["phoneNumber", "phone", "Phone"]) : null;

  return {
    nome,
    cpfCnpj,
    email,
    telefone,
    coHolders: coHolders ?? null,
    usuariosBtg: users ?? null,
  };
}

// ===== HELPERS =====

function shouldReplaceName(atual: string, novo: string | null): boolean {
  if (!novo) return false;
  // Substitui só se o nome atual é placeholder "Cliente NNN" ou vazio
  return /^Cliente\s+\d+$/.test(atual.trim()) || atual.trim() === "";
}

function normalizeAccount(s: string): string {
  return s.replace(/^0+/, "").trim();
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && !isNaN(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

function safeDate(s: string): Date | null {
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function extractErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  const meta = obj.meta as Record<string, unknown> | undefined;
  const globalErrors = meta?.globalErrors as Array<{ message?: string }> | undefined;
  if (globalErrors?.[0]?.message) return globalErrors[0].message;
  const errors = obj.errors as Array<{ message?: string }> | undefined;
  if (errors?.[0]?.message) return errors[0].message;
  const message = obj.message;
  if (typeof message === "string") return message;
  return null;
}

function shapeOf(body: unknown): string {
  if (body === null) return "null";
  if (Array.isArray(body)) return `array[${body.length}]`;
  if (typeof body !== "object") return typeof body;
  return `object{${Object.keys(body as Record<string, unknown>).slice(0, 10).join(",")}}`;
}
