import "server-only";
import fs from "node:fs";
import path from "node:path";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

/**
 * Storage cifrado para segredos persistidos em disco (ex.: refresh tokens
 * de OAuth obtidos em runtime). Usa AES-256-GCM com chave derivada via
 * scrypt a partir de `SECRETS_ENCRYPTION_KEY` (env var obrigatória em prod).
 *
 * Formato do arquivo: JSON `{ <key>: { iv, tag, ct } }` (todos base64).
 */

const FILE = path.resolve(process.cwd(), ".integrations.enc.json");

function deriveKey(): Buffer {
  const passphrase = process.env.SECRETS_ENCRYPTION_KEY;
  if (!passphrase) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SECRETS_ENCRYPTION_KEY não configurada — recuse persistência em produção.",
      );
    }
    // Fallback dev (NÃO usar em prod): chave fixa derivada do session secret.
    const dev = process.env.SESSION_SECRET || "dev-only-not-secure-key";
    return scryptSync(dev, "cockpit-onix-secrets", 32);
  }
  return scryptSync(passphrase, "cockpit-onix-secrets", 32);
}

type Encoded = { iv: string; tag: string; ct: string };

function readAll(): Record<string, Encoded> {
  try {
    if (!fs.existsSync(FILE)) return {};
    return JSON.parse(fs.readFileSync(FILE, "utf-8")) as Record<string, Encoded>;
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, Encoded>) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
}

function encrypt(plain: string): Encoded {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString("base64"), tag: tag.toString("base64"), ct: ct.toString("base64") };
}

function decrypt(enc: Encoded): string | null {
  try {
    const key = deriveKey();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(enc.iv, "base64"));
    decipher.setAuthTag(Buffer.from(enc.tag, "base64"));
    const pt = Buffer.concat([
      decipher.update(Buffer.from(enc.ct, "base64")),
      decipher.final(),
    ]);
    return pt.toString("utf8");
  } catch {
    return null;
  }
}

export function getSecret(key: string): string | null {
  const all = readAll();
  const enc = all[key];
  return enc ? decrypt(enc) : null;
}

export function setSecret(key: string, value: string): void {
  const all = readAll();
  all[key] = encrypt(value);
  writeAll(all);
}

export function listSecretKeys(): string[] {
  return Object.keys(readAll());
}
