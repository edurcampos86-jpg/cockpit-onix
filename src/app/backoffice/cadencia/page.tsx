export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { CadenciaBoard } from "@/components/backoffice/cadencia-board";
import { ReferenciaLivro } from "@/components/backoffice/referencia-livro";
import { ComoFunciona } from "@/components/backoffice/como-funciona";
import { REF_CADENCIA_12_4_2 } from "@/lib/backoffice/referencias";

export default async function CadenciaPage() {
  interface ClienteCadencia {
    id: string;
    nome: string;
    classificacao: string;
    saldo: number;
    email: string | null;
    telefone: string | null;
    ultimoContatoAt: Date | null;
    proximoContatoAt: Date | null;
    diasSemContato: number | null;
    status: "atrasado" | "hoje" | "semana" | "mes" | "futuro" | "nunca";
  }

  let clientes: ClienteCadencia[] = [];

  try {
    const raw = await prisma.clienteBackoffice.findMany({
      orderBy: [{ proximoContatoAt: "asc" }, { classificacao: "asc" }],
    });
    const agora = Date.now();
    const diaMs = 24 * 60 * 60 * 1000;

    clientes = raw.map((c) => {
      let status: ClienteCadencia["status"] = "futuro";
      const proximoTs = c.proximoContatoAt?.getTime();
      if (!c.ultimoContatoAt && !c.proximoContatoAt) {
        status = "nunca";
      } else if (proximoTs) {
        const diff = proximoTs - agora;
        if (diff < 0) status = "atrasado";
        else if (diff < diaMs) status = "hoje";
        else if (diff < 7 * diaMs) status = "semana";
        else if (diff < 30 * diaMs) status = "mes";
      }

      const diasSemContato = c.ultimoContatoAt
        ? Math.floor((agora - c.ultimoContatoAt.getTime()) / diaMs)
        : null;

      return {
        id: c.id,
        nome: c.nome,
        classificacao: c.classificacao,
        saldo: c.saldo,
        email: c.email,
        telefone: c.telefone,
        ultimoContatoAt: c.ultimoContatoAt,
        proximoContatoAt: c.proximoContatoAt,
        diasSemContato,
        status,
      };
    });
  } catch {
    // noop
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cadência 12-4-2"
        description="12 ligações + 4 reuniões + 2 revisões por ano para cada cliente A."
      />

      <div className="px-8 space-y-6">
        <ComoFunciona
          proposito="Kanban de cadência mostrando quem está atrasado, quem deve ser contatado hoje, na semana e no mês."
          comoUsar="Trabalhe da esquerda para a direita: zere atrasados primeiro, depois 'hoje', depois 'semana'. Registre cada toque."
          comoAjuda="Transforma a promessa 12-4-2 em rotina visual — nenhum cliente A passa mais de 30 dias sem contato."
        />
        <ReferenciaLivro
          referencias={REF_CADENCIA_12_4_2}
          titulo="A cadência 12-4-2 do método Supernova"
        />

        <CadenciaBoard clientes={clientes} />
      </div>
    </div>
  );
}
