import "server-only";
import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "./session";
import { prisma } from "./prisma";
import {
  normalizePermissoes,
  type ModuloEcossistema,
  type PermissoesAcesso,
} from "./permissoes";

/**
 * Contexto de autenticação enriquecido com dados da Pessoa (time) quando existe.
 *
 * - `role` vem do User (auth) — "admin" | "support"
 * - `pessoa.teamRole` vem do registro Pessoa — "admin" | "lideranca" | "colaborador"
 * - `pessoa.permissoes` já normalizado (null → tudo true)
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
    permissoes: PermissoesAcesso;
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
      permissoes: true,
    },
  });
  return {
    userId: session.userId,
    name: session.name,
    role: session.role,
    pessoa: pessoa
      ? {
          id: pessoa.id,
          teamRole: pessoa.teamRole,
          nomeCompleto: pessoa.nomeCompleto,
          departamentoId: pessoa.departamentoId,
          filialId: pessoa.filialId,
          permissoes: normalizePermissoes(pessoa.permissoes),
        }
      : null,
  };
}

/**
 * Versão "soft" — não redireciona se não há sessão. Retorna null.
 * Use em layouts compartilhados (root layout) que rodam também na tela de login.
 */
export async function getOptionalAuthContext(): Promise<AuthContext | null> {
  const session = await getSession();
  if (!session) return null;
  const pessoa = await prisma.pessoa.findUnique({
    where: { userId: session.userId },
    select: {
      id: true,
      teamRole: true,
      nomeCompleto: true,
      departamentoId: true,
      filialId: true,
      permissoes: true,
    },
  });
  return {
    userId: session.userId,
    name: session.name,
    role: session.role,
    pessoa: pessoa
      ? {
          id: pessoa.id,
          teamRole: pessoa.teamRole,
          nomeCompleto: pessoa.nomeCompleto,
          departamentoId: pessoa.departamentoId,
          filialId: pessoa.filialId,
          permissoes: normalizePermissoes(pessoa.permissoes),
        }
      : null,
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
 * - Admin: sempre
 * - A própria pessoa: sempre vê a própria
 * - Liderança: vê pessoas do mesmo departamento ou que reportam à hierarquia dela
 *   (checagem completa via SQL — esta função é só fallback de UI)
 * - Colaborador: vê dados públicos de qualquer pessoa ativa (a granularidade fica
 *   na seção; ex.: numerologia/acordo nunca vêm para colaborador)
 */
export function canViewPessoa(ctx: AuthContext, targetPessoaId: string): boolean {
  if (isAdmin(ctx)) return true;
  if (ctx.pessoa?.id === targetPessoaId) return true;
  return true; // visibilidade básica é pública para o time; campos sensíveis filtram em outra camada
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

/**
 * Pode acessar um módulo do ecossistema?
 * - Admin: sempre
 * - Pessoa sem permissoes (null) → tratado como "tudo liberado" (compat antigo)
 * - Caso contrário, consulta a flag específica
 *
 * Usuário "support" sem Pessoa vinculada também tem acesso total (caso técnico).
 */
export function canAccessModule(ctx: AuthContext, modulo: ModuloEcossistema): boolean {
  if (isAdmin(ctx)) return true;
  if (!ctx.pessoa) return true; // user sem pessoa = legado, não bloqueia
  return ctx.pessoa.permissoes[modulo] === true;
}

/**
 * Retorna o mapa de permissões efetivas (já considerando admin override).
 * Útil para passar pro Client Component da Sidebar.
 */
export function getEffectivePermissoes(ctx: AuthContext): PermissoesAcesso {
  if (isAdmin(ctx) || !ctx.pessoa) {
    return {
      mkt: true,
      corretora: true,
      backoffice: true,
      time: true,
      timeInsights: true,
      metodo: true,
      glossario: true,
      integracoes: true,
      configuracoes: true,
    };
  }
  return ctx.pessoa.permissoes;
}
