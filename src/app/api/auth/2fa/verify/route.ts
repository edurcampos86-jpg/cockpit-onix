/**
 * POST /api/auth/2fa/verify
 *
 * Valida um código TOTP (6 dígitos). Dois usos:
 *  - Setup inicial: body { code, enableSetup: true } — primeira validação,
 *    seta twoFactorEnabled = true.
 *  - Login pós-2FA: body { code } — cria cookie de sessão 2FA por 12h.
 *
 * Aceita também backup codes (single-use). Se o code passado matchar um
 * hash da lista, remove o hash usado.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-helpers";
import { decifrarSecret, validarCodigoTOTP, validarBackupCode } from "@/lib/auth/2fa";
import { criarSessao2FA } from "@/lib/auth/session-2fa";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { code?: string; enableSetup?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const code = (body.code || "").trim();
  if (!code) {
    return NextResponse.json({ error: "code é obrigatório" }, { status: 400 });
  }

  const perm = await prisma.usuarioPermissao.findUnique({
    where: { userId: ctx.userId },
    select: {
      twoFactorEnabled: true,
      twoFactorSecretEnc: true,
      twoFactorBackupCodes: true,
    },
  });
  if (!perm?.twoFactorSecretEnc) {
    return NextResponse.json(
      { error: "2FA não configurado. Use /setup primeiro." },
      { status: 400 }
    );
  }

  const secret = decifrarSecret(perm.twoFactorSecretEnc);
  let valido = false;
  let usouBackupCode = false;
  let novosBackupCodes: string[] | null = null;

  // 1) Tentar como TOTP normal (6 dígitos)
  if (/^\d{6}$/.test(code)) {
    valido = validarCodigoTOTP(secret, code);
  }

  // 2) Fallback: backup code (formato alfanumérico 10 chars, hash bcrypt)
  if (!valido && Array.isArray(perm.twoFactorBackupCodes)) {
    const hashes = (perm.twoFactorBackupCodes as unknown[]).filter(
      (h): h is string => typeof h === "string"
    );
    const idx = await validarBackupCode(code, hashes);
    if (idx >= 0) {
      valido = true;
      usouBackupCode = true;
      novosBackupCodes = hashes.filter((_, i) => i !== idx);
    }
  }

  if (!valido) {
    return NextResponse.json({ error: "Código inválido ou expirado" }, { status: 401 });
  }

  // Persistir atualizações
  await prisma.usuarioPermissao.update({
    where: { userId: ctx.userId },
    data: {
      ...(body.enableSetup ? { twoFactorEnabled: true } : {}),
      twoFactorVerifiedAt: new Date(),
      ...(usouBackupCode && novosBackupCodes
        ? { twoFactorBackupCodes: novosBackupCodes }
        : {}),
    },
  });

  // Criar cookie de sessão 2FA (12h)
  await criarSessao2FA(ctx.userId);

  return NextResponse.json({
    ok: true,
    twoFactorEnabled: true,
    usouBackupCode,
    backupCodesRestantes: novosBackupCodes
      ? novosBackupCodes.length
      : Array.isArray(perm.twoFactorBackupCodes)
        ? perm.twoFactorBackupCodes.length
        : 0,
  });
}
