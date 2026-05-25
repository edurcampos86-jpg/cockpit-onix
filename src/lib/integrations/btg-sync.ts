import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import * as btg from "./btg";

/**
 * Sincroniza movimentações financeiras dos clientes BTG e grava em MovimentacaoBtg.
 * Dedup por hashUnico = sha256(numeroConta|data|tipo|valor|ativo).
 *
 * Usado por:
 *   - POST /api/backoffice/btg-movements-sync (trigger="manual", precisa userId)
 *   - GET  /api/cron/btg-movements-poll       (trigger="cron")
 *   - eventualmente pelo handler de webhook   (trigger="webhook")
 *
 * Lança erro se scope="period" sem startDate/endDate — caller traduz pra 400.
 */

export type SyncBtgScope = "weekly" | "monthly" | "full" | "period";

export interface SyncBtgMovementsOptions {
  scope?: SyncBtgScope;
  startDate?: string;
  endDate?: string;
  trigger: "manual" | "cron" | "webhook";
  userId?: string | null;
}

export interface SyncBtgMovementsError {
  etapa: string;
  conta?: string;
  motivo: string;
}

export interface SyncBtgMovementsResult {
  ok: boolean;
  pending: boolean;
  scope: SyncBtgScope;
  movimentosNovos: number;
  movimentosDuplicados: number;
  movimentosOrfaos: number;
  contasComMovimentos: number;
  erros: SyncBtgMovementsError[];
  durationMs: number;
  logId: string;
  message: string;
}

export async function syncBtgMovements(
  opts: SyncBtgMovementsOptions,
): Promise<SyncBtgMovementsResult> {
  const scope: SyncBtgScope = opts.scope || "weekly";
  if (scope === "period" && (!opts.startDate || !opts.endDate)) {
    throw new Error("scope=period exige startDate e endDate");
  }

  const start = Date.now();
  const log = await prisma.btgSyncLog.create({
    data: {
      tipo: "movements",
      trigger: opts.trigger,
      userId: opts.userId ?? undefined,
      resumo: `scope=${scope}`,
    },
  });

  // Mapa numeroConta -> clienteId pra reduzir queries
  const clientes = await prisma.clienteBackoffice.findMany({
    where: { numeroConta: { not: "" } },
    select: { id: true, numeroConta: true },
  });
  const clienteByConta = new Map(
    clientes.map((c) => [normalizeAccount(c.numeroConta), c.id]),
  );

  let movimentosNovos = 0;
  let movimentosDuplicados = 0;
  let movimentosOrfaos = 0;
  let pendingViaWebhook = false;
  const erros: SyncBtgMovementsError[] = [];
  const contasComMovimentos = new Set<string>();

  const processarLista = async (movs: ParsedMovement[]) => {
    for (const m of movs) {
      const conta = normalizeAccount(m.numeroConta);
      const clienteId = clienteByConta.get(conta);
      if (!clienteId) {
        movimentosOrfaos++;
        continue;
      }
      contasComMovimentos.add(conta);

      const hashUnico = createHash("sha256")
        .update(
          `${conta}|${m.data.toISOString()}|${m.tipo}|${m.valor}|${m.ativo || ""}`,
        )
        .digest("hex");

      try {
        const exists = await prisma.movimentacaoBtg.findUnique({
          where: { hashUnico },
          select: { id: true },
        });
        if (exists) {
          movimentosDuplicados++;
          continue;
        }
        await prisma.movimentacaoBtg.create({
          data: {
            clienteId,
            numeroConta: conta,
            data: m.data,
            tipo: m.tipo,
            descricao: m.descricao,
            mercado: m.mercado,
            ativo: m.ativo,
            valor: m.valor,
            valorLiquido: m.valorLiquido,
            hashUnico,
            payloadBruto: m.raw as never,
          },
        });
        movimentosNovos++;
      } catch (e) {
        erros.push({
          etapa: "create",
          conta,
          motivo: e instanceof Error ? e.message : "?",
        });
      }
    }
  };

  try {
    if (scope === "full") {
      // Por conta — caro, só usar pra import histórico inicial
      await btg.rateLimitedSequential(
        clientes,
        async (c) => {
          const conta = normalizeAccount(c.numeroConta);
          try {
            const r = await btg.getMovementsByAccountFull(conta);
            if (r.status === 200) {
              await processarLista(parseMovements(r.body, conta));
            } else if (r.status !== 404) {
              erros.push({
                etapa: "getMovementsByAccountFull",
                conta,
                motivo: extractErrorMessage(r.body) || `HTTP ${r.status}`,
              });
            }
          } catch (e) {
            erros.push({
              etapa: "getMovementsByAccountFull",
              conta,
              motivo: e instanceof Error ? e.message : "?",
            });
          }
        },
        { maxPerMinute: 55 },
      );
    } else if (scope === "period") {
      const r = await btg.postMovementsByPartnerPeriod(
        opts.startDate!,
        opts.endDate!,
      );
      if (r.status === 200) {
        await processarLista(parseMovements(r.body));
      } else if (r.status === 202) {
        pendingViaWebhook = true;
      } else {
        erros.push({
          etapa: "postMovementsByPartnerPeriod",
          motivo: extractErrorMessage(r.body) || `HTTP ${r.status}`,
        });
      }
    } else {
      // weekly | monthly — todas contas em 1 chamada
      const helper =
        scope === "monthly"
          ? btg.getMovementsByPartnerMonthly
          : btg.getMovementsByPartnerWeekly;
      const r = await helper();
      if (r.status === 200) {
        await processarLista(parseMovements(r.body));
      } else if (r.status === 202) {
        pendingViaWebhook = true;
      } else {
        erros.push({
          etapa: scope,
          motivo: extractErrorMessage(r.body) || `HTTP ${r.status}`,
        });
      }
    }
  } catch (e) {
    erros.push({
      etapa: "scope-handler",
      motivo: e instanceof Error ? e.message : "?",
    });
  }

  const durationMs = Date.now() - start;
  const resumoBase = `scope=${scope} · ${movimentosNovos} novos · ${movimentosDuplicados} dup · ${movimentosOrfaos} órfãos · ${contasComMovimentos.size} contas`;
  const resumoFinal = pendingViaWebhook
    ? `${resumoBase} · pending (202 — vem via webhook)`
    : resumoBase;

  await prisma.btgSyncLog.update({
    where: { id: log.id },
    data: {
      finalizado: new Date(),
      sucesso: erros.length === 0,
      contasProcessadas: contasComMovimentos.size,
      contasComErro: erros.length,
      resumo: resumoFinal,
      // cast as never: Prisma quer InputJsonValue; nosso array de erros é
      // estruturalmente JSON mas tem campos opcionais. Mesmo padrão já usado
      // pra payloadBruto neste arquivo.
      erros: erros.length > 0 ? (erros as never) : undefined,
    },
  });

  const message = pendingViaWebhook
    ? `Solicitação aceita pelo BTG (202). Movimentações virão via webhook quando processadas.`
    : `${movimentosNovos} mov novo(s), ${movimentosDuplicados} duplicado(s), ${movimentosOrfaos} órfão(s) ignorado(s). ${contasComMovimentos.size} conta(s) com movimentos.`;

  return {
    ok: erros.length === 0,
    pending: pendingViaWebhook,
    scope,
    movimentosNovos,
    movimentosDuplicados,
    movimentosOrfaos,
    contasComMovimentos: contasComMovimentos.size,
    erros,
    durationMs,
    logId: log.id,
    message,
  };
}

