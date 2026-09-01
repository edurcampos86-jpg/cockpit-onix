"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Heart,
  FileText,
  CheckSquare,
  Target,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  Cake,
  Sparkles,
  ClipboardList,
  IdCard,
  Presentation,
  UserRound,
  NotebookPen,
  CalendarCheck,
} from "lucide-react";
import { ClienteFatosTab } from "./cliente-fatos-tab";
import {
  SeloOrigem,
  indexarProveniencias,
  type ProvenienciaView,
} from "./registro-rico/selo-origem";
import { PrepararReuniaoTab } from "./registro-rico/preparar-reuniao-tab";
import { RegistroDrawer } from "./registro-rico/registro-drawer";
import { campoDe } from "@/lib/clientes-registro/proveniencia";
import type { FatoView } from "@/lib/cockpit-reuniao/fatos-leitura";
import { ReferenciaLivro } from "./referencia-livro";
import { ComoFunciona } from "./como-funciona";
import {
  IconeGravacao,
  ReciboGravacao,
  rotuloGravacao,
  useGravacao,
} from "./recibo-gravacao";
import { apagar, gravarJson } from "@/lib/backoffice/gravacao";
import {
  CockpitReuniaoTab,
  type ReuniaoEstruturadaView,
} from "./cockpit-reuniao-tab";
import {
  REF_DESCOBERTA_PROFUNDA,
  REF_ONE_PAGE_PLAN,
  REF_CHECKLIST_ORGANIZACAO,
  REF_MAPA_METAS,
  REF_RCA,
} from "@/lib/backoffice/referencias";

interface Meta {
  id: string;
  titulo: string;
  descricao: string | null;
  prazoData: string | null;
  valorAlvo: number | null;
  status: string;
  categoria: string | null;
}

interface EventoVida {
  id: string;
  tipo: string;
  titulo: string;
  data: string;
  recorrente: boolean;
  notas: string | null;
}

interface Interacao {
  id: string;
  tipo: string;
  assunto: string;
  resumo: string | null;
  data: string;
  rcaNotas: string | null;
}

interface Cliente {
  id: string;
  nome: string;
  nomeCompleto: string | null;
  apelido: string | null;
  numeroConta: string;
  classificacao: string;
  saldo: number;
  saldoConta: number;
  receitaAnual: number;
  perfilEmocional: string | null;
  observacoes: string | null;
  perfilDescoberta: Record<string, string | null> | null;
  planoUmaPagina: Record<string, string | number | null> | null;
  checklist: Record<string, boolean | string | null> | null;
  metas: Meta[];
  eventosVida: EventoVida[];
  interacoes: Interacao[];
  // Cadastrais
  cpfCnpj: string | null;
  email: string | null;
  telefone: string | null;
  aniversario: string | Date | null;
  profissao: string | null;
  nicho: string | null;
  endereco: string | null;
  complemento: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  estadoCivil: string | null;
  genero: string | null;
  nacionalidade: string | null;
  cpfConjuge: string | null;
  tipoConta: string | null;
  // BTG / suitability / status
  perfilInvestidor: string | null;
  suitabilityValidoAte: string | Date | null;
  tipoInvestidor: string | null;
  faixaCliente: string | null;
  ativacaoConta: string | null;
  pendenciaCadastral: string | null;
  dataAberturaConta: string | Date | null;
  dataUltimaRevisaoCadastral: string | Date | null;
  dataProximaRevisaoCadastral: string | Date | null;
  idClienteBtg: string | null;
  // Assessor / escritório
  assessorNome: string | null;
  assessorCge: string | null;
  assessorEmail: string | null;
  tipoParceiro: string | null;
  escritorio: string | null;
  codigoEscritorio: string | null;
}

type Tab = "descoberta" | "cadastro" | "plano" | "checklist" | "metas" | "eventos" | "perfil" | "rca" | "cockpit-reuniao" | "fatos" | "preparar-reuniao";

/* Aba vinda da URL é entrada externa: só vale se for uma das que existem.
 * Sem esta trava, `?aba=qualquer-coisa` deixaria a ficha sem nenhuma aba
 * renderizada — tela em branco em vez de erro. */
const TABS_VALIDAS = new Set<Tab>([
  "descoberta", "cadastro", "plano", "checklist", "metas",
  "eventos", "perfil", "rca", "cockpit-reuniao", "fatos",
  // Aba nova precisa entrar AQUI também, não só em `TABS`. Esquecer não dá
  // erro: `?aba=preparar-reuniao` cai em Descoberta em silêncio, e quem mandou
  // o link acha que ele está quebrado sem nada indicar o motivo.
  "preparar-reuniao",
]);

const TABS: { id: Tab; label: string; icon: typeof Heart }[] = [
  { id: "descoberta", label: "Descoberta", icon: Heart },
  { id: "cadastro", label: "Cadastro", icon: IdCard },
  { id: "plano", label: "One-Page Plan", icon: FileText },
  { id: "checklist", label: "Organização", icon: CheckSquare },
  { id: "metas", label: "Metas de vida", icon: Target },
  { id: "eventos", label: "Eventos de vida", icon: Cake },
  { id: "perfil", label: "Perfil emocional", icon: Sparkles },
  { id: "rca", label: "RCA / Reuniões", icon: ClipboardList },
];

