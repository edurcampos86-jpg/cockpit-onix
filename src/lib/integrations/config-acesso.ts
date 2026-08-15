/**
 * Controle de acesso do endpoint de configuração de integrações.
 *
 * Por que este módulo existe separado da rota: a decisão de "quem pode gravar"
 * e "o que cada um enxerga" é a parte que precisa de teste, e o handler HTTP
 * do Next não é testável sem subir servidor e banco. Aqui a decisão é função
 * pura — recebe o contexto de auth, devolve o veredito — e a rota vira uma
 * casca fina que só traduz o veredito em resposta.
 *
 * Módulo puro: sem Prisma, sem rede, sem "server-only". O perfil entra como
 * parâmetro; quem obtém a sessão é a rota.
 */

import { isAdmin, type PerfilAcesso } from "@/lib/rbac-papeis";

/**
 * Chaves que o endpoint aceita gravar.
 *
 * Defesa em profundidade, não a correção principal: mesmo depois do gate de
 * admin, o handler aceitava QUALQUER string como nome de chave e a persistia
 * (no Config DB ou no .integrations.json). Uma chave com nome arbitrário não
 * é lida por ninguém, mas suja o store e — no caso do arquivo — cresce sem
 * limite. A lista espelha os campos que a tela de Integrações realmente
 * oferece; chave nova na UI precisa entrar aqui junto.
 *
 * GOOGLE_CLIENT_SECRET e MICROSOFT_CLIENT_SECRET NÃO entram: são configurados
 * só por env no Railway e não têm campo na tela. Deixá-los graváveis abriria
 * caminho para sobrescrever segredo de OAuth por uma superfície que não foi
 * desenhada para isso.
 */
/**
 * Chaves cujo store canônico é o **Config DB**, não o `.integrations.json`.
 *
 * O arquivo é EFÊMERO no Railway (vive no filesystem do container e some no
 * redeploy). Chave gravada só nele volta a "não configurada" no próximo deploy,
 * em silêncio — e pior: quem a lê por `getConfig()` nunca a encontra, nem antes
 * do redeploy, porque `getConfig` consulta o banco e não o arquivo.
 *
 * Toda chave nova consumida via `getConfig()` PRECISA entrar aqui — e, por
 * consequência, em `CHAVES_GRAVAVEIS` também (invariante testada logo abaixo,
 * em `config-acesso.test.ts`): chave que o banco guarda mas o endpoint recusa
 * gravar é config morta.
 */
export const CHAVES_CONFIG_DB = new Set([
  "ANTHROPIC_API_KEY",
  // Sincronia de status dos PRs da Central de Implementações (leitura apenas).
  "GITHUB_TOKEN",
  "GITHUB_REPO",
  /*
   * Segredo do webhook do Zapier/Plaud. Entrou aqui porque é o único segredo
   * gravável pela tela que também é credencial de uma rota PÚBLICA
   * (`/api/integracoes/zapier/webhook`, na allowlist do proxy).
   *
   * No arquivo efêmero a sequência era: salva pela tela → a tela mostra
   * "configurada" → o deploy seguinte apaga o container → a chave some sem
   * aviso, e a tela segue dizendo o contrário até alguém abrir de novo.
   *
   * Não é hipótese: a nota em `src/lib/proxy-rotas.ts` já registrava esse
   * desaparecimento como o caminho pelo qual a rota do Zapier reabria sozinha.
   */
  "ZAPIER_WEBHOOK_SECRET",
]);

export const CHAVES_GRAVAVEIS = new Set([
  "MANYCHAT_API_TOKEN",
  "ANTHROPIC_API_KEY",
  "ZAPIER_WEBHOOK_SECRET",
  "BTG_CLIENT_ID",
  "BTG_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "MICROSOFT_CLIENT_ID",
  "META_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "GITHUB_TOKEN",
  "GITHUB_REPO",
]);

export type VereditoEscrita =
  | { permitido: true }
  | { permitido: false; status: 400 | 403; erro: string };

/**
 * Pode gravar? Só admin — `User.role === "admin"` OU `Pessoa.teamRole === "admin"`,
 * exatamente a mesma régua de `isAdmin()` usada na Central de Implementações e
 * no resto do RBAC. O middleware (`src/proxy.ts`) garante apenas que existe
 * SESSÃO; ele nunca olhou role, então sem esta checagem qualquer usuário
 * logado — inclusive `role: "support"` — sobrescrevia as chaves do sistema.
 */
export function decidirEscritaConfig(
  ctx: PerfilAcesso | null,
  key: unknown,
): VereditoEscrita {
  if (!ctx) {
    return { permitido: false, status: 403, erro: "Não autenticado." };
  }
  if (!isAdmin(ctx)) {
    return {
      permitido: false,
      status: 403,
      erro: "Só administradores podem alterar chaves de integração.",
    };
  }
  if (typeof key !== "string" || !CHAVES_GRAVAVEIS.has(key)) {
    return {
      permitido: false,
      status: 400,
      erro: "Chave de integração desconhecida.",
    };
  }
  return { permitido: true };
}

/** O que a UI recebe sobre uma chave. `mascara` só existe para admin. */
export type ChaveVisivel = {
  configurada: boolean;
  /** Últimos 4 caracteres reais, prefixados. Ausente para não-admin. */
  mascara?: string;
};

/**
 * Projeta a config para o que cada perfil pode ver.
 *
 * NÃO-ADMIN: só o booleano `configurada`. Antes, o GET devolvia
 * `"••••••" + valor.slice(-4)` para qualquer sessão — os 4 últimos caracteres
 * REAIS de cada token. Sufixo de segredo é material de correlação: ele
 * confirma para um atacante qual token está instalado (útil para engenharia
 * social) e reduz o espaço de busca de quem já tenha um vazamento parcial.
 *
 * ADMIN: mantém a máscara com os 4 últimos. DECISÃO DOCUMENTADA — o sufixo
 * tem uso operacional real e insubstituível aqui: é a única forma de o admin
 * confirmar QUAL chave está instalada ao rotacionar credencial (o valor cheio
 * não é exposto em lugar nenhum da UI). Sem ele, "Chave configurada" não
 * distingue a chave nova da antiga, e uma rotação malfeita passa despercebida.
 * O admin já pode sobrescrever qualquer uma dessas chaves — expor 4 caracteres
 * a quem controla o valor inteiro não amplia superfície nenhuma.
 */
export function projetarConfig(
  config: Record<string, string>,
  opts: { admin: boolean },
): Record<string, ChaveVisivel> {
  const out: Record<string, ChaveVisivel> = {};
  for (const [key, valor] of Object.entries(config)) {
    const configurada = Boolean(valor);
    out[key] = opts.admin
      ? {
          configurada,
          // Só monta máscara quando há valor: "••••••" sozinho passaria a
          // impressão de chave configurada onde não há nenhuma.
          ...(configurada ? { mascara: "••••••" + valor.slice(-4) } : {}),
        }
      : { configurada };
  }
  return out;
}
