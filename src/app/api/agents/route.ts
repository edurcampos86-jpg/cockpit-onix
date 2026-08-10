import { NextRequest, NextResponse } from "next/server";
import { getAgentMetadata } from "@/lib/agents/registry";

/**
 * O metadado do agente PEDIDO — `GET /api/agents?id=kpis`.
 *
 * Antes esta rota devolvia o catálogo inteiro e o cliente escolhia um. Como o
 * chat já resolve `agentePorRota(pathname)` antes de montar, o `id` sempre foi
 * conhecido: mandar os dois agentes significava entregar a quem está em
 * "/kpis" o `intro` e as `suggestions` da Corretora, que descrevem o pipeline
 * dela.
 *
 * O `id` é obrigatório de propósito. Deixá-lo opcional (sem `id` = catálogo)
 * manteria o comportamento antigo vivo como caminho silencioso — e é
 * exatamente ele que se queria fechar.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: 'Informe o agente em "?id=".' }, { status: 400 });
  }

  const agent = getAgentMetadata(id);
  if (!agent) {
    return NextResponse.json({ error: `Agente "${id}" não encontrado.` }, { status: 404 });
  }

  return NextResponse.json({ agent });
}
