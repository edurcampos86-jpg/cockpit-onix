"use client";

import { useState } from "react";
import { Loader2, Phone, Presentation, X } from "lucide-react";

/**
 * Drawer de registro, com duas abas: Ligação e Reunião.
 *
 * As duas abas gravam em tabelas diferentes porque são coisas diferentes:
 * ligação é um contato (assunto, duração), reunião é um encontro com conteúdo
 * (pauta, pendências por lado, tarefas). Um formulário só, com metade dos
 * campos escondidos, produziria reunião sem pendência — que é a metade que o
 * briefing da próxima reunião precisa cobrar.
 *
 * O escopo de grupo só aparece na aba Ligação. Reunião não propaga: quem não
 * estava na sala não teve reunião, e marcar que teve zeraria o alerta de quem
 * está justamente vencido.
 *
 * Uma conta pode pertencer a VÁRIOS grupos ao mesmo tempo (cônjuge que também é
 * sócio PJ de outra família). Havendo mais de um, a tela obriga a escolher em
 * vez de assumir o primeiro: propagar para o grupo errado move a data de
 * contato de contas com quem ninguém falou, e isso não aparece como erro.
 */

type Aba = "ligacao" | "reuniao";

/** Um grupo de atendimento a que a conta pertence. */
export type Grupo = { id: string; nome: string; membrosQueRecebem: number };

/**
 * Escolha do escopo: só esta conta, ou um grupo nomeado.
 *
 * Com vários grupos, cada um é um radio próprio — a lista some a chance de
 * alguém marcar "o grupo" achando que é o outro. Com um só, o comportamento é
 * o de antes: dois radios, sem passo extra.
 */
function EscopoGrupo({
  nomeRadio,
  grupos,
  escopo,
  grupoId,
  onEscopo,
  onGrupo,
}: {
  nomeRadio: string;
  grupos: readonly Grupo[];
  escopo: "individual" | "grupo";
  grupoId: string;
  onEscopo: (e: "individual" | "grupo") => void;
  onGrupo: (id: string) => void;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-medium text-muted-foreground">Contar contato para</legend>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="radio"
          name={nomeRadio}
          checked={escopo === "individual"}
          onChange={() => onEscopo("individual")}
        />
        Só esta conta
      </label>
      {grupos.map((g) => (
        <label key={g.id} className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            name={nomeRadio}
            checked={escopo === "grupo" && grupoId === g.id}
            onChange={() => {
              onEscopo("grupo");
              onGrupo(g.id);
            }}
          />
          {g.nome} — {g.membrosQueRecebem} {g.membrosQueRecebem === 1 ? "conta" : "contas"}
        </label>
      ))}
      {grupos.length > 1 && (
        <p className="pt-0.5 text-[11px] text-muted-foreground">
          Esta conta está em {grupos.length} grupos. Escolha um — o contato vale só para o grupo
          escolhido.
        </p>
      )}
    </fieldset>
  );
}

export function RegistroDrawer({
  clienteId,
  clienteNome,
  aberto,
  grupos = [],
  pessoas = [],
  onFechar,
  onRegistrado,
}: {
  clienteId: string;
  clienteNome: string;
  aberto: boolean;
  /** Todos os grupos de atendimento da conta. Vazio = conta sem grupo. */
  grupos?: readonly Grupo[];
  pessoas?: readonly { id: string; nome: string }[];
  onFechar: () => void;
  onRegistrado?: () => void;
}) {
  const [aba, setAba] = useState<Aba>("ligacao");

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-semibold">Registrar</h2>
            <p className="text-xs text-muted-foreground">{clienteNome}</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar">
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>

        <div className="flex gap-2 border-b border-border">
          {(
            [
              { id: "ligacao" as const, label: "Ligação", Icon: Phone },
              { id: "reuniao" as const, label: "Reunião", Icon: Presentation },
            ]
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setAba(id)}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                aba === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {aba === "ligacao" ? (
          <FormLigacao
            clienteId={clienteId}
            grupos={grupos}
            onPronto={() => {
              onRegistrado?.();
              onFechar();
            }}
          />
        ) : (
          <FormReuniao
            clienteId={clienteId}
            pessoas={pessoas}
            onPronto={() => {
              onRegistrado?.();
              onFechar();
            }}
          />
        )}
      </div>
    </div>
  );
}

