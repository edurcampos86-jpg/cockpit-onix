import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/webhooks/btg
 *
 * Endpoint público que recebe pushes do BTG (configurar URL no portal de parceiros).
 * Validação opcional via header x-webhook-secret se BTG_WEBHOOK_SECRET estiver setado.
 * Sempre retorna 200 quando consegue parsear (BTG re-tenta em 4xx/5xx).
 */
export async function POST(req: NextRequest) {
  // Validação de secret (se configurado)
  const secret = process.env.BTG_WEBHOOK_SECRET;
  if (secret) {
    const got = req.headers.get("x-webhook-secret");
    if (got !== secret) {
      return NextResponse.json({ success: false, message: "Secret inválido" }, { status: 401 });
    }
  } else {
    console.warn("[btg-webhook] BTG_WEBHOOK_SECRET não setado — aceitando qualquer requisição");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Body inválido" }, { status: 400 });
  }

  const eventType = detectEventType(body);
  const log = await prisma.btgSyncLog.create({
    data: {
      tipo: "webhook",
      trigger: "webhook",
      resumo: `eventType=${eventType || "desconhecido"}`,
      erros: { payload: body } as never,
    },
  });

  let resultado: Record<string, unknown> = { eventType };

  try {
    if (eventType && /movement|operation/i.test(eventType)) {
      resultado = { ...resultado, ...(await handleMovementsEvent(body)) };
    } else if (eventType && /report|commission|stvm/i.test(eventType)) {
      resultado = { ...resultado, ...handleReportEvent(body) };
    } else {
      resultado.note = "Evento não reconhecido — payload registrado em BtgSyncLog.erros pra inspeção";
    }
    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: { finalizado: new Date(), sucesso: true, resumo: `${eventType} processado: ${JSON.stringify(resultado).slice(0, 200)}` },
    });
  } catch (e) {
    await prisma.btgSyncLog.update({
      where: { id: log.id },
      data: {
        finalizado: new Date(),
        sucesso: false,
        resumo: `Erro processando ${eventType}: ${e instanceof Error ? e.message : "?"}`,
      },
    });
  }

  return NextResponse.json({ success: true, ...resultado });
}

function detectEventType(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  for (const k of ["eventType", "type", "notificationType", "event", "kind", "webhookType"]) {
    const v = obj[k];
    if (typeof v === "string") return v;
  }
  return null;
}

async function handleMovementsEvent(body: unknown): Promise<Record<string, unknown>> {
  const movs = parseMovementsFromWebhook(body);
  if (movs.length === 0) return { processed: 0, note: "Sem movimentos extraídos do payload" };

  const contas = Array.from(new Set(movs.map((m) => m.numeroConta)));
  const clientes = await prisma.clienteBackoffice.findMany({
    where: { numeroConta: { in: contas } },
    select: { id: true, numeroConta: true },
  });
  const map = new Map(clientes.map((c) => [normalizeAccount(c.numeroConta), c.id]));

  let inseridos = 0;
  let duplicados = 0;
  let orfaos = 0;
  for (const m of movs) {
    const conta = normalizeAccount(m.numeroConta);
    const clienteId = map.get(conta);
    if (!clienteId) { orfaos++; continue; }
    const hashUnico = createHash("sha256")
      .update(`${conta}|${m.data.toISOString()}|${m.tipo}|${m.valor}|${m.ativo || ""}`)
      .digest("hex");
    const exists = await prisma.movimentacaoBtg.findUnique({ where: { hashUnico }, select: { id: true } });
    if (exists) { duplicados++; continue; }
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
    inseridos++;
  }
  return { inseridos, duplicados, orfaos };
}

function handleReportEvent(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return { note: "Body não-objeto" };
  const obj = body as Record<string, unknown>;
  const url =
    pickString(obj, ["url", "downloadUrl", "fileUrl", "reportUrl"]) ||
    pickString((obj.data as Record<string, unknown>) || {}, ["url", "downloadUrl"]);
  // TODO: baixar e processar o arquivo aqui (exige autenticação BTG separada — handler dedicado depois)
  return { reportUrl: url || null, note: "URL registrada — processamento de arquivo pendente" };
}

interface ParsedMov {
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

function parseMovementsFromWebhook(body: unknown): ParsedMov[] {
  // Webhook pode mandar payload com a lista em data/movements/operations etc.
  let arr: unknown[] = [];
  if (Array.isArray(body)) arr = body;
  else if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const k of ["data", "movements", "operations", "items", "payload", "content"]) {
      if (Array.isArray(obj[k])) { arr = obj[k] as unknown[]; break; }
    }
    // Se data é objeto com lista dentro
    const data = obj.data as Record<string, unknown> | undefined;
    if (arr.length === 0 && data && typeof data === "object") {
      for (const k of ["movements", "operations", "items"]) {
        if (Array.isArray(data[k])) { arr = data[k] as unknown[]; break; }
      }
    }
  }

  return arr
    .map((item): ParsedMov | null => {
      if (!item || typeof item !== "object") return null;
      const p = item as Record<string, unknown>;
      const numeroConta = pickString(p, ["accountNumber", "AccountNumber", "account", "numeroConta"]);
      if (!numeroConta) return null;
      const dataStr = pickString(p, ["date", "operationDate", "Date", "transactionDate"]);
      const data = dataStr ? safeDate(dataStr) : null;
      if (!data) return null;
      const tipo = pickString(p, ["type", "operationType", "movementType", "tipo"]) || "DESCONHECIDO";
      const valor = pickNumber(p, ["grossValue", "value", "amount", "valor"]);
      if (valor === null) return null;
      return {
        numeroConta,
        data,
        tipo,
        descricao: pickString(p, ["description", "note", "descricao"]),
        mercado: pickString(p, ["market", "marketType", "mercado"]),
        ativo: pickString(p, ["asset", "productName", "ativo"]),
        valor,
        valorLiquido: pickNumber(p, ["netValue", "valorLiquido"]),
        raw: p,
      };
    })
    .filter((x): x is ParsedMov => x !== null);
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
