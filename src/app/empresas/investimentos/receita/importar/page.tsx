export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ReceitaUpload } from "@/components/backoffice/receita-upload";
import { ComoFunciona } from "@/components/backoffice/como-funciona";

export default function ImportarReceitaPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar relatório de receita"
        description="Planilha de receita por parceiro, produto e cliente"
      />
      <div className="px-8 space-y-6">
        <Link
          href="/empresas/investimentos/receita"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para a receita
        </Link>
        <ComoFunciona
          proposito="Centralizar a receita real (faturamento bruto, imposto e líquido) por parceiro, produto, cliente e mês."
          comoUsar="Exporte o relatório de receita do Power BI em .xlsx e arraste aqui. A importação substitui o snapshot anterior."
          comoAjuda="Mostra com objetividade de onde vem sua receita e quais clientes/produtos representam o maior valor — base para decisões de foco e cross-sell."
        />
        <ReceitaUpload />
      </div>
    </div>
  );
}
