import "server-only";
import { prisma } from "../prisma";

/**
 * RBAC do módulo Jurídico — Fase 1B.
 *
 * Modelo:
 *  - User.role: "admin" | "support" (auth — não muda nessa fase)
 *  - UsuarioPermissao (1:1 com User): flags granulares + carteirasPermitidas
 *  - Pessoa.teamRole: "admin" | "lideranca" | "colaborador" (vem do módulo Time,
 *    usado como referência semântica; permissões REAIS estão em UsuarioPermissao)
 *
 * Princípio: default deny. Se UsuarioPermissao não existe, retorna false em tudo
 * EXCETO se User.role === "admin" — admin bypassa permissões granulares
 * (mas continua precisando de 2FA pra rotas /juridico/*).
 *
 * Em todo helper, "ctx" é o AuthContext já carregado por getAuthContext().
 */

import type { AuthContext } from "../auth-helpers";

export type PermissaoFlags = {
  podeVerContratos: boolean;
  podeBaixarContratos: boolean;
  podeEditarContratos: boolean;
  podeAprovarContratos: boolean;
  carteirasPermitidas: string[] | "*";
  twoFactorEnabled: boolean;
};

const DEFAULT_FLAGS: PermissaoFlags = {
  podeVerContratos: false,
  podeBaixarContratos: false,
  podeEditarContratos: false,
  podeAprovarContratos: false,
  carteirasPermitidas: [],
  twoFactorEnabled: false,
};

/** Flags efetivas — busca UsuarioPermissao do DB ou retorna defaults negativos. */
export async function getPermissoes(userId: string): Promise<PermissaoFlags> {
  const row = await prisma.usuarioPermissao.findUnique({
    where: { userId },
  });

  if (!row) return DEFAULT_FLAGS;

  let carteiras: string[] | "*";
  if (row.carteirasPermitidas === "*" || (Array.isArray(row.carteirasPermitidas) && row.carteirasPermitidas[0] === "*")) {
    carteiras = "*";
  } else if (Array.isArray(row.carteirasPermitidas)) {
    carteiras = row.carteirasPermitidas.filter((x): x is string => typeof x === "string");
  } else {
    carteiras = [];
  }

  return {
    podeVerContratos: row.podeVerContratos,
    podeBaixarContratos: row.podeBaixarContratos,
    podeEditarContratos: row.podeEditarContratos,
    podeAprovarContratos: row.podeAprovarContratos,
    carteirasPermitidas: carteiras,
    twoFactorEnabled: row.twoFactorEnabled,
  };
}

/**
 * Admin bypassa permissões granulares (vê e edita tudo), MAS continua sujeito a
 * 2FA — esse helper retorna true só pra flags de role, não pra 2FA.
 */
function isAuthAdmin(ctx: AuthContext): boolean {
  return ctx.role === "admin";
}

/** Pode listar/ver a página /juridico/contratos. */
export async function canViewContratosModule(ctx: AuthContext): Promise<boolean> {
  if (isAuthAdmin(ctx)) return true;
  const p = await getPermissoes(ctx.userId);
  return p.podeVerContratos;
}

/** Pode ver UM contrato específico (checa carteira). */
export async function canViewContrato(
  ctx: AuthContext,
  contratoId: string
): Promise<boolean> {
  if (isAuthAdmin(ctx)) return true;
  const p = await getPermissoes(ctx.userId);
  if (!p.podeVerContratos) return false;
  if (p.carteirasPermitidas === "*") return true;

  const contrato = await prisma.contratoArquivo.findUnique({
    where: { id: contratoId },
    select: { pessoaId: true },
  });
  if (!contrato?.pessoaId) return false; // contrato sem vínculo → só admin vê
  return p.carteirasPermitidas.includes(contrato.pessoaId);
}

/** Pode baixar/exportar PDF bruto (sem watermark). Geralmente só admin. */
export async function canDownloadContrato(ctx: AuthContext): Promise<boolean> {
  if (isAuthAdmin(ctx)) return true;
  const p = await getPermissoes(ctx.userId);
  return p.podeBaixarContratos;
}

/** Pode subir contratos novos. */
export async function canEditContratos(ctx: AuthContext): Promise<boolean> {
  if (isAuthAdmin(ctx)) return true;
  const p = await getPermissoes(ctx.userId);
  return p.podeEditarContratos;
}

/** Pode aprovar/rejeitar contratos pendentes. */
export async function canApproveContratos(ctx: AuthContext): Promise<boolean> {
  if (isAuthAdmin(ctx)) return true;
  const p = await getPermissoes(ctx.userId);
  return p.podeAprovarContratos;
}

/**
 * Gate de 2FA — retorna true se o usuário pode usar /juridico/* nesta sessão.
 * Requer:
 *  - UsuarioPermissao.twoFactorEnabled = true
 *  - Cookie de sessão `2fa-verified-at` válido (verificado em ../session-2fa.ts)
 *
 * Esta função apenas valida o DB. O cookie é checado pelo middleware.
 */
export async function isTwoFactorEnabled(userId: string): Promise<boolean> {
  const row = await prisma.usuarioPermissao.findUnique({
    where: { userId },
    select: { twoFactorEnabled: true },
  });
  return Boolean(row?.twoFactorEnabled);
}
