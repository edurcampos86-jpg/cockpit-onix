import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  candidatosDoWebhookBtg,
  decidirAcessoWebhookBtg,
} from "@/lib/integrations/btg-webhook-acesso";

/**
 * POST /api/webhooks/btg
 *
 * Endpoint PÚBLICO (allowlist do proxy, `src/lib/proxy-rotas.ts`): responde sem
 * sessão, à internet inteira. Recebe pushes do BTG — URL cadastrada no portal
 * de parceiros — e ESCREVE: cria `BtgSyncLog` e insere em `MovimentacaoBtg`.
 *
 * O segredo é aceito em sete formatos de header porque o portal do BTG não
 * documenta um só; a lista e a comparação moram em
 * `src/lib/integrations/btg-webhook-acesso.ts`, puras e testadas.
 *
 * ── FALHA FECHADA ────────────────────────────────────────────────────────
 * Sem `BTG_WEBHOOK_SECRET` configurado, a rota responde 503 e não grava nada.
 * Antes, o segredo ausente caía num `else` que só logava um aviso e SEGUIA:
 * qualquer requisição da internet inseria movimentação financeira casada ao
 * `clienteId` real pelo número da conta, com valor e tipo escolhidos por quem
 * enviou — e o alerta diário (`src/lib/alertas-cliente.ts`) trata "APLICA"/
 * "APORTE" nessa tabela como aporte de verdade. A nota em `proxy-rotas.ts`
 * registrava o furo desde a PR que fechou o webhook irmão do Zapier.
 *
 * ── SOBRE OS CÓDIGOS DE RESPOSTA ─────────────────────────────────────────
 * O BTG re-tenta em 4xx/5xx, e por isso a rota devolve 200 sempre que
 * CONSEGUE processar — inclusive em erro de handler, para não pedir reenvio de
 * evento que já foi registrado. As duas recusas abaixo são a exceção
 * deliberada, e a re-tentativa é desejável nas duas: em 503 (falta o segredo no
 * Railway), o evento volta quando alguém configurar, em vez de se perder em
 * silêncio; em 401, o BTG insiste até o cadastro do header ser corrigido.
 */
export async function POST(req: NextRequest) {
  const acesso = decidirAcessoWebhookBtg(
    process.env.BTG_WEBHOOK_SECRET,
    candidatosDoWebhookBtg((nome) => req.headers.get(nome)),
  );

  if (acesso === "sem-segredo") {
    console.warn(
      "[btg-webhook] BTG_WEBHOOK_SECRET não configurado — rota desativada (503). " +
        "Configure a variável no Railway e cadastre o mesmo valor no portal BTG.",
    );
    return NextResponse.json(
      { success: false, message: "Integração desativada (BTG_WEBHOOK_SECRET não configurado)" },
      { status: 503 },
    );
  }

  if (acesso === "invalido") {
    // Sem despejo de headers. A versão anterior logava
    // `Object.fromEntries(req.headers.entries())` a cada tentativa inválida:
    // no dia em que o BTG mandasse o segredo CERTO num header fora da lista
    // dos sete, ele iria para o log em texto claro — e log de aplicação não é
    // lugar de segredo. Quem chamou já sabe o que enviou; o que falta saber
    // aqui é só que alguém tentou.
    console.warn("[btg-webhook] secret inválido — requisição recusada");
    return NextResponse.json({ success: false, message: "Secret inválido" }, { status: 401 });
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
