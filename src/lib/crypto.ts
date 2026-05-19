import "server-only";
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

function loadKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.GOOGLE_TOKEN_ENC_KEY;
  if (!raw) {
    throw new Error(
      "GOOGLE_TOKEN_ENC_KEY ausente. Gere com: node -e 'console.log(require(\"crypto\").randomBytes(32).toString(\"base64\"))'"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `GOOGLE_TOKEN_ENC_KEY tem ${key.length} bytes; esperado 32 (256 bits) em base64.`
    );
  }
  cachedKey = key;
  return key;
}

/**
 * Cifra um segredo com AES-256-GCM.
 * Saída: "<ivBase64>:<tagBase64>:<cipherBase64>".
 * NUNCA logar o retorno — é dado sensível.
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) throw new Error("encryptSecret: plaintext vazio");
  const key = loadKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("decryptSecret: formato inválido");
  }
  const [ivB64, tagB64, encB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const enc = Buffer.from(encB64, "base64");
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("decryptSecret: IV ou tag com tamanho inválido");
  }
  const key = loadKey();
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}
