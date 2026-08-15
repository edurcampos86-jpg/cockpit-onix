import "server-only";

/**
 * Probe de disponibilidade da API Datacrazy — só responde "as credenciais
 * valem e a API atende?".
 *
 * ── POR QUE FICA AQUI, E NÃO EM `src/lib/datacrazy.ts` ───────────────────
 * O lugar natural seria junto de `fetchConversas`, que já tem a base URL.
 * Só que o gate de lint do CI roda sobre os ARQUIVOS ALTERADOS, e
 * `src/lib/datacrazy.ts` carrega 10 erros `no-explicit-any` pré-existentes —
 * a dívida que a PR #166 (aberta desde 13/06) existe para pagar. Encostar
 * naquele arquivo para acrescentar 30 linhas cobra o preço inteiro dessa
 * dívida e atropela a PR de outra pessoa.
 *
 * O custo desta escolha é a constante de URL duplicada abaixo. É consciente
 * e tem data para acabar: quando a #166 entrar, esta função volta para
 * `datacrazy.ts` e a constante volta a ser uma só. Enquanto isso, o comentário
 * é o que impede a duplicata de virar divergência silenciosa.
 *
 * ── READ-ONLY POR CONSTRUÇÃO ─────────────────────────────────────────────
 * `GET /conversations` com `take=1`. Não escreve nada, não mexe em
 * `ultimoContatoAt` — quem faz isso é o poll de 30 em 30 minutos. `take=1` é
 * de propósito: a pergunta é disponibilidade, não dados, e probe caro vira
 * motivo pra desligar o probe.
 */

/** Mesma base de `src/lib/datacrazy.ts` — ver o comentário acima. */
const DATACRAZY_BASE_URL = "https://api.g1.datacrazy.io/api/v1";

export async function testDatacrazyConnection(
  token: string,
  instanceId: string,
): Promise<{ success: boolean; message: string }> {
  const url = `${DATACRAZY_BASE_URL}/conversations?instanceId=${instanceId}&take=1&skip=0`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      return {
        success: false,
        message: `Datacrazy respondeu HTTP ${res.status} em /conversations`,
      };
    }
    return { success: true, message: "Datacrazy API respondendo em /conversations" };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : "Erro desconhecido" };
  }
}
