import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * Cifra simétrica de campo (DB) com AES-256-GCM.
 *
 * Formato: "v1.<iv>.<tag>.<ct>" (todos base64url, separados por ".").
 * Usar para campos sensíveis no Postgres que não são consultáveis por busca
 * (ex.: TOTP secret, refresh tokens). Não cobre campos onde se precisa filtrar.
 */

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const passphrase = process.env.SECRETS_ENCRYPTION_KEY;
  if (!passphrase) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SECRETS_ENCRYPTION_KEY ausente — necessário para cifra de campos.");
    }
    const dev = process.env.SESSION_SECRET || "dev-only-not-secure-key";
    cachedKey = scryptSync(dev, "cockpit-onix-fields", 32);
    return cachedKey;
  }
  cachedKey = scryptSync(passphrase, "cockpit-onix-fields", 32);
  return cachedKey;
}

const b64u = (b: Buffer) =>
  b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) =>
  Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${b64u(iv)}.${b64u(tag)}.${b64u(ct)}`;
}

export function decryptField(blob: string | null | undefined): string | null {
  if (!blob || !blob.startsWith("v1.")) return null;
  const [, ivB, tagB, ctB] = blob.split(".");
  if (!ivB || !tagB || !ctB) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", getKey(), fromB64u(ivB));
    decipher.setAuthTag(fromB64u(tagB));
    const pt = Buffer.concat([decipher.update(fromB64u(ctB)), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    return null;
  }
}
