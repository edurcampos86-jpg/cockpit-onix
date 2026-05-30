import { NextRequest, NextResponse } from "next/server";

// Stub da rota de busca inteligente de clientes.
//
// Quando implementada, vai receber uma query em linguagem natural (ex:
// "clientes do Lucas que aportaram mais de 100k este mês") e devolver uma
// lista de clientes filtrados via Claude API (modelo classifier + extractor).
//
// Por enquanto retorna 501 — fiação isolada pra estabelecer o contrato
// HTTP sem acoplar à lógica do classificador.
//
// Quando integrar, a chave virá de process.env.ANTHROPIC_API_KEY (vê em
// .env.local local; em prod, configurada como Railway env var).

export const dynamic = "force-dynamic";

type BuscaRequest = {
  query?: unknown;
};

export async function POST(request: NextRequest) {
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

  return NextResponse.json(
    {
      status: "not_implemented",
      message: "Busca inteligente em desenvolvimento. Retorne em breve.",
      query,
    },
    { status: 501 },
  );
}
