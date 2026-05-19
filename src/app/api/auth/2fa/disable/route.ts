/**
 * POST /api/auth/2fa/disable
 *
 * Desabilita 2FA. Exige senha atual + código TOTP/backup válido.
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-helpers";
import { decifrarSecret, validarCodigoTOTP, validarBackupCode } from "@/lib/auth/2fa";
import { limparSessao2FA } from "@/lib/auth/session-2fa";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { password?: string; code?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  if (!body.password || !body.code) {
    return NextResponse.json(
      { error: "password e code são obrigatórios" },
      { status: 400 }
    );
  }

  const [user, perm] = await Promise.all([
    prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { password: true },
    }),
    prisma.usuarioPermissao.findUnique({
      where: { userId: ctx.userId },
      select: {
        twoFactorEnabled: true,
        twoFactorSecretEnc: true,
        twoFactorBackupCodes: true,
      },
    }),
  ]);

  if (!user || !perm) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }
  if (!perm.twoFactorEnabled || !perm.twoFactorSecretEnc) {
    return NextResponse.json({ error: "2FA não está ativo" }, { status: 400 });
  }

  // Validar senha
  const senhaOk = await bcrypt.compare(body.password, user.password);
  if (!senhaOk) {
    return NextResponse.json({ error: "Senha incorreta" }, { status: 401 });
  }

  // Validar código (TOTP ou backup)
  const secret = decifrarSecret(perm.twoFactorSecretEnc);
  let codigoOk = /^\d{6}$/.test(body.code) && validarCodigoTOTP(secret, body.code);

  if (!codigoOk && Array.isArray(perm.twoFactorBackupCodes)) {
    const hashes = (perm.twoFactorBackupCodes as unknown[]).filter(
      (h): h is string => typeof h === "string"
    );
    codigoOk = (await validarBackupCode(body.code, hashes)) >= 0;
  }
  if (!codigoOk) {
    return NextResponse.json({ error: "Código inválido" }, { status: 401 });
  }

  await prisma.usuarioPermissao.update({
    where: { userId: ctx.userId },
    data: {
      twoFactorEnabled: false,
      twoFactorSecretEnc: null,
      twoFactorBackupCodes: undefined,
      twoFactorVerifiedAt: null,
    },
  });

  await limparSessao2FA();

  return NextResponse.json({ ok: true });
}
