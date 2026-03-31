import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/integrations/config";

/**
 * GET /api/integracoes/status
 * Retorna o status de configuração de cada integração
 */
export async function GET() {
  const [manychat, outlookClient, outlookSecret, outlookRefresh, metaToken] = await Promise.all([
    isConfigured("MANYCHAT_API_TOKEN"),
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