export function ClienteDetalhe({
  cliente: inicial,
  cockpitReuniao = false,
  perfilLeitura = false,
  registroRico = false,
  proveniencias = [],
  gruposDoCliente = [],
  reunioesEstruturadas = [],
  clienteFatos = [],
  pessoas = [],
  pessoasComLogin = [],
}: {
  cliente: Cliente;
  cockpitReuniao?: boolean;
  perfilLeitura?: boolean;
  /** Flag CLIENTES_REGISTRO_RICO. OFF → a ficha fica idêntica à de antes. */
  registroRico?: boolean;
  /** Selo de origem por campo. Vazio com a flag OFF — a page nem consulta. */
  proveniencias?: ProvenienciaView[];
  /** TODOS os grupos de atendimento da conta — uma conta pode estar em vários. */
  gruposDoCliente?: { id: string; nome: string; membrosQueRecebem: number }[];
  reunioesEstruturadas?: ReuniaoEstruturadaView[];
  clienteFatos?: FatoView[];
  pessoas?: { id: string; nome: string }[];
  pessoasComLogin?: { id: string; nome: string }[];
}) {
  /* Aba inicial vinda da URL. Existe para a ponte de /reunioes: o link de
   * "Levar para a ficha" precisa cair NA aba do Cockpit de Reunião, senão o
   * Eduardo chega na Descoberta e tem de procurar. `importarReuniao` carrega o
   * id da transcrição que o formulário vai pré-carregar. */
  const params = useSearchParams();
  const abaDaUrl = params.get("aba");
  const importarReuniao = params.get("importarReuniao");
  const [tab, setTab] = useState<Tab>(
    TABS_VALIDAS.has(abaDaUrl as Tab) ? (abaDaUrl as Tab) : "descoberta",
  );
  const [cliente, setCliente] = useState(inicial);
  const [drawerAberto, setDrawerAberto] = useState(false);

  // Index por endereço de campo: cada campo busca o próprio selo em O(1) em vez
  // de varrer a lista uma vez por campo renderizado.
  const selos = indexarProveniencias(proveniencias);

  // Cada flag OFF → aba correspondente some (tela byte-idêntica à de hoje).
  const tabs = [...TABS];
  if (perfilLeitura) tabs.push({ id: "fatos" as Tab, label: "Perfil", icon: UserRound });
  if (cockpitReuniao)
    tabs.push({ id: "cockpit-reuniao" as Tab, label: "Cockpit de Reunião", icon: Presentation });
  if (registroRico)
    tabs.push({ id: "preparar-reuniao" as Tab, label: "Preparar reunião", icon: CalendarCheck });

  return (
    <div className="space-y-4">
      {/* Registrar: fica ACIMA das abas de propósito. Registrar uma ligação não
          é "uma aba a mais" — é a ação que se faz assim que se desliga o
          telefone, e enterrá-la dentro de RCA é o motivo de ela não acontecer. */}
      {registroRico && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setDrawerAberto(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          >
            <NotebookPen className="h-4 w-4" aria-hidden />
            Registrar contato
          </button>
        </div>
      )}

      {registroRico && (
        <RegistroDrawer
          clienteId={cliente.id}
          clienteNome={cliente.nome}
          aberto={drawerAberto}
          grupos={gruposDoCliente}
          pessoas={pessoas}
          onFechar={() => setDrawerAberto(false)}
          // A ficha é server-rendered: depois de gravar, recarregar é o único
          // jeito honesto de a tela refletir contato, cadência e histórico —
          // remendar o estado local mostraria três números desatualizados.
          onRegistrado={() => window.location.reload()}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "descoberta" && (
        <DescobertaTab
          clienteId={cliente.id}
          selos={selos}
          inicial={cliente.perfilDescoberta}
          onSave={(p) => setCliente({ ...cliente, perfilDescoberta: p })}
        />
      )}
      {tab === "cadastro" && <CadastroTab cliente={cliente} />}
      {tab === "plano" && (
        <PlanoTab
          clienteId={cliente.id}
          inicial={cliente.planoUmaPagina}
          onSave={(p) => setCliente({ ...cliente, planoUmaPagina: p })}
        />
      )}
      {tab === "checklist" && (
        <ChecklistTab
          clienteId={cliente.id}
          inicial={cliente.checklist}
          onSave={(p) => setCliente({ ...cliente, checklist: p })}
        />
      )}
      {tab === "metas" && (
        <MetasTab
          clienteId={cliente.id}
          selos={selos}
          metas={cliente.metas}
          onChange={(metas) => setCliente({ ...cliente, metas })}
        />
      )}
      {tab === "eventos" && (
        <EventosTab
          clienteId={cliente.id}
          selos={selos}
          eventos={cliente.eventosVida}
          onChange={(ev) => setCliente({ ...cliente, eventosVida: ev })}
        />
      )}
      {tab === "perfil" && (
        <PerfilEmocionalTab
          clienteId={cliente.id}
          selos={selos}
          perfilEmocional={cliente.perfilEmocional}
          observacoes={cliente.observacoes}
          onSave={(p, o) =>
            setCliente({ ...cliente, perfilEmocional: p, observacoes: o })
          }
        />
      )}
      {tab === "rca" && (
        <RcaTab
          clienteId={cliente.id}
          interacoes={cliente.interacoes}
          onChange={(i) => setCliente({ ...cliente, interacoes: i })}
        />
      )}
      {tab === "fatos" && <ClienteFatosTab fatos={clienteFatos} />}
      {/* Travado pela flag, não só pela lista de botões. A aba inicial pode vir
          da URL (`?aba=`), então sem esta guarda `?aba=preparar-reuniao` com a
          flag OFF renderizaria a aba que a flag existe para esconder — a rota
          responderia 404 e a tela mostraria erro no lugar de nada. */}
      {registroRico && tab === "preparar-reuniao" && (
        <PrepararReuniaoTab clienteId={cliente.id} />
      )}
      {tab === "cockpit-reuniao" && (
        <CockpitReuniaoTab
          clienteId={cliente.id}
          importarReuniaoId={importarReuniao}
          cliente={cliente}
          interacoes={cliente.interacoes}
          metas={cliente.metas}
          eventos={cliente.eventosVida}
          perfilDescoberta={cliente.perfilDescoberta}
          planoUmaPagina={cliente.planoUmaPagina}
          reunioesEstruturadas={reunioesEstruturadas}
          pessoas={pessoas}
          pessoasComLogin={pessoasComLogin}
        />
      )}
    </div>
  );
}

// ============ CADASTRO ============

const moedaBR = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const formatarCpfCnpj = (doc: string): string => {
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc;
};

const formatarCep = (cep: string): string => {
  const d = cep.replace(/\D/g, "");
  if (d.length === 8) return d.replace(/(\d{5})(\d{3})/, "$1-$2");
  return cep;
};

const formatarTelefone = (tel: string): string => {
  const d = tel.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) {
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  }
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel;
};

const formatarData = (d: string | Date | null | undefined): string | null => {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("pt-BR");
};

function CadastroField({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-sm ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function CadastroSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
    </div>
  );
}

