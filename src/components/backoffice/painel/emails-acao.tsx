import { Mail, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EmailAcao } from "@/lib/painel-do-dia/types";

export function EmailsAcao({
  emails,
  erro,
}: {
  emails: EmailAcao[];
  erro?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" /> E-mails que pedem ação
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        {erro && (
          <p className="mb-3 text-sm text-destructive">
            Falha ao carregar e-mails: {erro}
          </p>
        )}
        {emails.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem e-mails pendentes de ação.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {emails.map((e) => (
              <li
                key={e.id}
                className="rounded-md ring-1 ring-foreground/10 p-3"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">{e.remetente}</p>
                  <Badge variant="outline">
                    {e.origem === "gmail" ? "Gmail" : "Outlook"}
                  </Badge>
                </div>
                <a
                  href={e.link}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-sm text-primary hover:underline"
                >
                  {e.assunto}
                </a>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {e.snippet}
                </p>
                {e.relacionadoComEventoId && (
                  <div className="mt-2 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <Zap className="h-3 w-3" /> Relacionado a reunião de hoje
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
