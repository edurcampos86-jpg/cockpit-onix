export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckSquare, Circle, Printer, ThumbsUp, AlertTriangle, MessageCircleQuestion, Megaphone, Target, Quote } from "lucide-react";

const SECAO_LABELS: Record<string, { label: string; color: string; Icon: typeof ThumbsUp }> = {
  secao1: { label: "Abordagens Positivas da Semana", color: "text-green-400 border-green-400/30 bg-green-400/5", Icon: ThumbsUp },
  secao2: { label: "Oportunidades de Melhoria", color: "text-yellow-400 border-yellow-400/30 bg-yellow-400/5", Icon: AlertTriangle },
  secao3: { label: "Objecoes Encontradas", color: "text-blue-400 border-blue-400/30 bg-blue-400/5", Icon: MessageCircleQuestion },
  secao4: { label: "Voz do Cliente", color: "text-purple-400 border-purple-400/30 bg-purple-400/5", Icon: Megaphone },
  secao5: { label: "Plano de Acao", color: "text-orange-400 border-orange-400/30 bg-orange-400/5", Icon: Target },
};

// Renderiza o texto da secao realcando blocos "Evidencia:" como quote cards
function RichText({ texto }: { texto: string }) {
  const linhas = texto.split("\n");
  const blocks: Array<{ kind: "text" | "evidence"; content: string }> = [];
  let buffer: string[] = [];

  const flushText = () => {
    if (buffer.length > 0) {
      blocks.push({ kind: "text", content: buffer.join("\n") });
      buffer = [];
    }
  };

  for (const l of linhas) {
    if (/^\s*evid[eê]ncia\s*:/i.test(l)) {
      flushText();
      blocks.push({ kind: "evidence", content: l.replace(/^\s*evid[eê]ncia\s*:\s*/i, "") });
    } else {
      buffer.push(l);
    }
  }
  flushText();

  return (
    <div className="space-y-3">
      {blocks.map((b, i) =>
        b.kind === "evidence" ? (
          <div key={i} className="flex gap-2 rounded-lg border border-foreground/10 bg-foreground/5 px-3 py-2 text-xs italic text-foreground/80">
            <Quote className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-60" />
            <span className="whitespace-pre-wrap leading-relaxed">{b.content}</span>
          </div>
        ) : (
          <div key={i} className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{b.content}</div>
        ),
      )}
    </div>
  );
}

function SecaoCard({ chave, texto }: { chave: string; texto: string }) {
  const { label, color, Icon } = SECAO_LABELS[chave];
  return (
    <div className={`rounded-xl border p-6 ${color}`}>
      <h3 className="font-semibold mb-4 text-sm uppercase tracking-wide flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {label}
      </h3>
      <RichText texto={texto} />
    </div>
  );
}

export default async function RelatorioDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const relatorio = await prisma.relatorio.findUnique({
    where: { id },
    include: { acoes: { orderBy: { numero: "asc" } }, metricas: true },
  });

  if (!relatorio) notFound();

  const acoesTotal = relatorio.acoes.length;
  const acoesConcluidas = relatorio.acoes.filter((a) => a.concluida).length;

  return (
    <div className="min-h-screen">
      <PageHeader
        title={`${relatorio.vendedor.split(" ")[0]} — ${relatorio.periodo}`}
        description={`${relatorio.conversasAnalisadas} conversas analisadas · ${new Date(relatorio.dataExecucao).toLocaleDateString("pt-BR")}`}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/onix-corretora/relatorios"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
          <Link
            href={`/onix-corretora/relatorios/${relatorio.id}/print`}
            target="_blank"
            className="flex items-center gap-1.5 text-sm py-1.5 px-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
          >
            <Printer className="h-4 w-4" />
            Exportar PDF
          </Link>
        </div>
      </PageHeader>

      <div className="p-8">
        <div className="mb-6">
          <ComoFunciona
            proposito="Relatório semanal individual gerado por IA a partir das conversas reais do vendedor: abordagens positivas, oportunidades, objeções, voz do cliente e plano de ação calibrado pelo PAT."
            comoUsar="Leia na ordem das seções. Cada bloco ‘Evidência:’ é um trecho real da conversa que justifica a observação. O Plano de Ação no fim já vem com itens marcáveis — ative os que vão valer pra essa semana."
            comoAjuda="Coaching deixa de ser feeling e vira evidência. O vendedor sabe exatamente o que fazer, com exemplo concreto, e o gestor entra na reunião com a pauta pronta."
          />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Secoes do relatorio */}
          <div className="xl:col-span-2 space-y-6">
            <SecaoCard chave="secao1" texto={relatorio.secao1} />
            <SecaoCard chave="secao2" texto={relatorio.secao2} />
            <SecaoCard chave="secao3" texto={relatorio.secao3} />
            <SecaoCard chave="secao4" texto={relatorio.secao4} />
            <SecaoCard chave="secao5" texto={relatorio.secao5} />
          </div>

          {/* Sidebar: acoes + metricas */}
          <div className="space-y-6">
            {/* Acoes */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm">Plano de Acao</h3>
                <span className="text-xs text-muted-foreground">{acoesConcluidas}/{acoesTotal}</span>
              </div>
              {relatorio.acoes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma acao registrada.</p>
              ) : (
                <div className="space-y-3">
                  {relatorio.acoes.map((acao) => (
                    <div key={acao.id} className="flex gap-3">
                      {acao.concluida ? (
                        <CheckSquare className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className={`text-sm font-medium ${acao.concluida ? "line-through text-muted-foreground" : ""}`}>
                          {acao.numero}. {acao.titulo}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{acao.descricao}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Link
                href={`/onix-corretora/acoes?relatorioId=${relatorio.id}`}
                className="block text-center text-xs mt-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
              >
                Gerenciar acoes
              </Link>
            </div>

            {/* Metricas */}
            {relatorio.metricas && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-semibold text-sm mb-4">Metricas</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Conversas analisadas</span>
                    <span className="font-medium">{relatorio.metricas.conversasAnalisadas}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sem resposta</span>
                    <span className="font-medium text-yellow-400">{relatorio.metricas.conversasSemResposta}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Reunioes agendadas</span>
                    <span className="font-medium text-green-400">{relatorio.metricas.reunioesAgendadas}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Leads perdidos</span>
                    <span className="font-medium text-red-400">{relatorio.metricas.leadsPerdidos}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Link PDF */}
            {relatorio.pdfPath && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-semibold text-sm mb-3">PDF</h3>
                <p className="text-xs text-muted-foreground break-all">{relatorio.pdfPath}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
