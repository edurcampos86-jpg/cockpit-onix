import { carregarQuestionarioPat } from "@/lib/time/questionario-pat-loader";
import { QuestionarioPatPanel } from "./questionario-pat-panel";

/**
 * Fronteira server-side da seção. O loader resolve flag, existência e RBAC;
 * `null` significa que nem a presença do questionário deve aparecer na ficha.
 */
export async function QuestionarioPatSection({ pessoaId }: { pessoaId: string }) {
  const dados = await carregarQuestionarioPat(pessoaId);
  if (!dados) return null;

  return (
    <QuestionarioPatPanel
      dados={dados}
      hoje={new Date().toISOString().slice(0, 10)}
    />
  );
}
