import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/integrations/config";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/integracoes/status
 * Retorna o status de configuração de cada integração
 */
export async function GET() {
  const [manychat, claudeAi, zapierSecret, googleClient, googleSecret, googleRefresh, metaToken, btgId, btgSecret] = await Promise.all([
    isConfigured("MANYCHAT_API_TOKEN"),
    isConfigured("ANTHROPIC_API_KEY"),
    isConfigured("ZAPIER_WEBHOOK_SECRET"),
    isConfigured("GOOGLE_CLIENT_ID"),
    isConfigured("GOOGLE_CLIENT_SECRET"),
    isConfigured("GOOGLE_REFRESH_TOKEN"),
    isConfigured("META_ACCESS_TOKEN"),
    isConfigured("BTG_CLIENT_ID"),
    isConfigured("BTG_CLIENT_SECRET"),
  ]);

  const session = await getSession();
  const userGoogle = session
    ? await prisma.userGoogleAuth.findUnique({
        where: { userId: session.userId },
        select: { googleEmail: true },
      })
    : null;
  const googleStatus = userGoogle
    ? "connected"
    : googleRefresh
      ? "connected"
      : googleClient && googleSecret
        ? "pending_auth"
        : "disconnected";

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
      authenticated: !!userGoogle || googleRefresh,
      userConnected: !!userGoogle,
      userEmail: userGoogle?.googleEmail,
      status: googleStatus,
    },
    meta: {
      configured: metaToken,
      status: metaToken ? "connected" : "disconnected",
    },
    btg_pactual: {
      configured: btgId && btgSecret,
      status: btgId && btgSecret ? "connected" : "disconnected",
    },
    manus: {
      configured: false,
      status: "coming_soon",
    },
  });
}
