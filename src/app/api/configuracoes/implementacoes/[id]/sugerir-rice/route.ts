import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { getConfig } from "@/lib/config-db";
import { downloadContrato } from "@/lib/b2/upload";
import { calcRiceScore } from "@/lib/rice";
import { EMPRESAS } from "@/lib/empresas-config";
import { logSugestaoRiceSugerida } from "@/lib/implementacoes/rice-audit";

/**
 * POST /api/configuracoes/implementacoes/[id]/sugerir-rice
 *
 * Fase C · perna 1 (motor). Lê uma Implementacao + seus anexos (com visão) e
 * SUGERE um R/I/C/E inicial via Claude (tool_use). NÃO grava nada — só devolve a
 * sugestão pro front, que o usuário ajusta e salva pelo fluxo normal (atualizarRice).
 *
 * Defesa principal: a régua RICE está TRAVADA no input_schema da tool (degraus
 * válidos como enum). Ainda assim clampamos no servidor por segurança.
 * Admin-only (mesma proteção das demais rotas de implementações).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;
const PDF_BETA = "pdfs-2024-09-25";

// Régua RICE (inteiros). Os campos no banco são Int — nada de fracionário.
const IMPACT_STEPS = [1, 2, 3] as const;
const CONFIDENCE_STEPS = [50, 80, 100] as const;

// Imagens que a API da Anthropic aceita como bloco `image` (heic NÃO entra).
const IMAGE_MEDIA_OK = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const RICE_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    reach: {
      type: "integer",
      minimum: 0,
      description:
        "Quantos clientes ou eventos a ideia atinge no período. Contagem inteira (>= 0).",
    },
    impact: {
      type: "integer",
      enum: [1, 2, 3],
      description: "Força do efeito em cada um: 3 massivo, 2 alto, 1 médio.",
    },
    confidence: {
      type: "integer",
      enum: [50, 80, 100],
      description:
        "Confiança na estimativa, em %: 100 alta, 80 média, 50 baixa.",
    },
    effort: {
      type: "integer",
      minimum: 1,
      description: "Custo de execução em pessoa-mês. Inteiro >= 1.",
    },
    justificativas: {
      type: "object",
      properties: {
        reach: { type: "string", description: "1 frase curta justificando o reach." },
        impact: { type: "string", description: "1 frase curta justificando o impact." },
        confidence: {
          type: "string",
          description: "1 frase curta justificando a confidence.",
        },
        effort: { type: "string", description: "1 frase curta justificando o effort." },
      },
      required: ["reach", "impact", "confidence", "effort"],
      additionalProperties: false,
    },
    confiancaGeral: {
      type: "string",
      enum: ["alta", "media", "baixa"],
      description: "Sua confiança geral na sugestão.",
    },
  },
  required: ["reach", "impact", "confidence", "effort", "justificativas", "confiancaGeral"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Você prioriza ideias de produto pelo método RICE para o Cockpit Onix. Dado o conteúdo de uma sugestão (Golden Circle: O quê / Como / Por quê) e seus anexos (imagens/PDF), sugira uma nota INICIAL para cada eixo, que um humano vai revisar.

Régua RICE — use SOMENTE estes valores inteiros (NUNCA fracionário):
- Reach (R): contagem de quantos clientes ou eventos a ideia atinge no período. Inteiro >= 0.
- Impact (I): 3 = massivo, 2 = alto, 1 = médio. Só 1, 2 ou 3.
- Confidence (C): 100 = alta, 80 = média, 50 = baixa. Só 50, 80 ou 100 (sua confiança na própria estimativa, não a importância da ideia).
- Effort (E): custo de execução em pessoa-mês. Inteiro >= 1.

Regras:
- Use os anexos como EVIDÊNCIA do alcance/impacto (prints de tela, mockups, PDFs explicativos).
- NÃO calcule o score — o aplicativo calcula (R×I×C÷E).
- Seja conservador na Confidence quando o pedido estiver vago ou sem evidência.
- Responda SEMPRE chamando a tool 'sugerir_rice'. Cada justificativa: 1 frase curta.`;

function notFound() {
  // Não vaza existência: not-found e sem-permissão respondem igual.
  return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
}

export async function POST(
  _req: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!isAdmin(ctx)) return notFound();

  // Chave vive no Config DB (gravada pela UI de Integrações via setConfig), com
  // fallback pra env — mesmo padrão de extrair/analisar e das libs de IA. Ler de
  // process.env direto quebrava quando a chave só estava no banco (Railway sem a
  // env), dando "ausente" mesmo com a IA funcionando no resto do app.
  const apiKey = await getConfig("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "IA indisponível: a chave da Anthropic não está configurada (Integrações › Claude AI).",
      },
      { status: 500 },
    );
  }

  const { id } = await ctxParams.params;

  const impl = await prisma.implementacao.findUnique({
    where: { id },
    select: {
      tipo: true,
      empresaId: true,
      oQue: true,
      como: true,
      porQue: true,
      anexos: {
        select: { b2Key: true, contentType: true, nomeArquivo: true },
        orderBy: { ordem: "asc" },
      },
    },
  });
  if (!impl) return notFound();

  // Monta os blocos de conteúdo: anexos (visão) primeiro, depois o texto.
  const content: Anthropic.Messages.ContentBlockParam[] = [];
  const anexosIgnorados: string[] = [];
  let hasPdf = false;

  for (const a of impl.anexos) {
    try {
      if (a.contentType === "application/pdf") {
        const buf = await downloadContrato(a.b2Key);
        content.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: buf.toString("base64"),
          },
        });
        hasPdf = true;
      } else if (IMAGE_MEDIA_OK.has(a.contentType)) {
        const buf = await downloadContrato(a.b2Key);
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: a.contentType as
              | "image/png"
              | "image/jpeg"
              | "image/gif"
              | "image/webp",
            data: buf.toString("base64"),
          },
        });
      } else {
        // Tipo sem suporte de visão (ex.: heic) — segue sem ele.
        anexosIgnorados.push(`${a.nomeArquivo} (${a.contentType})`);
      }
    } catch {
      // Falha ao baixar do B2: não derruba a sugestão, só ignora o anexo.
      anexosIgnorados.push(`${a.nomeArquivo} (falha ao baixar)`);
    }
  }

  const empresaNome =
    EMPRESAS.find((e) => e.id === impl.empresaId)?.nome ?? impl.empresaId;

  const userText = [
    "Sugira o RICE inicial para esta implementação.",
    "",
    `Empresa: ${empresaNome}`,
    `Tipo: ${impl.tipo}`,
    `O quê (o pedido): ${impl.oQue}`,
    `Como: ${impl.como ?? "(não informado)"}`,
    `Por quê (motivação): ${impl.porQue}`,
    anexosIgnorados.length
      ? `\n(Anexos não enviados por tipo/erro: ${anexosIgnorados.join(", ")})`
      : "",
    "",
    "Chame a tool 'sugerir_rice' com os inteiros da régua.",
  ].join("\n");

  content.push({ type: "text", text: userText });

  // Beta de PDF só quando há PDF entre os anexos (espelha o padrão do projeto).
  const client = new Anthropic({
    apiKey,
    timeout: 55_000,
    maxRetries: 1,
    ...(hasPdf ? { defaultHeaders: { "anthropic-beta": PDF_BETA } } : {}),
  });

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: "sugerir_rice",
          description:
            "Devolve a sugestão de R/I/C/E (inteiros da régua) + justificativas curtas. O app calcula o score; você não calcula.",
          input_schema: RICE_TOOL_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "sugerir_rice" },
      messages: [{ role: "user", content }],
    });
  } catch (err) {
    console.error("[sugerir-rice] anthropic error", err);
    return NextResponse.json(
      {
        error: "Falha ao consultar a IA para sugerir o RICE.",
        detalhe: err instanceof Error ? err.message : "erro desconhecido",
      },
      { status: 502 },
    );
  }

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json(
      {
        error: "A IA não retornou uma sugestão estruturada.",
        stopReason: response.stop_reason,
      },
      { status: 502 },
    );
  }

  // Defesa extra: mesmo com o schema, clampa/valida no servidor.
  const out = toolUse.input as {
    reach?: unknown;
    impact?: unknown;
    confidence?: unknown;
    effort?: unknown;
    justificativas?: unknown;
    confiancaGeral?: unknown;
  };

  const reachNum = Number(out.reach);
  const effortNum = Number(out.effort);
  const impact = Number(out.impact);
  const confidence = Number(out.confidence);

  if (![reachNum, effortNum, impact, confidence].every(Number.isFinite)) {
    return NextResponse.json(
      { error: "A IA retornou valores RICE não numéricos." },
      { status: 502 },
    );
  }

  const reach = Math.max(0, Math.trunc(reachNum));
  const effort = Math.max(1, Math.trunc(effortNum));

  if (!IMPACT_STEPS.includes(impact as (typeof IMPACT_STEPS)[number])) {
    return NextResponse.json(
      { error: `Impact fora da régua (1, 2 ou 3): recebi ${out.impact}.` },
      { status: 502 },
    );
  }
  if (
    !CONFIDENCE_STEPS.includes(confidence as (typeof CONFIDENCE_STEPS)[number])
  ) {
    return NextResponse.json(
      {
        error: `Confidence fora da régua (50, 80 ou 100): recebi ${out.confidence}.`,
      },
      { status: 502 },
    );
  }

  const scorePrevisto = calcRiceScore(reach, impact, confidence, effort);
  const confiancaGeral =
    typeof out.confiancaGeral === "string" ? out.confiancaGeral : null;

  // Log append-only do evento "sugerida" (fire-and-forget — nunca quebra a
  // resposta). Devolve o id pro front correlacionar a confirmação/descarte.
  const sugestaoLogId = await logSugestaoRiceSugerida({
    implementacaoId: id,
    usuarioId: ctx.userId,
    usuarioNome: ctx.name,
    valores: { reach, impact, confidence, effort, score: scorePrevisto, confiancaGeral },
    metadata: anexosIgnorados.length ? { anexosIgnorados } : undefined,
  });

  return NextResponse.json({
    reach,
    impact,
    confidence,
    effort,
    scorePrevisto,
    justificativas: out.justificativas ?? null,
    confiancaGeral,
    sugestaoLogId,
    anexosIgnorados: anexosIgnorados.length ? anexosIgnorados : undefined,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  });
}
