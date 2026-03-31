import { NextRequest, NextResponse } from "next/server";
import * as claude from "@/lib/integrations/claude-ai";

/**
 * POST /api/integracoes/ai
 * Endpoints da integração Claude AI
 * Body: { action: "suggest_script" | "analyze" | "ideas" | "lead_approach", ...params }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    let result: string;

    switch (action) {
      case "suggest_script":
        result = await claude.suggestScript(params.category, params.topic);
        break;
      case "analyze":
        result = await claude.analyzePerformance(params.posts);
        break;
      case "ideas":
        result = await claude.generateContentIdeas(params.theme, params.count);
        break;
      case "lead_approach":
        result = await claude.suggestLeadApproach(params.lead);
        break;
      default:
        return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const result = await claude.testConnection();
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
