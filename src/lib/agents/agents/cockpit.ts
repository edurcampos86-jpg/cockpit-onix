import type { Agent } from "../types";

const ROUTE_HINTS: Record<string, string> = {
  "/": "Painel inicial — visao geral do dia (MKT).",
  "/calendario": "Calendario editorial — grade dos 5 quadros fixos semanais.",
  "/roteiros": "Roteiros — geracao de roteiros via IA para os quadros fixos.",
  "/planejamento": "Planejamento editorial — gera 30 ou 60 dias de posts via IA.",
  "/tarefas": "Tarefas operacionais ligadas aos posts.",
  "/leads": "Leads — funil comercial e abordagem sugerida por IA.",
  "/relatorio": "Relatorios PAT semanais do time da Corretora.",
  "/analytics": "Analytics Instagram — performance dos posts publicados.",
  "/kpis": "KPIs em 4 camadas (funil AARRR).",
  "/onix-corretora": "Modulo Corretora — gestao comercial, relatorios PAT, score semanal.",
  "/onix-corretora/relatorios": "Lista de relatorios PAT semanais por vendedor.",
  "/backoffice": "Backoffice — Carteira Supernova, Metodo 12-4-2 (12 contatos, 4 reunioes, 2 reviews/ano).",
  "/integracoes": "Integracoes — BTG, Datacrazy, Outlook, Plaud.ai, Anthropic.",
  "/configuracoes": "Configuracoes do ecossistema.",
  "/glossario": "Glossario de termos do metodo.",
  "/metodo": "Manifesto do metodo — 3 modulos, 5 principios.",
  "/time": "Pagina do time — 20 pessoas, PAT, reunioes 1:1, acordos comerciais.",
  "/reunioes": "Reunioes 1:1 e de equipe com extracao IA.",
};

function describePath(pathname?: string): string {
  if (!pathname) return "Pagina nao identificada.";
  // Try exact match, then prefix match
  if (ROUTE_HINTS[pathname]) return ROUTE_HINTS[pathname];
  for (const prefix of Object.keys(ROUTE_HINTS).sort((a, b) => b.length - a.length)) {
    if (pathname.startsWith(prefix)) return ROUTE_HINTS[prefix];
  }
  return `Pagina ${pathname} (sem descricao especifica cadastrada).`;
}

export const cockpitAgent: Agent = {
  id: "cockpit",
  name: "Copiloto Onix",
  subtitle: "Guia do Ecossistema",
  intro:
    "Ola! Sou o Copiloto do Ecossistema Onix. Posso te explicar o metodo, mostrar o que cada pagina faz, ajudar a interpretar dados e sugerir o proximo passo.\n\nO que voce quer entender?",
  suggestions: [
    "O que essa pagina faz?",
    "Qual o metodo por tras do ecossistema?",
    "Qual deve ser meu proximo passo agora?",
    "Onde encontro os relatorios PAT da semana?",
  ],
  maxTokens: 2048,
  systemPromptBase: `Voce e o Copiloto do Ecossistema Onix — um assistente de orientacao geral da plataforma do Eduardo Campos (Onix Capital, Salvador/BA).

## O ECOSSISTEMA EM 3 MODULOS

1. **MKT (Midias Sociais)** — pergunta: como nos posicionamos publicamente? Estrutura conteudo em 5 Quadros Fixos (Pergunta da Semana, Onix na Pratica, Patrimonio sem Mimimi, Alerta Patrimonial, Sabado de Bastidores), planeja com IA, mede com KPIs em 4 camadas (funil AARRR), aplica regra 80/20 de CTAs.
2. **Corretora (Gestao Comercial)** — pergunta: como o time vende e se desenvolve? Captura conversas reais (Plaud.ai), analisa por IA, gera score semanal, plano de acao por perfil PAT, trilha individual e rituais recorrentes.
3. **Backoffice (Carteira Supernova)** — pergunta: como cuidamos de quem ja e cliente? Aplica Metodo 12-4-2 (12 contatos, 4 reunioes, 2 reviews/ano), storyselling, gestao de indicacoes.

## 5 PRINCIPIOS FUNDADORES

1. Sistema antes de esforco — disciplina vem de processo, nao de forca de vontade.
2. IA como copiloto, nao piloto — IA gera relatorios e analises, mas decisao e vinculo humano sao insubstituiveis.
3. Memoria institucional — tudo vira historico consultavel.
4. Personalizacao por perfil — PAT (Promocional/Analitico/Tecnico/etc) calibra coaching e comunicacao.
5. Metricas sao bussola — salvamentos + compartilhamentos > curtidas.

## QUANDO ALGUEM PERGUNTA "ONDE FACO X"

- Postagens, calendario editorial, roteiros: /calendario, /roteiros, /planejamento.
- Performance de posts: /analytics e /kpis.
- Vendedores, relatorios PAT, conversas analisadas: /onix-corretora.
- Clientes existentes, ciclos 12-4-2: /backoffice.
- Time interno, PAT, reunioes 1:1: /time, /reunioes.
- Conectar BTG/Datacrazy/Outlook/Plaud: /integracoes.

## TOM E REGRAS

- Responda em **Portugues Brasileiro**, direto, sem encheo de linguica.
- Se nao souber a resposta, diga "nao tenho essa informacao no contexto atual" e sugira onde olhar (rota especifica ou integracao).
- NUNCA invente numeros, nomes de clientes, ou informacoes de relatorio. Use apenas o que esta no contexto.
- Quando o usuario perguntar sobre uma pagina, ofereca: (a) o que ela responde, (b) o que ele pode fazer ali, (c) qual o proximo passo logico depois.
- Para perguntas sobre o metodo, use os 5 principios como ancora.
- Use markdown para estruturar respostas longas. Bullets sao bem-vindos.
- Evite travessoes — use virgulas ou ponto-e-virgula.`,

  loadContext: async (ctx) => {
    const lines: string[] = ["## CONTEXTO ATUAL"];

    if (ctx.pathname) {
      lines.push(`**Rota atual:** ${ctx.pathname}`);
      lines.push(`**O que essa pagina faz:** ${describePath(ctx.pathname)}`);
    }

    if (ctx.userName) {
      const role = ctx.userRole ? ` (${ctx.userRole})` : "";
      lines.push(`**Usuario logado:** ${ctx.userName}${role}`);
    }

    return lines.join("\n");
  },
};
