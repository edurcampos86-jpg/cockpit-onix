import { Landmark, ShieldCheck, UserCog, TrendingUp, TrendingDown, Clock } from "lucide-react";

interface CoHolder { name?: string; taxIdentification?: string }
interface UsuarioBtg { name?: string; userEmail?: string; phoneNumber?: string; isOwner?: boolean }
interface BreakdownItem { ProductName?: string; productName?: string; TotalAmmount?: string | number; Balance?: string | number }

interface ClienteBtg {
  cpfCnpj: string | null;
  perfilInvestidor: string | null;
  suitabilityValidoAte: string | Date | null;
  assessorNome: string | null;
  assessorCge: string | null;
  positionDate: string | Date | null;
  ultimaSyncBtg: string | Date | null;
  coHolders: unknown;
  usuariosBtg: unknown;
  breakdownProdutos: unknown;
  saldo: number;
  saldoConta: number;
}

interface MovimentacaoView {
  id: string;
  data: string | Date;
  tipo: string;
  descricao: string | null;
  mercado: string | null;
  ativo: string | null;
  valor: number;
}

const moeda = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const formatarDoc = (doc: string): string => {
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc;
};

const PERFIL_CORES: Record<string, string> = {
  conservador: "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200 border-blue-300",
  moderado: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 border-amber-300",
  sofisticado: "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200 border-red-300",
};

const TIPOS_NEGATIVOS = ["RESGATE", "RETIRADA", "SAQUE", "TED OUT", "PIX OUT"];

export function ClienteBtgSection({
  cliente,
  movimentacoes,
}: {
  cliente: ClienteBtg;
  movimentacoes: MovimentacaoView[];
}) {
  const coHolders = (cliente.coHolders as CoHolder[] | null) || [];
  const usuarios = (cliente.usuariosBtg as UsuarioBtg[] | null) || [];
  const breakdown = (cliente.breakdownProdutos as BreakdownItem[] | { Products?: BreakdownItem[] } | null);
  const breakdownArr: BreakdownItem[] = Array.isArray(breakdown)
    ? breakdown
    : (breakdown && "Products" in breakdown && Array.isArray(breakdown.Products))
      ? breakdown.Products
      : [];

  const temDadosBtg =
    cliente.cpfCnpj || cliente.perfilInvestidor || cliente.assessorNome || cliente.positionDate ||
    coHolders.length > 0 || usuarios.length > 0 || breakdownArr.length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Landmark className="h-5 w-5 text-sky-600" />
          <h3 className="font-semibold">Dados BTG</h3>
        </div>

        {!temDadosBtg ? (
          <p className="text-sm text-muted-foreground">
            Nenhum dado BTG sincronizado ainda. Use os botões "Importar do BTG" e "Enriquecer dados" na lista de clientes.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {cliente.cpfCnpj && (
              <Field label="CPF/CNPJ" value={formatarDoc(cliente.cpfCnpj)} mono />
            )}
            {cliente.perfilInvestidor && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Perfil de investidor</p>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${PERFIL_CORES[cliente.perfilInvestidor] || "bg-zinc-100 dark:bg-zinc-900/50 border-zinc-300"}`}>
                  <ShieldCheck className="h-3 w-3" />
                  {cliente.perfilInvestidor}
                </span>
                {cliente.suitabilityValidoAte && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Válido até {new Date(cliente.suitabilityValidoAte).toLocaleDateString("pt-BR")}
                  </p>
                )}
              </div>
            )}
            {cliente.assessorNome && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Assessor responsável</p>
                <p className="font-medium flex items-center gap-1">
                  <UserCog className="h-3 w-3" /> {cliente.assessorNome}
                </p>
                {cliente.assessorCge && <p className="text-xs text-muted-foreground">CGE {cliente.assessorCge}</p>}
              </div>
            )}
            {cliente.positionDate && (
              <Field label="Data da posição" value={new Date(cliente.positionDate).toLocaleDateString("pt-BR")} />
            )}
            {cliente.ultimaSyncBtg && (
              <Field
                label="Última sincronização"
                value={new Date(cliente.ultimaSyncBtg).toLocaleString("pt-BR")}
              />
            )}
            <Field label="AUM total" value={moeda(cliente.saldo)} mono />
            <Field label="Saldo em conta" value={moeda(cliente.saldoConta)} mono />
          </div>
        )}

        {coHolders.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-2">Co-titulares ({coHolders.length})</p>
            <div className="flex flex-wrap gap-2">
              {coHolders.map((c, i) => (
                <span key={i} className="text-sm px-2 py-1 rounded bg-muted">
                  {c.name || "—"}
                </span>
              ))}
            </div>
          </div>
        )}

        {usuarios.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-2">Usuários da conta ({usuarios.length})</p>
            <div className="space-y-1">
              {usuarios.map((u, i) => (
                <div key={i} className="text-sm flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{u.name || "—"}</span>
                  {u.isOwner && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 text-xs">Titular</span>
                  )}
                  {u.userEmail && <span className="text-muted-foreground text-xs">{u.userEmail}</span>}
                  {u.phoneNumber && <span className="text-muted-foreground text-xs">· {u.phoneNumber}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {breakdownArr.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-2">Breakdown de produtos ({breakdownArr.length})</p>
            <div className="rounded border overflow-hidden">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {breakdownArr.slice(0, 20).map((p, i) => {
                    const valor = parseFloat(String(p.TotalAmmount ?? p.Balance ?? "0"));
                    return (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-3 py-1.5">{p.ProductName || p.productName || "—"}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{isNaN(valor) ? "—" : moeda(valor)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {breakdownArr.length > 20 && (
                <p className="px-3 py-2 text-xs text-muted-foreground bg-muted/30">+ {breakdownArr.length - 20} produtos</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-3">
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-zinc-600" />
          <h3 className="font-semibold">Timeline de movimentações BTG</h3>
          <span className="text-xs text-muted-foreground">(últimas {movimentacoes.length})</span>
        </div>
        {movimentacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma movimentação sincronizada. Use o botão "Sync Movimentações" na lista de clientes.
          </p>
        ) : (
          <div className="space-y-1">
            {movimentacoes.map((m) => {
              const isNegativo = TIPOS_NEGATIVOS.some((t) => m.tipo.toUpperCase().includes(t));
              return (
                <div key={m.id} className="flex items-start gap-3 text-sm py-2 border-b last:border-b-0">
                  <span className="text-xs text-muted-foreground w-20 shrink-0 mt-0.5">
                    {new Date(m.data).toLocaleDateString("pt-BR")}
                  </span>
                  <span className="font-medium w-40 shrink-0">{m.tipo}</span>
                  <span className={`font-mono shrink-0 flex items-center gap-1 ${isNegativo ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                    {isNegativo ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                    {moeda(Math.abs(m.valor))}
                  </span>
                  {m.ativo && <span className="text-muted-foreground">· {m.ativo}</span>}
                  {m.descricao && (
                    <span className="text-xs text-muted-foreground truncate flex-1" title={m.descricao}>
                      {m.descricao}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`font-medium ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
