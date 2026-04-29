"use server";

import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { encryptField, decryptField } from "@/lib/security/field-crypto";
import {
  generateBase32Secret,
  generateRecoveryCodes,
  otpauthUrl,
  verifyTotp,
} from "@/lib/security/totp";

export type SetupTotpResult =
  | {
      ok: true;
      secret: string;
      otpauth: string;
      recoveryCodes: string[];
    }
  | { ok: false; error: string };

export type SimpleResult = { ok: true } | { ok: false; error: string };

const ISSUER = "Cockpit Onix";

function hashCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

/**
 * Inicia setup de TOTP para o usuário logado. Retorna o secret (em base32) +
 * URL otpauth + códigos de recuperação que o usuário PRECISA salvar agora —
 * é a única vez que aparecem em texto puro.
 *
 * O secret só é persistido depois de `confirmTotp` validar um código.
 */
export async function setupTotp(): Promise<SetupTotpResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sessão expirada" };

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, totpEnabled: true },
  });
  if (!user) return { ok: false, error: "Usuário não encontrado" };
  if (user.totpEnabled) {
    return { ok: false, error: "2FA já está ativo. Desative primeiro para reconfigurar." };
  }

  const secret = generateBase32Secret();
  const recoveryCodes = generateRecoveryCodes(10);
  const otpauth = otpauthUrl({ secret, account: user.email, issuer: ISSUER });

  // Persistimos o secret cifrado mas com totpEnabled=false. Só será habilitado
  // após o usuário provar que o app está sincronizado via confirmTotp.
  await prisma.user.update({
    where: { id: session.userId },
    data: {
      totpSecret: encryptField(secret),
      totpRecoveryHashes: recoveryCodes.map(hashCode),
      totpEnabled: false,
    },
  });

  return { ok: true, secret, otpauth, recoveryCodes };
}

/** Confirma o setup ativando 2FA após validar um código gerado pelo app. */
export async function confirmTotp(formData: FormData): Promise<SimpleResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sessão expirada" };

  const code = String(formData.get("code") || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "Código deve ter 6 dígitos" };

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { totpSecret: true, totpEnabled: true },
  });
  if (!user || !user.totpSecret) return { ok: false, error: "Setup não iniciado" };
  if (user.totpEnabled) return { ok: false, error: "2FA já está ativo" };

  const secret = decryptField(user.totpSecret);
  if (!secret) return { ok: false, error: "Falha ao decifrar secret" };
  if (!verifyTotp(secret, code)) return { ok: false, error: "Código inválido" };

  await prisma.user.update({
    where: { id: session.userId },
    data: { totpEnabled: true },
  });

  return { ok: true };
}

/** Desativa 2FA. Exige senha + (código TOTP atual OU código de recuperação). */
export async function disableTotp(formData: FormData): Promise<SimpleResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sessão expirada" };

  const password = String(formData.get("password") || "");
  const code = String(formData.get("code") || "").replace(/\s+/g, "");
  if (!password) return { ok: false, error: "Senha obrigatória" };
  if (!code) return { ok: false, error: "Código TOTP ou de recuperação obrigatório" };

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      password: true,
      totpEnabled: true,
      totpSecret: true,
      totpRecoveryHashes: true,
    },
  });
  if (!user) return { ok: false, error: "Usuário não encontrado" };
  if (!user.totpEnabled) return { ok: false, error: "2FA não está ativo" };

  const passwordOk = await bcrypt.compare(password, user.password);
  if (!passwordOk) return { ok: false, error: "Senha incorreta" };

  const secret = decryptField(user.totpSecret);
  const totpOk = secret ? verifyTotp(secret, code) : false;
  const recoveryOk = user.totpRecoveryHashes.includes(hashCode(code));
  if (!totpOk && !recoveryOk) return { ok: false, error: "Código inválido" };

  await prisma.user.update({
    where: { id: session.userId },
    data: { totpEnabled: false, totpSecret: null, totpRecoveryHashes: [] },
  });

  return { ok: true };
}

/**
 * Verifica um código TOTP (ou recuperação) durante o login intermediário.
 * Retorna true se válido. Para recovery code: consome o hash (um-uso).
 */
export async function consumeLoginCode(
  userId: string,
  code: string,
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpRecoveryHashes: true, totpEnabled: true },
  });
  if (!user || !user.totpEnabled) return false;

  const cleaned = code.replace(/\s+/g, "");
  // TOTP de 6 dígitos
  if (/^\d{6}$/.test(cleaned)) {
    const secret = decryptField(user.totpSecret);
    return !!secret && verifyTotp(secret, cleaned);
  }
  // Código de recuperação — consome (remove) ao usar
  const h = hashCode(cleaned);
  if (user.totpRecoveryHashes.includes(h)) {
    await prisma.user.update({
      where: { id: userId },
      data: { totpRecoveryHashes: user.totpRecoveryHashes.filter((x) => x !== h) },
    });
    return true;
  }
  return false;
}
