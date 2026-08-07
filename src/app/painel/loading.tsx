import { Skeleton } from "@/components/ui/skeleton";

/**
 * Estado de carregamento do Painel de Comando.
 *
 * Mesma razão do `loading.tsx` de `/empresas`: a página é `force-dynamic` e
 * dispara cinco queries de uma vez mais a varredura de risco de evasão. Sem
 * fronteira de Suspense o Next não prefetcha a rota, e o "Painel" da sidebar —
 * junto com o link que sai do hub — vira o clique mais lento e mais mudo do
 * Cockpit.
 *
 * A raiz `/` renderiza o MESMO componente, mas com a flag do hub desligada; o
 * `loading.tsx` da raiz seria outro arquivo e não vale a duplicação enquanto o
 * hub não estiver ligado de verdade.
 */
export default function CarregandoPainel() {
  return (
    <div className="min-h-screen">
      <div className="border-b border-border px-8 py-6">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>
      <div className="space-y-8 p-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-8 xl:grid-cols-3">
          <Skeleton className="h-96 w-full rounded-xl xl:col-span-2" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
