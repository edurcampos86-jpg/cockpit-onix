import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config-db";
import { getSession } from "@/lib/session";
import { collectWeeklySnapshot, snapshotToContextBlock } from "@/lib/agents/snapshot";

export const maxDuration = 120;

interface BriefingPayload {
  resumo: string;
  melhorou: Array<{ area: string; detalhe: string }>;
  piorou: Array<{ area: string; detalhe: string }>;
  acoes: Array<{ prioridade: number; acao: string; responsavelSugerido: string; ate: string }>;
}

const BRIEFING_PROMPT = `Voce e o Analista de KPIs do Ecossistema Onix. Receba o snapshot semanal abaixo e gere um briefing estruturado.

REGRAS:
- Use APENAS os numeros do snapshot. Nao invente.
- Compare semana atual vs anterior; se ambos sao zero, diga "sem atividade na janela".
- Acoes devem ser concretas, com responsavel sugerido (ex: "Eduardo", "Rose", "Time MKT", "Time Corretora") e prazo curto (proximos 7 dias).
- Para o time da Corretora, respeite o perfil PAT: Eduardo entusiastico, Rose precisa reconhecimento antes de cobranca, Thiago tecnico.
- Portugues Brasileiro. Sem travessoes.

FORMATO DE RESPOSTA: retorne APENAS um JSON valido (sem markdown, sem texto antes ou depois) com esta estrutura exata:

{
  "resumo": "2-3 frases sintetizando o que mudou nesta semana",
  "melhorou": [
    {"area": "MKT|Corretora|Leads|Tarefas", "detalhe": "frase curta com numero"}
  ],
  "piorou": [
    {"area": "MKT|Corretora|Leads|Tarefas", "detalhe": "frase curta com numero"}
  ],
  "acoes": [
    {"prioridade": 1, "acao": "acao concreta", "responsavelSugerido": "nome ou time", "ate": "ate quando, ex: ate sexta 09/05"}
  ]
}

Cada array deve ter entre 2 e 5 itens. Se nao houver nada para uma categoria, retorne array vazio para essa categoria mas mencione no resumo.`;

export async function POST() {
  const session = await getSession();
  if (!session) {
    return new Response("Nao autenticado.", { status: 401 });
  }

  const apiKey = await getConfig("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response("ANTHROPIC_API_KEY nao configurada.", { status: 500 });
  }

  const snap = await collectWeeklySnapshot();
  const contextBlock = snapshotToContextBlock(snap);

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      system: BRIEFING_PROMPT,
      messages: [
        {
          role: "user",
          content: `Snapshot da semana:\n\n${contextBlock}\n\nGere o briefing.`,
        },
      ],
    }),
  });

  if (!claudeRes.ok) {
    const errorText = await claudeRes.text();
    return new Response(`Claude API error: ${claudeRes.status} — ${errorText}`, {
      status: 500,
    });
  }

  const data = await claudeRes.json();
  const text: string = data.content?.[0]?.text || "";
  const cleaned = text.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();

  let payload: BriefingPayload;
  try {
    payload = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json(
        { error: "IA nao retornou JSON valido", raw: text.slice(0, 500) },
        { status: 502 }
      );
    }
    try {
      payload = JSON.parse(match[0]);
    } catch {
      return NextResponse.json(
        { error: "Falha ao parsear JSON do briefing", raw: text.slice(0, 500) },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({
    geradoEm: snap.geradoEm,
    janela: snap.janelaAtual,
    snapshot: snap,
    briefing: payload,
  });
}
