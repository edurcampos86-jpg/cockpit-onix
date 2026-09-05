import { isAdminMaster } from "@/lib/rbac-papeis";

/** Recorte mínimo do contexto necessário para decidir esta permissão. */
export type ContextoAcessoQuestionarioPat = {
  role: string;
  pessoa: { id: string; teamRole: string } | null;
};

/** Recorte mínimo da pessoa-alvo. */
export type AlvoQuestionarioPat = {
  lideradoPorId: string | null;
};

/**
 * Questionário de incentivo é dado sensível de gestão.
 *
 * A régua é intencionalmente mais estreita que `isAdmin`: somente o master ou
 * o responsável DIRETO cadastrado na hierarquia. Admin comum, liderança do
 * mesmo departamento e a própria pessoa não ganham acesso por aproximação.
 */
export function podeAcessarQuestionarioPat(
  ctx: ContextoAcessoQuestionarioPat,
  alvo: AlvoQuestionarioPat,
): boolean {
  if (isAdminMaster(ctx)) return true;
  return Boolean(ctx.pessoa?.id && alvo.lideradoPorId === ctx.pessoa.id);
}

