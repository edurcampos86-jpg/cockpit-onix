"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CircleDashed,
  Database,
  HardDrive,
  History,
  Loader2,
  Lock,
  ShieldQuestion,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EstadoFlag, MudancaFlag } from "@/lib/flags/estado";
import {
  EXPECTED_FLAGS_ON_KEY,
  compararComLista,
  type ComparacaoEsperado,
} from "@/lib/flags/esperadas";
import { chavesLigadasDe } from "@/lib/flags/ligadas";
import {
  flagAlternavel,
  flagLigada,
  intencaoProvavel,
  valoresAceitos,
} from "@/lib/flags/registro";

type DetalheHistorico = {
  key: string;
  carregando: boolean;
  mudancas: MudancaFlag[];
  truncado: boolean;
  erro: string | null;
};

/* ──────────────────────────────────────────────────────────────
 * Tabela de flags com toggle.
 *
 * Flags de `impacto: "alto"` passam por um diálogo que mostra o `aviso` do
 * registro antes de gravar. As de gate de UI viram direto: liga, olha,
 * desliga — nada aconteceu no meio.
 *
 * O estado vem do servidor e é substituído pela resposta do POST, que devolve
 * TODAS as flags recalculadas. Nada de otimismo local: se a escrita não pegar
 * (env com precedência, erro no banco), a chave volta sozinha para onde estava
 * em vez de mostrar um estado que não existe.
 * ────────────────────────────────────────────────────────────── */

