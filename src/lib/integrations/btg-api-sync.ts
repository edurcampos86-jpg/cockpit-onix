import "server-only";
import { prisma } from "@/lib/prisma";
import * as btg from "./btg";
import { upsertPorPolitica } from "@/lib/backoffice/upsert-cliente";

/**
 * Sync da Partner API BTG pra dentro de ClienteBackoffice, respeitando
 * FIELD_SOURCE_POLICY (fonte "api"). Tira o login do Eduardo do circuito.
 *
 * Cobertura confirmada via scripts/btg-discovery.ts (3 contas reais):
 *   - listAllBalances    → saldoConta (availableBalance) — bulk, 1 chamada
 *   - getAccountInformation → nomeCompleto (holder.name), cpfCnpj
 *                             (holder.taxIdentification), email/telefone
 *                             (users[owner])
 *   - getSuitabilityInfo → perfilInvestidor (description), suitabilityValidoAte
 *                          (expirationDate)
 *
 * Tudo o que a API NÃO traz (profissão, estado civil, PL declarado, renda
 * anual, AUM, breakdown) NÃO é tocado — `api` não é fonte autorizada nesses
 * campos, então upsertPorPolitica bloqueia. Segue vindo do arquivo.
 *
 * Os dois syncs SÓ atualizam clientes que JÁ existem no DB (a criação canônica
 * é o /api/backoffice/btg-import a partir de listAllAccounts). Nunca criam
 * cliente a partir de um saldo/cadastro solto.
 *
 * getPartnerPositions retornou vazio na descoberta (precisa refresh+webhook),
 * então AUM/breakdown continuam vindo do arquivo — este módulo NÃO depende dele.
 */

const FONTE = "api" as const;

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
      const n = parseFloat(v.replace(",", "."));
      if (!isNaN(n)) return n;
    }
  }
  return null;
}

function safeDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

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

function extractErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  const meta = obj.meta as Record<string, unknown> | undefined;
  const ge = meta?.globalErrors as Array<{ message?: string }> | undefined;
  if (ge?.[0]?.message) return ge[0].message;
  const errors = obj.errors as Array<{ message?: string }> | undefined;
  if (errors?.[0]?.message) return errors[0].message;
  const m = obj.message;
  return typeof m === "string" ? m : null;
}

// ===================================================================
// SYNC 1 — SALDOS (diário, bulk)
// ===================================================================

export interface SyncBtgBalancesResult {
  ok: boolean;
  logId: string;
  contasBtg: number; // contas retornadas pelo listAllBalances
  contasAtualizadas: number; // clientes nossos com saldoConta atualizado
  semClienteLocal: number; // saldos sem cliente correspondente no DB
  erros: Array<{ conta?: string; etapa: string; motivo: string }>;
  durationMs: number;
  message: string;
}

export async function syncBtgBalances(opts: {
  trigger: "manual" | "cron";
  userId?: string | null;
}): Promise<SyncBtgBalancesResult> {
  const start = Date.now();
  const log = await prisma.btgSyncLog.create({
    data: { tipo: "balances", trigger: opts.trigger, userId: opts.userId ?? undefined, resumo: "api/balances" },
  });

  const erros: Array<{ conta?: string; etapa: string; motivo: string }> = [];
  let contasBtg = 0;
  let contasAtualizadas = 0;
  let semClienteLocal = 0;

  try {
    // Só atualizamos clientes que já existem — pré-carrega o set de contas.
    const existentes = await prisma.clienteBackoffice.findMany({
      where: { numeroConta: { not: "" } },
      select: { numeroConta: true },
    });
    const contasLocais = new Set(existentes.map((c) => normalizeAccount(c.numeroConta)));

    const res = await btg.listAllBalances();
    if (res.status !== 200) {
      throw new Error(`listAllBalances HTTP ${res.status}: ${extractErrorMessage(res.body) || res.raw.slice(0, 200)}`);
    }

    for (const item of asArray(res.body)) {
      if (!item || typeof item !== "object") continue;
      const p = item as Record<string, unknown>;
      const contaRaw = pickString(p, ["account", "accountNumber", "AccountNumber", "numeroConta"]);
      if (!contaRaw) continue;
      contasBtg++;
      const conta = normalizeAccount(contaRaw);
      if (!contasLocais.has(conta)) {
        semClienteLocal++;
        continue;
      }
      // availableBalance = cash disponível em conta corrente (= saldoConta).
      const saldoConta = pickNumber(p, ["availableBalance", "AvailableBalance", "balance", "Balance"]);
      if (saldoConta === null) continue;
      try {
        const r = await upsertPorPolitica({
          numeroConta: conta,
          dadosImportados: { saldoConta },
          fonte: FONTE,
        });
        if (r.camposEscritos.length > 0) contasAtualizadas++;
      } catch (e) {
        erros.push({ conta, etapa: "upsert", motivo: e instanceof Error ? e.message : "?" });
      }
    }
  } catch (e) {
    erros.push({ etapa: "listAllBalances", motivo: e instanceof Error ? e.message : "?" });
  }

  const durationMs = Date.now() - start;
  const message = `saldoConta atualizado em ${contasAtualizadas} cliente(s). ${contasBtg} contas BTG, ${semClienteLocal} sem cliente local, ${erros.length} erro(s).`;
  await prisma.btgSyncLog.update({
    where: { id: log.id },
    data: {
      finalizado: new Date(),
      sucesso: erros.length === 0,
      contasProcessadas: contasAtualizadas,
      contasComErro: erros.length,
      resumo: message,
      erros: erros.length > 0 ? (erros as never) : undefined,
    },
  });

  return { ok: erros.length === 0, logId: log.id, contasBtg, contasAtualizadas, semClienteLocal, erros, durationMs, message };
}