function FormLigacao({
  clienteId,
  grupos,
  onPronto,
}: {
  clienteId: string;
  grupos: readonly Grupo[];
  onPronto: () => void;
}) {
  const [assunto, setAssunto] = useState("");
  const [resumo, setResumo] = useState("");
  const [canal, setCanal] = useState("telefone");
  const [duracao, setDuracao] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [escopo, setEscopo] = useState<"individual" | "grupo">("individual");
  // Sem pré-seleção quando há mais de um grupo: o botão fica desabilitado até
  // a escolha. Pré-selecionar o primeiro é o mesmo erro de antes, com um
  // radio marcado por cima para parecer decisão de quem clicou.
  const [grupoId, setGrupoId] = useState<string>(() =>
    grupos.length === 1 ? grupos[0]!.id : "",
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const grupoEscolhido = grupos.find((g) => g.id === grupoId) ?? null;
  const faltaEscolherGrupo = escopo === "grupo" && !grupoEscolhido;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/backoffice/clientes/${clienteId}/registro-contato`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assunto: assunto.trim(),
          resumo: resumo.trim() || undefined,
          canal,
          duracaoMin: duracao ? Number(duracao) : undefined,
          data: new Date(`${data}T12:00:00`).toISOString(),
          escopo,
          grupoId: escopo === "grupo" ? grupoEscolhido?.id : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Não foi possível registrar");
        return;
      }
      onPronto();
    } catch {
      setErro("Falha de rede. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <Campo label="Assunto" id="lig-assunto">
        <input
          id="lig-assunto"
          type="text"
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          placeholder="ex.: aporte do 13º"
          className="w-full rounded border border-border bg-background px-2 py-1"
        />
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Quando" id="lig-data">
          <input
            id="lig-data"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1"
          />
        </Campo>
        <Campo label="Duração (min)" id="lig-duracao">
          <input
            id="lig-duracao"
            type="number"
            min={1}
            value={duracao}
            onChange={(e) => setDuracao(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1"
          />
        </Campo>
      </div>

      <Campo label="Canal" id="lig-canal">
        <select
          id="lig-canal"
          value={canal}
          onChange={(e) => setCanal(e.target.value)}
          className="w-full rounded border border-border bg-background px-2 py-1"
        >
          <option value="telefone">Telefone</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="videoconferencia">Videoconferência</option>
          <option value="presencial">Presencial</option>
        </select>
      </Campo>

      <Campo label="O que ficou combinado" id="lig-resumo">
        <textarea
          id="lig-resumo"
          rows={4}
          value={resumo}
          onChange={(e) => setResumo(e.target.value)}
          className="w-full rounded border border-border bg-background px-2 py-1"
        />
      </Campo>

      {grupos.length > 0 && (
        <EscopoGrupo
          nomeRadio="escopo-lig"
          grupos={grupos}
          escopo={escopo}
          grupoId={grupoId}
          onEscopo={setEscopo}
          onGrupo={setGrupoId}
        />
      )}

      {/* A ligação registra o contato e NÃO quita a cadência 12-4-2 — só
          reunião completa quita. Dito na tela para o operador não estranhar
          a data de próximo contato ficar onde estava. */}
      <p className="text-xs text-muted-foreground">
        Registra o contato. A cadência 12-4-2 só é quitada por reunião.
      </p>

      {erro && <p className="text-xs text-destructive">{erro}</p>}

      <button
        type="button"
        onClick={salvar}
        disabled={salvando || !assunto.trim() || faltaEscolherGrupo}
        className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
        Registrar ligação
      </button>
    </div>
  );
}

function FormReuniao({
  clienteId,
  pessoas,
  onPronto,
}: {
  clienteId: string;
  pessoas: readonly { id: string; nome: string }[];
  onPronto: () => void;
}) {
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [pessoaId, setPessoaId] = useState("");
  const [tipoCadencia, setTipoCadencia] = useState("");
  const [dataRetorno, setDataRetorno] = useState("");
  const [pautas, setPautas] = useState("");
  const [pendAssessor, setPendAssessor] = useState("");
  const [pendCliente, setPendCliente] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/backoffice/clientes/${clienteId}/registro-reuniao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: new Date(`${data}T12:00:00`).toISOString(),
          pessoaId: pessoaId || undefined,
          tipoCadencia: tipoCadencia || undefined,
          dataRetorno: dataRetorno ? new Date(`${dataRetorno}T12:00:00`).toISOString() : undefined,
          pautas: linhas(pautas),
          pendencias: { assessor: linhas(pendAssessor), cliente: linhas(pendCliente) },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErro(json.error ?? "Não foi possível registrar");
        return;
      }
      onPronto();
    } catch {
      setErro("Falha de rede. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Quando" id="reu-data">
          <input
            id="reu-data"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1"
          />
        </Campo>
        <Campo label="Volta em" id="reu-retorno">
          <input
            id="reu-retorno"
            type="date"
            value={dataRetorno}
            onChange={(e) => setDataRetorno(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1"
          />
        </Campo>
      </div>

      {pessoas.length > 0 && (
        <Campo label="Quem conduziu" id="reu-pessoa">
          <select
            id="reu-pessoa"
            value={pessoaId}
            onChange={(e) => setPessoaId(e.target.value)}
            className="w-full rounded border border-border bg-background px-2 py-1"
          >
            <option value="">—</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
      )}

      <Campo label="Tipo" id="reu-cadencia">
        <select
          id="reu-cadencia"
          value={tipoCadencia}
          onChange={(e) => setTipoCadencia(e.target.value)}
          className="w-full rounded border border-border bg-background px-2 py-1"
        >
          <option value="">—</option>
          <option value="primeira">Primeira reunião</option>
          <option value="trimestral">Trimestral</option>
          <option value="revisao-anual">Revisão anual</option>
        </select>
      </Campo>

      <Campo label="Pauta (uma por linha)" id="reu-pautas">
        <textarea
          id="reu-pautas"
          rows={3}
          value={pautas}
          onChange={(e) => setPautas(e.target.value)}
          className="w-full rounded border border-border bg-background px-2 py-1"
        />
      </Campo>

      {/* Pendências separadas por lado desde o formulário. Uma lista só faria
          "o que EU devo" e "o que ELE deve" virarem a mesma coisa — e o
          briefing da próxima reunião perde exatamente o que precisa cobrar. */}
      <Campo label="Fiquei de fazer (uma por linha)" id="reu-pend-assessor">
        <textarea
          id="reu-pend-assessor"
          rows={3}
          value={pendAssessor}
          onChange={(e) => setPendAssessor(e.target.value)}
          className="w-full rounded border border-border bg-background px-2 py-1"
        />
      </Campo>

      <Campo label="Ele ficou de mandar (uma por linha)" id="reu-pend-cliente">
        <textarea
          id="reu-pend-cliente"
          rows={3}
          value={pendCliente}
          onChange={(e) => setPendCliente(e.target.value)}
          className="w-full rounded border border-border bg-background px-2 py-1"
        />
      </Campo>

      {erro && <p className="text-xs text-destructive">{erro}</p>}

      <button
        type="button"
        onClick={salvar}
        disabled={salvando}
        className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
        Registrar reunião
      </button>
    </div>
  );
}

function Campo({
  label,
  id,
  children,
}: {
  label: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Textarea "uma por linha" → array, sem linhas vazias. */
function linhas(v: string): string[] {
  return v
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
