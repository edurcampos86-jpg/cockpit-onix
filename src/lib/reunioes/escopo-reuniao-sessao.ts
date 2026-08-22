import { prisma } from "@/lib/prisma";
import { rbacEnforcementHabilitado, resolverCgesVisiveis } from "@/lib/rbac";
import type { AuthContext } from "@/lib/auth-helpers";
import type { EscopoReunioes } from "./escopo-reuniao";

/**
 * Casca de IO do escopo de reuniões: resolve, a partir da sessão, se a pessoa
 * lê tudo ou só as reuniões dela. A régua está em `escopo-reuniao.ts` (puro,
 * testado); aqui só se busca o que ela precisa.
 *
 * QUEM É RESTRITO é decidido pela MESMA função que a ficha do cliente usa —
 * `resolverCgesVisiveis`, cujo `null` significa "sem filtro". Reusar em vez de
 * reimplementar é o ponto: duas definições de "quem é restrito" divergem, e a
 * que divergir primeiro é sempre a que ninguém olha.
 *
 * O que muda é só o EIXO do filtro depois dessa decisão: a ficha filtra por
 * `assessorCge` (que `ClienteBackoffice` tem); a reunião filtra por `vendedor`
 * (que é a única titularidade que `Meeting` carrega). Ver o cabeçalho de
 * `escopo-reuniao.ts`.
 */
export async function escopoDeReunioes(ctx: AuthContext): Promise<EscopoReunioes> {
  // Enforcement OFF: nada muda para ninguém. Mesma postura não-disruptiva do
  // resto do RBAC — ligar o gate é uma decisão, não um efeito colateral.
  if (!(await rbacEnforcementHabilitado())) return { tipo: "tudo" };

  const cges = await resolverCgesVisiveis(ctx);
  if (cges === null) return { tipo: "tudo" };

  // Restrito. Os nomes pelos quais o `Meeting.vendedor` pode se referir a esta
  // pessoa: o do cadastro de Pessoa e o apelido, mais o nome da sessão.
  const pessoa = ctx.pessoa
    ? await prisma.pessoa.findUnique({
        where: { id: ctx.pessoa.id },
        select: { nomeCompleto: true, apelido: true },
      })
    : null;

  const nomesDaPessoa = [pessoa?.nomeCompleto, pessoa?.apelido, ctx.name].filter(
    (n): n is string => typeof n === "string" && n.trim().length > 0,
  );

  return { tipo: "so-minhas", nomesDaPessoa };
}
