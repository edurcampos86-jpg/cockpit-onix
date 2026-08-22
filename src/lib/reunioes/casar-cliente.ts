/**
 * Casa os participantes de uma reunião do Plaud com um cliente da base — módulo
 * PURO (sem Prisma, sem rede). Quem busca os candidatos é quem chama.
 *
 * ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────
 * A transcrição que entra pelo webhook do Zapier vira `Meeting`, e `Meeting` só
 * sabe ligar em `Lead` (`zapier/webhook/route.ts:51`). A ficha do cliente lê
 * outra coisa: `ReuniaoEstruturada`, alimentada só pelo import manual do
 * Cockpit de Reunião. Resultado prático: pauta, pendências e próximos passos da
 * reunião NÃO chegam no cliente a menos que alguém cole o texto à mão.
 *
 * Este módulo é a primeira metade da ponte: dado quem estava na sala, dizer de
 * qual cliente é aquela reunião. A segunda metade é a tela, que leva a
 * transcrição para o import existente — com preview e revisão humana, como já
 * era. Nada aqui grava nada.
 *
 * ── POR QUE CONSERVADOR ─────────────────────────────────────────────────
 * O `Lead` casa com `name: { contains: name }` — substring. Num cadastro de
 * clientes isso é perigoso: "Ana" casa com "Ana Paula", "Mariana" e "Adriana".
 * Errar aqui não é errar uma linha de lista: é oferecer levar a transcrição de
 * uma família para a ficha de outra. Então:
 *
 *   - comparação por igualdade do nome NORMALIZADO, nunca por substring;
 *   - dois clientes casando = NENHUM (ambíguo não é palpite);
 *   - quem é do time nunca casa (a sala tem o assessor também).
 */

/** Minúsculas, sem acento, sem pontuação, espaços colapsados. */
export function normalizarNome(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nomes do time. Mesma lista de `VENDEDOR_KEYWORDS` em
 * `src/lib/integrations/zapier.ts` — quem aparece como vendedor não pode
 * aparecer como cliente. Sem isto, uma reunião com "Eduardo" casaria com
 * qualquer cliente chamado Eduardo, que é o nome mais comum da base.
 */
const PRIMEIROS_NOMES_DO_TIME = new Set(["eduardo", "rose", "thiago"]);

export type ClienteCandidato = {
  id: string;
  nome: string;
  nomeCompleto?: string | null;
  apelido?: string | null;
};

export type Casamento =
  | { tipo: "casou"; clienteId: string; nome: string; participante: string }
  | { tipo: "nenhum" }
  | { tipo: "ambiguo"; participante: string; clienteIds: string[] };

/** Todos os rótulos pelos quais um cliente pode ser chamado numa reunião. */
function rotulosDe(c: ClienteCandidato): string[] {
  return [c.nome, c.nomeCompleto ?? "", c.apelido ?? ""]
    .map(normalizarNome)
    .filter(Boolean);
}

/**
 * Devolve o cliente da reunião, se der para afirmar qual é.
 *
 * `ambiguo` é diferente de `nenhum` de propósito: a tela mostra "2 clientes com
 * este nome — escolha" em vez de silêncio. Silêncio faria o Eduardo achar que a
 * base não tem o cliente e cadastrar de novo.
 */
export function casarClientePorParticipantes(
  participantes: string[] | null | undefined,
  candidatos: ClienteCandidato[],
): Casamento {
  if (!Array.isArray(participantes)) return { tipo: "nenhum" };

  for (const bruto of participantes) {
    if (typeof bruto !== "string") continue;
    const participante = normalizarNome(bruto);
    if (!participante) continue;

    // Nome solto do time: pula. Nome composto ("eduardo campos silva") só é
    // pulado se o primeiro nome for do time E não houver sobrenome — assim um
    // cliente "Eduardo Nogueira" continua casando normalmente.
    const partes = participante.split(" ");
    if (partes.length === 1 && PRIMEIROS_NOMES_DO_TIME.has(partes[0])) continue;

    const casam = candidatos.filter((c) => rotulosDe(c).includes(participante));
    if (casam.length === 1) {
      return {
        tipo: "casou",
        clienteId: casam[0].id,
        nome: casam[0].nome,
        participante: bruto,
      };
    }
    if (casam.length > 1) {
      return {
        tipo: "ambiguo",
        participante: bruto,
        clienteIds: casam.map((c) => c.id),
      };
    }
  }

  return { tipo: "nenhum" };
}
