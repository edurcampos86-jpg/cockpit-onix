"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CircleDashed, Database, HardDrive, Loader2, ShieldQuestion } from "lucide-react";
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
import type { EstadoFlag } from "@/lib/flags/estado";
import {
  EXPECTED_FLAGS_ON_KEY,
  compararComLista,
  type ComparacaoEsperado,
} from "@/lib/flags/esperadas";

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
}: {
  flagsIniciais: EstadoFlag[];
  esperado: ComparacaoEsperado;
}) {
  const router = useRouter();
  const [flags, setFlags] = useState(flagsIniciais);
  const [gravando, setGravando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<{ flag: EstadoFlag; ligar: boolean } | null>(null);
  const [, startTransition] = useTransition();

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
      const { flags: atualizadas } = (await resposta.json()) as { flags: EstadoFlag[] };
      setFlags(atualizadas);
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
  const divergencia = compararComLista(
    flags.filter((f) => f.ligada === true).map((f) => f.key),
    esperado.esperadas,
  );
  const foraDoEsperado = new Set([...divergencia.faltando, ...divergencia.sobrando]);

  return (
    <div className="space-y-8">
      {erro && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {erro}
        </p>
      )}

      <AvisoSmoke comparacao={divergencia} />

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
                <p className="font-mono text-xs font-semibold text-foreground">{flag.key}</p>
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
    </div>
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
}: {
  flag: EstadoFlag;
  gravando: boolean;
  desabilitado: boolean;
  foraDoEsperado: boolean;
  aoVirar: (ligar: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 bg-card px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-xs font-semibold text-foreground">{flag.key}</p>
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
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{flag.rotulo}</p>
        <p className="mt-1 font-mono text-[0.65rem] text-muted-foreground/70">{flag.onde}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {flag.atualizadoEm && (
          <span className="hidden text-[0.65rem] text-muted-foreground sm:inline">
            {new Date(flag.atualizadoEm).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
        <Origem flag={flag} />
        {gravando ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
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
 * env: uma flag vinda do ENV não muda pela tela, e sem este selo o toggle
 * pareceria simplesmente não funcionar.
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
          ? "Valor vem de variável de ambiente. O banco tem precedência: gravar pela tela passa a valer sobre o env."
          : flag.origem === "db"
            ? "Valor gravado na tabela Config."
            : "Sem linha no banco e sem env — vale o default (desligada)."}
      </TooltipContent>
    </Tooltip>
  );
}
