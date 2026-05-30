import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import {
  BUSCA_TOOL_SCHEMA,
  validarFiltros,
} from "@/lib/backoffice/busca-inteligente-schema";

// Rota: POST /api/backoffice/busca-inteligente
//
// Recebe { query: string } em linguagem natural e devolve os filtros
// estruturados que a query implica. Esta camada NÃO toca o banco —
// só traduz NL para o vocabulário fechado de FiltrosBusca via tool_use.
//
// REGRA DE SEGURANÇA: o modelo nunca compõe SQL nem nomes de coluna. O
// único "espaço de manobra" dele é preencher (ou não) os campos do
// BUSCA_TOOL_SCHEMA. Qualquer campo extra é descartado em runtime.

export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `Você traduz consultas em português sobre uma base de clientes financeiros em filtros estruturados. Use SEMPRE a tool 'buscar_clientes' — nunca responda em texto livre. Use apenas os campos do schema; se a consulta pedir algo fora do schema (por exemplo: "perfil agressivo", "do escritório X"), ignore essa parte e preencha só o que couber. Valores monetários em reais (R$); converta "k" para milhares (50k = 50000) e "MM" para milhões (1MM = 1000000). Quando o usuário pedir "os maiores", "top", "mais", use ordenarPor + ordem='desc' + limite apropriado.`;

type BuscaRequest = {
  query?: unknown;
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY ausente" },
      { status: 500 },
    );
  }

  let body: BuscaRequest;
  try {
    body = (await request.json()) as BuscaRequest;
  } catch {
    return NextResponse.json(
      { status: "bad_request", error: "Corpo da requisicao precisa ser JSON valido." },
      { status: 400 },
    );
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json(
      { status: "bad_request", error: "Campo 'query' obrigatorio e nao-vazio." },
      { status: 400 },
    );
  }

  const client = new Anthropic({ apiKey });

  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: "buscar_clientes",
          description:
            "Aplica filtros estruturados sobre a base de clientes BTG e devolve uma lista. Você só preenche os filtros — quem executa a busca é o backend.",
          input_schema: BUSCA_TOOL_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "buscar_clientes" },
      messages: [{ role: "user", content: query }],
    });
  } catch (err) {
    console.error("[busca-inteligente] anthropic error", err);
    return NextResponse.json(
      {
        error: "Falha ao consultar o classificador.",
        detalhe: err instanceof Error ? err.message : "erro desconhecido",
      },
      { status: 502 },
    );
  }

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json(
      {
        error: "Modelo não retornou tool_use.",
        stopReason: response.stop_reason,
        blocos: response.content.map((b) => b.type),
      },
      { status: 502 },
    );
  }

  const validacao = validarFiltros(toolUse.input);
  if (!validacao.ok) {
    return NextResponse.json(
      { error: "Filtros invalidos vindos do modelo.", detalhe: validacao.erro, brutoToolInput: toolUse.input },
      { status: 502 },
    );
  }

  return NextResponse.json({
    query,
    filtros: validacao.filtros,
    camposIgnorados: validacao.camposIgnorados,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  });
}
