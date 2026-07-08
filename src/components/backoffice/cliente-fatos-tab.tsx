import { Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  agruparFatosLeitura,
  rotuloCampo,
  type FatoView,
} from "@/lib/cockpit-reuniao/fatos-leitura";

/** Data ISO → dd/mm/aaaa deterministicamente (sem Intl, evita mismatch de hidratação). */
function formatarData(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/**
 * Aba "Perfil" (Perfil·Leitura L1) — leitura read-only dos `ClienteFato`
 * agrupados por categoria, mostrando o valor atual de cada campo. Sem edição.
 * Fatos `sensivel` ganham badge (o detalhe protegido fica em `dados`, não no
 * `valor`, então não é exibido aqui). Histórico/versão ficam para o L2.
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
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{f.valor}</p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  {formatarData(f.criadoEm)} · {f.fonte}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
