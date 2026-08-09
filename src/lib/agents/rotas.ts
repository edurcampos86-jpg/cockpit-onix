/* ──────────────────────────────────────────────────────────────
 * Qual agente atende cada rota — UMA definição, módulo PURO.
 *
 * Client-safe de propósito (sem prisma, sem `server-only`): o botão flutuante
 * é `'use client'` e precisa decidir isso no browser, enquanto o `registry.ts`
 * precisa da mesma resposta no servidor. O registry NÃO pode ser importado do
 * cliente — ele puxa `agents/kpis.ts` → `snapshot.ts`, que abre com
 * `server-only` e Prisma.
 *
 * Antes desta separação a regra estava escrita DUAS vezes, palavra por
 * palavra: em `registry.ts` e dentro de `floating-chat.tsx`. Enquanto as duas
 * concordavam ninguém via problema; a divergência silenciosa é o modo de falha
 * — o botão monta para um agente que a rota do servidor não serve, e o usuário
 * vê um chat que responde 404.
 * ────────────────────────────────────────────────────────────── */

/**
 * O agente daquela rota, ou `null` quando a rota não tem agente.
 *
 * ── POR QUE `null` E NÃO UM PADRÃO ───────────────────────────────────────
 * Esta função já teve `return "cockpit"` no fim, e por isso o Copiloto Onix
 * atendia TODAS as rotas que não fossem Corretora ou KPIs — o botão aparecia
 * no app inteiro. Com o Copiloto removido, um fallback teria de apontar para
 * algum dos outros dois, e nenhum deles sabe falar do resto do sistema:
 * o de KPIs carrega snapshot semanal de indicadores, o da Corretora conhece
 * o pipeline dela. Oferecer qualquer um dos dois numa página de cliente seria
 * um assistente que responde com confiança sobre o assunto errado.
 *
 * `null` é a resposta honesta: aqui não há agente, e o botão não monta.
 * Acrescentar cobertura de volta é somar uma linha; tirar um assistente que já
 * está respondendo errado é bem mais caro.
 */
export function agentePorRota(pathname: string): string | null {
  if (pathname.startsWith("/onix-corretora")) return "corretora";
  if (pathname.startsWith("/kpis") || pathname.startsWith("/analytics")) return "kpis";
  return null;
}