function CadastroTab({ cliente: c }: { cliente: Cliente }) {
  const enderecoLinha = [c.endereco, c.complemento].filter(Boolean).join(" — ") || null;
  const cidadeUf = [c.cidade, c.estado].filter(Boolean).join(" / ") || null;

  const temCadastro =
    c.cpfCnpj || c.email || c.telefone || c.aniversario || c.endereco || c.cidade;

  return (
    <div className="space-y-4">
      <ComoFunciona
        proposito="Snapshot completo dos dados cadastrais do cliente — vindo do BTG ou da última importação."
        comoUsar="Use para conferir CPF, contato, endereço e status antes de uma reunião ou para preencher formulários internos."
        comoAjuda="Centraliza tudo em um lugar — não precisa abrir o BTG nem a planilha pra checar um dado."
      />

      {!temCadastro && (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Nenhum dado cadastral importado ainda. Use <strong>Importar dados</strong> na lista de clientes.
        </div>
      )}

      {(c.cpfCnpj || c.email || c.telefone || c.aniversario || c.profissao || c.estadoCivil || c.genero || c.nacionalidade || c.tipoConta || c.cpfConjuge) && (
        <CadastroSection title="Identificação">
          {/* Apelido (manual), nome (Base BTG), nomeCompleto (Informacoes) — as 3
              fontes da identidade tripla. Exibidas separadamente pra o operador
              ver origem; uso programático passa por getNomeRelacionamento(). */}
          <CadastroField label="Apelido" value={c.apelido} />
          <CadastroField label="Nome (curto / Base BTG)" value={c.nome} />
          <CadastroField label="Nome completo (Informações)" value={c.nomeCompleto} />
          <CadastroField label="Conta" value={c.numeroConta} mono />
          <CadastroField label="Tipo de conta" value={c.tipoConta} />
          <CadastroField label="CPF / CNPJ" value={c.cpfCnpj ? formatarCpfCnpj(c.cpfCnpj) : null} mono />
          <CadastroField label="E-mail" value={c.email} />
          <CadastroField label="Telefone" value={c.telefone ? formatarTelefone(c.telefone) : null} />
          <CadastroField label="Aniversário" value={formatarData(c.aniversario)} />
          <CadastroField label="Profissão / Setor" value={c.profissao} />
          <CadastroField label="Nicho" value={c.nicho} />
          <CadastroField label="Estado civil" value={c.estadoCivil} />
          <CadastroField label="Gênero" value={c.genero} />
          <CadastroField label="Nacionalidade" value={c.nacionalidade} />
          <CadastroField label="CPF do cônjuge" value={c.cpfConjuge ? formatarCpfCnpj(c.cpfConjuge) : null} mono />
        </CadastroSection>
      )}

      {(enderecoLinha || cidadeUf || c.cep) && (
        <CadastroSection title="Endereço">
          {enderecoLinha && (
            <div className="sm:col-span-2 lg:col-span-3">
              <CadastroField label="Logradouro" value={enderecoLinha} />
            </div>
          )}
          <CadastroField label="Cidade / UF" value={cidadeUf} />
          <CadastroField label="CEP" value={c.cep ? formatarCep(c.cep) : null} mono />
        </CadastroSection>
      )}

      {(c.perfilInvestidor || c.suitabilityValidoAte || c.tipoInvestidor || c.faixaCliente || c.ativacaoConta || c.pendenciaCadastral || c.dataAberturaConta || c.dataUltimaRevisaoCadastral || c.dataProximaRevisaoCadastral || c.idClienteBtg) && (
        <CadastroSection title="Conta BTG e Suitability">
          <CadastroField label="Perfil de investidor" value={c.perfilInvestidor} />
          <CadastroField label="Suitability válido até" value={formatarData(c.suitabilityValidoAte)} />
          <CadastroField label="Tipo de investidor" value={c.tipoInvestidor} />
          <CadastroField label="Faixa de cliente" value={c.faixaCliente} />
          <CadastroField label="Ativação da conta" value={c.ativacaoConta} />
          <CadastroField label="Pendência cadastral" value={c.pendenciaCadastral} />
          <CadastroField label="Data de abertura da conta" value={formatarData(c.dataAberturaConta)} />
          <CadastroField label="Última revisão cadastral" value={formatarData(c.dataUltimaRevisaoCadastral)} />
          <CadastroField label="Próxima revisão cadastral" value={formatarData(c.dataProximaRevisaoCadastral)} />
          <CadastroField label="ID Cliente BTG" value={c.idClienteBtg} mono />
        </CadastroSection>
      )}

      <CadastroSection title="Posição financeira">
        <CadastroField label="AUM total" value={moedaBR(c.saldo)} mono />
        <CadastroField label="Saldo em conta" value={moedaBR(c.saldoConta)} mono />
        {/* Renda anual DECLARADA pelo cliente (Base BTG), não receita da Onix.
            Ver o bloco em performance-dashboard.tsx e field-source-policy.ts:54. */}
        <CadastroField label="Renda anual declarada" value={moedaBR(c.receitaAnual)} mono />
        <CadastroField label="Classificação ABC" value={c.classificacao} />
      </CadastroSection>

      {(c.assessorNome || c.assessorCge || c.assessorEmail || c.tipoParceiro || c.escritorio || c.codigoEscritorio) && (
        <CadastroSection title="Assessor e escritório">
          <CadastroField label="Assessor" value={c.assessorNome} />
          <CadastroField label="CGE do assessor" value={c.assessorCge} mono />
          <CadastroField label="E-mail do assessor" value={c.assessorEmail} />
          <CadastroField label="Tipo de parceiro" value={c.tipoParceiro} />
          <CadastroField label="Escritório" value={c.escritorio} />
          <CadastroField label="Código do escritório" value={c.codigoEscritorio} mono />
        </CadastroSection>
      )}
    </div>
  );
}

// ============ DESCOBERTA ============
const PERGUNTAS_DESCOBERTA: { campo: string; pergunta: string; placeholder: string }[] = [
  {
    campo: "valoresVida",
    pergunta: "O que mais importa na sua vida hoje?",
    placeholder: "Família, liberdade, propósito, segurança...",
  },
  {
    campo: "sonhos",
    pergunta: "Se dinheiro não fosse problema, o que você faria?",
    placeholder: "Sonhos, projetos, lugares, experiências...",
  },
  {
    campo: "medos",
    pergunta: "Qual é o seu maior medo financeiro?",
    placeholder: "Perder patrimônio, faltar para a família, depender de alguém...",
  },
  {
    campo: "legado",
    pergunta: "O que você gostaria de deixar para a próxima geração?",
    placeholder: "Patrimônio, valores, educação, oportunidades...",
  },
  {
    campo: "perguntaMagica",
    pergunta: "Se tudo desse certo, como seria sua vida daqui a 5 anos?",
    placeholder: "Visualize com detalhes — onde, com quem, fazendo o quê...",
  },
  {
    campo: "experienciaPrev",
    pergunta: "Qual sua experiência anterior com investimentos?",
    placeholder: "Boas e más experiências, lições aprendidas...",
  },
  {
    campo: "mentorReferencia",
    pergunta: "Quem você admira em termos financeiros e por quê?",
    placeholder: "Pode ser alguém da família, do mercado, um autor...",
  },
  {
    campo: "familiaSituacao",
    pergunta: "Como é a composição da sua família e dependentes?",
    placeholder: "Cônjuge, filhos, pais, dependentes financeiros...",
  },
];

