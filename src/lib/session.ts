import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export interface SessionPayload {
  userId: string;
  name: string;
  role: string;
  expiresAt: Date;
}

const secretKey = process.env.SESSION_SECRET;
if (!secretKey || secretKey.length < 32) {
  // Falha cedo: rodar com SESSION_SECRET fraco/ausente é um risco crítico.
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET ausente ou muito curto (mínimo 32 caracteres) em produção.");
  }
}
const encodedKey = new TextEncoder().encode(secretKey || "dev-only-fallback-secret-change-me");

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const SESSION_TTL_JWT = "1d";

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL_JWT)
    .sign(encodedKey);
}

export async function decrypt(session: string | undefined = "") {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(userId: string, name: string, role: string) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const session = await encrypt({ userId, name, role, expiresAt });
  const cookieStore = await cookies();

  cookieStore.set("session", session, {
    httpOnly: true,
    // Sempre Secure; em dev sobre HTTP os browsers ignoram em localhost (OK).
    secure: true,
    expires: expiresAt,
    sameSite: "strict",
    path: "/",
  });
}

export async function getSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  if (!session) return null;
  return decrypt(session);
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}

/**
 * Token intermediário emitido após senha OK quando o usuário tem 2FA ativo.
 * Vida curta (5 min), assinado com a mesma chave da sessão. NÃO autoriza
 * acesso a rotas — só comprova que a senha foi validada para a etapa TOTP.
 */
export async function signTotpChallenge(userId: string): Promise<string> {
  return new SignJWT({ userId, scope: "totp-challenge" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(encodedKey);
}

export async function verifyTotpChallenge(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, encodedKey, { algorithms: ["HS256"] });
    if (payload.scope !== "totp-challenge" || typeof payload.userId !== "string") return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}
