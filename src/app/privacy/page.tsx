import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidade · Ecossistema Onix",
  description:
    "Como o Ecossistema Onix coleta, usa, armazena e protege dados pessoais e dados de contas Google conectadas.",
};

const ULTIMA_ATUALIZACAO = "19 de maio de 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <div className="mb-8 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-primary">
          ← Voltar
        </Link>
      </div>

      <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
        Política de Privacidade
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Última atualização: {ULTIMA_ATUALIZACAO}
      </p>

      <section className="prose prose-zinc dark:prose-invert mt-10 max-w-none space-y-6">
        <h2 className="text-xl font-semibold">1. Quem somos</h2>
        <p>
          O <strong>Ecossistema Onix</strong> (&quot;Onix&quot;, &quot;nós&quot;) é uma plataforma
          interna de gestão usada pela Onix Capital para apoiar assessores
          financeiros e equipe administrativa. Não é um produto comercial
          aberto ao público — o acesso é restrito a colaboradores autorizados.
        </p>
        <p>
          Esta Política descreve quais dados pessoais coletamos, por quê, com
          quem compartilhamos e como você pode exercer seus direitos.
        </p>

        <h2 className="text-xl font-semibold">2. Dados que coletamos</h2>
        <h3 className="text-lg font-medium">2.1 Dados do colaborador (você)</h3>
        <ul className="list-disc pl-6">
          <li>Nome, CPF e e-mail corporativo (para login e identificação).</li>
          <li>Senha (armazenada com hash bcrypt — nunca em texto puro).</li>
          <li>Função, filial, foto de avatar (quando informados).</li>
          <li>
            Logs de uso: páginas acessadas, ações registradas, horários,
            endereço IP. Mantidos para auditoria e segurança.
          </li>
        </ul>

        <h3 className="text-lg font-medium">2.2 Dados de clientes da Onix</h3>
        <p>
          Como ferramenta interna, processamos dados dos clientes que a Onix
          Capital atende: nome, CPF, e-mail, telefone, endereço, dados
          financeiros (saldo, movimentações) e histórico de relacionamento.
          O tratamento desses dados segue a LGPD (Lei 13.709/2018) e a
          relação contratual entre o cliente e a Onix Capital.
        </p>

        <h3 className="text-lg font-medium">
          2.3 Dados acessados via integrações (Google, Microsoft, BTG)
        </h3>
        <p>
          Quando você conecta sua conta Google ao Ecossistema Onix, podemos
          acessar:
        </p>
        <ul className="list-disc pl-6">
          <li>
            <strong>Google Calendar (leitura + escrita):</strong> lemos eventos
            do seu calendário primário para alimentar o Painel do Dia e
            cruzar reuniões com a base de clientes; escrevemos eventos
            quando você agenda posts editoriais.
          </li>
          <li>
            <strong>Gmail (somente leitura):</strong> lemos metadados e
            preview de e-mails não lidos das últimas 24 horas para identificar
            mensagens que pedem ação. Não acessamos anexos, não enviamos
            e-mails em seu nome e não armazenamos o corpo completo das
            mensagens.
          </li>
          <li>
            <strong>OIDC userinfo:</strong> e-mail e nome da conta Google
            conectada, exibidos na tela de Integrações para você confirmar
            qual conta está vinculada.
          </li>
        </ul>
        <p>
          Quando você conecta sua conta <strong>Microsoft</strong> (Outlook
          via Microsoft Graph), o tratamento é equivalente:
        </p>
        <ul className="list-disc pl-6">
          <li>
            <strong>Outlook Calendar (somente leitura):</strong> lemos os
            eventos do dia para o Painel do Dia.
          </li>
          <li>
            <strong>Outlook Mail (somente leitura):</strong> lemos
            metadados/preview de e-mails não lidos das últimas 24 horas. Sem
            acesso a anexos, sem envio em seu nome.
          </li>
          <li>
            <strong>Perfil básico (User.Read):</strong> e-mail e nome da conta
            Microsoft conectada, exibidos na tela de Integrações.
          </li>
        </ul>
        <p>
          <strong>Sobre tokens:</strong> seu <em>refresh token</em> e{" "}
          <em>access token</em> (Google e Microsoft) são armazenados
          cifrados em AES-256-GCM no nosso banco de dados (Postgres). A chave
          de criptografia fica apenas no servidor. Os refresh tokens
          Microsoft expiram automaticamente após 90 dias de inatividade — você
          é solicitado a reconectar quando isso acontece.
        </p>

        <h2 className="text-xl font-semibold">
          3. Uso dos dados Google em conformidade com a política da Google
        </h2>
        <p>
          O uso e a transferência, pelo Ecossistema Onix, de informações
          recebidas das APIs do Google estarão em conformidade com a{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
            className="text-primary underline"
          >
            Política de Dados do Usuário dos Serviços de API do Google
          </a>
          , incluindo os requisitos de Uso Limitado. Especificamente:
        </p>
        <ul className="list-disc pl-6">
          <li>
            Não usamos dados do Calendar ou Gmail para servir anúncios.
          </li>
          <li>
            Não permitimos que humanos leiam seus dados Google, exceto:
            (a) com seu consentimento explícito para o caso específico,
            (b) por necessidade de segurança (ex: investigar abuso), ou
            (c) para cumprir obrigação legal.
          </li>
          <li>
            Não transferimos os dados para terceiros, exceto fornecedores
            de infraestrutura sob contrato (ver §5).
          </li>
        </ul>

        <h2 className="text-xl font-semibold">4. Base legal (LGPD)</h2>
        <p>
          O tratamento dos seus dados pessoais como colaborador se baseia
          em: (a) execução de contrato de trabalho/prestação de serviços e
          (b) legítimo interesse do controlador para gestão da operação.
          O tratamento de dados de clientes da Onix Capital tem base no
          contrato de assessoria e nos consentimentos coletados pelos
          canais oficiais.
        </p>

        <h2 className="text-xl font-semibold">5. Com quem compartilhamos</h2>
        <ul className="list-disc pl-6">
          <li>
            <strong>Provedores de infraestrutura:</strong> Railway (hospedagem),
            Anthropic (IA — Claude, apenas trechos curtos para classificação,
            sem armazenamento por parte deles), Google (APIs já mencionadas),
            BTG Pactual (dados financeiros do banco).
          </li>
          <li>
            <strong>Autoridades:</strong> apenas mediante ordem judicial ou
            obrigação legal.
          </li>
          <li>
            <strong>Nunca</strong> vendemos dados a anunciantes ou terceiros
            comerciais.
          </li>
        </ul>

        <h2 className="text-xl font-semibold">6. Retenção</h2>
        <ul className="list-disc pl-6">
          <li>
            Dados de conta de colaborador: enquanto durar o vínculo + 5 anos
            para fins fiscais e regulatórios.
          </li>
          <li>
            Tokens Google: mantidos até você desconectar (em{" "}
            <code>/integracoes</code>) ou revogar em{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline"
            >
              myaccount.google.com/permissions
            </a>
            . Após desconexão, removemos o registro do banco e tentamos
            revogar o token na Google.
          </li>
          <li>
            Cache de e-mails Gmail (metadados de inbox 24h): renovado a cada
            consulta; sem persistência de longo prazo do corpo da mensagem.
          </li>
        </ul>

        <h2 className="text-xl font-semibold">7. Seus direitos (LGPD)</h2>
        <p>Você pode, a qualquer momento:</p>
        <ul className="list-disc pl-6">
          <li>Solicitar confirmação e acesso aos seus dados;</li>
          <li>Corrigir dados incompletos, inexatos ou desatualizados;</li>
          <li>
            Solicitar a exclusão ou anonimização de dados desnecessários ou
            excessivos;
          </li>
          <li>
            Revogar consentimento e desconectar integrações (botão
            &quot;Desconectar&quot; em <code>/integracoes</code>);
          </li>
          <li>
            Solicitar portabilidade dos seus dados a outro fornecedor.
          </li>
        </ul>
        <p>
          Para exercer qualquer direito, escreva para{" "}
          <a href="mailto:contato@onixcapital.com.br" className="text-primary underline">
            contato@onixcapital.com.br
          </a>{" "}
          (assunto: &quot;LGPD — Ecossistema Onix&quot;).
        </p>

        <h2 className="text-xl font-semibold">8. Segurança</h2>
        <ul className="list-disc pl-6">
          <li>HTTPS em todo tráfego (TLS 1.2+).</li>
          <li>
            Senhas armazenadas com bcrypt; tokens Google cifrados em
            AES-256-GCM.
          </li>
          <li>
            Acesso ao banco restrito por VPN/IAM da Railway; logs de
            auditoria das mutações sensíveis.
          </li>
          <li>
            Cookies de sessão são <code>httpOnly</code>, <code>secure</code>{" "}
            e <code>sameSite=lax</code>.
          </li>
        </ul>

        <h2 className="text-xl font-semibold">9. Crianças</h2>
        <p>
          O Ecossistema Onix é uma ferramenta corporativa. Não é destinada
          a menores de 18 anos e não coletamos intencionalmente dados de
          crianças.
        </p>

        <h2 className="text-xl font-semibold">10. Mudanças nesta política</h2>
        <p>
          Esta Política pode ser atualizada para refletir mudanças na
          legislação, em integrações ou em práticas internas. Mudanças
          materiais serão comunicadas no app antes de entrarem em vigor.
        </p>

        <h2 className="text-xl font-semibold">11. Contato</h2>
        <p>
          Encarregado pelo tratamento de dados (DPO): a definir formalmente.
          Até lá, escreva para{" "}
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
