export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { PageHeader } from "@/components/layout/page-header";
import { PainelDiaHeader } from "@/components/backoffice/painel/painel-dia-header";
import { PrioridadesCard } from "@/components/backoffice/painel/prioridades-card";
import { AgendaUnificada } from "@/components/backoffice/painel/agenda-unificada";
import { EmailsAcao } from "@/components/backoffice/painel/emails-acao";
import { AcoesDoDia } from "@/components/backoffice/painel/acoes-do-dia";
import { IntegracoesStatus } from "@/components/backoffice/painel/integracoes-status";
import {
  carregarPainelDoDia,
  hojeBahia,
} from "@/lib/painel-do-dia/agregador";

export default async function PainelDoDiaPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const data = hojeBahia();
  const payload = await carregarPainelDoDia(session.userId, data);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel do Dia"
        description="Tudo que importa hoje, num só lugar."
      >
        <PainelDiaHeader
          data={payload.data}
          pendingSyncCount={payload.pendingSyncCount}
        />
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 px-8 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <PrioridadesCard
            prioridades={payload.prioridades}
            data={payload.data}
          />
        </div>
        <div className="lg:col-span-2 grid grid-cols-1 gap-6 md:grid-cols-2">
          <AgendaUnificada
            eventos={payload.agenda}
            erro={payload.errosPorSecao.agenda}
          />
          <EmailsAcao
            emails={payload.emails}
            erro={payload.errosPorSecao.emails}
          />
        </div>
      </div>

      <div className="px-8">
        <AcoesDoDia acoes={payload.acoes} erro={payload.errosPorSecao.acoes} />
      </div>

      <div className="px-8 pb-8">
        <IntegracoesStatus integracoes={payload.integracoes} />
      </div>
    </div>
  );
}
