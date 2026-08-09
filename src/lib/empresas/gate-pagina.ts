import "server-only";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-helpers";
import { isAdmin } from "@/lib/rbac-papeis";
import { empresasVisiveis } from "@/lib/empresas/acesso-core";

/**
 * Gate de PÁGINA por empresa — a régua de verdade, não a aparência.
 *
 * O cadeado do hub (`hub-ecossistema/acesso.ts`) é estado VISUAL: quem digitar
 * `/empresas/corporate` na barra de endereço nunca passava por ele. Este é o
 * gate que fecha essa porta.
 *
 * ── ONDE ELE MORA, E POR QUÊ ─────────────────────────────────────────────
 * No `layout.tsx` de cada empresa: UM ponto de decisão por empresa, valendo em
 * bloco para todas as abas dela. A alternativa — gate por aba, em cada
 * `page.tsx` — foi descartada por ora: as abas hoje são placeholders sem dado
 * próprio, então granularidade fina não teria o que proteger, e seriam ~30
 * pontos de decisão em vez de 6. A direção também importa: refinar depois
 * (acesso por aba) é aditivo; recolher gates espalhados para um só, não.
 *
 * ── RESPONDE INEXISTENTE, NÃO "NEGADO" ───────────────────────────────────
 * `notFound()` e não uma tela de "acesso negado", copiando a regra de produto
 * já escrita em `rbac.ts` para fichas de cliente: fora de escopo responde 404,
 * para não vazar a existência do recurso. Quem não tem a Onix Corporate não
 * deve nem descobrir que ela existe por eliminação.
 *
 * ── O STATUS HTTP É 200, E ISSO É ESPERADO ───────────────────────────────
 * MEDIDO: rota bloqueada devolve HTTP 200 com a UI de 404 no corpo e
 * `<meta name="robots" content="noindex">`; rota inexistente de verdade
 * devolve 404. A diferença vem de `src/app/empresas/loading.tsx`: ele cria uma
 * fronteira de Suspense ACIMA destes layouts, então quando o `notFound()`
 * dispara os cabeçalhos já saíram e o status não pode mais mudar. Está na doc
 * do Next 16 (`file-conventions/loading` › Status Codes).
 *
 * Não é problema aqui: o CORPO é indistinguível de um 404 real, que é a
 * propriedade que importa — ninguém descobre que a empresa existe. O status
 * importaria para crawler ou analytics, e esta é uma aplicação autenticada.
 *
 * Se um dia precisar do 404 de verdade (compliance, métrica), a escolha é:
 * remover aquele `loading.tsx` (perdendo o prefetch e o skeleton que ele
 * trouxe) ou mover a checagem para o `proxy.ts`, como a própria doc sugere.
 * Trocar por 403 NÃO é opção: revelaria a existência da empresa.
 *
 * ── NÃO-DISRUPTIVO, IGUAL AO RESTO ───────────────────────────────────────
 *   - pessoa sem concessão nenhuma              -> passa (vê tudo)
 *   - admin                                     -> passa
 *   - empresa não cadastrada em `Empresa`       -> passa (nada a julgar)
 *   - erro ao resolver (banco fora, sem sessão) -> passa
 * `PessoaEmpresa` nasce vazia, então no dia do deploy ninguém perde acesso a
 * página nenhuma. A restrição começa quando alguém GANHA uma concessão.
 *
 * O erro passar em vez de barrar é decisão consciente: este gate protege
 * páginas que hoje são placeholders, e derrubar o acesso do time inteiro por
 * uma query que falhou seria pior que o risco que ele cobre. Quando alguma
 * dessas páginas ganhar dado sensível de verdade, esta linha é a primeira a
 * revisitar — está marcada com TODO.
 */
export async function podeVerEmpresa(empresaId: string): Promise<boolean> {
  try {
    const ctx = await getAuthContext().catch(() => null);
    if (!ctx?.pessoa || isAdmin(ctx)) return true;

    const [concessoes, empresas] = await Promise.all([
      prisma.pessoaEmpresa.findMany({
        where: { pessoaId: ctx.pessoa.id },
        select: { empresaId: true, incluiDescendentes: true },
      }),
      prisma.empresa.findMany({ select: { id: true, parentId: true } }),
    ]);

    // Empresa que não existe como cadastro não é julgada — ausência de registro
    // não é negação. Mesma regra do hub.
    if (!empresas.some((e) => e.id === empresaId)) return true;

    const visiveis = empresasVisiveis(concessoes, empresas);
    if (visiveis === null) return true; // sem filtro

    return visiveis.has(empresaId);
  } catch (erro) {
    // TODO(seguranca): quando alguma página de empresa passar a mostrar dado
    // real de cliente, trocar por falha FECHADA — barrar em caso de erro.
    console.warn(
      `[empresas] falha ao resolver acesso a "${empresaId}" — liberando: ` +
        `${erro instanceof Error ? erro.message : String(erro)}`,
    );
    return true;
  }
}
