export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/backoffice/como-funciona";
import { PainelDiaHeader } from "@/components/backoffice/painel/painel-dia-header";
import { PrioridadesCard } from "@/components/backoffice/painel/prioridades-card";
import { AgendaUnificada } from "@/components/backoffice/painel/agenda-unificada";
import { EmailsAcao } from "@/components/backoffice/painel/emails-acao";
import { AcoesDoDia } from "@/components/backoffice/painel/acoes-do-dia";
import { IntegracoesStatus } from "@/components/backoffice/painel/integracoes-status";
import { RetrospectivaCard } from "@/components/backoffice/painel/retrospectiva-card";
import { SugestoesCard } from "@/components/backoffice/painel/sugestoes-card";
import { BuscaSemanticaBlock } from "@/components/painel-do-dia/BuscaSemanticaBlock";
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
          acoesPendentes={payload.acoes.filter((a) => a.pendingSync)}
        />
      </PageHeader>

      <div className="px-8">
        <BuscaSemanticaBlock />
      </div>

      <div className="px-8">
        <ComoFunciona
          proposito="Tudo que importa hoje em uma única tela: 3 prioridades, agenda, e-mails que viram ação, lista de ações pendentes e saúde das integrações."
          comoUsar="Abra de manhã, confirme as 3 prioridades sugeridas pelo Boot do Dia, processe e-mails marcados como 'ação' e siga as ações do dia. Feche o dia marcando o que entregou."
          comoAjuda="Substitui dezenas de abas (e-mail, calendar, lista de tarefas, CRM) por uma só visão diária — sem você precisar lembrar onde cada coisa mora."
        />
      </div>

      {payload.retrospectiva && (
        <div className="px-8">
          <RetrospectivaCard retro={payload.retrospectiva} />
        </div>
      )}

      {payload.sugestoes.length > 0 && (
        <div className="px-8">
          <SugestoesCard sugestoes={payload.sugestoes} />
        </div>
      )}

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
            googleConectado={payload.googleConectado}
            fetchedAt={payload.agendaFetchedAt}
          />
          <EmailsAcao
            emails={payload.emails}
            erro={payload.errosPorSecao.emails}
            googleConectado={payload.googleConectado}
            fetchedAt={payload.emailsFetchedAt}
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