// ===== PARSER DE MOVIMENTAÇÕES (defensivo — shape exato BTG não documentado publicamente) =====

interface ParsedMovement {
  numeroConta: string;
  data: Date;
  tipo: string;
  descricao: string | null;
  mercado: string | null;
  ativo: string | null;
  valor: number;
  valorLiquido: number | null;
  raw: unknown;
}

function asArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const k of [
      "data",
      "movements",
      "operations",
      "history",
      "items",
      "results",
      "content",
      "list",
    ]) {
      if (Array.isArray(obj[k])) return obj[k] as unknown[];
    }
  }
  return [];
}

function parseMovements(
  body: unknown,
  fallbackConta?: string,
): ParsedMovement[] {
  return asArray(body)
    .map((item): ParsedMovement | null => {
      if (!item || typeof item !== "object") return null;
      const p = item as Record<string, unknown>;
      const numeroConta =
        pickString(p, [
          "accountNumber",
          "AccountNumber",
          "account",
          "numeroConta",
        ]) ||
        fallbackConta ||
        null;
      if (!numeroConta) return null;
      const dataStr = pickString(p, [
        "date",
        "operationDate",
        "Date",
        "OperationDate",
        "transactionDate",
      ]);
      const data = dataStr ? safeDate(dataStr) : null;
      if (!data) return null;
      const tipo =
        pickString(p, [
          "type",
          "operationType",
          "Type",
          "OperationType",
          "movementType",
          "tipo",
        ]) || "DESCONHECIDO";
      const valor = pickNumber(p, [
        "grossValue",
        "value",
        "amount",
        "GrossValue",
        "Amount",
        "valor",
      ]);
      if (valor === null) return null;
      return {
        numeroConta,
        data,
        tipo,
        descricao: pickString(p, [
          "description",
          "note",
          "Description",
          "Note",
          "descricao",
        ]),
        mercado: pickString(p, [
          "market",
          "marketType",
          "Market",
          "MarketType",
          "mercado",
        ]),
        ativo: pickString(p, [
          "asset",
          "productName",
          "Asset",
          "ProductName",
          "ativo",
        ]),
        valor,
        valorLiquido: pickNumber(p, ["netValue", "NetValue", "valorLiquido"]),
        raw: p,
      };
    })
    .filter((x): x is ParsedMovement => x !== null);
}

function normalizeAccount(s: string): string {
  return s.replace(/^0+/, "").trim();
}

function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function pickNumber(
  obj: Record<string, unknown>,
  keys: string[],
): number | null {
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
  const m = obj.message;
  if (typeof m === "string") return m;
  return null;
}
