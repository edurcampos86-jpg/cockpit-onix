import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/integrations/config";

/**
 * GET /api/integracoes/status
 * Retorna o status de configuração de cada integração
 */
export async function GET() {
  const [manychat, claudeAi, zapierSecret, googleClient, googleSecret, googleRefresh, metaToken] = await Promise.all([
    isConfigured("MANYCHAT_API_TOKEN"),
    isConfigured("ANTHROPIC_API_KEY"),
    isConfigured("ZAPIER_WEBHOOK_SECRET"),
    isConfigured("GOOGLE_CLIENT_ID"),
    isConfigured("GOOGLE_CLIENT_SECRET"),
    isConfigured("GOOGLE_REFRESH_TOKEN"),
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
    google_calendar: {
      configured: googleClient && googleSecret,
      authenticated: googleRefresh,
      status: googleRefresh ? "connected" : (googleClient && googleSecret) ? "pending_auth" : "disconnected",
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
