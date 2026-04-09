import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { Compass, Layers, Target, Zap, BookOpen } from "lucide-react";

export const metadata = {
  title: "Método Onix — Cockpit",
};

export default function MetodoPage() {
  return (
    <div className="min-h-screen">
      <PageHeader
        title="Método Onix"
        description="Os fundamentos por trás do Cockpit — por que o sistema é assim e como tudo se conecta"
      />

      <div className="p-8 space-y-6 max-w-4xl">
        <ComoFunciona
          proposito="Explica o método de gestão por trás do Cockpit Onix. Os três módulos não são pastas de funcionalidades — são respostas a três perguntas estratégicas distintas."
          comoUsar="Leia uma vez para entender o pano de fundo. Volte aqui sempre que precisar relembrar por que uma página existe ou como tomar uma decisão entre módulos."
          comoAjuda="Dá clareza estratégica. A ferramenta deixa de ser uma coleção de telas e vira um sistema com lógica própria — e isso muda como você usa cada página."
        />

        {/* Os três módulos */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-3 mb-2">
            <Layers className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Os 3 módulos</h2>
          </div>

          <div className="space-y-4">
            <div className="border-l-4 border-blue-500 pl-4">
              <h3 className="font-semibold text-blue-400 mb-1">MKT — Mídias Sociais</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Pergunta que responde: <em>como nos posicionamos publicamente?</em> Estrutura o conteúdo
                editorial em 5 Quadros Fixos, planeja com IA, mede com KPIs em 4 camadas (funil AARRR)
                e aplica a regra 80/20 de CTAs para não cansar a audiência.
              </p>
            </div>

            <div className="border-l-4 border-amber-500 pl-4">
              <h3 className="font-semibold text-amber-400 mb-1">Corretora — Gestão Comercial</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Pergunta que responde: <em>como o time vende e se desenvolve?</em> Captura conversas
                reais (Plaud.ai), analisa por IA, gera score semanal, plano de ação personalizado por
                PAT, trilha de desenvolvimento individual e rituais de gestão recorrentes.
              </p>
            </div>

            <div className="border-l-4 border-violet-500 pl-4">
              <h3 className="font-semibold text-violet-400 mb-1">Backoffice — Carteira Supernova</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Pergunta que responde: <em>como cuidamos de quem já é cliente?</em> Aplica o Método
                12-4-2 (12 contatos, 4 reuniões, 2 reviews por ano), storyselling, gestão de
                indicações e cadência estruturada para nunca perder cliente por esquecimento.
              </p>
            </div>
          </div>
        </section>

        {/* Princípios */}
        <section className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-3 mb-2">
            <Compass className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Princípios fundadores</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Principio
              icon={Target}
              titulo="Sistema antes de esforço"
              descricao="Cada página existe para reduzir decisão arbitrária. Disciplina vem de processo, não de força de vontade."
            />
            <Principio
              icon={Zap}
              titulo="IA como copiloto, não piloto"
              descricao="A IA gera relatórios, planos e análises — mas a decisão e o vínculo humano são insubstituíveis."
            />
            <Principio
              icon={BookOpen}
              titulo="Memória institucional"
              descricao="Tudo que acontece vira histórico consultável. Aprendizado individual vira aprendizado do time."
            />
            <Principio
              icon={Layers}
              titulo="Personalização por perfil"
              descricao="Mesma cobrança em pessoas diferentes gera resultados opostos. PAT calibra coaching e comunicação."
            />
          </div>
        </section>

        {/* Como tudo se conecta */}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-3">
            <Zap className="h-5 w-5 text-primary" />
            Como tudo se conecta
          </h2>
          <ol className="space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                1
              </span>
              <p>
                Conversas reais são gravadas (Plaud.ai) → IA analisa → gera relatório semanal por
                vendedor com score, pontos fortes, pontos a desenvolver e ações concretas.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <p>
                As ações entram no Plano de Ação semanal. O gestor revisa na reunião de terça
                (Formato C: coletivo + individual calibrado por PAT).
              </p>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                3
              </span>
              <p>
                Padrões coletivos viram conteúdo (MKT) e a execução comercial gera leads para a
                carteira (Backoffice). Os três módulos se retroalimentam.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                4
              </span>
              <p>
                Alertas (pipeline parado, recontato vencido) garantem que nada cai. Rituais
                (calendário) garantem que a gestão não vira reativa.
              </p>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}

function Principio({
  icon: Icon,
  titulo,
  descricao,
}: {
  icon: React.ComponentType<{ className?: string }>;
  titulo: string;
  descricao: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">{titulo}</h3>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{descricao}</p>
    </div>
  );
}
