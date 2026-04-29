import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Implementação RFC 6238 (TOTP) em cima do node:crypto, sem dependências.
 * Compatível com Google Authenticator, Authy, 1Password, Microsoft Authenticator.
 *
 * Padrão: SHA1, 6 dígitos, passo de 30s.
 */

const STEP = 30;
const DIGITS = 6;
const ALG = "sha1";

const B32_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateBase32Secret(bytes = 20): string {
  // 20 bytes (160 bits) — recomendado para SHA1 TOTP
  return base32Encode(randomBytes(bytes));
}

export function base32Encode(buf: Buffer): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHA[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHA[(value << (5 - bits)) & 0x1f];
  return out;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of cleaned) {
    const idx = B32_ALPHA.indexOf(ch);
    if (idx < 0) throw new Error("base32 inválido");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function counterBuffer(counter: number): Buffer {
  const buf = Buffer.alloc(8);
  // counter cabe em 32 bits para tempos razoáveis (passa de 2106)
  buf.writeUInt32BE(Math.floor(counter / 0x1_0000_0000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  return buf;
}

export function totpAt(secretB32: string, atSeconds: number): string {
  const counter = Math.floor(atSeconds / STEP);
  const key = base32Decode(secretB32);
  const hmac = createHmac(ALG, key).update(counterBuffer(counter)).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** Verifica um código com janela de tolerância (±N passos de 30s). */
export function verifyTotp(secretB32: string, code: string, window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const now = Math.floor(Date.now() / 1000);
  const expected: string[] = [];
  for (let w = -window; w <= window; w++) {
    expected.push(totpAt(secretB32, now + w * STEP));
  }
  const a = Buffer.from(code);
  for (const e of expected) {
    const b = Buffer.from(e);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/**
 * Constrói a URI otpauth:// usada por aplicativos autenticadores.
 * Exemplo: otpauth://totp/Onix:fulano%40onix.com?secret=...&issuer=Onix
 */
export function otpauthUrl(opts: {
  secret: string;
  account: string;
  issuer: string;
}): string {
  const label = encodeURIComponent(`${opts.issuer}:${opts.account}`);
  const params = new URLSearchParams({
    secret: opts.secret,
    issuer: opts.issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(STEP),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Gera N códigos de recuperação legíveis no formato XXXX-XXXX. */
export function generateRecoveryCodes(n = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    const buf = randomBytes(5);
    const hex = buf.toString("hex").toUpperCase(); // 10 chars
    codes.push(`${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 10)}`);
  }
  return codes;
}
