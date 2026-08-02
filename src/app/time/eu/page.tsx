import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth-helpers";

/**
 * Atalho para a PRÓPRIA ficha.
 *
 * Existe por dois motivos práticos:
 *
 *  1. O caminho até a própria ficha tinha três passos — /time, achar o próprio
 *     nome entre 19 cards, clicar. O primeiro passo é o que trava: procurar-se
 *     numa grade já é atrito suficiente para deixar para depois, e o pedido
 *     "cada um preenche o seu telefone" morre aí.
 *  2. É uma URL ESTÁVEL, igual para todo mundo. Dá para colar no WhatsApp do
 *     time uma frase só, sem montar um link por pessoa.
 *
 * Rota estática ganha da dinâmica no Next, então `/time/eu` nunca é confundida
 * com `/time/<id>`.
 */
export default async function MinhaFichaPage() {
  const ctx = await getAuthContext();
  // Sem Pessoa vinculada (usuário "support" técnico) não há ficha própria —
  // volta para a listagem em vez de dar 404 sem explicação.
  if (!ctx.pessoa) redirect("/time");
  redirect(`/time/${ctx.pessoa.id}`);
}
