import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import * as btg from "@/lib/integrations/btg";

/**
 * GET /api/backoffice/btg-debug?conta=XXXXX
 *
 * Endpoint de diagnóstico: chama as APIs cujo parser está retornando 0 e devolve
 * o body cru (truncado) + shape detectado pra debugar. Usa a primeira conta do banco
 * por padrão, ou ?conta=XXX pra forçar.
 *
 * APIs testadas: Suitability, Suitability Info, Advisor (link/account),
 * Commission Report. Tudo somente leitura.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Não autenticado" }, { status: 401 });
  }

  const conta = req.nextUrl.searchParams.get("conta") || "302087"; // conta de teste padrão

  const results: Record<string, unknown> = {};

  // 1. Suitability (por conta)
  try {
    const r = await btg.getSuitability(conta);
    results.suitability_get = {
      status: r.status,
      shape: shapeOf(r.body),
      sample: r.raw.slice(0, 800),
      body: r.body,
    };
  } catch (e) {
    results.suitability_get = { error: e instanceof Error ? e.message : "?" };
  }

  // 2. Suitability Info (por conta)
  try {
    const r = await btg.getSuitabilityInfo(conta);
    results.suitability_info = {
      status: r.status,
      shape: shapeOf(r.body),
      sample: r.raw.slice(0, 800),
      body: r.body,
    };
  } catch (e) {
    results.suitability_info = { error: e instanceof Error ? e.message : "?" };
  }

  // 3. Advisor link/account (lista global)
  try {
    const r = await btg.getAccountsByAdvisor();
    results.advisor_link = {
      status: r.status,
      shape: shapeOf(r.body),
      sample: r.raw.slice(0, 1500),
      // Não retorna body completo pra evitar payload gigante; só primeiros itens
      firstItems: extractFirstItems(r.body, 3),
    };
  } catch (e) {
    results.advisor_link = { error: e instanceof Error ? e.message : "?" };
  }

  // 4. Office informations (deve ser pequeno)
  try {
    const r = await btg.getOfficeInformations();
    results.office_informations = {
      status: r.status,
      shape: shapeOf(r.body),
      sample: r.raw.slice(0, 1500),
      body: r.body,
    };
  } catch (e) {
    results.office_informations = { error: e instanceof Error ? e.message : "?" };
  }

  // 5. Commission report
  try {
    const r = await btg.getCommissionReport();
    results.commission = {
      status: r.status,
      shape: shapeOf(r.body),
      sample: r.raw.slice(0, 1500),
      body: r.body,
    };
  } catch (e) {
    results.commission = { error: e instanceof Error ? e.message : "?" };
  }

  // 6. Position partner (pra debugar AUM=0)
  try {
    const r = await btg.getPartnerPositions();
    results.position_partner = {
      status: r.status,
      shape: shapeOf(r.body),
      sample: r.raw.slice(0, 1500),
      firstItems: extractFirstItems(r.body, 3),
    };
  } catch (e) {
    results.position_partner = { error: e instanceof Error ? e.message : "?" };
  }

  return NextResponse.json({ contaTestada: conta, results });
}

function shapeOf(body: unknown): string {
  if (body === null) return "null";
  if (Array.isArray(body)) return `array[${body.length}]`;
  if (typeof body !== "object") return typeof body;
  const obj = body as Record<string, unknown>;
  return `object{${Object.keys(obj).slice(0, 15).join(",")}}`;
}

function extractFirstItems(body: unknown, n: number): unknown {
  if (Array.isArray(body)) return body.slice(0, n);
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const k of ["data", "accounts", "links", "advisors", "result", "items", "content", "list", "positions"]) {
      if (Array.isArray(obj[k])) return { [k]: (obj[k] as unknown[]).slice(0, n) };
    }
  }
  return null;
}
