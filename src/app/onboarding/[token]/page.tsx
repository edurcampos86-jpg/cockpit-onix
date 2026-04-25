import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { concluirOnboarding } from "@/app/actions/convite";
import { CheckCircle2, Lock, Sparkles, AlertTriangle, XCircle } from "lucide-react";

export const metadata = {
  title: "Onboarding — Ecossistema Onix",
};

/**
 * Rota PÚBLICA — não chama requireSession.
 * Recebe um token de convite gerado pelo admin e permite à pessoa criar a senha
 * e ter seu primeiro acesso ao Cockpit.
 */
export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token) notFound();

  const convite = await prisma.conviteOnboarding.findUnique({
    where: { token },
    include: {
      pessoa: {
        select: {
          id: true,
          nomeCompleto: true,
          apelido: true,
          email: true,
          userId: true,
        },
      },
    },
  });

  // Convite inválido (não existe)
  if (!convite) {
    return <ConviteInvalido titulo="Convite inválido" mensagem="Esse link não existe ou foi revogado pelo administrador." />;
  }

  // Convite já foi usado
  if (convite.usedAt) {
    return (
      <ConviteInvalido
        titulo="Convite já usado"
        mensagem={`Esse convite foi consumido em ${convite.usedAt.toLocaleDateString("pt-BR")}. Acesse pela página de login.`}
      />
    );
  }

  // Convite expirado
  if (convite.expiresAt < new Date()) {
    return (
      <ConviteInvalido
        titulo="Convite expirado"
        mensagem={`Esse convite expirou em ${convite.expiresAt.toLocaleDateString("pt-BR")}. Peça um novo ao administrador.`}
      />
    );
  }

  // Pessoa já tem login (caso edge — admin não revogou após criar User)
  if (convite.pessoa.userId) {
    return (
      <ConviteInvalido
        titulo="Acesso já existe"
        mensagem="Você já tem login no Cockpit. Acesse pela página de login."
      />
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Bem-vindo(a) ao Ecossistema Onix</h1>
            <p className="text-xs text-muted-foreground">Defina sua senha pra começar</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/40 p-4 mb-6">
          <p className="text-xs text-muted-foreground">Você está criando o acesso de</p>
          <p className="text-sm font-semibold text-foreground mt-0.5">
            {convite.pessoa.nomeCompleto}
          </p>
          <p className="text-xs text-muted-foreground">{convite.pessoa.email}</p>
        </div>

        <form action={concluirOnboarding} className="space-y-4">
          <input type="hidden" name="token" value={token} />

          <div>
            <label htmlFor="senha" className="block text-xs font-medium text-muted-foreground mb-1.5">
              Sua nova senha (mínimo 8 caracteres)
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                id="senha"
                name="senha"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <div>
            <label htmlFor="senhaConfirm" className="block text-xs font-medium text-muted-foreground mb-1.5">
              Confirme a senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                id="senhaConfirm"
                name="senhaConfirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" />
            Criar acesso e entrar
          </button>
        </form>

        <p className="text-[10px] text-muted-foreground text-center mt-6">
          Convite expira em{" "}
          {convite.expiresAt.toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}
        </p>
      </div>
    </main>
  );
}

function ConviteInvalido({ titulo, mensagem }: { titulo: string; mensagem: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-destructive/15 flex items-center justify-center mb-4">
          <XCircle className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="text-lg font-bold text-foreground mb-2">{titulo}</h1>
        <p className="text-sm text-muted-foreground mb-6">{mensagem}</p>
        <a
          href="/login"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          <AlertTriangle className="h-4 w-4" />
          Ir para o login
        </a>
      </div>
    </main>
  );
}