// ===================================================================
// SYNC 2 — CADASTRAIS + SUITABILITY (semanal, incremental, 55/min)
// ===================================================================

interface ParsedInfo {
  nomeCompleto: string | null;
  cpfCnpj: string | null;
  email: string | null;
  telefone: string | null;
}

function parseAccountInformation(body: unknown): ParsedInfo {
  if (!body || typeof body !== "object") {
    return { nomeCompleto: null, cpfCnpj: null, email: null, telefone: null };
  }
  const p = body as Record<string, unknown>;
  const holder = (p.holder ?? p.Holder) as Record<string, unknown> | undefined;
  const users = (p.users ?? p.Users) as Array<Record<string, unknown>> | undefined;
  const owner = users?.find((u) => u.isOwner === true) || users?.[0];
  return {
    nomeCompleto: holder ? pickString(holder, ["name", "Name"]) : null,
    cpfCnpj: holder ? pickString(holder, ["taxIdentification", "TaxIdentification", "cpf", "cnpj"]) : null,
    email: owner ? pickString(owner, ["userEmail", "email", "Email"]) : null,
    telefone: owner ? pickString(owner, ["phoneNumber", "phone", "Phone"]) : null,
  };
}

interface ParsedSuit {
  perfilInvestidor: string | null;
  suitabilityValidoAte: Date | null;
}

// Mesma normalização do /api/backoffice/btg-enrich pra perfilInvestidor ficar
// consistente ("conservador" | "moderado" | "sofisticado"), não "Sofisticado".
function normalizePerfil(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  if (s === "cons" || s.includes("conserv")) return "conservador";
  if (s === "mod" || s.includes("moderad")) return "moderado";
  if (s === "soph" || s === "agr" || s.includes("sofist") || s.includes("agress") || s.includes("arroj")) return "sofisticado";
  return s || null;
}

function parseSuitabilityInfo(body: unknown): ParsedSuit {
  if (!body || typeof body !== "object") return { perfilInvestidor: null, suitabilityValidoAte: null };
  const p = body as Record<string, unknown>;
  return {
    perfilInvestidor: normalizePerfil(pickString(p, ["description", "Description", "code", "Code"])),
    suitabilityValidoAte: safeDate(pickString(p, ["expirationDate", "ExpirationDate"])),
  };
}

export interface SyncBtgCadastralResult {
  ok: boolean;
  logId: string;
  candidatos: number; // clientes sem info que entraram na fila
  processados: number;
  atualizados: number;
  nomeCompletoNovos: number; // clientes que ganharam nomeCompleto agora (ganho de recall do matcher)
  erros: Array<{ conta?: string; etapa: string; motivo: string }>;
  durationMs: number;
  message: string;
}

