import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-helpers";
import { getSession } from "@/lib/session";
import { assertClienteVisivel, rbacEnforcementHabilitado } from "@/lib/rbac";
import { registroRicoHabilitado } from "./flag";

export type Guarda = { erro: NextResponse } | { erro?: undefined; userId: string };

/**
 * Guarda comum das rotas do registro rico: FLAG primeiro, sessão, RBAC depois.
 *
 * A ordem importa. Com a flag OFF a rota responde 404 sem ler sessão nem banco
 * — feature desligada não pode ser sondável nem por quem tem login. Só depois
 * vem o escopo do RBAC, que responde "este cliente é seu?".
 *
 * 404 nos dois casos (e não 403): o 403 confirmaria que o cliente existe, que
 * é exatamente o que o escopo esconde. Mesmo padrão da rota de interações.
 *
 * `getSession()` e não `getAuthContext()` no gate de autenticação: o segundo
 * chama `redirect("/login")`, que numa rota de API vira uma resposta de
 * redirect no lugar do 401 que o fetch do componente espera.
 */
export async function guardaRegistroRico(clienteId: string): Promise<Guarda> {
  const base = await guardaFlag();
  if (base.erro) return base;

  if (await rbacEnforcementHabilitado()) {
    const ctx = await getAuthContext();
    const { visivel } = await assertClienteVisivel(clienteId, ctx);
    if (!visivel) {
      return { erro: NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 }) };
    }
  }

  return base;
}

/** Só flag + sessão — para as rotas que não são por cliente (grupos, sugestões). */
export async function guardaFlag(): Promise<Guarda> {
  if (!(await registroRicoHabilitado())) {
    return { erro: NextResponse.json({ error: "Não encontrado" }, { status: 404 }) };
  }
  const sessao = await getSession();
  if (!sessao?.userId) {
    return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }
  return { userId: sessao.userId };
}
