import "server-only";
import { prisma } from "../prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Audit log do módulo Jurídico (ContratoAcessoLog).
 * Toda função de log é fire-and-forget: usa .catch para que falha de
 * persistência NUNCA quebre a resposta principal do endpoint.
 */

export type AcaoContrato =
  | "visualizou"
  | "tentou_baixar"
  | "tentou_imprimir"
  | "baixou_pdf"
  | "extraiu_dados"
  | "editou_extracao"
  | "aprovou"
  | "rejeitou"
  | "reextraiu"
  | "subiu";

export type RequestMeta = {
  ipAddress: string | null;
  userAgent: string | null;
};

export function extrairRequestMeta(req: Request): RequestMeta {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = (fwd?.split(",")[0]?.trim()) || req.headers.get("x-real-ip") || null;
  const ua = req.headers.get("user-agent") || null;
  return { ipAddress: ip, userAgent: ua };
}

export async function logAcessoContrato(params: {
  contratoArquivoId: string;
  usuarioId: string;
  acao: AcaoContrato;
  meta: RequestMeta;
  extra?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.contratoAcessoLog.create({
      data: {
        contratoArquivoId: params.contratoArquivoId,
        usuarioId: params.usuarioId,
        acao: params.acao,
        ipAddress: params.meta.ipAddress,
        userAgent: params.meta.userAgent,
        metadata: (params.extra as Prisma.InputJsonValue) ?? undefined,
      },
    });
  } catch (e) {
    console.error("[juridico/audit] falha ao logar acesso:", e);
  }
}