export async function syncBtgCadastral(opts: {
  trigger: "manual" | "cron";
  userId?: string | null;
  limit?: number; // teto de contas por execução (proteção de tempo)
}): Promise<SyncBtgCadastralResult> {
  const start = Date.now();
  const log = await prisma.btgSyncLog.create({
    data: { tipo: "enrich", trigger: opts.trigger, userId: opts.userId ?? undefined, resumo: "api/cadastral" },
  });

  const erros: Array<{ conta?: string; etapa: string; motivo: string }> = [];
  let processados = 0;
  let atualizados = 0;
  let nomeCompletoNovos = 0;

  // Incremental: só contas "novas ou sem info" — sem nomeCompleto OU sem
  // cpfCnpj OU sem perfilInvestidor (ainda não enriquecidas pela API).
  const candidatosRows = await prisma.clienteBackoffice.findMany({
    where: {
      numeroConta: { not: "" },
      OR: [{ ativacaoConta: "Ativa" }, { ativacaoConta: null }],
      AND: [{ OR: [{ nomeCompleto: null }, { cpfCnpj: null }, { perfilInvestidor: null }] }],
    },
    select: { numeroConta: true, nomeCompleto: true },
    // 480 contas ≈ 9min a 55/min — cabe na janela de curl do cron (max-time 540s
    // pra esse path em cron.yml). Como o filtro é "sem info", cada run pega
    // as próximas contas pendentes (self-paginação); o backlog inicial drena
    // em ~5-6 runs semanais (ou acelere via workflow_dispatch manual).
    take: opts.limit ?? 480,
  });

  try {
    await btg.rateLimitedSequential(
      candidatosRows,
      async (cliente) => {
        const conta = normalizeAccount(cliente.numeroConta);
        processados++;
        const dados: Record<string, unknown> = {};
        try {
          const infoRes = await btg.getAccountInformation(conta);
          if (infoRes.status === 200) {
            const info = parseAccountInformation(infoRes.body);
            if (info.nomeCompleto) dados.nomeCompleto = info.nomeCompleto;
            if (info.cpfCnpj) dados.cpfCnpj = info.cpfCnpj;
            if (info.email) dados.email = info.email;
            if (info.telefone) dados.telefone = info.telefone;
          } else if (infoRes.status !== 404) {
            erros.push({ conta, etapa: "getAccountInformation", motivo: extractErrorMessage(infoRes.body) || `HTTP ${infoRes.status}` });
          }
        } catch (e) {
          erros.push({ conta, etapa: "getAccountInformation", motivo: e instanceof Error ? e.message : "?" });
        }
        try {
          const suitRes = await btg.getSuitabilityInfo(conta);
          if (suitRes.status === 200) {
            const suit = parseSuitabilityInfo(suitRes.body);
            if (suit.perfilInvestidor) dados.perfilInvestidor = suit.perfilInvestidor;
            if (suit.suitabilityValidoAte) dados.suitabilityValidoAte = suit.suitabilityValidoAte;
          } else if (suitRes.status !== 404) {
            erros.push({ conta, etapa: "getSuitabilityInfo", motivo: extractErrorMessage(suitRes.body) || `HTTP ${suitRes.status}` });
          }
        } catch (e) {
          erros.push({ conta, etapa: "getSuitabilityInfo", motivo: e instanceof Error ? e.message : "?" });
        }

        if (Object.keys(dados).length === 0) return;
        try {
          const r = await upsertPorPolitica({ numeroConta: conta, dadosImportados: dados, fonte: FONTE });
          if (r.camposEscritos.length > 0) {
            atualizados++;
            // ganho de recall: nomeCompleto que estava vazio e foi preenchido agora
            if (!cliente.nomeCompleto && r.camposEscritos.includes("nomeCompleto")) nomeCompletoNovos++;
          }
        } catch (e) {
          erros.push({ conta, etapa: "upsert", motivo: e instanceof Error ? e.message : "?" });
        }
      },
      { maxPerMinute: 55 },
    );
  } catch (e) {
    erros.push({ etapa: "rateLimitedSequential", motivo: e instanceof Error ? e.message : "?" });
  }

  const durationMs = Date.now() - start;
  const message = `${atualizados} cliente(s) enriquecido(s) de ${processados} processado(s) (${candidatosRows.length} candidatos). nomeCompleto novo em ${nomeCompletoNovos}. ${erros.length} erro(s).`;
  await prisma.btgSyncLog.update({
    where: { id: log.id },
    data: {
      finalizado: new Date(),
      sucesso: erros.length === 0,
      contasProcessadas: atualizados,
      contasComErro: erros.length,
      resumo: message,
      erros: erros.length > 0 ? (erros as never) : undefined,
    },
  });

  return {
    ok: erros.length === 0,
    logId: log.id,
    candidatos: candidatosRows.length,
    processados,
    atualizados,
    nomeCompletoNovos,
    erros,
    durationMs,
    message,
  };
}
