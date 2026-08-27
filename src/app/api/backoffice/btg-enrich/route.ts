import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getSession } from "@/lib/session";
import * as btg from "@/lib/integrations/btg";

/**
 * De onde vem o número, gravado em `ComissaoMensalCliente.fonte`.
 *
 * Constante e não literal solto: a chave única inclui `fonte`, então um typo
 * aqui não daria erro — criaria uma segunda série paralela, silenciosa, que só
 * apareceria como receita faltando num relatório.
 */
const FONTE_COMISSAO = "btg_rm_reports";

/**
 * POST /api/backoffice/btg-enrich
 *
 * Enriquece ClienteBackoffice já existentes com:
 * - Suitability (perfilInvestidor + validade) — 1 chamada por cliente, rate limit 60/min
 * - Relacionamento Conta×Assessor (assessorCge + assessorNome) — 1 chamada global
 * - Comissões (receitaAnual estimada = mês × 12) — 1 chamada global
 *
 * Query params:
 * - ?clienteId=xxx — processa só 1 cliente (útil pra detalhe)
 * - ?offset=0&limit=20 — pagina pra evitar timeout. Default limit=20 (~22s pra 20 contas com rate limit).
 *   Frontend deve chamar em loop até resposta com hasMore=false.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Não autenticado" }, { status: 401 });
  }

  const clienteIdFiltro = req.nextUrl.searchParams.get("clienteId");
  const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0", 10);
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "20", 10), 25);

  // Competência do relatório: o mês em que o enrich está rodando, em
  // America/Sao_Paulo. `sv-SE` porque é o locale que o Intl devolve já no
  // formato ISO (AAAA-MM-DD) — mais barato e mais legível que remontar as
  // partes à mão, e o CHECK da tabela recusa qualquer coisa fora de AAAA-MM.
  //
  // ⚠️ É uma APROXIMAÇÃO, e ela precisa ser dita: `getCommissionReport()` não
  // devolve a competência do próprio relatório. Rodar o enrich no dia 1º pode,
  // portanto, gravar sob o mês corrente um relatório que ainda é do mês
  // anterior. Corrigir isso exige `getMonthlyCommissionReport(refDate)`, que
  // recebe a data de referência de propósito — e trocar de endpoint é outra
  // PR, com outra forma de resposta (webhook assíncrono).
  const competencia = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());

  const log = await prisma.btgSyncLog.create({
    data: { tipo: "enrich", trigger: "manual", userId: session.userId, resumo: `offset=${offset} limit=${limit}` },
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
  // Quantas linhas de `ComissaoMensalCliente` esta execução gravou. Separado de
  // `comReceita` de propósito: aquele conta quantos clientes TÊM comissão, este
  // conta quantas linhas foram efetivamente persistidas. Divergência entre os
  // dois é o sinal de que o upsert falhou em silêncio.
  let comissoesGravadas = 0;
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

  // 3. Lista clientes a enriquecer (paginado pra evitar timeout)
  const where = clienteIdFiltro ? { id: clienteIdFiltro } : { numeroConta: { not: "" } };
  const totalClientes = clienteIdFiltro ? 1 : await prisma.clienteBackoffice.count({ where });
  const clientes = await prisma.clienteBackoffice.findMany({
    where,
    select: { id: true, numeroConta: true },
    orderBy: { id: "asc" },
    skip: clienteIdFiltro ? 0 : offset,
    take: clienteIdFiltro ? 1 : limit,
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
      // `receitaAnual` continua exatamente como estava. Removê-lo é PR futura,
      // depois de haver histórico real para derivar — trocar a estimativa pelo
      // realizado ANTES de ter 12 meses guardados zeraria a tela de quem lê.
      // TODO: receitaAnual aqui é estimativa = mes × 12. Evoluir pra média móvel quando tivermos histórico.
      if (receitaAnual !== undefined) data.receitaAnual = receitaAnual;

      try {
        await prisma.clienteBackoffice.update({ where: { id: c.id }, data });
        enriquecidos++;
      } catch (e) {
        erros.push({ conta: numeroConta, etapa: "update", motivo: e instanceof Error ? e.message : "?" });
      }

      // ── A linha mensal que antes era descartada ─────────────────────────
      //
      // `receitaMes` já estava aqui, na mão, e morria multiplicado por 12. O
      // upsert casa pela chave única (clienteId, competencia, fonte), então
      // rodar o enrich duas vezes no mesmo mês ATUALIZA em vez de duplicar —
      // sem ela, a receita do mês dobraria e o erro só apareceria na soma.
      //
      // `Prisma.Decimal` e não Number: a coluna é DECIMAL(14,2) e este número
      // vai ser somado. Medido no shadow: somar 0,07 mil vezes dá 70,00 em
      // decimal e 69,99999999999966 em float8.
      //
      // Falha aqui NÃO derruba o enrich: a linha entra em `erros` como
      // qualquer outra etapa. O enriquecimento do cliente já foi gravado, e
      // perder a série de um cliente é ruim — perder a sincronia inteira por
      // causa dela seria pior.
      if (receitaMes !== undefined) {
        try {
          await prisma.comissaoMensalCliente.upsert({
            where: {
              clienteId_competencia_fonte: {
                clienteId: c.id,
                competencia,
                fonte: FONTE_COMISSAO,
              },
            },
            create: {
              clienteId: c.id,
              competencia,
              fonte: FONTE_COMISSAO,
              comissao: new Prisma.Decimal(receitaMes),
              origemSyncId: log.id,
            },
            update: {
              comissao: new Prisma.Decimal(receitaMes),
              importadoEm: new Date(),
              origemSyncId: log.id,
            },
          });
          comissoesGravadas++;
        } catch (e) {
          erros.push({
            conta: numeroConta,
            etapa: "comissao-mensal",
            motivo: e instanceof Error ? e.message : "?",
          });
        }
      }
    },
    { maxPerMinute: 55 },
  );

  const nextOffset = offset + clientes.length;
  const hasMore = !clienteIdFiltro && nextOffset < totalClientes;

  await prisma.btgSyncLog.update({
    where: { id: log.id },
    data: {
      finalizado: new Date(),
      sucesso: erros.length === 0,
      contasProcessadas: enriquecidos,
      contasComErro: erros.length,
      resumo: `${enriquecidos} enriquecido(s) · ${comSuitability} c/ suitability · ${comAssessor} c/ assessor · ${comReceita} c/ receita · ${comissoesGravadas} comissão ${competencia} · batch ${offset}-${nextOffset}/${totalClientes}`,
      erros: erros.length > 0 ? erros : undefined,
    },
  });

  return NextResponse.json({
    success: true,
    message: `Batch ${offset + 1}-${nextOffset} de ${totalClientes}: ${enriquecidos} enriquecido(s). Suitability: ${comSuitability}, Assessor: ${comAssessor}, Receita: ${comReceita}, Comissão ${competencia}: ${comissoesGravadas}.`,
    enriquecidos,
    comSuitability,
    comAssessor,
    comReceita,
    // A série mensal desta execução. Sem isto, "gravou?" só se responde indo ao
    // banco — e o caminho que a #407 fechou é justamente o de quem não deveria
    // estar lá.
    comissoesGravadas,
    competencia,
    offset,
    nextOffset,
    totalClientes,
    hasMore,
    erros: erros.slice(0, 20),
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
  // BTG /suitability/account/{n} retorna { profileRisk: { code: "SOPH", description: "Sofisticado" } }
  // BTG /suitability/account/{n}/info retorna { code, initDate, expirationDate, description } flat
  let raw: string | null = null;
  const profileRiskObj = p.profileRisk;
  if (profileRiskObj && typeof profileRiskObj === "object" && !Array.isArray(profileRiskObj)) {
    raw = pickString(profileRiskObj as Record<string, unknown>, ["description", "code", "name"]);
  }
  if (!raw) {
    raw = pickString(p, [
      "description",
      "code",
      "profileRisk",
      "profile",
      "risk",
      "riskProfile",
      "investorProfile",
      "perfil",
      "perfilInvestidor",
      "perfilRisco",
    ]);
  }
  const validUntilStr = pickString(p, ["expirationDate", "validUntil", "expiresAt", "dueDate", "validade"]);
  return {
    perfil: raw ? normalizePerfil(raw) : null,
    validUntil: validUntilStr ? safeDate(validUntilStr) : null,
  };
}

function normalizePerfil(raw: string): string | null {
  const s = raw.toLowerCase().trim();
  // Códigos BTG: CONS = conservador, MOD = moderado, SOPH/AGR = sofisticado
  if (s === "cons" || s.includes("conserv")) return "conservador";
  if (s === "mod" || s.includes("moderad")) return "moderado";
  if (s === "soph" || s === "agr" || s.includes("sofist") || s.includes("agress") || s.includes("arroj")) return "sofisticado";
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
