import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Compara dois segredos em tempo constante.
 * Retorna `false` quando algum dos lados está vazio (default-deny).
 */
export function safeEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    // ainda assim faz a comparação para não vazar tamanho
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}
