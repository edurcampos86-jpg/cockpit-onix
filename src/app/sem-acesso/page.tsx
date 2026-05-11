import Link from "next/link";
import { Lock } from "lucide-react";

export const metadata = {
  title: "Sem acesso — Ecossistema Onix",
};

export default function SemAcessoPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md w-full rounded-xl border border-border bg-card p-8 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">
          Acesso restrito
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Você não tem permissão para visualizar este módulo do Ecossistema. Se
          precisa de acesso, fale com o admin para liberar.
        </p>
        <Link
          href="/"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
