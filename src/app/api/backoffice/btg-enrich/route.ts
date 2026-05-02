import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import * as btg from "@/lib/integrations/btg";

/**
 * POST /api/backoffice/btg-enrich
 *
 * Enriquece ClienteBackoffice já existentes com:
 * - Suitability (perfilInvestidor + validade)
 * - Relacionamento Conta×Assessor (assessorCge + assessorNome)
 * - Comissões (receitaAnual estimada = mês × 12)
 *
 * Query: ?clienteId=xxx (opcional — se não passar, processa todos os clientes com numeroConta)
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Não autenticado" }, { status: 401 });
  }

  const clienteIdFiltro = req.nextUrl.searchParams.get("clienteId");

  const log = await prisma.btgSyncLog.create({
    data: { tipo: "enrich", trigger: "manual", userId: session.userId },
  });

  // 1. Mapa conta → assessor (1 chamada)
  const assessoresMap = new Map<string, { cge: string; nome: string }>();
  let comAssessor = 0;
  try {
    const advRes = await btg.getAccountsByAdvisor();
    if (advRes.status === 200) {
      for (const link of parseAdvisorList(advRes.body)) {
        assessoresMap.set(normalizeAccount(link.numeroConta), { cge: link.cge, nome: link.nome });
      }
    } else {
      console.warn(`[btg-enrich] getAccountsByAdvisor ${advRes.status}: ${advRes.raw.slice(0, 200)}`);
    }
  } catch (e) {
    console.warn(`[btg-enrich] getAccountsByAdvisor erro:`, e);
  }

  // 2. Comissões (1 chamada — pode vir como URL/JSON inline/CSV)
  const receitasMap = new Map<string, number>(); // numeroConta -> comissao do mês
  try {
    const comRes = await btg.getCommissionReport();
    if (comRes.status === 200) {
      const list = await resolveCommissionData(comRes.body);
      for (const r of list) {
        receitasMap.set(normalizeAccount(r.numeroConta), r.comissao);
      }
    } else {
      console.warn(`[btg-enrich] getCommissionReport ${comRes.status}: ${comRes.raw.slice(0, 200)}`);
    }
  } catch (e) {
    console.warn(`[btg-enrich] getCommissionReport erro:`, e);
  }

  // 3. Lista clientes a enriquecer
  const clientes = await prisma.clienteBackoffice.findMany({
    where: clienteIdFiltro ? { id: clienteIdFiltro } : { numeroConta: { not: "" } },
    select: { id: true, numeroConta: true },
  });

  let comSuitability = 0;
  let comReceita = 0;
  let enriquecidos = 0;
  const erros: Array<{ conta: string; etapa: string; motivo: string }> = [];

  // 4. Pra cada cliente: Suitability rate-limited 55/min
  await btg.rateLimitedSequential(
    clientes,
    async (c) => {
      const numeroConta = normalizeAccount(c.numeroConta);
      let perfilInvestidor: string | null = null;
      let suitabilityValidoAte: Date | null = null;
      try {
        const sRes = await btg.getSuitabilityInfo(numeroConta);
        if (sRes.status === 200) {
          const parsed = parseSuitability(sRes.body);
          perfilInvestidor = parsed.perfil;
          suitabilityValidoAte = parsed.validUntil;
          if (perfilInvestidor) comSuitability++;
        } else if (sRes.status !== 404) {
          erros.push({
            conta: numeroConta,
            etapa: "suitability",
            motivo: extractErrorMessage(sRes.body) || `HTTP ${sRes.status}`,
          });
        }
      } catch (e) {
        erros.push({ conta: numeroConta, etapa: "suitability", motivo: e instanceof Error ? e.message : "?" });
      }

      const assessor = assessoresMap.get(numeroConta);
      if (assessor) comAssessor++;
      const receitaMes = receitasMap.get(numeroConta);
      const receitaAnual = receitaMes !== undefined ? receitaMes * 12 : undefined;
      if (receitaAnual !== undefined) comReceita++;

      // Atualiza só campos com novidade
      const data: Record<string, unknown> = { ultimaSyncBtg: new Date() };
      if (perfilInvestidor) data.perfilInvestidor = perfilInvestidor;
      if (suitabilityValidoAte) data.suitabilityValidoAte = suitabilityValidoAte;
      if (assessor) {
        data.assessorCge = assessor.cge;
        data.assessorNome = assessor.nome;
      }
      // TODO: receitaAnual aqui é estimativa = mes × 12. Evoluir pra média móvel quando tivermos histórico.
      if (receitaAnual !== undefined) data.receitaAnual = receitaAnual;

      try {
        await prisma.clienteBackoffice.update({ where: { id: c.id }, data });
        enriquecidos++;
      } catch (e) {
        erros.push({ conta: numeroConta, etapa: "update", motivo: e instanceof Error ? e.message : "?" });
      }
    },
    { maxPerMinute: 55 },
  );

  await prisma.btgSyncLog.update({
    where: { id: log.id },
    data: {
      finalizado: new Date(),
      sucesso: erros.length === 0,
      contasProcessadas: enriquecidos,
      contasComErro: erros.length,
      resumo: `${enriquecidos} enriquecido(s) · ${comSuitability} c/ suitability · ${comAssessor} c/ assessor · ${comReceita} c/ receita`,
      erros: erros.length > 0 ? erros : undefined,
    },
  });

  return NextResponse.json({
    success: true,
    message: `${enriquecidos} cliente(s) enriquecido(s). Suitability: ${comSuitability}, Assessor: ${comAssessor}, Receita: ${comReceita}.`,
    enriquecidos,
    comSuitability,
    comAssessor,
    comReceita,
    erros: erros.slice(0, 50),
  });
}

// ===== PARSERS =====

interface AdvisorLink { numeroConta: string; cge: string; nome: string }
interface SuitabilityParsed { perfil: string | null; validUntil: Date | null }
interface CommissionRow { numeroConta: string; comissao: number }

function asArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const k of ["data", "accounts", "links", "advisors", "result", "items", "content", "list"]) {
      if (Array.isArray(obj[k])) return obj[k] as unknown[];
    }
  }
  return [];
}

function parseAdvisorList(body: unknown): AdvisorLink[] {
  return asArray(body)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const p = item as Record<string, unknown>;
      const numeroConta = pickString(p, ["accountNumber", "AccountNumber", "account", "numeroConta"]);
      if (!numeroConta) return null;
      // Advisor pode estar aninhado ou flat
      const advObj = (p.advisor || p.Advisor || p.assessor) as Record<string, unknown> | undefined;
      const cge = advObj
        ? pickString(advObj, ["cge", "CGE", "code", "id"])
        : pickString(p, ["advisorCge", "AdvisorCge", "advisorCode", "cgeAdvisor"]);
      const nome = advObj
        ? pickString(advObj, ["name", "Name", "fullName"])
        : pickString(p, ["advisorName", "AdvisorName", "advisorFullName"]);
      if (!cge && !nome) return null;
      return { numeroConta, cge: cge || "", nome: nome || "" };
    })
    .filter((x): x is AdvisorLink => x !== null);
}

function parseSuitability(body: unknown): SuitabilityParsed {
  if (!body || typeof body !== "object") return { perfil: null, validUntil: null };
  let p = body as Record<string, unknown>;
  // Pode estar aninhado em data/suitability
  for (const wrap of ["data", "suitability", "result"]) {
    if (p[wrap] && typeof p[wrap] === "object" && !Array.isArray(p[wrap])) {
      p = p[wrap] as Record<string, unknown>;
      break;
    }
  }
  const raw = pickString(p, [
    "profileRisk",
    "profile",
    "risk",
    "riskProfile",
    "investorProfile",
    "perfil",
    "perfilInvestidor",
    "perfilRisco",
  ]);
  const validUntilStr = pickString(p, ["validUntil", "expirationDate", "expiresAt", "dueDate", "validade"]);
  return {
    perfil: raw ? normalizePerfil(raw) : null,
    validUntil: validUntilStr ? safeDate(validUntilStr) : null,
  };
}

function normalizePerfil(raw: string): string | null {
  const s = raw.toLowerCase().trim();
  if (s.includes("conserv")) return "conservador";
  if (s.includes("moderad")) return "moderado";
  if (s.includes("sofist") || s.includes("agress") || s.includes("arroj")) return "sofisticado";
  return s || null;
}

async function resolveCommissionData(body: unknown): Promise<CommissionRow[]> {
  if (!body || typeof body !== "object") return [];
  const obj = body as Record<string, unknown>;

  // Caso 1: URL pra download
  const url =
    pickString(obj, ["url", "downloadUrl", "fileUrl", "reportUrl"]) ||
    null;
  if (url) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      // Tenta JSON
      try {
        const json = JSON.parse(text);
        return parseCommissionList(json);
      } catch {
        // Tenta CSV
        return parseCommissionCsv(text);
      }
    } catch (e) {
      console.warn(`[btg-enrich] erro baixando comissões de ${url}:`, e);
      return [];
    }
  }

  // Caso 2: JSON inline
  return parseCommissionList(body);
}

function parseCommissionList(body: unknown): CommissionRow[] {
  return asArray(body)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const p = item as Record<string, unknown>;
      const numeroConta = pickString(p, ["accountNumber", "AccountNumber", "account", "numeroConta", "conta"]);
      if (!numeroConta) return null;
      const comissao =
        pickNumber(p, ["commission", "Commission", "totalCommission", "value", "amount", "comissao"]) ?? 0;
      return { numeroConta, comissao };
    })
    .filter((x): x is CommissionRow => x !== null);
}

function parseCommissionCsv(text: string): CommissionRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(/[,;]/).map((h) => h.trim().toLowerCase());
  const accountIdx = header.findIndex((h) => /account|conta/.test(h));
  const commissionIdx = header.findIndex((h) => /commission|comiss|value|amount/.test(h));
  if (accountIdx < 0 || commissionIdx < 0) return [];
  const out: CommissionRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(/[,;]/);
    const numeroConta = cols[accountIdx]?.trim();
    const comissao = parseFloat(cols[commissionIdx]?.replace(",", "."));
    if (numeroConta && !isNaN(comissao)) out.push({ numeroConta, comissao });
  }
  return out;
}

// ===== HELPERS =====

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
  const ge = meta?.globalErrors as Array<{ message?: string }> | undefined;
  if (ge?.[0]?.message) return ge[0].message;
  const errors = obj.errors as Array<{ message?: string }> | undefined;
  if (errors?.[0]?.message) return errors[0].message;
  const message = obj.message;
  if (typeof message === "string") return message;
  return null;
}
