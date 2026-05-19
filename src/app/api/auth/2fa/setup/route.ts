/**
 * POST /api/auth/2fa/setup
 *
 * Gera secret + QR + 10 backup codes. Persiste o secret cifrado e os codes
 * hashados em UsuarioPermissao, mas mantém twoFactorEnabled = false até
 * o /verify confirmar o primeiro código TOTP.
 *
 * Auth: usuário logado.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-helpers";
import {
  gerarSetup2FA,
  cifrarSecret,
  hashearBackupCodes,
} from "@/lib/auth/2fa";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Bloqueia se já tem 2FA ativo — pra mudar, usar /disable primeiro
  const existing = await prisma.usuarioPermissao.findUnique({
    where: { userId: ctx.userId },
    select: { twoFactorEnabled: true },
  });
  if (existing?.twoFactorEnabled) {
    return NextResponse.json(
      { error: "2FA já está ativo. Use /disable antes de re-configurar." },
      { status: 409 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { email: true },
  });
  if (!user) return NextResponse.json({ error: "User não encontrado" }, { status: 404 });

  const setup = await gerarSetup2FA(user.email);
  const secretEnc = cifrarSecret(setup.secretBase32);
  const backupCodesHash = await hashearBackupCodes(setup.backupCodes);

  await prisma.usuarioPermissao.upsert({
    where: { userId: ctx.userId },
    create: {
      userId: ctx.userId,
      twoFactorEnabled: false, // ainda não confirmado
      twoFactorSecretEnc: secretEnc,
      twoFactorBackupCodes: backupCodesHash,
    },
    update: {
      twoFactorEnabled: false,
      twoFactorSecretEnc: secretEnc,
      twoFactorBackupCodes: backupCodesHash,
      twoFactorVerifiedAt: null,
    },
  });

  // Retorna secret base32 + QR + backup codes EM TEXTO (mostrar UMA vez na UI)
  return NextResponse.json({
    ok: true,
    qrCodeDataUrl: setup.qrCodeDataUrl,
    secretBase32: setup.secretBase32, // backup manual caso a leitura do QR falhe
    backupCodes: setup.backupCodes, // 10 strings — usuário deve anotar
    proximo: "POST /api/auth/2fa/verify com o código do app pra ativar",
  });
}