function DescobertaTab({
  clienteId,
  selos,
  inicial,
  onSave,
}: {
  clienteId: string;
  /** Selo de origem por endereço de campo. Vazio com a flag OFF. */
  selos: Map<string, ProvenienciaView>;
  inicial: Cliente["perfilDescoberta"];
  onSave: (p: Cliente["perfilDescoberta"]) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    for (const p of PERGUNTAS_DESCOBERTA) f[p.campo] = (inicial?.[p.campo] as string) ?? "";
    f.linguagemPref = (inicial?.linguagemPref as string) ?? "";
    return f;
  });
  const gravacao = useGravacao();

  const salvar = async () => {
    const p = await gravacao.executar(() =>
      gravarJson<NonNullable<Cliente["perfilDescoberta"]>>(`/api/backoffice/clientes/${clienteId}/descoberta`, "PUT", form),
    );
    if (p !== null) onSave(p);
  };

  return (
    <div className="space-y-4">
      <ComoFunciona
        proposito="Roteiro de descoberta emocional para entender valores, medos, sonhos e história do cliente."
        comoUsar="Use na primeira reunião e revisite anualmente. Pergunte, escute e registre nas próprias palavras do cliente."
        comoAjuda="Conecta a relação no nível humano — clientes que se sentem entendidos não vão embora por preço."
      />
      <ReferenciaLivro
        referencias={REF_DESCOBERTA_PROFUNDA}
        titulo="Descoberta profunda — hemisfério direito (Storyselling)"
      />
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div>
          <h3 className="font-semibold">Questionário de descoberta profunda</h3>
          <p className="text-xs text-muted-foreground mt-1">
            As respostas são a base emocional do plano. Capture na linguagem do cliente.
          </p>
        </div>

        {PERGUNTAS_DESCOBERTA.map((p) => (
          <div key={p.campo}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <label className="text-sm font-medium">{p.pergunta}</label>
              <SeloOrigem proveniencia={selos.get(campoDe.descoberta(p.campo))} />
            </div>
            <textarea
              value={form[p.campo] ?? ""}
              onChange={(e) => setForm({ ...form, [p.campo]: e.target.value })}
              placeholder={p.placeholder}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
          </div>
        ))}

        <div>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <label className="text-sm font-medium">Linguagem preferida</label>
            <SeloOrigem proveniencia={selos.get(campoDe.descoberta("linguagemPref"))} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { id: "tecnica", label: "Técnica" },
              { id: "simples", label: "Simples" },
              { id: "visual", label: "Visual" },
              { id: "narrativa", label: "Narrativa" },
            ].map((l) => (
              <button
                key={l.id}
                onClick={() => setForm({ ...form, linguagemPref: l.id })}
                className={`px-3 py-2 rounded-lg border text-sm ${
                  form.linguagemPref === l.id
                    ? "border-primary bg-primary/10 font-semibold"
                    : "border-border"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <ReciboGravacao erro={gravacao.erro} aoFechar={gravacao.limpar} />
          <button
            onClick={salvar}
            disabled={gravacao.gravando}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            {gravacao.estado === "parado" ? (
              <Save className="h-4 w-4" />
            ) : (
              <IconeGravacao estado={gravacao.estado} />
            )}
            {rotuloGravacao(gravacao.estado, "Salvar descoberta")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ ONE-PAGE PLAN ============
function PlanoTab({
  clienteId,
  inicial,
  onSave,
}: {
  clienteId: string;
  inicial: Cliente["planoUmaPagina"];
  onSave: (p: Cliente["planoUmaPagina"]) => void;
}) {
  const [form, setForm] = useState({
    visaoFamiliar: (inicial?.visaoFamiliar as string) ?? "",
    objetivoPrincipal: (inicial?.objetivoPrincipal as string) ?? "",
    horizonteAnos: (inicial?.horizonteAnos as number) ?? "",
    perfilRisco: (inicial?.perfilRisco as string) ?? "",
    alocacaoAlvo: (inicial?.alocacaoAlvo as string) ?? "",
    riscosPrincipais: (inicial?.riscosPrincipais as string) ?? "",
    proximosPassos: (inicial?.proximosPassos as string) ?? "",
    resumoExecutivo: (inicial?.resumoExecutivo as string) ?? "",
  });
  const gravacao = useGravacao();

  const salvar = async () => {
    const p = await gravacao.executar(() =>
      gravarJson<NonNullable<Cliente["planoUmaPagina"]>>(`/api/backoffice/clientes/${clienteId}/plano`, "PUT", form),
    );
    if (p !== null) onSave(p);
  };

  return (
    <div className="space-y-4">
      <ComoFunciona
        proposito="Plano financeiro de uma página: estado atual, metas, gaps e ações combinadas com o cliente."
        comoUsar="Atualize após cada revisão. Imprima ou compartilhe — é o documento que o cliente leva para casa."
        comoAjuda="Dá clareza imediata ao cliente do 'onde estou × onde quero chegar' e ancora todas as próximas reuniões."
      />
      <ReferenciaLivro referencias={REF_ONE_PAGE_PLAN} titulo="One-Page Financial Plan (Supernova)" />

      {/* Visualização tipo "página única" */}
      <div className="rounded-xl border-2 border-primary/30 bg-card p-6 shadow-sm">
        <div className="text-center mb-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Plano em uma página
          </p>
          <h3 className="text-lg font-bold">Resumo executivo do cliente</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <Bloco label="Visão da família">{form.visaoFamiliar || "—"}</Bloco>
          <Bloco label="Objetivo principal">{form.objetivoPrincipal || "—"}</Bloco>
          <Bloco label="Horizonte">
            {form.horizonteAnos ? `${form.horizonteAnos} anos` : "—"}
          </Bloco>
          <Bloco label="Perfil de risco">{form.perfilRisco || "—"}</Bloco>
          <Bloco label="Alocação alvo">{form.alocacaoAlvo || "—"}</Bloco>
          <Bloco label="Riscos principais">{form.riscosPrincipais || "—"}</Bloco>
          <div className="md:col-span-2">
            <Bloco label="Próximos passos">{form.proximosPassos || "—"}</Bloco>
          </div>
          {form.resumoExecutivo && (
            <div className="md:col-span-2">
              <Bloco label="Resumo executivo">{form.resumoExecutivo}</Bloco>
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h3 className="font-semibold">Editar plano</h3>
        <Field label="Visão da família">
          <input
            type="text"
            value={form.visaoFamiliar}
            onChange={(e) => setForm({ ...form, visaoFamiliar: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </Field>
        <Field label="Objetivo principal">
          <input
            type="text"
            value={form.objetivoPrincipal}
            onChange={(e) => setForm({ ...form, objetivoPrincipal: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Horizonte (anos)">
            <input
              type="number"
              value={form.horizonteAnos}
              onChange={(e) => setForm({ ...form, horizonteAnos: e.target.value as unknown as number })}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
          </Field>
          <Field label="Perfil de risco">
            <select
              value={form.perfilRisco}
              onChange={(e) => setForm({ ...form, perfilRisco: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            >
              <option value="">Selecione...</option>
              <option value="conservador">Conservador</option>
              <option value="moderado">Moderado</option>
              <option value="arrojado">Arrojado</option>
            </select>
          </Field>
        </div>
        <Field label="Alocação alvo">
          <input
            type="text"
            value={form.alocacaoAlvo}
            onChange={(e) => setForm({ ...form, alocacaoAlvo: e.target.value })}
            placeholder="Ex: 60% RF / 30% RV / 10% alternativos"
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </Field>
        <Field label="Riscos principais">
          <textarea
            rows={2}
            value={form.riscosPrincipais}
            onChange={(e) => setForm({ ...form, riscosPrincipais: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </Field>
        <Field label="Próximos passos">
          <textarea
            rows={3}
            value={form.proximosPassos}
            onChange={(e) => setForm({ ...form, proximosPassos: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </Field>
        <Field label="Resumo executivo">
          <textarea
            rows={3}
            value={form.resumoExecutivo}
            onChange={(e) => setForm({ ...form, resumoExecutivo: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </Field>

        <div className="space-y-2">
          <ReciboGravacao erro={gravacao.erro} aoFechar={gravacao.limpar} />
          <button
            onClick={salvar}
            disabled={gravacao.gravando}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            {gravacao.estado === "parado" ? (
              <Save className="h-4 w-4" />
            ) : (
              <IconeGravacao estado={gravacao.estado} />
            )}
            {rotuloGravacao(gravacao.estado, "Salvar plano")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Bloco({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
        {label}
      </p>
      <p className="text-sm whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function Field({
  label,
  children,
  selo,
}: {
  label: string;
  children: React.ReactNode;
  /** Selo de origem, quando o campo tem proveniência. Opcional: as demais
   *  chamadas de `Field` continuam sem passar nada e renderizam como antes. */
  selo?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <label className="text-xs font-medium text-muted-foreground block">{label}</label>
        {selo}
      </div>
      {children}
    </div>
  );
}

// ============ CHECKLIST ============
const ITENS_CHECKLIST: { campo: string; titulo: string; descricao: string }[] = [
  { campo: "testamento", titulo: "Testamento atualizado", descricao: "Documento formal de vontade." },
  { campo: "seguroVida", titulo: "Seguro de vida adequado", descricao: "Cobertura compatível com dependentes e dívidas." },
  { campo: "planoSucessao", titulo: "Plano de sucessão patrimonial", descricao: "Holding, doação em vida, planejamento sucessório." },
  { campo: "reservaEmergencia", titulo: "Reserva de emergência (6+ meses)", descricao: "Liquidez imediata em caso de imprevistos." },
  { campo: "planoSaude", titulo: "Plano de saúde atualizado", descricao: "Cobertura familiar adequada à idade e necessidades." },
  { campo: "procuracao", titulo: "Procuração / diretivas", descricao: "Procuração para situações de incapacidade." },
  { campo: "inventarioBens", titulo: "Inventário de bens consolidado", descricao: "Lista completa de ativos, passivos e localização." },
  { campo: "beneficiariosAtual", titulo: "Beneficiários atualizados", descricao: "Em apólices, previdência, contas conjuntas." },
  { campo: "declaracaoIR", titulo: "Declaração de IR em dia", descricao: "Sem pendências, com bens declarados corretamente." },
  { campo: "planejamentoTributario", titulo: "Planejamento tributário ativo", descricao: "Estrutura otimizada conforme regime e patrimônio." },
];

function ChecklistTab({
  clienteId,
  inicial,
  onSave,
}: {
  clienteId: string;
  inicial: Cliente["checklist"];
  onSave: (p: Cliente["checklist"]) => void;
}) {
  const [estado, setEstado] = useState<Record<string, boolean>>(() => {
    const e: Record<string, boolean> = {};
    for (const i of ITENS_CHECKLIST) e[i.campo] = !!inicial?.[i.campo];
    return e;
  });
  const [notas, setNotas] = useState<string>((inicial?.notas as string) ?? "");
  const gravacao = useGravacao();

  const total = ITENS_CHECKLIST.length;
  const feitos = Object.values(estado).filter(Boolean).length;
  const pct = Math.round((feitos / total) * 100);

  const toggle = (campo: string) => setEstado({ ...estado, [campo]: !estado[campo] });

  const salvar = async () => {
    const p = await gravacao.executar(() =>
      gravarJson<NonNullable<Cliente["checklist"]>>(`/api/backoffice/clientes/${clienteId}/checklist`, "PUT", { ...estado, notas }),
    );
    if (p !== null) onSave(p);
  };

  return (
    <div className="space-y-4">
      <ComoFunciona
        proposito="Checklist da organização total da vida financeira do cliente: documentos, contas, seguros, sucessão."
        comoUsar="Marque o que já está em ordem, identifique gaps e abra tarefas para os pendentes."
        comoAjuda="Posiciona você como o orquestrador da vida financeira do cliente — não apenas mais um vendedor de produto."
      />
      <ReferenciaLivro
        referencias={REF_CHECKLIST_ORGANIZACAO}
        titulo="Organização total da vida financeira"
      />

      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Checklist de organização</h3>
            <p className="text-xs text-muted-foreground">
              {feitos} de {total} pilares cobertos
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold">{pct}%</p>
          </div>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden mb-6">
          <div
            className={`h-full transition-all ${
              pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="space-y-2">
          {ITENS_CHECKLIST.map((i) => (
            <button
              key={i.campo}
              onClick={() => toggle(i.campo)}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                estado[i.campo]
                  ? "border-green-300 bg-green-50 dark:bg-green-950/20 dark:border-green-900"
                  : "border-border hover:bg-muted/30"
              }`}
            >
              {estado[i.campo] ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${estado[i.campo] ? "line-through opacity-70" : ""}`}>
                  {i.titulo}
                </p>
                <p className="text-xs text-muted-foreground">{i.descricao}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Notas / pendências
          </label>
          <textarea
            rows={3}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Observações importantes sobre a organização do cliente..."
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </div>

        <div className="mt-4 space-y-2">
          <ReciboGravacao erro={gravacao.erro} aoFechar={gravacao.limpar} />
          <button
            onClick={salvar}
            disabled={gravacao.gravando}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            {gravacao.estado === "parado" ? (
              <Save className="h-4 w-4" />
            ) : (
              <IconeGravacao estado={gravacao.estado} />
            )}
            {rotuloGravacao(gravacao.estado, "Salvar checklist")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ METAS ============
function MetasTab({
  clienteId,
  selos,
  metas: iniciais,
  onChange,
}: {
  clienteId: string;
  selos: Map<string, ProvenienciaView>;
  metas: Meta[];
  onChange: (m: Meta[]) => void;
}) {
  const [metas, setMetas] = useState<Meta[]>(iniciais);
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    categoria: "",
    prazoData: "",
    valorAlvo: "",
  });

  const moeda = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

  const gravacao = useGravacao();

  const criar = async () => {
    if (!form.titulo.trim()) return;
    const nova = await gravacao.executar(() =>
      gravarJson<Meta>(`/api/backoffice/clientes/${clienteId}/metas`, "POST", {
        ...form,
        valorAlvo: form.valorAlvo ? Number(form.valorAlvo) : null,
        prazoData: form.prazoData || null,
      }),
    );
    if (nova === null) return;
    const novas = [nova, ...metas];
    setMetas(novas);
    onChange(novas);
    setForm({ titulo: "", descricao: "", categoria: "", prazoData: "", valorAlvo: "" });
    setCriando(false);
  };

  const remover = async (id: string) => {
    // Apagar meta é definitivo — não há `deletedAt` nesta tabela. Por isso a
    // falha PRECISA aparecer: some da tela sem ter sumido do banco é pior que
    // não sumir.
    const r = await gravacao.executar(() => apagar(`/api/backoffice/metas/${id}`));
    if (r === null) return;
    const novas = metas.filter((m) => m.id !== id);
    setMetas(novas);
    onChange(novas);
  };

  const togglarStatus = async (m: Meta) => {
    const novoStatus = m.status === "atingida" ? "ativa" : "atingida";
    const atualizada = await gravacao.executar(() =>
      gravarJson<Meta>(`/api/backoffice/metas/${m.id}`, "PATCH", { status: novoStatus }),
    );
    if (atualizada === null) return;
    const novas = metas.map((x) => (x.id === m.id ? atualizada : x));
    setMetas(novas);
    onChange(novas);
  };

  const corCategoria: Record<string, string> = {
    aposentadoria: "bg-blue-100 text-blue-900 border-blue-300",
    educacao: "bg-purple-100 text-purple-900 border-purple-300",
    imovel: "bg-amber-100 text-amber-900 border-amber-300",
    viagem: "bg-pink-100 text-pink-900 border-pink-300",
    outro: "bg-zinc-100 text-zinc-900 border-zinc-300",
  };

  return (
    <div className="space-y-4">
      <ComoFunciona
        proposito="Mapa visual das metas de vida do cliente — com prazo, valor e progresso de cada uma."
        comoUsar="Crie metas com o cliente, atualize o progresso a cada revisão e celebre quando uma é atingida."
        comoAjuda="Transforma dinheiro em vida real. O cliente vê o investimento conectado aos sonhos dele, não a um número."
      />
      <ReciboGravacao erro={gravacao.erro} aoFechar={gravacao.limpar} />
      <ReferenciaLivro referencias={REF_MAPA_METAS} titulo="Mapa de metas de vida (Storyselling + Supernova)" />

      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Metas de vida do cliente</h3>
            <p className="text-xs text-muted-foreground">
              {metas.length} {metas.length === 1 ? "meta" : "metas"} cadastradas
            </p>
          </div>
          <button
            onClick={() => setCriando(!criando)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            Nova meta
          </button>
        </div>

        {criando && (
          <div className="mb-4 p-4 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 space-y-3">
            <input
              type="text"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Título da meta (ex: Aposentar aos 60)"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
            <textarea
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder="Descrição / o sonho por trás da meta..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                className="px-3 py-2 rounded-lg border bg-background text-sm"
              >
                <option value="">Categoria...</option>
                <option value="aposentadoria">Aposentadoria</option>
                <option value="educacao">Educação</option>
                <option value="imovel">Imóvel</option>
                <option value="viagem">Viagem</option>
                <option value="outro">Outro</option>
              </select>
              <input
                type="date"
                value={form.prazoData}
                onChange={(e) => setForm({ ...form, prazoData: e.target.value })}
                className="px-3 py-2 rounded-lg border bg-background text-sm"
              />
              <input
                type="number"
                value={form.valorAlvo}
                onChange={(e) => setForm({ ...form, valorAlvo: e.target.value })}
                placeholder="Valor alvo (R$)"
                className="px-3 py-2 rounded-lg border bg-background text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={criar}
                disabled={!form.titulo.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                Salvar meta
              </button>
              <button
                onClick={() => setCriando(false)}
                className="px-4 py-2 rounded-lg border text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {metas.map((m) => {
            const cor = corCategoria[m.categoria ?? "outro"] ?? corCategoria.outro;
            const atingida = m.status === "atingida";
            return (
              <div
                key={m.id}
                className={`rounded-lg border-2 p-4 ${cor} ${atingida ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <p className={`font-semibold ${atingida ? "line-through" : ""}`}>{m.titulo}</p>
                    {m.descricao && <p className="text-xs mt-1 opacity-80">{m.descricao}</p>}
                    {/* Meta aceita de uma transcrição fica marcada. Sem isto, o
                        que a máquina ouviu de brincadeira vira meta de vida com
                        a mesma cara de meta acordada na reunião. */}
                    <SeloOrigem proveniencia={selos.get(campoDe.meta(m.id))} />
                  </div>
                  <button
                    onClick={() => remover(m.id)}
                    className="opacity-50 hover:opacity-100"
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-3 text-xs">
                  <div>
                    {m.prazoData && (
                      <span className="block">
                        Prazo: {new Date(m.prazoData).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                    {m.valorAlvo != null && (
                      <span className="font-mono font-semibold">{moeda(m.valorAlvo)}</span>
                    )}
                  </div>
                  <button
                    onClick={() => togglarStatus(m)}
                    className="px-2 py-1 rounded bg-white/60 dark:bg-black/30 font-medium"
                  >
                    {atingida ? "Reabrir" : "Marcar atingida"}
                  </button>
                </div>
              </div>
            );
          })}
          {metas.length === 0 && !criando && (
            <p className="md:col-span-2 text-center text-sm text-muted-foreground py-8">
              Nenhuma meta cadastrada. Clique em &quot;Nova meta&quot; para começar.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ EVENTOS DE VIDA ============
const TIPOS_EVENTO: { id: string; label: string }[] = [
  { id: "aniversario", label: "Aniversário" },
  { id: "casamento", label: "Casamento" },
  { id: "nascimento", label: "Nascimento" },
  { id: "formatura", label: "Formatura" },
  { id: "outro", label: "Outro" },
];

function EventosTab({
  clienteId,
  selos,
  eventos: iniciais,
  onChange,
}: {
  clienteId: string;
  selos: Map<string, ProvenienciaView>;
  eventos: EventoVida[];
  onChange: (e: EventoVida[]) => void;
}) {
  const [eventos, setEventos] = useState(iniciais);
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState({
    tipo: "aniversario",
    titulo: "",
    data: "",
    recorrente: true,
    notas: "",
  });

  const gravacao = useGravacao();

  const criar = async () => {
    if (!form.titulo.trim() || !form.data) return;
    const novo = await gravacao.executar(() =>
      gravarJson<EventoVida>(`/api/backoffice/clientes/${clienteId}/eventos`, "POST", form),
    );
    if (novo === null) return;
    const novos = [...eventos, novo].sort(
      (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime()
    );
    setEventos(novos);
    onChange(novos);
    setForm({ tipo: "aniversario", titulo: "", data: "", recorrente: true, notas: "" });
    setCriando(false);
  };

  const remover = async (id: string) => {
    const r = await gravacao.executar(() => apagar(`/api/backoffice/eventos/${id}`));
    if (r === null) return;
    const novos = eventos.filter((e) => e.id !== id);
    setEventos(novos);
    onChange(novos);
  };

  return (
    <div className="space-y-4">
      <ComoFunciona
        proposito="Linha do tempo dos eventos significativos da vida do cliente: aniversários, casamentos, nascimentos, conquistas."
        comoUsar="Cadastre eventos recorrentes (aniversários) e únicos (casamento de filho). Use para gestos personalizados."
        comoAjuda="Lembrar de detalhes da vida do cliente é o que diferencia um assessor Supernova de um vendedor de fundos."
      />
      <ReciboGravacao erro={gravacao.erro} aoFechar={gravacao.limpar} />
      <div className="rounded-xl border border-pink-200 bg-pink-50 dark:border-pink-900/50 dark:bg-pink-950/20 p-4">
        <p className="text-sm font-semibold text-pink-900 dark:text-pink-200 mb-1">
          Por que isso importa?
        </p>
        <p className="text-xs text-pink-800/80 dark:text-pink-300/80">
          Lembrar de aniversários, casamentos e nascimentos é o gesto mais barato e mais
          impactante de um assessor Supernova. O cliente A não se lembra do retorno do mês
          — ele se lembra de quem ligou no dia do filho dele.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Eventos de vida</h3>
          <button
            onClick={() => setCriando(!criando)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Novo evento
          </button>
        </div>

        {criando && (
          <div className="mb-4 p-4 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                className="px-3 py-2 rounded-lg border bg-background text-sm"
              >
                {TIPOS_EVENTO.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                className="px-3 py-2 rounded-lg border bg-background text-sm"
              />
            </div>
            <input
              type="text"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Título (ex: Aniversário do filho João)"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
            <textarea
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              placeholder="Notas..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.recorrente}
                onChange={(e) => setForm({ ...form, recorrente: e.target.checked })}
              />
              Recorrente (anual)
            </label>
            <div className="flex gap-2">
              <button
                onClick={criar}
                disabled={!form.titulo.trim() || !form.data}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                Salvar evento
              </button>
              <button onClick={() => setCriando(false)} className="px-4 py-2 rounded-lg border text-sm">
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {eventos.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20"
            >
              <div className="w-10 h-10 rounded-lg bg-pink-100 dark:bg-pink-950/30 flex items-center justify-center shrink-0">
                <Cake className="h-5 w-5 text-pink-600 dark:text-pink-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold">{e.titulo}</p>
                  <SeloOrigem proveniencia={selos.get(campoDe.eventoVida(e.id))} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(e.data).toLocaleDateString("pt-BR")} ·{" "}
                  {TIPOS_EVENTO.find((t) => t.id === e.tipo)?.label ?? e.tipo}
                  {e.recorrente && " · anual"}
                </p>
                {e.notas && <p className="text-xs text-muted-foreground mt-1">{e.notas}</p>}
              </div>
              <button onClick={() => remover(e.id)} className="opacity-50 hover:opacity-100">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {eventos.length === 0 && !criando && (
            <p className="text-center text-sm text-muted-foreground py-6">
              Nenhum evento cadastrado.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ PERFIL EMOCIONAL ============
function PerfilEmocionalTab({
  clienteId,
  selos,
  perfilEmocional: pInicial,
  observacoes: oInicial,
  onSave,
}: {
  clienteId: string;
  selos: Map<string, ProvenienciaView>;
  perfilEmocional: string | null;
  observacoes: string | null;
  onSave: (p: string | null, o: string | null) => void;
}) {
  const [perfil, setPerfil] = useState(pInicial ?? "");
  const [obs, setObs] = useState(oInicial ?? "");
  const gravacao = useGravacao();

  const salvar = async () => {
    const r = await gravacao.executar(() =>
      gravarJson<unknown>(`/api/backoffice/clientes/${clienteId}`, "PATCH", {
        perfilEmocional: perfil,
        observacoes: obs,
      }),
    );
    if (r !== null) onSave(perfil, obs);
  };

  return (
    <div className="space-y-4">
      <ComoFunciona
        proposito="Notas sobre o perfil emocional do cliente: como ele toma decisões, como reage a perdas, qual a linguagem dele."
        comoUsar="Anote observações após cada interação. Releia antes da próxima reunião para se sintonizar."
        comoAjuda="Permite adaptar a comunicação ao estilo do cliente — racional, emocional, visual, narrativo."
      />
      <div className="rounded-xl border border-purple-200 bg-purple-50 dark:border-purple-900/50 dark:bg-purple-950/20 p-4">
        <p className="text-sm font-semibold text-purple-900 dark:text-purple-200 mb-1">
          Perfil emocional (Storyselling)
        </p>
        <p className="text-xs text-purple-800/80 dark:text-purple-300/80">
          Capture aqui a forma como o cliente fala, os medos que ele admite, os sonhos que
          ilumina os olhos dele. É a base para escolher a analogia certa em cada conversa.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <Field
          label="Perfil emocional / linguagem do cliente"
          selo={<SeloOrigem proveniencia={selos.get(campoDe.cliente("perfilEmocional"))} />}
        >
          <textarea
            rows={5}
            value={perfil}
            onChange={(e) => setPerfil(e.target.value)}
            placeholder="Como ele fala? O que o emociona? Que palavras ele usa? Que metáforas funcionam?"
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </Field>
        <Field
          label="Observações gerais"
          selo={<SeloOrigem proveniencia={selos.get(campoDe.cliente("observacoes"))} />}
        >
          <textarea
            rows={4}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Hobbies, time, família, restrições, preferências de contato..."
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </Field>
        <div className="space-y-2">
          <ReciboGravacao erro={gravacao.erro} aoFechar={gravacao.limpar} />
          <button
            onClick={salvar}
            disabled={gravacao.gravando}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
          >
            {gravacao.estado === "parado" ? (
              <Save className="h-4 w-4" />
            ) : (
              <IconeGravacao estado={gravacao.estado} />
            )}
            {rotuloGravacao(gravacao.estado, "Salvar perfil")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ RCA / REUNIÕES ============
const RCA_ROTEIRO = [
  "1. Mudanças de vida desde o último contato",
  "2. Revisão de metas (atingidas, ajustadas, novas)",
  "3. Performance da carteira vs. objetivo",
  "4. Eventos de mercado relevantes para o cliente",
  "5. Pendências de organização (checklist)",
  "6. Indicações que ele queira fazer",
  "7. Próximos passos e data do próximo contato",
];

function RcaTab({
  clienteId,
  interacoes: iniciais,
  onChange,
}: {
  clienteId: string;
  interacoes: Interacao[];
  onChange: (i: Interacao[]) => void;
}) {
  const [interacoes, setInteracoes] = useState(iniciais);
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState({
    tipo: "reuniao",
    assunto: "",
    resumo: "",
    rcaNotas: "",
  });

  const gravacao = useGravacao();

  const criar = async () => {
    if (!form.assunto.trim()) return;
    const nova = await gravacao.executar(() =>
      gravarJson<Interacao>(`/api/backoffice/clientes/${clienteId}/interacoes`, "POST", form),
    );
    if (nova === null) return;
    const novas = [nova, ...interacoes];
    setInteracoes(novas);
    onChange(novas);
    setForm({ tipo: "reuniao", assunto: "", resumo: "", rcaNotas: "" });
    setCriando(false);
  };

  return (
    <div className="space-y-4">
      <ComoFunciona
        proposito="Roteiro de 7 pontos do Rapid Client Assessment para conduzir reuniões de revisão Supernova."
        comoUsar="Antes da reunião, abra o RCA e siga os 7 itens. Anote as respostas e gere ações de follow-up."
        comoAjuda="Padroniza a qualidade das revisões e garante que nada importante seja esquecido na conversa."
      />
      <ReciboGravacao erro={gravacao.erro} aoFechar={gravacao.limpar} />
      <ReferenciaLivro referencias={REF_RCA} titulo="Rapid Client Assessment (RCA) — Supernova" />

      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Roteiro RCA padrão</h3>
            <p className="text-xs text-muted-foreground">
              Use este roteiro nas reuniões trimestrais com clientes A.
            </p>
          </div>
          <button
            onClick={() => setCriando(!criando)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Novo RCA
          </button>
        </div>

        <ol className="space-y-1.5 mb-4">
          {RCA_ROTEIRO.map((item, i) => (
            <li key={i} className="text-sm text-muted-foreground">
              {item}
            </li>
          ))}
        </ol>

        {criando && (
          <div className="p-4 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 space-y-3 mb-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "ligacao", label: "Ligação" },
                { id: "reuniao", label: "Reunião" },
                { id: "revisao", label: "Revisão" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setForm({ ...form, tipo: t.id })}
                  className={`px-3 py-2 rounded-lg border text-sm ${
                    form.tipo === t.id
                      ? "border-primary bg-primary/10 font-semibold"
                      : "border-border"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={form.assunto}
              onChange={(e) => setForm({ ...form, assunto: e.target.value })}
              placeholder="Assunto (ex: RCA Q2 2026)"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm font-semibold"
            />
            <textarea
              value={form.rcaNotas}
              onChange={(e) => setForm({ ...form, rcaNotas: e.target.value })}
              placeholder="Notas estruturadas seguindo o roteiro RCA acima..."
              rows={6}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm font-mono"
            />
            <textarea
              value={form.resumo}
              onChange={(e) => setForm({ ...form, resumo: e.target.value })}
              placeholder="Resumo executivo (1-2 frases)"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={criar}
                disabled={!form.assunto.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                Registrar
              </button>
              <button
                onClick={() => setCriando(false)}
                className="px-4 py-2 rounded-lg border text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-4">Histórico de contatos ({interacoes.length})</h3>
        <div className="space-y-3">
          {interacoes.map((i) => (
            <div key={i.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold">{i.assunto}</p>
                <span className="text-xs text-muted-foreground">
                  {new Date(i.data).toLocaleDateString("pt-BR")} · {i.tipo}
                </span>
              </div>
              {i.resumo && <p className="text-xs text-muted-foreground mb-2">{i.resumo}</p>}
              {i.rcaNotas && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-primary">Ver notas RCA</summary>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-xs bg-muted/30 p-2 rounded">
                    {i.rcaNotas}
                  </pre>
                </details>
              )}
            </div>
          ))}
          {interacoes.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">
              Nenhum contato registrado ainda.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
