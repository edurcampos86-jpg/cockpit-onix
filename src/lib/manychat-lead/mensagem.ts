/**
 * Payload do ManyChat → texto do aviso — módulo PURO (sem server-only, sem
 * prisma, sem fetch), para ser testável sem subir o Next.
 *
 * O que ele resolve, e por que não mora na rota: o corpo que chega vem de um
 * "External Request" montado à mão no painel do ManyChat, onde cada campo é uma
 * variável que PODE não estar preenchida naquele fluxo. Na prática o corpo
 * chega com string vazia, com o campo ausente, com `@` já no username ou com a
 * DM inteira de 900 caracteres. Nenhuma dessas variações é erro do ManyChat —
 * é o normal de um formulário de painel —, então o parsing é tolerante e a
 * validação recusa só o caso em que não há nada a avisar.
 */

/** Corpo esperado do External Request. Todos os campos são best-effort. */
export type LeadManyChat = {
  nome: string;
  username_instagram: string;
  palavra_gatilho: string;
  texto_mensagem: string;
  origem: string;
};

/**
 * Teto do trecho da DM no aviso.
 *
 * O aviso é para o Eduardo LER no celular e decidir se responde agora — não é
 * arquivo da conversa (esta PR não grava nada; a DM inteira continua no
 * ManyChat). DM longa colada por inteiro empurra o nome e a palavra-gatilho
 * para fora da prévia da notificação, que é justamente a parte que decide.
 */
export const LIMITE_TEXTO = 300;

/** O que aparece no lugar de um campo que o ManyChat não preencheu. */
const AUSENTE = "—";

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

/**
 * Extrai os cinco campos do corpo cru, sem nunca lançar.
 *
 * Corpo que não é objeto JSON (array, número, `null`) devolve os cinco campos
 * vazios — quem chama decide o que fazer com isso via `temConteudo`.
 */
export function parseLeadManyChat(bruto: unknown): LeadManyChat {
  const o = (bruto && typeof bruto === "object" && !Array.isArray(bruto)
    ? bruto
    : {}) as Record<string, unknown>;

  return {
    nome: texto(o.nome),
    username_instagram: texto(o.username_instagram),
    palavra_gatilho: texto(o.palavra_gatilho),
    texto_mensagem: texto(o.texto_mensagem),
    origem: texto(o.origem),
  };
}

/**
 * Sobrou alguma coisa que valha um aviso?
 *
 * `origem` NÃO conta: ela é preenchida com um literal fixo no painel do
 * ManyChat ("instagram"), então um fluxo mal configurado manda um corpo em que
 * ela é o único campo cheio. Aceitar isso viraria um WhatsApp dizendo
 * "🔔 Lead Instagram: — (@—) acionou —: —", que é ruído puro.
 */
export function temConteudo(lead: LeadManyChat): boolean {
  return !!(
    lead.nome ||
    lead.username_instagram ||
    lead.palavra_gatilho ||
    lead.texto_mensagem
  );
}

/** "@edu" e "edu" viram "edu" — senão o aviso sai com "@@edu". */
export function normalizarUsername(valor: string): string {
  return valor.replace(/^@+/, "").trim();
}

function truncar(valor: string, limite: number): string {
  const uma = valor.replace(/\s+/g, " ").trim();
  return uma.length <= limite ? uma : `${uma.slice(0, limite - 1)}…`;
}

/**
 * Monta o aviso que vai para o WhatsApp.
 *
 * Formato fixo, uma linha:
 *   🔔 Lead Instagram: {nome} (@{username}) acionou {palavra}: {texto}
 *
 * `origem` entra numa SEGUNDA linha e só quando vem preenchida. Ela é o único
 * campo que diz de qual fluxo o lead veio — com duas campanhas rodando, é o que
 * separa "anúncio novo" de "bio do perfil". Fora da primeira linha porque a
 * prévia da notificação do celular corta ali, e o nome vale mais que a origem.
 */
export function montarAvisoLead(lead: LeadManyChat): string {
  const nome = lead.nome || AUSENTE;
  const user = normalizarUsername(lead.username_instagram) || AUSENTE;
  const gatilho = lead.palavra_gatilho || AUSENTE;
  const msg = lead.texto_mensagem ? truncar(lead.texto_mensagem, LIMITE_TEXTO) : AUSENTE;

  const primeira = `🔔 Lead Instagram: ${nome} (@${user}) acionou ${gatilho}: ${msg}`;
  return lead.origem ? `${primeira}\norigem: ${lead.origem}` : primeira;
}
