import { Lightbulb, Target, Zap } from "lucide-react";

interface Props {
  proposito: string;
  comoUsar: string;
  comoAjuda: string;
}

/**
 * Cartão auto-explicativo: o que essa ferramenta faz, como usar, como ajuda.
 * Aparece no topo de cada página/aba para que o assessor entenda imediatamente
 * o propósito e o valor prático antes de operar.
 */
export function ComoFunciona({ proposito, comoUsar, comoAjuda }: Props) {
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 dark:border-sky-900/50 dark:bg-sky-950/20 p-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0">
            <Target className="h-4 w-4 text-sky-700 dark:text-sky-400" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-sky-900 dark:text-sky-200 mb-1">
              Propósito
            </p>
            <p className="text-xs text-sky-900/80 dark:text-sky-200/80 leading-relaxed">
              {proposito}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0">
            <Zap className="h-4 w-4 text-sky-700 dark:text-sky-400" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-sky-900 dark:text-sky-200 mb-1">
              Como usar
            </p>
            <p className="text-xs text-sky-900/80 dark:text-sky-200/80 leading-relaxed">
              {comoUsar}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0">
            <Lightbulb className="h-4 w-4 text-sky-700 dark:text-sky-400" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-sky-900 dark:text-sky-200 mb-1">
              Como te ajuda
            </p>
            <p className="text-xs text-sky-900/80 dark:text-sky-200/80 leading-relaxed">
              {comoAjuda}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
