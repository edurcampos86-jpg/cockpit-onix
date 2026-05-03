import { NextRequest } from "next/server";
import { getAgent } from "@/lib/agents/registry";
import { streamAgentResponse } from "@/lib/agents/runtime";
import { getSession } from "@/lib/session";
import type { AgentMessage } from "@/lib/agents/types";

export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent) {
    return new Response(`Agente "${id}" nao encontrado.`, { status: 404 });
  }

  const session = await getSession();
  if (!session) {
    return new Response("Nao autenticado.", { status: 401 });
  }

  const body = await req.json();
  const messages: AgentMessage[] = body.messages ?? [];
  const pathname: string | undefined = body.pathname;

  return streamAgentResponse(agent, messages, {
    pathname,
    userId: session.userId,
    userName: session.name,
    userRole: session.role,
  });
}
