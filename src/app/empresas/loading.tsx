import { Skeleton } from "@/components/ui/skeleton";

/**
 * Estado de carregamento de TODA rota sob `/empresas/*` que não tenha um
 * `loading.tsx` mais específico (o de `investimentos/painel-do-dia` continua
 * valendo para aquele segmento).
 *
 * Existe por dois motivos, e o segundo é o que pesa:
 *
 * 1. As páginas de empresa são `force-dynamic` com queries pesadas. Sem
 *    fronteira de Suspense, o clique fica sem NENHUM retorno visual até o
 *    servidor responder — a tela velha simplesmente trava.
 * 2. O Next PULA o prefetch de rota dinâmica quando não existe `loading.tsx`;
 *    com ele, a rota passa a ser prefetchada parcialmente ao entrar no
 *    viewport. Isso importa em cheio no hub do Ecossistema, onde os 8 links
 *    ficam visíveis de uma vez: sem isto, nenhum deles é aquecido e a primeira
 *    navegação a partir da tela inicial é sempre a mais lenta do sistema.
 *
 * O desenho imita o esqueleto comum das telas de empresa (PageHeader + corpo),
 * para o salto do skeleton para o conteúdo real ser pequeno.
 */
export default function CarregandoEmpresa() {
  return (
    <div>
      <div className="border-b border-border px-8 py-6">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="mt-2 h-4 w-96" />
      </div>
      <div className="space-y-8 p-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
