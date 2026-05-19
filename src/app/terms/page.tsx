import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Termos de Uso · Ecossistema Onix",
  description:
    "Termos e condições de uso do Ecossistema Onix — plataforma interna de gestão da Onix Capital.",
};

const ULTIMA_ATUALIZACAO = "19 de maio de 2026";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <div className="mb-8 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-primary">
          ← Voltar
        </Link>
      </div>

      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
        Termos de Uso
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Última atualização: {ULTIMA_ATUALIZACAO}
      </p>

      <section className="prose prose-zinc dark:prose-invert mt-10 max-w-none space-y-6">
        <h2 className="text-xl font-semibold">1. Aceitação</h2>
        <p>
          Ao acessar o <strong>Ecossistema Onix</strong> (&quot;Onix&quot;,
          &quot;plataforma&quot;), você concorda com estes Termos de Uso e
          com a{" "}
          <Link href="/privacy" className="text-primary underline">
            Política de Privacidade
          </Link>
          . Se você não concorda, não utilize a plataforma.
        </p>

        <h2 className="text-xl font-semibold">2. Escopo do serviço</h2>
        <p>
          O Ecossistema Onix é uma ferramenta interna de gestão da Onix
          Capital, oferecida exclusivamente a colaboradores autorizados
          (assessores, equipe administrativa e parceiros designados). Não
          é um serviço comercial aberto ao público; o acesso só é concedido
          mediante credenciais distribuídas pela administração.
        </p>

        <h2 className="text-xl font-semibold">3. Conta e responsabilidade</h2>
        <ul className="list-disc pl-6">
          <li>
            Você é responsável por manter suas credenciais (CPF e senha)
            confidenciais.
          </li>
          <li>
            Toda atividade realizada em sua conta é considerada sua, salvo
            se você reportar comprometimento à administração imediatamente.
          </li>
          <li>
            Não compartilhe sua sessão, não use a conta de outro colaborador
            e não burle controles de acesso.
          </li>
        </ul>

        <h2 className="text-xl font-semibold">4. Uso aceitável</h2>
        <p>Você concorda em não:</p>
        <ul className="list-disc pl-6">
          <li>
            Exportar, copiar ou divulgar dados de clientes da Onix Capital
            fora do contexto operacional autorizado.
          </li>
          <li>
            Tentar acessar áreas, recursos ou dados que não sejam de sua
            atribuição.
          </li>
          <li>
            Fazer engenharia reversa, varredura automatizada de
            vulnerabilidades sem autorização, ou tentativas de invasão.
          </li>
          <li>
            Usar a plataforma para qualquer atividade ilícita, fraudulenta
            ou que viole a regulação financeira aplicável (CVM, Anbima,
            BACEN).
          </li>
        </ul>

        <h2 className="text-xl font-semibold">5. Integrações com terceiros</h2>
        <p>
          O Onix pode integrar-se a serviços de terceiros (Google
          Workspace, Microsoft 365, BTG Pactual, etc.) por OAuth ou por
          credenciais fornecidas por você. Ao conectar uma conta de
          terceiros:
        </p>
        <ul className="list-disc pl-6">
          <li>
            Você reconhece que o uso desses serviços está sujeito aos
            termos e à política de privacidade do respectivo fornecedor.
          </li>
          <li>
            Você autoriza o Onix a acessar os escopos exibidos na tela de
            consentimento (ex: Google Calendar, Gmail) apenas para os
            propósitos descritos em nossa{" "}
            <Link href="/privacy" className="text-primary underline">
              Política de Privacidade
            </Link>
            .
          </li>
          <li>
            Você pode revogar o acesso a qualquer momento, em
            <code> /integracoes</code> ou diretamente no console do
            fornecedor.
          </li>
        </ul>

        <h2 className="text-xl font-semibold">
          6. Propriedade intelectual
        </h2>
        <p>
          Todo o código, design, dados agregados e conteúdo do Ecossistema
          Onix são propriedade da Onix Capital ou de seus licenciantes.
          Você recebe uma licença não exclusiva, não transferível e
          revogável para uso da plataforma no exercício de suas funções.
        </p>

        <h2 className="text-xl font-semibold">7. Disponibilidade</h2>
        <p>
          O Onix é fornecido &quot;como está&quot;, com base no melhor
          esforço. Podemos suspender o acesso para manutenção,
          atualizações de segurança ou em caso de uso indevido. Não há
          garantia de SLA contratual para colaboradores internos, embora
          monitoramos disponibilidade ativamente.
        </p>

        <h2 className="text-xl font-semibold">
          8. Limitação de responsabilidade
        </h2>
        <p>
          Na medida máxima permitida pela legislação aplicável, a Onix
          Capital não será responsável por danos indiretos, lucros
          cessantes ou perda de dados decorrentes do uso (ou impossibilidade
          de uso) da plataforma. O usuário é responsável por manter
          backups independentes de informações críticas e por verificar a
          exatidão de dados antes de tomar decisões financeiras.
        </p>

        <h2 className="text-xl font-semibold">9. Encerramento de acesso</h2>
        <p>
          A Onix Capital pode revogar seu acesso a qualquer momento,
          especialmente em caso de violação destes Termos, encerramento
          do vínculo profissional, ou suspeita de uso indevido. Após a
          revogação, os dados de auditoria associados à sua conta são
          mantidos pelo prazo descrito na Política de Privacidade.
        </p>

        <h2 className="text-xl font-semibold">10. Mudanças nestes Termos</h2>
        <p>
          Estes Termos podem ser revisados periodicamente. Mudanças
          materiais serão comunicadas no app com pelo menos 7 dias de
          antecedência. O uso continuado após a comunicação implica
          aceitação da nova versão.
        </p>

        <h2 className="text-xl font-semibold">
          11. Lei aplicável e foro
        </h2>
        <p>
          Estes Termos são regidos pelas leis brasileiras. Fica eleito o
          foro da comarca de Salvador (BA) para resolução de qualquer
          controvérsia.
        </p>

        <h2 className="text-xl font-semibold">12. Contato</h2>
        <p>
          Dúvidas sobre estes Termos:{" "}
          <a href="mailto:contato@onixcapital.com.br" className="text-primary underline">
            contato@onixcapital.com.br
          </a>
          .
        </p>

        <p className="text-sm text-muted-foreground">
          Onix Capital · Brasil
        </p>
      </section>
    </main>
  );
}