export function FlagsTabela({
  flagsIniciais,
  esperado,
  historicoInicial,
}: {
  flagsIniciais: EstadoFlag[];
  esperado: ComparacaoEsperado;
  historicoInicial: MudancaFlag[];
}) {
  const router = useRouter();
  const [flags, setFlags] = useState(flagsIniciais);
  const [historico, setHistorico] = useState(historicoInicial);
  const [gravando, setGravando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<{ flag: EstadoFlag; ligar: boolean } | null>(null);
  const [detalhe, setDetalhe] = useState<DetalheHistorico | null>(null);
  const [, startTransition] = useTransition();

  /** Abre o histórico completo de uma chave. Busca sob demanda: carregar o
   *  histórico das 18 no load da tela seria pagar por dado que quase nunca é
   *  olhado. */
  async function abrirHistorico(key: string) {
    setDetalhe({ key, carregando: true, mudancas: [], truncado: false, erro: null });
    try {
      const resposta = await fetch(
        `/api/configuracoes/flags/${encodeURIComponent(key)}/historico`,
      );
      if (!resposta.ok) {
        setDetalhe({
          key,
          carregando: false,
          mudancas: [],
          truncado: false,
          erro: `Não deu para carregar (${resposta.status}).`,
        });
        return;
      }
      const dados = (await resposta.json()) as { mudancas: MudancaFlag[]; truncado: boolean };
      setDetalhe({ key, carregando: false, ...dados, erro: null });
    } catch (e) {
      setDetalhe({
        key,
        carregando: false,
        mudancas: [],
        truncado: false,
        erro: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function gravar(key: string, ligar: boolean) {
    setGravando(key);
    setErro(null);
    try {
      const resposta = await fetch("/api/configuracoes/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, ligada: ligar }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        setErro(`Não deu para gravar ${key}: ${corpo.error ?? resposta.status}`);
        return;
      }
      const { flags: atualizadas, historico: novoHistorico } = (await resposta.json()) as {
        flags: EstadoFlag[];
        historico: MudancaFlag[];
      };
      setFlags(atualizadas);
      setHistorico(novoHistorico);
      // As telas gateadas por flag são server components — sem o refresh, o
      // resto do app continua renderizado com a configuração antiga.
      startTransition(() => router.refresh());
    } catch (e) {
      setErro(`Falha de rede ao gravar ${key}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGravando(null);
    }
  }

  function aoVirar(flag: EstadoFlag, ligar: boolean) {
    if (flag.impacto === "alto") {
      setConfirmando({ flag, ligar });
      return;
    }
    void gravar(flag.key, ligar);
  }

  const booleanas = flags.filter((f) => f.tipo === "booleana");
  const valores = flags.filter((f) => f.tipo === "valor");

  /* Recalcula a cada toggle. A comparação chega pronta do servidor, mas
   * envelhece assim que o usuário vira uma chave — e um aviso que não acompanha
   * a própria ação seria pior que nenhum. A lista ESPERADA é que é fixa. */
  const divergencia = compararComLista(chavesLigadasDe(flags), esperado.esperadas);
  const foraDoEsperado = new Set([...divergencia.faltando, ...divergencia.sobrando]);

  return (
    <div className="space-y-8">
      {erro && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {erro}
        </p>
      )}

      <AvisoSmoke comparacao={divergencia} />

      <Historico mudancas={historico} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          Liga/desliga <span className="text-muted-foreground">({booleanas.length})</span>
        </h2>
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {booleanas.map((flag) => (
            <LinhaFlag
              key={flag.key}
              flag={flag}
              gravando={gravando === flag.key}
              desabilitado={gravando !== null}
              foraDoEsperado={foraDoEsperado.has(flag.key)}
              aoVirar={(ligar) => aoVirar(flag, ligar)}
              aoAbrirHistorico={() => void abrirHistorico(flag.key)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          Ajustes de valor <span className="text-muted-foreground">({valores.length})</span>
        </h2>
        {/* Só leitura: são números, não interruptores. Gravar "1" aqui mudaria
          * o teto de vácuo para 1 dia em vez de "ligar" coisa nenhuma — a rota
          * de escrita recusa estas chaves de propósito. */}
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {valores.map((flag) => (
            <div key={flag.key} className="flex items-center justify-between gap-4 bg-card px-4 py-3">
              <div className="min-w-0">
                <ChaveClicavel chave={flag.key} aoClicar={() => void abrirHistorico(flag.key)} />
                <p className="mt-0.5 text-xs text-muted-foreground">{flag.rotulo}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <code className="rounded bg-secondary px-2 py-1 text-xs text-foreground">
                  {flag.valor ?? "padrão"}
                </code>
                <Origem flag={flag} />
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Ajuste de valor continua sendo por banco — a tela não edita número.
        </p>
      </section>

      <Dialog
        open={confirmando !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setConfirmando(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              {confirmando?.ligar ? "Ligar" : "Desligar"} {confirmando?.flag.key}?
            </DialogTitle>
            <DialogDescription className="space-y-2 text-left">
              <span className="block">{confirmando?.flag.aviso}</span>
              <span className="block text-muted-foreground">
                Vale imediatamente, sem redeploy, e fica registrado no log do servidor.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmando(null)}>
              Cancelar
            </Button>
            <Button
              variant={confirmando?.ligar ? "default" : "outline"}
              onClick={() => {
                if (!confirmando) return;
                const { flag, ligar } = confirmando;
                setConfirmando(null);
                void gravar(flag.key, ligar);
              }}
            >
              {confirmando?.ligar ? "Ligar mesmo assim" : "Desligar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DialogoHistorico detalhe={detalhe} aoFechar={() => setDetalhe(null)} />
    </div>
  );
}

/**
 * A chave da flag, clicável para abrir o histórico dela.
 *
 * Botão de verdade (não `<div onClick>`) para chegar por teclado — a tela é
 * administrativa e quem investiga costuma navegar assim.
 */
function ChaveClicavel({ chave, aoClicar }: { chave: string; aoClicar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className="rounded font-mono text-xs font-semibold text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`Ver o histórico de ${chave}`}
    >
      {chave}
    </button>
  );
}

/** Histórico completo de UMA flag, sob demanda. */
function DialogoHistorico({
  detalhe,
  aoFechar,
}: {
  detalhe: DetalheHistorico | null;
  aoFechar: () => void;
}) {
  return (
    <Dialog
      open={detalhe !== null}
      onOpenChange={(aberto) => {
        if (!aberto) aoFechar();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-sm">{detalhe?.key}</span>
          </DialogTitle>
          <DialogDescription>
            Todas as mudanças registradas desta flag, da mais recente para a mais antiga.
          </DialogDescription>
        </DialogHeader>

        {detalhe?.carregando && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </p>
        )}

        {detalhe?.erro && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {detalhe.erro}
          </p>
        )}

        {detalhe && !detalhe.carregando && !detalhe.erro && (
          <>
            {detalhe.mudancas.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                Esta flag nunca foi mudada pela tela. Se o valor dela não é o padrão, veio do
                banco direto ou de variável de ambiente — nos dois casos não há registro de
                autor.
              </p>
            ) : (
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {detalhe.mudancas.map((m, i) => (
                  <div
                    key={`${m.quando}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-border px-3 py-2"
                  >
                    <span className="text-xs text-muted-foreground">
                      <ValorAuditado chave={m.key} valor={m.de} /> →{" "}
                      <ValorAuditado chave={m.key} valor={m.para} destacado />
                    </span>
                    <span className="text-[0.7rem] text-muted-foreground">
                      {m.quemEmail ?? "autor não registrado"} · {formatarQuando(m.quando)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {detalhe.truncado && (
              <p className="text-xs text-muted-foreground">
                Mostrando as mais recentes — há mais histórico além destas.
              </p>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={aoFechar}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** dd/mm/aa hh:mm — formato curto, o mesmo usado na coluna de cada linha. */
function formatarQuando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Últimas mudanças registradas em `ConfigAudit`.
 *
 * A tabela já gravava, mas só se lia por `psql` — o mesmo problema que a tela
 * resolveu para o estado atual. Cinco linhas bastam: quem opera quer saber "o
 * que mexeram agora há pouco", não auditar o ano.
 *
 * Vazio não é erro: é o estado de quem nunca mudou flag pela tela, e o texto
 * diz isso em vez de sumir — sumir faria parecer que o registro não existe.
 */
/**
 * Um valor da trilha, com o efeito dele anotado ao lado.
 *
 * ── POR QUE O VALOR CRU NÃO BASTA ────────────────────────────────────────
 * O histórico guarda o que foi gravado, e o que foi gravado nem sempre se lê.
 * Existem DOIS dialetos de booleano no código (`registro.ts`): o amplo aceita
 * `1 | true | on | yes | sim`, o estrito só `1 | true | on`. Nas 4 flags
 * estritas, `sim` está DESLIGADA — e não há como saber isso olhando a linha.
 *
 * `flagLigada` é a mesma função que o resto do app usa para decidir, e recebe
 * o dialeto da própria flag. A anotação não é interpretação da tela: é o
 * veredito do runtime, exibido.
 *
 * Só anota flag BOOLEANA. `flagAlternavel` devolve `null` para as de valor
 * (`LIMIAR_VACUO_DIAS` é um número), e ali "(ON)" seria invenção. Chave fora
 * do registro — mudança antiga de flag já removida — cai no mesmo caminho e
 * aparece crua, que é o honesto.
 */
function ValorAuditado({
  chave,
  valor,
  destacado = false,
}: {
  chave: string;
  valor: string | null;
  destacado?: boolean;
}) {
  const flag = flagAlternavel(chave);
  const rotulo = valor ?? "ausente";

  return (
    <>
      <code className={cn(destacado && "font-semibold text-foreground")}>{rotulo}</code>
      {flag && (
        /* Ausente também é anotado: o default de TODAS é OFF, e dizer isso
         * fecha a leitura em vez de deixar o leitor deduzir. */
        <span className="ml-1 text-[0.65rem] font-medium uppercase tracking-wide">
          ({flagLigada(valor ?? undefined, flag.dialeto) ? "on" : "off"})
        </span>
      )}
    </>
  );
}

/**
 * Lacuna a partir da qual duas mudanças deixam de ser "a mesma virada".
 *
 * Cinco minutos, escolhido pelo comportamento real de quem opera: virar 3 ou 4
 * chaves durante um incidente acontece em segundos, uma atrás da outra. O que
 * separa dois EPISÓDIOS é o intervalo entre eles, não a data — duas mudanças do
 * mesmo dia às 09h e às 17h não têm relação nenhuma, e a lista as encosta.
 */
const LACUNA_EPISODIO_MS = 5 * 60_000;

/**
 * Lacuna em prosa curta. Recebe ms, nunca `Date.now()` — ver `Historico`.
 *
 * "ANTES", não "depois": a lista desce do mais recente para o mais antigo, e o
 * separador fica logo ACIMA do episódio mais velho. Quem lê descendo está
 * andando para trás no tempo. A primeira versão dizia "3 h depois" e foi
 * pega na validação ao vivo — o texto contava a história ao contrário.
 */
function descreverLacuna(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min antes`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h antes`;
  const d = Math.round(h / 24);
  return `${d} ${d === 1 ? "dia" : "dias"} antes`;
}

/**
 * A trilha, agrupada por EPISÓDIO.
 *
 * A lista vem do mais recente para o mais antigo e mistura todas as flags. Numa
 * virada de incidente com 3 ou 4 chaves seguidas isso vira uma coluna só, e
 * quem lê depois não consegue ver o que aconteceu NAQUELE minuto — que é
 * exatamente a pergunta de quem abre esta tela durante um incidente.
 *
 * O separador só aparece onde há lacuna real. Sem lacuna, a lista continua
 * corrida: agrupar tudo criaria caixinhas de um item e pioraria a leitura.
 *
 * SEM `Date.now()`: a lacuna é a diferença entre dois carimbos FIXOS, igual no
 * servidor e no cliente. Escrever "há 2 horas" exigiria a hora atual e o texto
 * divergiria entre o HTML renderizado e a primeira pintura no browser.
 */
function Historico({ mudancas }: { mudancas: MudancaFlag[] }) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <History className="h-4 w-4 text-muted-foreground" />
        Últimas mudanças
      </h2>
      {mudancas.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma mudança registrada ainda. Toda vez que uma flag for virada por aqui, a
          linha aparece nesta lista.
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {mudancas.map((m, i) => {
            // Lista do mais recente para o mais antigo: a anterior NA TELA é a
            // seguinte no tempo, então a lacuna se mede contra `i - 1`.
            const maisRecente = i > 0 ? mudancas[i - 1] : null;
            const lacuna = maisRecente
              ? new Date(maisRecente.quando).getTime() - new Date(m.quando).getTime()
              : 0;
            const separa = lacuna > LACUNA_EPISODIO_MS;

            return (
              <div key={`${m.key}-${m.quando}`}>
                {separa && (
                  <div
                    className="flex items-center gap-2 bg-muted/40 px-4 py-1"
                    aria-hidden="true"
                  >
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">
                      {descreverLacuna(lacuna)}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-card px-4 py-2.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <code className="text-xs font-semibold text-foreground">{m.key}</code>
                    <span className="text-xs text-muted-foreground">
                      <ValorAuditado chave={m.key} valor={m.de} /> →{" "}
                      <ValorAuditado chave={m.key} valor={m.para} destacado />
                    </span>
                  </div>
                  <span className="text-[0.7rem] text-muted-foreground">
                    {m.quemEmail ?? "autor não registrado"} · {formatarQuando(m.quando)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * Aviso de divergência com o que o smoke pós-deploy espera.
 *
 * SÓ LEITURA, de propósito: não oferece atualizar a variável. A expectativa
 * mora no GitHub (Settings → Variables), FORA do ambiente auditado — se a tela
 * pudesse mudá-la, quem alterasse a config alteraria a expectativa junto e o
 * smoke deixaria de provar qualquer coisa. Aqui só se avisa.
 *
 * O que a tela lê é a CÓPIA da variável no env deste ambiente. Por isso o texto
 * diz de onde veio: as duas podem sair de sincronia, e apresentar isto como
 * verdade absoluta seria mentir com confiança.
 */
function AvisoSmoke({ comparacao }: { comparacao: ComparacaoEsperado }) {
  if (comparacao.esperadas === null) {
    return (
      <p className="text-xs text-muted-foreground">
        <code className="rounded bg-secondary px-1.5 py-0.5">{EXPECTED_FLAGS_ON_KEY}</code>{" "}
        não está definida neste ambiente — o smoke pós-deploy só registra a configuração,
        sem cobrar nada dela.
      </p>
    );
  }

  if (!comparacao.diverge) {
    return (
      <p className="text-xs text-muted-foreground">
        Configuração confere com o que o smoke espera (
        <code className="rounded bg-secondary px-1.5 py-0.5">{EXPECTED_FLAGS_ON_KEY}</code>).
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ShieldQuestion className="h-4 w-4 text-primary" />
        Diverge do que o smoke pós-deploy espera
      </p>
      {comparacao.sobrando.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Ligadas sem estar na lista:</strong>{" "}
          <code className="text-foreground">{comparacao.sobrando.join(", ")}</code>
        </p>
      )}
      {comparacao.faltando.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Esperadas e desligadas:</strong>{" "}
          <code className="text-foreground">{comparacao.faltando.join(", ")}</code>
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Enquanto durar, o smoke fica vermelho e abre issue de incidente a cada
        execução. Ajustar a expectativa é manual, no GitHub (Settings → Variables →{" "}
        <code className="rounded bg-secondary px-1 py-0.5">{EXPECTED_FLAGS_ON_KEY}</code>) — a
        tela não mexe nisso de propósito, porque a expectativa precisa viver fora do
        ambiente que ela audita.
      </p>
    </div>
  );
}

function LinhaFlag({
  flag,
  gravando,
  desabilitado,
  foraDoEsperado,
  aoVirar,
  aoAbrirHistorico,
}: {
  flag: EstadoFlag;
  gravando: boolean;
  desabilitado: boolean;
  foraDoEsperado: boolean;
  aoVirar: (ligar: boolean) => void;
  aoAbrirHistorico: () => void;
}) {
  const travadoPorEnv = flag.origem === "env";

  /* Para que lado o selo conserta, ou `null` se ele não deve agir. Origem `env`
   * zera a ação mesmo com intenção clara: gravar no banco por cima de uma flag
   * que vive no ambiente cria a segunda fonte que o toggle travado impede. */
  const acaoDoSelo =
    flag.valorNaoReconhecido && !travadoPorEnv
      ? intencaoProvavel(flag.valor ?? undefined, flag.dialeto ?? "amplo")
      : null;

  return (
    <div className="flex items-center justify-between gap-4 bg-card px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <ChaveClicavel chave={flag.key} aoClicar={aoAbrirHistorico} />
          {flag.impacto === "alto" && (
            <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 px-1.5 py-px text-[0.6rem] font-medium uppercase tracking-wide text-destructive">
              <AlertTriangle className="h-2.5 w-2.5" />
              Efeito pesado
            </span>
          )}
          {foraDoEsperado && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/50 px-1.5 py-px text-[0.6rem] font-medium uppercase tracking-wide text-primary">
              <ShieldQuestion className="h-2.5 w-2.5" />
              Diverge do smoke
            </span>
          )}
          {/* O selo mais alto da linha, e de propósito: os outros dois avisam
            * sobre o que a flag FAZ; este avisa que ela não faz o que quem
            * gravou achou que fazia. Leva o valor no rótulo porque é o valor —
            * não a chave — que precisa ser corrigido.
            *
            * ── CLICÁVEL, quando dá para saber a intenção ──────────────────
            * O selo dispara `aoVirar`, o MESMO caminho do switch. Isso importa:
            * flag de efeito pesado continua passando pelo diálogo de "tem
            * certeza", com o aviso próprio dela. O atalho pula a NAVEGAÇÃO até
            * o controle (achar a linha, ler o tooltip, mirar o switch), nunca a
            * confirmação.
            *
            * NÃO é clicável em dois casos, e os dois são deliberados:
            *   • intenção ambíguo (`tru`, `2`) — um clique para o lado errado
            *     numa flag que abre escrita em ledger append-only é pior que
            *     clique nenhum;
            *   • origem `env` — gravar daria à flag uma SEGUNDA fonte, que é
            *     exatamente o que o toggle travado ao lado existe para impedir.
            * Nos dois, o selo continua explicando; só não age. */}
          {flag.valorNaoReconhecido && (
            <Tooltip>
              <TooltipTrigger
                type="button"
                aria-disabled={acaoDoSelo === null ? "true" : undefined}
                onClick={acaoDoSelo === null ? undefined : () => aoVirar(acaoDoSelo)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border border-destructive bg-destructive/10 px-1.5 py-px text-[0.6rem] font-medium uppercase tracking-wide text-destructive",
                  acaoDoSelo !== null && "hover:bg-destructive/20",
                )}
                aria-label={
                  acaoDoSelo === null
                    ? `${flag.key} tem valor não reconhecido`
                    : `Corrigir ${flag.key}: ${acaoDoSelo ? "ligar" : "desligar"}`
                }
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                Valor não reconhecido
                {acaoDoSelo !== null && (
                  <span className="font-semibold">
                    · {acaoDoSelo ? "ligar" : "desligar"}
                  </span>
                )}
              </TooltipTrigger>
              <TooltipContent side="right">
                O valor gravado é <code>{flag.valor}</code>, e o dialeto{" "}
                <strong>{flag.dialeto}</strong> desta flag não o reconhece — ela está
                valendo <strong>OFF</strong>. Aceita:{" "}
                <code>{valoresAceitos(flag.dialeto ?? "amplo").join(" · ")}</code> para
                ligar, <code>0</code> para desligar.
                {acaoDoSelo !== null ? (
                  <>
                    {" "}
                    Parece que a intenção era <strong>
                      {acaoDoSelo ? "ligar" : "desligar"}
                    </strong>
                    ; clique aqui para gravar <code>{acaoDoSelo ? "1" : "0"}</code>
                    {flag.impacto === "alto" && " — a confirmação de efeito pesado continua valendo"}.
                  </>
                ) : travadoPorEnv ? (
                  <> Como a origem é o ambiente, o conserto é no Railway.</>
                ) : (
                  <> Não dá para deduzir a intenção deste valor — vire a chave à direita.</>
                )}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{flag.rotulo}</p>
        <p className="mt-1 font-mono text-[0.65rem] text-muted-foreground/70">{flag.onde}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {flag.atualizadoEm && (
          <span className="hidden text-right text-[0.65rem] leading-tight text-muted-foreground sm:block">
            {formatarQuando(flag.atualizadoEm)}
            <br />
            {/* Autor ausente com data presente NÃO é falha: é mudança feita
              * fora da tela (psql direto, ou antes da auditoria existir). Dizer
              * isso vale mais que deixar o campo em branco. */}
            <span className={cn(!flag.ultimoAutor && "italic")}>
              {flag.ultimoAutor ?? "fora da tela"}
            </span>
          </span>
        )}
        <Origem flag={flag} />
        {gravando ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : travadoPorEnv ? (
          /* Origem `env` TRAVA o toggle. Gravar funcionaria (banco tem
           * precedência sobre env no `getConfig`), e é justamente esse o
           * problema: a flag passaria a ter DUAS fontes, e a próxima pessoa a
           * ler a variável no Railway acharia que ela manda — quando não manda
           * mais. Melhor obrigar a mudança a acontecer onde ela já está. */
          <Tooltip>
            <TooltipTrigger
              type="button"
              aria-disabled="true"
              className="flex h-5 w-9 cursor-not-allowed items-center justify-center rounded-full border border-border bg-muted"
              aria-label={`${flag.key} é controlada por variável de ambiente`}
            >
              <Lock className="h-2.5 w-2.5 text-muted-foreground" />
            </TooltipTrigger>
            {/* Nomeia a variável E o lugar, nesta ordem: quem abre este tooltip
              * está tentando virar a chave AGORA e precisa da próxima ação, não
              * da explicação. O porquê vem depois, em uma frase.
              *
              * A fricção do Railway é INTENCIONAL — decisão do Eduardo. O texto
              * não sugere migrar a flag para o banco nem oferece atalho. */}
            <TooltipContent side="left">
              Mude em <strong>Railway → Variables → <code>{flag.key}</code></strong> (o deploy
              reinicia sozinho). A tela não grava por cima de propósito: o banco tem
              precedência sobre o env, então gravar aqui daria DUAS fontes à flag — e quem
              lesse a variável no Railway depois acharia que ela ainda manda.
            </TooltipContent>
          </Tooltip>
        ) : (
          <Switch
            checked={flag.ligada === true}
            disabled={desabilitado}
            onCheckedChange={(marcada) => aoVirar(marcada)}
            aria-label={`${flag.ligada ? "Desligar" : "Ligar"} ${flag.key}`}
          />
        )}
      </div>
    </div>
  );
}

/**
 * De onde veio o valor. Importa porque a precedência do `getConfig` é banco →
 * env, e flag de origem `env` fica com o toggle TRAVADO: sem este selo, a
 * chave cadeada pareceria um bug em vez de uma decisão.
 */
function Origem({ flag }: { flag: EstadoFlag }) {
  const rotulo =
    flag.origem === "db" ? "banco" : flag.origem === "env" ? "env" : "não definida";
  const Icone = flag.origem === "db" ? Database : flag.origem === "env" ? HardDrive : CircleDashed;

  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md",
          flag.origem === "env" ? "text-primary" : "text-muted-foreground",
        )}
        aria-label={`Origem do valor: ${rotulo}`}
      >
        <Icone className="h-3.5 w-3.5" />
      </TooltipTrigger>
      <TooltipContent side="left">
        {flag.origem === "env"
          ? "Valor vem de variável de ambiente — o toggle fica travado. Mudar só editando a variável no Railway."
          : flag.origem === "db"
            ? "Valor gravado na tabela Config."
            : "Sem linha no banco e sem env — vale o default (desligada)."}
      </TooltipContent>
    </Tooltip>
  );
}
