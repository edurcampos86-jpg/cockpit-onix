import "server-only";
import { prisma } from "@/lib/prisma";
import { resolverDestinatarios, type ResolucaoDestinatarios } from "./destinatarios-core";

/**
 * Busca, no banco, quem atende cada CGE — e devolve a quem o alerta vai.
 *
 * A decisão de quem recebe é `resolverDestinatarios` (puro, testado). Aqui só
 * há I/O, e ele é feito UMA vez para todos os CGEs do lote: o cron avalia a
 * carteira inteira, e uma query por cliente daria centenas de idas ao banco
 * para responder uma pergunta que muda pouco.
 *
 * Cache por CGE no Map de retorno — dois clientes do mesmo assessor resolvem
 * para o mesmo conjunto sem consultar de novo.
 */
export async function destinatariosPorCge(
  cges: readonly string[],
): Promise<Map<string, ResolucaoDestinatarios>> {
  const unicos = [...new Set(cges.filter((c): c is string => !!c && c.trim().length > 0))];
  const mapa = new Map<string, ResolucaoDestinatarios>();
  if (unicos.length === 0) return mapa;

  const linhas = await prisma.carteiraCge.findMany({
    where: { cge: { in: unicos } },
    select: {
      cge: true,
      carteira: {
        select: {
          acessos: {
            select: {
              tipo: true,
              pessoa: { select: { id: true, nomeCompleto: true, apelido: true, telefone: true } },
            },
          },
        },
      },
    },
  });

  for (const l of linhas) {
    mapa.set(
      l.cge,
      resolverDestinatarios(
        l.carteira.acessos.map((a) => ({
          pessoaId: a.pessoa.id,
          nome: a.pessoa.apelido?.trim() || a.pessoa.nomeCompleto,
          telefone: a.pessoa.telefone,
          tipo: a.tipo,
        })),
      ),
    );
  }

  // CGE sem carteira cadastrada não some do mapa: entra como órfão explícito,
  // para o chamador conseguir dizer "este cliente não tem para quem alertar" em
  // vez de simplesmente não alertar.
  for (const cge of unicos) {
    if (!mapa.has(cge)) {
      mapa.set(cge, { destinatarios: [], semTelefone: [], orfao: true });
    }
  }

  return mapa;
}
