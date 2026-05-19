import "server-only";
import speakeasy from "speakeasy";
import qrcode from "qrcode";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { encryptSecret, decryptSecret } from "../crypto";

/**
 * 2FA TOTP — Fase 1B do Jurídico.
 *
 * Stack:
 *  - speakeasy: gera secret base32, valida códigos TOTP (window ±1 step de 30s)
 *  - qrcode: gera data:URL do QR code pro usuário escanear no app authenticator
 *  - bcryptjs: hasha os 10 códigos de backup (single-use)
 *  - crypto.ts: cifra o secret base32 em AES-256-GCM antes de salvar no DB
 *
 * Fluxo:
 *  1. setup: gera secret + QR + backup codes; persiste secret cifrado e
 *     backupCodes hashados; twoFactorEnabled fica FALSE até verify confirmar.
 *  2. verify (setup): valida 1º código TOTP; se OK, twoFactorEnabled = true.
 *  3. verify (login): pós-login, valida código antes de criar a sessão 2FA.
 *  4. disable: pede senha + código, zera secret/codes/enabled.
 */

const APP_NAME = process.env.TWO_FACTOR_APP_NAME || "Cockpit Onix";
const ISSUER = process.env.TWO_FACTOR_ISSUER || "Onix Capital";

export type SetupResult = {
  secretBase32: string; // mostrado UMA vez na UI (backup manual)
  otpauthUrl: string; // pra usar em wallets/UI fora do QR
  qrCodeDataUrl: string; // data:image/png;base64,... pra <img src>
  backupCodes: string[]; // 10 strings de 10 chars (mostradas UMA vez)
};

/**
 * Gera secret + QR + backup codes. NÃO ativa 2FA ainda — caller deve persistir
 * (cifrado/hashado) e chamar verify pra confirmar.
 */
export async function gerarSetup2FA(email: string): Promise<SetupResult> {
  const secret = speakeasy.generateSecret({
    length: 20,
    name: `${APP_NAME}:${email}`,
    issuer: ISSUER,
  });

  if (!secret.base32 || !secret.otpauth_url) {
    throw new Error("Falha ao gerar secret 2FA");
  }

  const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url, {
    width: 240,
    margin: 1,
  });

  const backupCodes: string[] = [];
  for (let i = 0; i < 10; i++) {
    backupCodes.push(crypto.randomBytes(5).toString("hex").toUpperCase());
  }

  return {
    secretBase32: secret.base32,
    otpauthUrl: secret.otpauth_url,
    qrCodeDataUrl,
    backupCodes,
  };
}

/** Cifra o secret base32 com AES-256-GCM (lib/crypto). Caller persiste no DB. */
export function cifrarSecret(secretBase32: string): string {
  return encryptSecret(secretBase32);
}

/** Decifra o secret stored no DB. */
export function decifrarSecret(secretEnc: string): string {
  return decryptSecret(secretEnc);
}

/** Hasha os 10 backup codes (bcrypt) — caller persiste o array de hashes. */
export async function hashearBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => bcrypt.hash(c, 8)));
}

/**
 * Valida um código TOTP de 6 dígitos contra o secret armazenado.
 * Window ±1 = aceita ±30s de drift relógio.
 */
export function validarCodigoTOTP(secretBase32: string, code: string): boolean {
  if (!code || !/^\d{6}$/.test(code)) return false;
  return speakeasy.totp.verify({
    secret: secretBase32,
    encoding: "base32",
    token: code,
    window: 1,
  });
}

/**
 * Valida um backup code (single-use). Caller deve remover o hash que matchou
 * da lista após retorno true. Retorna o índice do hash que casou, ou -1.
 */
export async function validarBackupCode(
  code: string,
  hashes: string[]
): Promise<number> {
  if (!code) return -1;
  const normalizado = code.trim().toUpperCase().replace(/\s+/g, "");
  for (let i = 0; i < hashes.length; i++) {
    if (await bcrypt.compare(normalizado, hashes[i])) return i;
  }
  return -1;
}
