export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { FileText, Printer, Users } from "lucide-react";

export default async function ColetivoPage() {
  const relatorios = await prisma.relatorioColetivo.findMany({
    orderBy: { periodoInicio: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Padroes Coletivos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visao consolidada do time comercial para a reuniao de terca-feira
        </p>
      </div>

      {relatorios.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">
            Nenhum relatorio coletivo gerado
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Gere os relatorios individuais de Thiago e Rose primeiro, depois gere o coletivo pelo Painel.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {relatorios.map((rel) => {
            const vendedores = rel.vendedoresAnalisados.split(",");

            return (
              <div
                key={rel.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">
                      {rel.periodo}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {vendedores.length} assessores analisados · Gerado em{" "}
                      {new Date(rel.dataExecucao).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/onix-corretora/coletivo/${rel.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Ver
                  </Link>
                  <Link
                    href={`/onix-corretora/coletivo/${rel.id}/print`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    PDF
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
