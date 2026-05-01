"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  createSession,
  deleteSession,
  signTotpChallenge,
  verifyTotpChallenge,
} from "@/lib/session";
import { rateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import { consumeLoginCode } from "@/app/actions/two-factor";
import { logSecurityEvent, SecurityEventType } from "@/lib/security/audit";
import { getSession } from "@/lib/session";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

export type LoginState =
  | { error?: string; needsTotp?: false }
  | { needsTotp: true; challenge: string; error?: string }
  | undefined;

function cleanCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

const LOGIN_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 };
const TOTP_LIMIT = { limit: 8, windowMs: 15 * 60 * 1000, blockMs: 30 * 60 * 1000 };

export async function login(state: LoginState, formData: FormData): Promise<LoginState> {
  const rawCpf = formData.get("cpf") as string;
  const password = formData.get("password") as string;

  if (!rawCpf || !password) {
    return { error: "Preencha todos os campos." };
  }

  const cpf = cleanCpf(rawCpf);

  if (cpf.length !== 11) {
    return { error: "CPF inválido. Digite os 11 dígitos." };
  }

  const ip = await clientIp();
  const rlIpCpf = rateLimit(`login:${ip}:${cpf}`, LOGIN_LIMIT);
  const rlIp = rateLimit(`login:${ip}`, { limit: 30, windowMs: 15 * 60 * 1000 });
  if (!rlIpCpf.allowed || !rlIp.allowed) {
    const wait = Math.ceil(
      Math.max(
        !rlIpCpf.allowed ? rlIpCpf.retryAfterMs : 0,
        !rlIp.allowed ? rlIp.retryAfterMs : 0,
      ) / 60000,
    );
    await logSecurityEvent({
      type: SecurityEventType.LOGIN_RATE_LIMITED,
      cpf,
      success: false,
      metadata: { waitMinutes: wait },
    });
    return { error: `Muitas tentativas. Tente novamente em ~${wait} minuto(s).` };
  }

  let user:
    | {
        id: string;
        name: string;
        role: string;
        password: string;
        totpEnabled: boolean;
      }
    | null = null;
  try {
    user = await prisma.user.findUnique({
      where: { cpf },
      select: { id: true, name: true, role: true, password: true, totpEnabled: true },
    });
  } catch (error) {
    console.error("Login error:", error);
    return { error: "Erro ao fazer login. Tente novamente." };
  }

  const fakeHash = "$2b$12$CwTycUXWue0Thq9StjUM0uJ8w6m1rO0Y7rQ2t6lKPv9wG2uFhK6Wm";
  const passwordMatch = await bcrypt.compare(password, user?.password ?? fakeHash);

  if (!user || !passwordMatch) {
    await logSecurityEvent({
      type: SecurityEventType.LOGIN_FAIL,
      userId: user?.id ?? null,
      cpf,
      success: false,
      metadata: { reason: user ? "wrong_password" : "unknown_cpf" },
    });
    return { error: "CPF ou senha incorretos." };
  }

  resetRateLimit(`login:${ip}:${cpf}`);

  if (user.totpEnabled) {
    // Não cria sessão ainda — devolve um challenge curto; o cliente envia
    // junto do código TOTP/recuperação para concluir o login.
    const challenge = await signTotpChallenge(user.id);
    return { needsTotp: true, challenge };
  }

  await logSecurityEvent({
    type: SecurityEventType.LOGIN_OK,
    userId: user.id,
    metadata: { totp: false },
  });
  await createSession(user.id, user.name, user.role);

  redirect("/");
}

export type VerifyTotpState =
  | { error?: string }
  | undefined;

export async function verifyLoginTotp(
  state: VerifyTotpState,
  formData: FormData,
): Promise<VerifyTotpState> {
  const challenge = String(formData.get("challenge") || "");
  const code = String(formData.get("code") || "");

  const claim = await verifyTotpChallenge(challenge);
  if (!claim) return { error: "Sessão de login expirou — comece de novo." };

  const ip = await clientIp();
  const rl = rateLimit(`totp:${ip}:${claim.userId}`, TOTP_LIMIT);
  if (!rl.allowed) {
    const wait = Math.ceil(rl.retryAfterMs / 60000);
    return { error: `Muitas tentativas. Tente em ~${wait} min.` };
  }

  if (!code) return { error: "Informe o código." };

  const ok = await consumeLoginCode(claim.userId, code);
  if (!ok) {
    await logSecurityEvent({
      type: SecurityEventType.LOGIN_TOTP_FAIL,
      userId: claim.userId,
      success: false,
    });
    return { error: "Código inválido." };
  }

  resetRateLimit(`totp:${ip}:${claim.userId}`);

  const user = await prisma.user.findUnique({
    where: { id: claim.userId },
    select: { id: true, name: true, role: true },
  });
  if (!user) return { error: "Usuário não encontrado." };

  await logSecurityEvent({
    type: SecurityEventType.LOGIN_TOTP_OK,
    userId: user.id,
    metadata: { totp: true },
  });
  await createSession(user.id, user.name, user.role);
  redirect("/");
}

export async function logout() {
  const session = await getSession();
  if (session) {
    await logSecurityEvent({
      type: SecurityEventType.LOGOUT,
      userId: session.userId,
    });
  }
  await deleteSession();
  redirect("/login");
}
