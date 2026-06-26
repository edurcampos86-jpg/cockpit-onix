import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-helpers";
import { cockpitReuniaoHabilitado } from "@/lib/cockpit-reuniao/flag";
import { CADENCIAS_REUNIAO } from "@/lib/cockpit-reuniao/tipos";

/**
 * POST /api/cockpit-reuniao/extrair
 *
 * Motor de extração do "Importar reunião". Recebe o resumo bruto (Plaud) e SUGERE
 * os campos operacionais + um snapshot de patrimônio via Claude (tool_use forçado).
 * NÃO grava nada — o front mostra um preview editável e só persiste no clique de
 * "Salvar reunião" (action importarReuniaoEstruturada).
 *
 * Espelha o padrão de sugerir-rice: SDK Anthropic, tool_choice forçado, régua
 * travada no input_schema e revalidação defensiva no servidor.
 *
 * Gate: autenticado + flag COCKPIT_REUNIAO (sem flag nova). Flag OFF → 404.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;

const CADENCIA_VALUES = CADENCIAS_REUNIAO.map((c) => c.value);

const EXTRAIR_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    data: {
      type: "string",
      description:
        "Data da reunião no formato ISO yyyy-mm-dd. String vazia se o resumo não disser a data.",
    },
    tipoCadencia: {
      type: "string",
      enum: [...CADENCIA_VALUES],
      description:
        "Cadência da reunião. Use 'outra' se não der pra inferir uma das demais.",
    },
    pautas: {
      type: "array",
      items: { type: "string" },
      description: "Tópicos da pauta tratados na reunião. Vazio se não houver.",
    },
    pendenciasAssessor: {
      type: "array",
      items: { type: "string" },
      description: "O que o ASSESSOR ficou de fazer. Vazio se não houver.",
    },
    pendenciasCliente: {
      type: "array",
      items: { type: "string" },
      description: "O que o CLIENTE ficou de fazer. Vazio se não houver.",
    },
    proximosPassos: {
      type: "array",
      items: { type: "string" },
      description: "Próximos passos acordados. Vazio se não houver.",
    },
    patrimonioSnapshot: {
      type: "object",
      properties: {
        totalBtg: {
          type: "number",
          description: "Patrimônio no BTG, em MILHÕES de reais (ex.: 5 = R$ 5 mi).",
        },
        totalForaBtg: {
          type: "number",
          description: "Patrimônio fora do BTG, em MILHÕES de reais.",
        },
        totalGeral: {
          type: "number",
          description: "Patrimônio total declarado, em MILHÕES de reais.",
        },
        observacao: {
          type: "string",
          description: "Observação curta sobre o patrimônio, se houver.",
        },
      },
      additionalProperties: false,
      description:
        "Snapshot do patrimônio declarado. Omita os campos que o resumo não trouxer.",
    },
  },
  required: [
    "data",
    "tipoCadencia",
    "pautas",
    "pendenciasAssessor",
    "pendenciasCliente",
    "proximosPassos",
    "patrimonioSnapshot",
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Você extrai dados estruturados do resumo de uma reunião entre assessor de investimentos e cliente (resumos do app Plaud).

Regras de fidelidade (CRÍTICAS):
- Extraia FIELMENTE o que está no texto. NÃO invente, não complete e não deduza nada que não esteja escrito.
- Deixe VAZIO ('', [] ou campo omitido) tudo que o resumo não trouxer explicitamente.
- Separe pendências por lado: o que o ASSESSOR ficou de fazer vs. o que o CLIENTE ficou de fazer.
- Patrimônio: sempre em MILHÕES de reais (ex.: "cinco milhões" → 5; "R$ 800 mil" → 0.8). Só preencha um total se o resumo o declarar.
- Data: formato ISO yyyy-mm-dd. Se o resumo não disser a data, devolva string vazia.

Responda SEMPRE chamando a tool 'extrair_reuniao'.`;

/** Coage para string ISO yyyy-mm-dd válida, ou null se não-parseável. */
function dataIsoOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

/** Mantém só strings não-vazias (trim) de um valor que deveria ser string[]. */
function listaTextos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const limpo = item.trim();
    if (limpo) out.push(limpo);
  }
  return out;
}

/** Número finito ou undefined (descarta NaN/Infinity/lixo). */
function numOrUndef(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v;
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Não vaza existência quando a feature está desligada.
  if (!(await cockpitReuniaoHabilitado())) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY ausente" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  const texto =
    body && typeof body === "object" && "texto" in body
      ? (body as { texto: unknown }).texto
      : null;
  if (typeof texto !== "string" || texto.trim().length === 0) {
    return NextResponse.json(
      { error: "Cole o resumo da reunião no campo de texto." },
      { status: 400 },
    );
  }

  const client = new Anthropic({ apiKey, timeout: 55_000, maxRetries: 1 });

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: "extrair_reuniao",
          description:
            "Devolve os campos operacionais da reunião (data, cadência, pautas, pendências dos dois lados, próximos passos) + snapshot de patrimônio. Extraídos fielmente do resumo.",
          input_schema: EXTRAIR_TOOL_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "extrair_reuniao" },
      messages: [
        {
          role: "user",
          content: `Extraia os campos do resumo de reunião abaixo.\n\n---\n${texto.trim()}\n---`,
        },
      ],
    });
  } catch (err) {
    console.error("[cockpit-reuniao/extrair] anthropic error", err);
    return NextResponse.json(
      {
        error: "Falha ao consultar a IA para extrair a reunião.",
        detalhe: err instanceof Error ? err.message : "erro desconhecido",
      },
      { status: 502 },
    );
  }

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json(
      {
        error: "A IA não retornou uma extração estruturada.",
        stopReason: response.stop_reason,
      },
      { status: 502 },
    );
  }

  const raw = toolUse.input as Record<string, unknown>;

  // Revalidação defensiva no servidor (não confiar só no schema).
  const cadenciaRaw =
    typeof raw.tipoCadencia === "string" ? raw.tipoCadencia : "";
  const tipoCadencia = CADENCIA_VALUES.includes(
    cadenciaRaw as (typeof CADENCIA_VALUES)[number],
  )
    ? cadenciaRaw
    : "outra";

  const patRaw =
    raw.patrimonioSnapshot && typeof raw.patrimonioSnapshot === "object"
      ? (raw.patrimonioSnapshot as Record<string, unknown>)
      : {};
  const patrimonioSnapshot = {
    totalBtg: numOrUndef(patRaw.totalBtg),
    totalForaBtg: numOrUndef(patRaw.totalForaBtg),
    totalGeral: numOrUndef(patRaw.totalGeral),
    observacao:
      typeof patRaw.observacao === "string" && patRaw.observacao.trim()
        ? patRaw.observacao.trim()
        : undefined,
    moeda: "BRL" as const,
  };

  return NextResponse.json({
    data: dataIsoOrNull(raw.data),
    tipoCadencia,
    pautas: listaTextos(raw.pautas),
    pendenciasAssessor: listaTextos(raw.pendenciasAssessor),
    pendenciasCliente: listaTextos(raw.pendenciasCliente),
    proximosPassos: listaTextos(raw.proximosPassos),
    patrimonioSnapshot,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  });
}
