import { LinkIcon, CheckCircle2, Clock, Trash2, RefreshCw, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { gerarConviteForm, revogarConviteForm } from "@/app/actions/convite";

/**
 * Seção de convite de onboarding na ficha (admin only).
 * Exibe estado atual e oferece ações:
 *  - Pessoa já tem User: mostra "Login ativo"
 *  - Convite válido pendente: mostra link copiável + botões revogar/regerar
 *  - Convite expirado/usado: oferece gerar novo
 *  - Sem convite: oferece gerar
 */
export async function ConviteSection({
  pessoaId,
  pessoaNome,
}: {
  pessoaId: string;
  pessoaNome: string;
}) {
  const [pessoa, convite] = await Promise.all([
    prisma.pessoa.findUnique({
      where: { id: pessoaId },
      select: { userId: true, status: true },
    }),
    prisma.conviteOnboarding.findUnique({
      where: { pessoaId },
    }),
  ]);

  if (!pessoa) return null;

  // 1) Já tem login — não precisa convite
  if (pessoa.userId) {
    return (
      <SectionShell>
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Login ativo</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pessoaNome} já tem acesso ao Ecossistema. Não é necessário convite.
            </p>
          </div>
        </div>
      </SectionShell>
    );
  }

  // 2) Pessoa arquivada — não pode convidar
  if (pessoa.status === "arquivado") {
    return (
      <SectionShell>
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Pessoa arquivada</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Pessoas arquivadas não podem receber convite. Restaure primeiro pra dar acesso.
            </p>
          </div>
        </div>
      </SectionShell>
    );
  }

  // 3) Estados do convite
  const agora = new Date();
  const conviteValido = convite && !convite.usedAt && convite.expiresAt > agora;
  const conviteUsado = convite?.usedAt;
  const conviteExpirado = convite && !convite.usedAt && convite.expiresAt <= agora;

  if (conviteValido) {
    const path = `/onboarding/${convite.token}`;
    return (
      <SectionShell>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Convite ativo</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Mande este link pra {pessoaNome} via WhatsApp ou email. Expira em{" "}
                {convite.expiresAt.toLocaleDateString("pt-BR", {
                  day: "numeric",
                  month: "long",
                })}
                .
              </p>
            </div>
          </div>

          <code className="block text-xs bg-background border border-border rounded p-2 break-all select-all">
            {path}
          </code>
          <p className="text-[10px] text-muted-foreground italic">
            Use o domínio do seu Ecossistema ao mandar — ex.: https://ecossistemaonix.com.br{path}
          </p>

          <div className="flex items-center gap-2 pt-1">
            <form action={gerarConviteForm}>
              <input type="hidden" name="pessoaId" value={pessoaId} />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
                title="Gera novo token e invalida o atual"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regerar link
              </button>
            </form>
            <form action={revogarConviteForm}>
              <input type="hidden" name="pessoaId" value={pessoaId} />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 text-destructive hover:bg-destructive/10 rounded px-2.5 py-1.5 text-xs font-medium transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Revogar
              </button>
            </form>
          </div>
        </div>
      </SectionShell>
    );
  }

  if (conviteUsado) {
    // Estado raro: convite marcado como usado mas pessoa.userId null (inconsistência)
    return (
      <SectionShell>
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Convite usado mas vínculo inconsistente
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              O convite foi consumido em {convite.usedAt!.toLocaleDateString("pt-BR")} mas a
              pessoa não tem User vinculado. Gere um novo convite ou contate suporte.
            </p>
            <form action={gerarConviteForm} className="mt-3">
              <input type="hidden" name="pessoaId" value={pessoaId} />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Gerar novo convite
              </button>
            </form>
          </div>
        </div>
      </SectionShell>
    );
  }

  if (conviteExpirado) {
    return (
      <SectionShell>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Convite expirado</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                O convite expirou em{" "}
                {convite.expiresAt.toLocaleDateString("pt-BR")}. Gere um novo.
              </p>
            </div>
          </div>
          <form action={gerarConviteForm}>
            <input type="hidden" name="pessoaId" value={pessoaId} />
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Gerar novo convite
            </button>
          </form>
        </div>
      </SectionShell>
    );
  }

  // 4) Sem convite — oferece criar
  return (
    <SectionShell>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            <LinkIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Sem acesso ao Ecossistema</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Gere um link de convite pra {pessoaNome} criar a senha e logar pela primeira vez.
              O link vale 7 dias.
            </p>
          </div>
        </div>

        <form action={gerarConviteForm}>
          <input type="hidden" name="pessoaId" value={pessoaId} />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <LinkIcon className="h-4 w-4" />
            Gerar link de convite
          </button>
        </form>
      </div>
    </SectionShell>
  );
}

function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-6">
      <header className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <LinkIcon className="h-4 w-4 text-blue-500" />
          <h2 className="text-sm font-semibold text-foreground">Acesso ao Ecossistema</h2>
        </div>
      </header>
      {children}
    </section>
  );
}
