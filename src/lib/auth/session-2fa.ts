import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Sessão 2FA — cookie separado da sessão principal. Marca que o usuário
 * passou pelo verify TOTP recentemente. Tempo de vida: 12h.
 *
 * Por que cookie separado e não dentro da `session` JWT principal:
 *  - Permite revogar 2FA sem deslogar (limpar só essa cookie)
 *  - Reduz necessidade de renovar a sessão principal toda vez
 *  - Middleware fica simples: tem 2fa-verified ou não tem
 */

const COOKIE_NAME = "2fa-verified";
const TTL_MS = 12 * 60 * 60 * 1000; // 12h

const secretKey = process.env.SESSION_SECRET;
const encodedKey = new TextEncoder().encode(secretKey);

type TwoFactorSession = {
  userId: string;
  verifiedAt: number; // epoch ms
};

export async function criarSessao2FA(userId: string): Promise<void> {
  const payload: TwoFactorSession = {
    userId,
    verifiedAt: Date.now(),
  };
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(new Date(Date.now() + TTL_MS))
    .sign(encodedKey);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: new Date(Date.now() + TTL_MS),
    sameSite: "lax",
    path: "/",
  });
}

export async function verificarSessao2FA(userId: string): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ["HS256"] });
    const tf = payload as unknown as TwoFactorSession;
    if (tf.userId !== userId) return false;
    if (Date.now() - tf.verifiedAt > TTL_MS) return false;
    return true;
  } catch {
    return false;
  }
}

export async function limparSessao2FA(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
