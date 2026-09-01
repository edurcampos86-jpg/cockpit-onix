"use client";

import * as React from "react";
import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getNomeRelacionamento } from "@/lib/backoffice/display-name";
import type { MicrocopyIndicacoes } from "@/content/indicacoes-microcopy";
import {
  COLUNAS_V2,
  STATUS_ABERTOS,
  colunaDe,
  moeda,
  type ClienteOpcao,
  type Indicacao,
  type ParceiroOpcao,
} from "./tipos";
import { Coluna, EmptyColuna, type HandlersCard } from "./coluna";
import { CardIndicacao } from "./card-indicacao";
import { DialogCriar } from "./dialog-criar";
import { DialogConverter } from "./dialog-converter";

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function IndicacoesBoardV2({
  indicacoes: iniciais,
  clientes,
  parceiros,
  microcopy,
}: {
  indicacoes: Indicacao[];
  clientes: ClienteOpcao[];
  parceiros: ParceiroOpcao[];
  microcopy: MicrocopyIndicacoes;
}) {
  const [indicacoes, setIndicacoes] = React.useState(iniciais);
  /** Ids com requisição em voo — ações concorrentes em cards DIFERENTES são
   * permitidas; duas no MESMO card não (handlers retornam cedo). */
  const [salvandoIds, setSalvandoIds] = React.useState<Set<string>>(new Set());
  const [erro, setErro] = React.useState<string | null>(null);
  const [anuncio, setAnuncio] = React.useState("");
  const [busca, setBusca] = React.useState("");
  const [recemCriadaId, setRecemCriadaId] = React.useState<string | null>(null);
  const [dialogCriarAberto, setDialogCriarAberto] = React.useState(false);
  const [converterAlvo, setConverterAlvo] = React.useState<Indicacao | null>(null);
  const [removerAlvo, setRemoverAlvo] = React.useState<Indicacao | null>(null);
  const [desfazerAlvo, setDesfazerAlvo] = React.useState<Indicacao | null>(null);
  const botaoNovaRef = React.useRef<HTMLButtonElement | null>(null);
  const contadorAnuncio = React.useRef(0);

  /* Sufixo invisível alternante: mensagens IGUAIS em sequência ("movida para
   * X" duas vezes) ainda mudam o conteúdo do nó e são re-anunciadas. */
  const anunciar = (msg: string) => {
    contadorAnuncio.current += 1;
    setAnuncio(msg + (contadorAnuncio.current % 2 === 0 ? "​" : ""));
  };

  const marcarSalvando = (id: string, ligado: boolean) => {
    setSalvandoIds((prev) => {
      const novo = new Set(prev);
      if (ligado) novo.add(id);
      else novo.delete(id);
      return novo;
    });
  };

  /* ── KPIs (sempre sobre a lista COMPLETA, não a filtrada) ── */
  const total = indicacoes.length;
  const convertidas = indicacoes.filter((i) => i.status === "convertida").length;
  const taxa = total > 0 ? Math.round((convertidas / total) * 100) : 0;
  const pipeline = indicacoes
    .filter((i) => STATUS_ABERTOS.includes(i.status))
    .reduce((s, i) => s + (i.valorEstimado ?? 0), 0);
  const seteDiasAtras = Date.now() - 7 * 86_400_000;
  const novasSemana = indicacoes.filter(
    (i) => new Date(i.criadoEm).getTime() >= seteDiasAtras
  ).length;

  /* ── busca client-side, case/acento-insensível ── */
  const termo = busca.trim();
  const filtradas = React.useMemo(() => {
    if (!termo) return indicacoes;
    const t = normalizar(termo);
    return indicacoes.filter(
      (i) =>
        normalizar(i.nomeIndicado).includes(t) ||
        (i.indicador && normalizar(i.indicador.nome).includes(t)) ||
        (i.parceiro && normalizar(i.parceiro.nome).includes(t))
    );
  }, [indicacoes, termo]);

  const porStatus = (status: string) =>
    filtradas
      .filter((i) => i.status === status)
      .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));

  const nomeClientePorId = (clienteId: string | null): string | null => {
    if (!clienteId) return null;
    const c = clientes.find((x) => x.id === clienteId);
    return c ? getNomeRelacionamento(c) : null;
  };

  /* ── ações ─────────────────────────────────────────────── */

  const mover = async (i: Indicacao, novoStatus: string) => {
    if (salvandoIds.has(i.id) || i.status === novoStatus) return;
    const statusAnterior = i.status;
    marcarSalvando(i.id, true);
    // Otimista: aplica já; rollback se o servidor recusar.
    setIndicacoes((prev) =>
      prev.map((x) => (x.id === i.id ? { ...x, status: novoStatus } : x))
    );
    try {
      const res = await fetch(`/api/backoffice/indicacoes/${i.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: novoStatus }),
      });
      if (!res.ok) throw new Error();
      anunciar(`${i.nomeIndicado} agora está em ${colunaDe(novoStatus).label}.`);
    } catch {
      setIndicacoes((prev) =>
        prev.map((x) => (x.id === i.id ? { ...x, status: statusAnterior } : x))
      );
      setErro(
        `A mudança de etapa não foi salva e o cartão voltou para ${colunaDe(statusAnterior).label}. Arraste de novo.`
      );
    } finally {
      marcarSalvando(i.id, false);
    }
  };

  const agradecer = async (i: Indicacao) => {
    if (salvandoIds.has(i.id)) return;
    const valorNovo = !i.agradecimentoEnviado;
    marcarSalvando(i.id, true);
    setIndicacoes((prev) =>
      prev.map((x) => (x.id === i.id ? { ...x, agradecimentoEnviado: valorNovo } : x))
    );
    try {
      const res = await fetch(`/api/backoffice/indicacoes/${i.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agradecimentoEnviado: valorNovo }),
      });
      if (!res.ok) throw new Error();
      anunciar(
        valorNovo
          ? "Agradecimento registrado. Quem é reconhecido apresenta de novo."
          : "Agradecimento desmarcado."
      );
    } catch {
      setIndicacoes((prev) =>
        prev.map((x) => (x.id === i.id ? { ...x, agradecimentoEnviado: !valorNovo } : x))
      );
      setErro("O agradecimento não foi marcado. Toque no coração de novo.");
    } finally {
      marcarSalvando(i.id, false);
    }
  };

  /* fetch cujo fracasso — rede caída OU !res.ok — vira Error com mensagem
   * amigável, porque os dialogs exibem `e.message` inline. Sem isto, uma
   * queda de rede mostraria "Failed to fetch" cru para o usuário. */
  const fetchOuErro = async (url: string, init: RequestInit, mensagem: string) => {
    let res: Response | null = null;
    try {
      res = await fetch(url, init);
    } catch {
      // rede caiu — res fica null e cai na mensagem amigável abaixo
    }
    if (!res || !res.ok) throw new Error(mensagem);
    return res;
  };

  /** Chamado pelo DialogConverter; lançar erro mantém o dialog aberto com a
   * mensagem inline. A rota /converter grava vínculo E status numa escrita só. */
  const vincular = async (i: Indicacao, clienteId: string) => {
    if (salvandoIds.has(i.id)) {
      // Retornar em silêncio fecharia o dialog como se tivesse dado certo.
      throw new Error("Outra ação neste cartão ainda está salvando. Aguarde um instante e confirme de novo.");
    }
    marcarSalvando(i.id, true);
    try {
      await fetchOuErro(
        `/api/backoffice/indicacoes/${i.id}/converter`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clienteId }),
        },
        "A conversão não foi salva. Escolha o cliente e confirme outra vez; se o cadastro ainda não existe, crie-o antes em Clientes."
      );
      setIndicacoes((prev) =>
        prev.map((x) =>
          x.id === i.id ? { ...x, clienteConvertidoId: clienteId, status: "convertida" } : x
        )
      );
      anunciar(`${i.nomeIndicado} agora é cliente Onix. Falta o agradecimento a quem apresentou.`);
    } finally {
      marcarSalvando(i.id, false);
    }
  };

  const desfazerConversao = async () => {
    const i = desfazerAlvo;
    if (!i) return;
    marcarSalvando(i.id, true);
    try {
      await fetchOuErro(
        `/api/backoffice/indicacoes/${i.id}/converter`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clienteId: null }),
        },
        "A conversão não foi desfeita e o vínculo continua. Tente de novo."
      );
      // A rota devolve o status para "reuniao" junto com o vínculo — o estado
      // local segue o servidor.
      setIndicacoes((prev) =>
        prev.map((x) =>
          x.id === i.id ? { ...x, clienteConvertidoId: null, status: "reuniao" } : x
        )
      );
      anunciar("Conversão desfeita — a introdução voltou ao quadro.");
      setDesfazerAlvo(null);
    } finally {
      marcarSalvando(i.id, false);
    }
  };

  const remover = async () => {
    const i = removerAlvo;
    if (!i) return;
    await fetchOuErro(
      `/api/backoffice/indicacoes/${i.id}`,
      { method: "DELETE" },
      "A remoção falhou — a introdução continua no quadro. Tente de novo em alguns segundos."
    );
    setIndicacoes((prev) => prev.filter((x) => x.id !== i.id));
    anunciar("Introdução removida.");
    setRemoverAlvo(null);
    // O elemento de origem morreu — devolve o foco ao botão da toolbar.
    requestAnimationFrame(() => botaoNovaRef.current?.focus());
  };

  const aoCriada = (nova: Indicacao) => {
    setIndicacoes((prev) => [nova, ...prev]);
    setRecemCriadaId(nova.id);
    setTimeout(() => setRecemCriadaId((atual) => (atual === nova.id ? null : atual)), 2000);
    anunciar("Introdução registrada. Próximo passo: o convite.");
  };

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const alvo = indicacoes.find((x) => x.id === draggableId);
    if (alvo) void mover(alvo, destination.droppableId);
  };

  const handlers: HandlersCard = {
    onMover: (i, s) => void mover(i, s),
    onAgradecer: (i) => void agradecer(i),
    onConverter: setConverterAlvo,
    onDesfazerConversao: setDesfazerAlvo,
    onRemover: setRemoverAlvo,
  };

  const boardVazio = indicacoes.length === 0;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Região aria-live ÚNICA do board — recebe toda mensagem de sucesso. */}
        <div aria-live="polite" role="status" className="sr-only">
          {anuncio}
        </div>
        <p className="sr-only">
          Para mover uma introdução pelo teclado, use o menu Mover de cada cartão.
        </p>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <Tooltip>
            <TooltipTrigger
              render={<div tabIndex={0} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />}
            >
              <StatCard
                icon={Sparkles}
                label="Placar da semana"
                sublabel="novas nos últimos 7 dias"
                value={novasSemana}
                tone="primary"
              />
            </TooltipTrigger>
            <TooltipContent>
              Introduções registradas nos últimos 7 dias. Prospecção é volume e constância — o
              placar anda quando você registra.
            </TooltipContent>
          </Tooltip>
          <StatCard
            icon={TrendingUp}
            label="Pipeline aberto"
            sublabel="recebidas + contato + convívio"
            value={moeda(pipeline)}
            tone="primary"
          />
          <StatCard icon={Users} label="Introduções" sublabel="no círculo" value={total} />
          <StatCard icon={CheckCircle2} label="Clientes conquistados" value={convertidas} />
          <StatCard icon={Target} label="Taxa de conversão" value={`${taxa}%`} />
        </div>

        {/* Banner de erro — um por vez; NÃO some sozinho. */}
        {erro && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm px-4 py-3 flex items-center gap-2"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{erro}</span>
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => setErro(null)}
              className="shrink-0 rounded-md p-1 hover:bg-destructive/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold text-foreground">Pipeline de introduções</h3>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou quem apresentou…"
                aria-label="Buscar introduções"
                className="pl-8"
              />
            </div>
            <Button ref={botaoNovaRef} onClick={() => setDialogCriarAberto(true)}>
              <Plus className="h-4 w-4" />
              {microcopy.ctaPrincipal}
            </Button>
          </div>
        </div>

        {boardVazio ? (
          /* Empty state global — substitui o kanban inteiro. */
          <div className="rounded-xl border border-dashed border-gold-dark/40 bg-primary/5 p-10 text-center max-w-md mx-auto space-y-3">
            <Users className="h-10 w-10 text-primary mx-auto" aria-hidden="true" />
            <p className="font-semibold text-foreground">Seu funil de introduções começa aqui</p>
            <p className="text-sm text-muted-foreground">{microcopy.emptyGlobal}</p>
            <Button onClick={() => setDialogCriarAberto(true)}>
              <Plus className="h-4 w-4" />
              {microcopy.ctaPrincipal}
            </Button>
          </div>
        ) : (
          <>
            {/* Mobile (<768px): Tabs por status, FORA do DragDropContext —
                mover é pelo menu do card. */}
            <Tabs defaultValue="recebida" className="md:hidden">
              <TabsList className="w-full overflow-x-auto justify-start">
                {COLUNAS_V2.map((c) => (
                  <TabsTrigger key={c.id} value={c.id}>
                    {c.label}
                    <Badge variant="secondary" className="text-[11px] tabular-nums">
                      {porStatus(c.id).length}
                    </Badge>
                  </TabsTrigger>
                ))}
              </TabsList>
              {COLUNAS_V2.map((c) => {
                const lista = porStatus(c.id);
                return (
                  <TabsContent key={c.id} value={c.id}>
                    <div className="space-y-2">
                      {lista.map((i) => (
                        <CardIndicacao
                          key={i.id}
                          indicacao={i}
                          salvando={salvandoIds.has(i.id)}
                          recemCriada={recemCriadaId === i.id}
                          nomeClienteVinculado={nomeClientePorId(i.clienteConvertidoId)}
                          {...handlers}
                        />
                      ))}
                      {lista.length === 0 && (
                        <EmptyColuna
                          coluna={c}
                          termoBusca={termo}
                          onNova={() => setDialogCriarAberto(true)}
                        />
                      )}
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>

            {/* ≥768px: UM único nó de colunas — trilho horizontal no md,
                grid de 5 no xl. DnD ativo nos dois regimes. */}
            <DragDropContext onDragEnd={onDragEnd}>
              <div
                className={cn(
                  "hidden md:flex xl:grid xl:grid-cols-5 gap-4 pb-3",
                  "md:overflow-x-auto md:snap-x md:snap-proximity"
                )}
              >
                {COLUNAS_V2.map((c) => (
                  <Coluna
                    key={c.id}
                    coluna={c}
                    lista={porStatus(c.id)}
                    termoBusca={termo}
                    salvandoIds={salvandoIds}
                    recemCriadaId={recemCriadaId}
                    nomeClientePorId={nomeClientePorId}
                    handlers={handlers}
                    onNova={() => setDialogCriarAberto(true)}
                  />
                ))}
              </div>
            </DragDropContext>
          </>
        )}

        {/* Dialogs */}
        <DialogCriar
          open={dialogCriarAberto}
          onOpenChange={setDialogCriarAberto}
          clientes={clientes}
          parceiros={parceiros}
          onCriada={aoCriada}
        />
        <DialogConverter
          indicacao={converterAlvo}
          clientes={clientes}
          onOpenChange={(aberto) => !aberto && setConverterAlvo(null)}
          onVincular={vincular}
        />
        <ConfirmDialog
          open={removerAlvo !== null}
          onOpenChange={(aberto) => !aberto && setRemoverAlvo(null)}
          titulo={`Remover a introdução de ${removerAlvo?.nomeIndicado ?? ""}?`}
          descricao="Ela sai do quadro e o histórico não volta. Se a relação só esfriou, mova o cartão para Esfriou — esfriada dá para reaquecer, removida não."
          textoConfirmar="Remover"
          textoOcupado="Removendo..."
          textoCancelar="Manter no quadro"
          destrutivo
          onConfirmar={remover}
        />
        <ConfirmDialog
          open={desfazerAlvo !== null}
          onOpenChange={(aberto) => !aberto && setDesfazerAlvo(null)}
          titulo="Desfazer conversão"
          descricao={
            desfazerAlvo
              ? `Vinculada a ${nomeClientePorId(desfazerAlvo.clienteConvertidoId) ?? "um cliente"}. A introdução volta ao quadro em Convívio marcado.`
              : ""
          }
          textoConfirmar="Desfazer conversão"
          textoOcupado="Desfazendo..."
          onConfirmar={desfazerConversao}
        />
      </div>
    </TooltipProvider>
  );
}
