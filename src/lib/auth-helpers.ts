import "server-only";
import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "./session";
import { prisma } from "./prisma";

/**
 * Contexto de autenticação enriquecido com dados da Pessoa (time) quando existe.
 *
 * - `role` vem do User (auth) — "admin" | "support"
 * - `pessoa.teamRole` vem do registro Pessoa — "admin" | "lideranca" | "colaborador"
 *
 * O User pode existir sem Pessoa (ex.: usuário "support" técnico). A Pessoa pode existir
 * sem User (criada pelo admin antes do convite). A interseção comum: User + Pessoa linkados.
 */
export type AuthContext = {
  userId: string;
  name: string;
  role: string; // "admin" | "support"
  pessoa: {
    id: string;
    teamRole: string; // "admin" | "lideranca" | "colaborador"
    nomeCompleto: string;
    departamentoId: string;
    filialId: string;
  } | null;
};

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function getAuthContext(): Promise<AuthContext> {
  const session = await requireSession();
  const pessoa = await prisma.pessoa.findUnique({
    where: { userId: session.userId },
    select: {
      id: true,
      teamRole: true,
      nomeCompleto: true,
      departamentoId: true,
      filialId: true,
    },
  });
  return {
    userId: session.userId,
    name: session.name,
    role: session.role,
    pessoa,
  };
}

/** Admin é quem tem User.role === "admin" OU Pessoa.teamRole === "admin". */
export function isAdmin(ctx: AuthContext): boolean {
  return ctx.role === "admin" || ctx.pessoa?.teamRole === "admin";
}

/** Liderança = admin OU pessoa com teamRole === "lideranca". */
export function isLideranca(ctx: AuthContext): boolean {
  return isAdmin(ctx) || ctx.pessoa?.teamRole === "lideranca";
}

export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!isAdmin(ctx)) redirect("/");
  return ctx;
}

export async function requireLideranca(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!isLideranca(ctx)) redirect("/");
  return ctx;
}

/**
 * Pode ver a ficha da pessoa-alvo?
 *
 * Padrão default-deny — quem pode ver:
 * - Admin: sempre
 * - A própria pessoa: sempre
 * - Liderança ou colaborador: precisa estar no mesmo departamento da pessoa-alvo
 *
 * Para a versão completa por hierarquia (chefe/subordinado direto), use a
 * checagem SQL específica nas queries — esta função é o gate de UI/handlers.
 */
export async function canViewPessoa(
  ctx: AuthContext,
  targetPessoaId: string,
): Promise<boolean> {
  if (isAdmin(ctx)) return true;
  if (!ctx.pessoa) return false;
  if (ctx.pessoa.id === targetPessoaId) return true;

  const target = await prisma.pessoa.findUnique({
    where: { id: targetPessoaId },
    select: { departamentoId: true },
  });
  if (!target) return false;
  return target.departamentoId === ctx.pessoa.departamentoId;
}

/** Pode ver dados sensíveis (numerologia, acordo comercial) da pessoa-alvo? */
export function canViewSensitive(ctx: AuthContext, targetPessoaId: string): boolean {
  if (isAdmin(ctx)) return true;
  // A própria pessoa vê o próprio acordo comercial (mas NÃO a própria numerologia).
  // A regra fina fica em cada seção; este helper retorna o caso geral mais permissivo.
  if (ctx.pessoa?.id === targetPessoaId) return true;
  return false;
}

/** Pode editar (criar/atualizar/arquivar) registros do time? Só admin. */
export function canManageTeam(ctx: AuthContext): boolean {
  return isAdmin(ctx);
}
