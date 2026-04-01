import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/integrations/config";

/**
 * GET /api/integracoes/status
 * Retorna o status de configuração de cada integração
 */
export async function GET() {
  const [manychat, claudeAi, zapierSecret, outlookClient, outlookSecret, outlookRefresh, metaToken] = await Promise.all([
    isConfigured("MANYCHAT_API_TOKEN"),
    isConfigured("ANTHROPIC_API_KEY"),
    isConfigured("ZAPIER_WEBHOOK_SECRET"),
    isConfigured("MICROSOFT_CLIENT_ID"),
    isConfigured("MICROSOFT_CLIENT_SECRET"),
    isConfigured("MICROSOFT_REFRESH_TOKEN"),
    isConfigured("META_ACCESS_TOKEN"),
  ]);

  return NextResponse.json({
    manychat: {
      configured: manychat,
      status: manychat ? "connected" : "disconnected",
    },
    claude_ai: {
      configured: claudeAi,
      status: claudeAi ? "connected" : "disconnected",
    },
    zapier_plaud: {
      configured: zapierSecret,
      status: zapierSecret ? "connected" : "disconnected",
    },
    outlook: {
      configured: outlookClient && outlookSecret,
      authenticated: outlookRefresh,
      status: outlookRefresh ? "connected" : outlookClient ? "pending_auth" : "disconnected",
    },
    meta: {
      configured: metaToken,
      status: metaToken ? "connected" : "disconnected",
    },
    manus: {
      configured: false,
      status: "coming_soon",
    },
  });
}
