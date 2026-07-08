import Link from "next/link";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PendenciasGlobais } from "@/lib/cockpit-reuniao/pendencias-globais";

/** ISO → dd/mm/aaaa deterministicamente (sem Intl). */
function formatarData(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/**
 * Tela GLOBAL de pendências de reunião abertas (T2) — read-only. Agrupa por
 * cliente (mais atrasadas primeiro), separa lado assessor/cliente e sinaliza as
 * vencidas. Cada cliente linka para a ficha. Sem ações (marcar/rotear ficam
 * para o T3, quando houver rastreabilidade pendência↔ação).
 */
export function PendenciasAbertas({ dados }: { dados: PendenciasGlobais }) {
  if (dados.totalAbertas === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nenhuma pendência de reunião aberta. Tudo em dia. 🎯
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {dados.totalAbertas} pendência{dados.totalAbertas === 1 ? "" : "s"} aberta
        {dados.totalAbertas === 1 ? "" : "s"} em {dados.totalClientes} cliente
        {dados.totalClientes === 1 ? "" : "s"}
        {dados.totalAtrasadas > 0 ? ` · ${dados.totalAtrasadas} atrasada${dados.totalAtrasadas === 1 ? "" : "s"}` : ""}
        . Somente leitura.
      </p>

      {dados.grupos.map((g) => (
        <Card key={g.clienteId}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Link
                href={`/empresas/investimentos/clientes/${g.clienteId}`}
                className="inline-flex items-center gap-1 hover:text-primary hover:underline"
              >
                {g.clienteNome}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
              <Badge variant="secondary">{g.abertas}</Badge>
              {g.atrasadas > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> {g.atrasadas} atrasada
                  {g.atrasadas === 1 ? "" : "s"}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {g.itens.map((it) => (
              <div
                key={`${it.reuniaoId}:${it.lado}:${it.indice}`}
                className="border-b border-border/60 pb-3 last:border-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={it.lado === "assessor" ? "outline" : "secondary"}>
                    {it.lado === "assessor" ? "Assessor" : "Cliente"}
                  </Badge>
                  {it.atrasada && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> Atrasada
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-foreground">{it.texto}</p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Reunião de {formatarData(it.reuniaoData)}
                  {it.dataRetorno ? ` · retorno ${formatarData(it.dataRetorno)}` : ""}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
