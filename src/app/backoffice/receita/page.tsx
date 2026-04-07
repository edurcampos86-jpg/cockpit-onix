export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/layout/page-header";
import { ReceitaUpload } from "@/components/backoffice/receita-upload";
import { ComoFunciona } from "@/components/backoffice/como-funciona";

export default function ReceitaPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório de Receita"
        description="Importe a planilha de receita por parceiro, produto e cliente"
      />
      <div className="px-8 space-y-6">
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
