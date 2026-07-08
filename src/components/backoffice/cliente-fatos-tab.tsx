import { CalendarClock, History, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  agruparFatosLeitura,
  formatarValorFato,
  rotuloCampo,
  type FatoView,
} from "@/lib/cockpit-reuniao/fatos-leitura";

/** Data ISO → dd/mm/aaaa deterministicamente (sem Intl, evita mismatch de hidratação). */
function formatarData(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** Houve revisão? valorAnterior presente e diferente do atual. */
function temRevisao(f: FatoView): boolean {
  const ant = (f.valorAnterior ?? "").trim();
  return ant !== "" && ant !== (f.valor ?? "").trim();
}

function truncar(s: string, max = 140): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/**
 * Aba "Perfil" (Perfil·Leitura) — leitura read-only dos `ClienteFato` agrupados
 * por categoria, valor atual por campo. L2 acrescenta: rótulos ricos, moeda nas
 * métricas, badge "Revisado" (com o valor anterior), chip de `vence` e a reunião
 * de origem no rodapé. Fatos `sensivel` ganham badge; o detalhe protegido fica
 * em `dados` e não é exibido. Sem edição.
 */
export function ClienteFatosTab({ fatos = [] }: { fatos?: FatoView[] }) {
  const grupos = agruparFatosLeitura(fatos);

  if (grupos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nenhum fato de perfil ainda. Os fatos são extraídos automaticamente ao
        importar uma reunião.
      </div>
    );
  }

  const total = grupos.reduce((n, g) => n + g.fatos.length, 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Perfil versionado do cliente — {total} {total === 1 ? "fato" : "fatos"}{" "}
        extraídos das reuniões. Somente leitura.
      </p>
      {grupos.map((g) => (
        <Card key={g.categoria}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {g.label}
              <Badge variant="secondary">{g.fatos.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {g.fatos.map((f) => (
              <div
                key={f.id}
                className="border-b border-border/60 pb-3 last:border-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {rotuloCampo(f.campo)}
                  </span>
                  {f.sensivel && (
                    <Badge variant="destructive" className="gap-1">
                      <Lock className="h-3 w-3" /> Sensível
                    </Badge>
                  )}
                  {temRevisao(f) && (
                    <Badge variant="outline" className="gap-1">
                      <History className="h-3 w-3" /> Revisado
                    </Badge>
                  )}
                  {f.vence && (
                    <Badge variant="secondary" className="gap-1">
                      <CalendarClock className="h-3 w-3" /> Vence em{" "}
                      {formatarData(f.vence)}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatarValorFato(f)}
                </p>
                {temRevisao(f) &&
                  (f.sensivel ? (
                    // Fato sensível: NÃO expor o valor anterior — ele pode conter
                    // o detalhe protegido que foi retirado do valor atual. Mostra
                    // só que houve revisão.
                    <p className="mt-1 text-xs italic text-muted-foreground/50">
                      Valor anterior oculto (sensível)
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground/60">
                      Antes:{" "}
                      <span className="line-through">
                        {truncar(f.valorAnterior ?? "")}
                      </span>
                    </p>
                  ))}
                <p className="mt-1 text-xs text-muted-foreground/70">
                  {formatarData(f.criadoEm)} · {f.fonte}
                  {f.reuniao?.data
                    ? ` · reunião de ${formatarData(f.reuniao.data)}`
                    : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
