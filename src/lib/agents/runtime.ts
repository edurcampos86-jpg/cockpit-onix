import "server-only";
import { getConfig } from "@/lib/config-db";
import type { Agent, AgentMessage, AgentRequestContext } from "./types";

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-5";

export async function streamAgentResponse(
  agent: Agent,
  messages: AgentMessage[],
  context: AgentRequestContext
): Promise<Response> {
  const apiKey = await getConfig("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response("ANTHROPIC_API_KEY nao configurada.", { status: 500 });
  }

  const dynamicContext = agent.loadContext ? await agent.loadContext(context) : "";
  const systemPrompt = dynamicContext
    ? `${agent.systemPromptBase}\n\n${dynamicContext}`
    : agent.systemPromptBase;

  const claudeResponse = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: agent.maxTokens ?? 2048,
      system: systemPrompt,
      messages,
      stream: true,
    }),
  });

  if (!claudeResponse.ok) {
    const errorText = await claudeResponse.text();
    return new Response(`Claude API error: ${claudeResponse.status} — ${errorText}`, {
      status: 500,
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = claudeResponse.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]" || !data) continue;

            try {
              const parsed = JSON.parse(data);
              if (
                parsed.type === "content_block_delta" &&
                parsed.delta?.type === "text_delta" &&
                parsed.delta?.text
              ) {
                controller.enqueue(encoder.encode(parsed.delta.text));
              }
            } catch {
              // Ignore malformed SSE chunks
            }
          }
        }
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
