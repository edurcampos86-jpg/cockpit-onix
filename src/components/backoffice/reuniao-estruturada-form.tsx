"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarIcon, Plus, Trash2, CheckCircle2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { criarReuniaoEstruturada } from "@/app/actions/reuniao-estruturada";
import { CADENCIAS_REUNIAO } from "@/lib/cockpit-reuniao/tipos";

// Sentinela do select "quem conduziu" — Base UI não lida bem com value "" como
// item; mapeamos pra null antes de enviar.
const PESSOA_NENHUMA = "__nenhuma__";

type PessoaOpcao = { id: string; nome: string };

/** yyyy-mm-dd a partir dos componentes LOCAIS (evita shift de timezone do ISO). */
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function fmtData(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/**
 * Lista dinâmica de textos: input + adicionar + remover. O valor consolidado é
 * serializado como JSON num hidden input (`name`) para chegar no FormData.
 */
function ListaDinamica({
  name,
  itens,
  setItens,
  placeholder,
}: {
  name: string;
  itens: string[];
  setItens: (next: string[]) => void;
  placeholder: string;
}) {
  const limpos = itens.map((t) => t.trim()).filter(Boolean);
  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(limpos)} />
      {itens.map((texto, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={texto}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...itens];
              next[i] = e.target.value;
              setItens(next);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remover item"
            onClick={() => setItens(itens.filter((_, j) => j !== i))}
          >
            <Trash2 className="text-muted-foreground" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setItens([...itens, ""])}
      >
        <Plus /> Adicionar
      </Button>
    </div>
  );
}

export function ReuniaoEstruturadaForm({
  clienteId,
  pessoas,
}: {
  clienteId: string;
  pessoas: PessoaOpcao[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  // Estado dos campos controlados (componentes do design system não submetem
  // sozinhos → espelhamos em hidden inputs).
  const [data, setData] = useState<Date | undefined>(undefined);
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const [cadencia, setCadencia] = useState<string>("");
  const [pessoaId, setPessoaId] = useState<string>(PESSOA_NENHUMA);
  const [pautas, setPautas] = useState<string[]>([]);
  const [pendAssessor, setPendAssessor] = useState<string[]>([]);
  const [pendCliente, setPendCliente] = useState<string[]>([]);
  const [proximosPassos, setProximosPassos] = useState<string[]>([]);

  const [erro, setErro] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Trata o resultado NO callback da submissão (não em effect) — fecha o Sheet,
  // reseta o form e recarrega os dados do servidor em caso de sucesso.
  function onSubmit(formData: FormData) {
    setErro(null);
    startTransition(async () => {
      const r = await criarReuniaoEstruturada({ ok: false }, formData);
      if (!r.ok) {
        setErro(r.error ?? "Não consegui salvar. Tente novamente.");
        return;
      }
      setOpen(false);
      setData(undefined);
      setCadencia("");
      setPessoaId(PESSOA_NENHUMA);
      setPautas([]);
      setPendAssessor([]);
      setPendCliente([]);
      setProximosPassos([]);
      setSucesso(true);
      router.refresh();
    });
  }

  // Limpa o aviso de sucesso depois de alguns segundos.
  useEffect(() => {
    if (!sucesso) return;
    const t = setTimeout(() => setSucesso(false), 4000);
    return () => clearTimeout(t);
  }, [sucesso]);

  return (
    <div className="flex items-center gap-2">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button size="sm">
              <Plus /> Registrar reunião
            </Button>
          }
        />
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Registrar reunião</SheetTitle>
            <SheetDescription>
              Captura manual de uma reunião estruturada do cliente.
            </SheetDescription>
          </SheetHeader>

          <form action={onSubmit} className="flex flex-1 flex-col gap-5 px-4">
            <input type="hidden" name="clienteId" value={clienteId} />
            <input type="hidden" name="data" value={data ? toYmd(data) : ""} />
            <input type="hidden" name="tipoCadencia" value={cadencia} />
            <input
              type="hidden"
              name="pessoaId"
              value={pessoaId === PESSOA_NENHUMA ? "" : pessoaId}
            />

            {/* Data */}
            <div className="space-y-1.5">
              <Label>
                Data <span className="text-destructive">*</span>
              </Label>
              <Popover open={calendarioAberto} onOpenChange={setCalendarioAberto}>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start font-normal"
                    >
                      <CalendarIcon className="text-muted-foreground" />
                      {data ? (
                        fmtData(data)
                      ) : (
                        <span className="text-muted-foreground">
                          Selecione a data
                        </span>
                      )}
                    </Button>
                  }
                />
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={data}
                    onSelect={(d) => {
                      setData(d);
                      setCalendarioAberto(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Cadência */}
            <div className="space-y-1.5">
              <Label>Cadência</Label>
              <Select value={cadencia} onValueChange={(v) => setCadencia(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {CADENCIAS_REUNIAO.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quem conduziu */}
            <div className="space-y-1.5">
              <Label>Quem conduziu</Label>
              <Select
                value={pessoaId}
                onValueChange={(v) => setPessoaId(v ?? PESSOA_NENHUMA)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PESSOA_NENHUMA}>Não informar</SelectItem>
                  {pessoas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Pautas */}
            <div className="space-y-1.5">
              <Label>Pautas</Label>
              <ListaDinamica
                name="pautas"
                itens={pautas}
                setItens={setPautas}
                placeholder="Tópico da pauta"
              />
            </div>

            {/* Pendências do assessor */}
            <div className="space-y-1.5">
              <Label>Pendências do assessor</Label>
              <ListaDinamica
                name="pendenciasAssessor"
                itens={pendAssessor}
                setItens={setPendAssessor}
                placeholder="O que o assessor ficou de fazer"
              />
            </div>

            {/* Pendências do cliente */}
            <div className="space-y-1.5">
              <Label>Pendências do cliente</Label>
              <ListaDinamica
                name="pendenciasCliente"
                itens={pendCliente}
                setItens={setPendCliente}
                placeholder="O que o cliente ficou de fazer"
              />
            </div>

            {/* Próximos passos */}
            <div className="space-y-1.5">
              <Label>Próximos passos</Label>
              <ListaDinamica
                name="proximosPassos"
                itens={proximosPassos}
                setItens={setProximosPassos}
                placeholder="Próximo passo acordado"
              />
            </div>

            {erro && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </p>
            )}

            <SheetFooter className="px-0">
              <Button type="submit" disabled={pending || !data}>
                {pending ? "Salvando…" : "Salvar reunião"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {sucesso && (
        <span className="inline-flex items-center gap-1.5 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4" /> Reunião registrada
        </span>
      )}
    </div>
  );
}
