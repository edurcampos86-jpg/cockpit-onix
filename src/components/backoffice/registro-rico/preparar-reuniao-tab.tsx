"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Compass, ListChecks, Loader2, Sparkles, User } from "lucide-react";
import type { Briefing } from "@/lib/clientes-registro/briefing";

/**
 * Aba "Preparar reunião" — o briefing de 30 segundos antes de entrar na sala.
 *
 * Os quatro insumos já existiam na ficha, em quatro abas separadas. O que esta
 * tela entrega é a reconciliação: momento de vida, o que cada lado deve, a
 * pauta em ordem de cobrança e como conduzir segundo o PAT.
 *
 * Read-only e sem botão de salvar, de propósito: abrir a preparação minutos
 * antes da reunião não pode mexer em data de contato nem marcar nada.
 *
 * Busca no cliente (e não via props do server) porque a aba é aberta sob
 * demanda: montar o briefing de todo cliente em toda renderização da ficha
 * pagaria seis queries para a maioria das visitas, que nunca abre esta aba.
 */

type Resposta = {
  cliente: { nome: string; numeroConta: string; classificacao: string; proximaReuniaoAt: string | null };
  briefing: Briefing;
  pat: { arquetipoCodigo: number | null; arquetipoNome: string | null } | null;
};

export function PrepararReuniaoTab({ clienteId }: { clienteId: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/backoffice/clientes/${clienteId}/preparar-reuniao`)
      .then(async (r) => {
        const json = await r.json();
        if (!vivo) return;
        if (!r.ok) setErro(json.error ?? "Não foi possível montar o briefing");
        else setDados(json);
      })
      .catch(() => vivo && setErro("Falha de rede."));
    return () => {
      vivo = false;
    };
  }, [clienteId]);

  if (erro) return <p className="p-6 text-sm text-destructive">{erro}</p>;
  if (!dados) {
    return (
      <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Montando o briefing…
      </p>
    );
  }

  const { briefing } = dados;
  const { assessor, cliente: doCliente } = briefing.pendencias;

  return (
    <div className="space-y-4">
      {/* Régua de topo: os três números que decidem o tom da conversa. */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
        <Numero
          rotulo="Sem contato há"
          valor={diasTexto(briefing.resumo.diasDesdeUltimoContato)}
        />
        <Numero
          rotulo="Sem reunião há"
          valor={diasTexto(briefing.resumo.diasDesdeUltimaReuniao)}
        />
        <Numero rotulo="Pendências abertas" valor={String(briefing.resumo.totalPendenciasAbertas)} />
      </div>

      <Bloco titulo="Momento de vida" Icon={Sparkles} itens={briefing.momentoDeVida} vazio="Nada registrado desde a última conversa." />

      <div className="grid gap-4 md:grid-cols-2">
        <Bloco
          titulo="Eu fiquei de fazer"
          Icon={User}
          itens={assessor.map((p) => `${p.texto} — ${p.origem}`)}
          vazio="Nada pendente do nosso lado."
        />
        <Bloco
          titulo="Ele ficou de mandar"
          Icon={ListChecks}
          itens={doCliente.map((p) => `${p.texto} — ${p.origem}`)}
          vazio="Nada pendente do lado dele."
        />
      </div>

      <Bloco
        titulo="Pauta sugerida"
        Icon={CalendarClock}
        itens={briefing.pautaSugerida}
        vazio="Sem pauta herdada — reunião de agenda livre."
        ordenada
      />

      <Bloco
        titulo="Como conduzir"
        Icon={Compass}
        itens={briefing.comoConduzir}
        vazio="Sem PAT vigente."
        rodape={
          dados.pat?.arquetipoNome
            ? `Segundo o PAT vigente: ${dados.pat.arquetipoCodigo ?? ""} ${dados.pat.arquetipoNome}`.trim()
            : undefined
        }
      />
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="bg-card p-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-xl font-semibold tabular-nums">{valor}</p>
    </div>
  );
}

function Bloco({
  titulo,
  Icon,
  itens,
  vazio,
  ordenada = false,
  rodape,
}: {
  titulo: string;
  Icon: typeof Sparkles;
  itens: readonly string[];
  vazio: string;
  ordenada?: boolean;
  rodape?: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4" aria-hidden />
        {titulo}
      </h3>
      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">{vazio}</p>
      ) : ordenada ? (
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {itens.map((t, i) => (
            <li key={`${i}-${t}`}>{t}</li>
          ))}
        </ol>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {itens.map((t, i) => (
            <li key={`${i}-${t}`}>{t}</li>
          ))}
        </ul>
      )}
      {rodape && <p className="pt-1 text-xs text-muted-foreground">{rodape}</p>}
    </section>
  );
}

/** `null` = nunca houve. "—" e não "0 dias": zero diria que foi hoje. */
function diasTexto(dias: number | null): string {
  if (dias === null) return "—";
  if (dias === 0) return "hoje";
  return `${dias}d`;
}
