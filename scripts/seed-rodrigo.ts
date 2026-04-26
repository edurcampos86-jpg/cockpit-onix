/**
 * Cadastra Rodrigo José Sampaio Oliveira (Onx Corretora):
 *  1) Pessoa
 *  2) PAT (extraído manualmente do PDF de 30/06/2025)
 *  3) Acordo comercial (Ajuste Particular 2 de 06/2024 — vigente)
 *
 * Não calculo numerologia: o contrato/PAT só dão a idade (50 em 30/06/2025)
 * sem data de nascimento exata. Eduardo edita pela UI depois.
 *
 * Uso: npx tsx scripts/seed-rodrigo.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "node:fs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const CPF = "60752629549";

const CONTRATO_PDF =
  "C:\\Users\\edurc\\ONIX CAPITAL AGENTE AUTONOMO DE INVESTIMENTO LTDA\\Rede Interna Onix - Documentos\\5.Jurídico\\ONX Corretora\\EQUIPE\\ATIVO\\Rodrigo José Sampaio Oliveira\\2024_06 - Ajuste Particular 2 - Rodrigo Sampaio - Ass.pdf";

const PAT_PDF =
  "C:\\Users\\edurc\\iCloudDrive\\Onix Co\\Onix Investimentos\\GESTAO E PERFORMANCE\\Teste de Perfil Jul.2025\\PAT Executive - Rodrigo Jose Sampaio Oliveira.pdf";

async function main() {
  console.log("🌱 Rodrigo José Sampaio Oliveira — pessoa + PAT + acordo\n");

  // 1) Filial e departamento
  const filialSalvador = await prisma.filial.findUnique({ where: { nome: "Salvador" } });
  const deptoCorretora = await prisma.departamento.findUnique({
    where: { nome: "Corretora" },
  });
  if (!filialSalvador || !deptoCorretora) {
    throw new Error("Filial Salvador ou Departamento Corretora não encontrados.");
  }

  // 2) Upsert da Pessoa
  console.log("👤 Pessoa:");
  const pessoaData = {
    nomeCompleto: "Rodrigo José Sampaio Oliveira",
    apelido: "Rodrigo",
    email: "rodrigo.sampaio@onixcapital.com.br",
    telefone: "(71) 99985-3113",
    cidade: "Salvador",
    dataEntrada: new Date("2023-06-30"),
    cargoFamilia: "assessor_investimentos",
    cargoTitulo:
      "Assessor de investimentos Onx Corretora (sócio em formação — 6.000 cotas / 3% se aprovar Ancord até 31/12/2024)",
    teamRole: "colaborador",
    filialId: filialSalvador.id,
    departamentoId: deptoCorretora.id,
    observacoes:
      "Vínculo com Onx Agro Corretora desde 30/06/2023. Ajuste Particular 2 firmado em 22-29/07/2024. Acordo: R$ 16.000/mês fixo + 40% receita líquida captada diretamente + 30% receita Corporate de negócios captados por outros assessores. Dependentes no plano de saúde: Maria Clara Falcão Sampaio Oliveira (17 anos) e Maria Fernanda Azevedo Sampaio Oliveira (11 anos). Limite plano: R$ 2.000. Endereço contrato: Rua Magno Valente, 110, Edf. Transatlântico, torre B, apt. 50, Salvador/BA, CEP 41810-620. Idade 50 em 30/06/2025 (nasceu ~1975 — data exata pendente).",
  };

  const existing = await prisma.pessoa.findUnique({
    where: { cpf: CPF },
    select: { id: true },
  });

  let pessoaId: string;
  if (existing) {
    await prisma.pessoa.update({ where: { id: existing.id }, data: pessoaData });
    pessoaId = existing.id;
    console.log("  ↻ Rodrigo (atualizado)");
  } else {
    const created = await prisma.pessoa.create({
      data: { ...pessoaData, cpf: CPF, status: "ativo" },
    });
    pessoaId = created.id;
    console.log("  + Rodrigo (novo)");
  }

  // 3) PAT — extração manual
  console.log("\n🧠 PAT:");
  const patExistente = await prisma.pat.findFirst({
    where: { pessoaId, status: "extraido" },
  });

  if (patExistente) {
    console.log(`  ↻ Já tem PAT (${patExistente.dataPat.toISOString().slice(0, 10)})`);
  } else {
    let patPdfBase64: string | null = null;
    let patBytes: number | null = null;
    try {
      const buf = fs.readFileSync(PAT_PDF);
      patPdfBase64 = buf.toString("base64");
      patBytes = buf.length;
    } catch (e) {
      console.log(`  ⚠ Não conseguiu ler PDF do PAT: ${(e as Error).message.slice(0, 80)}`);
    }

    await prisma.pat.create({
      data: {
        pessoaId,
        filename: "PAT Executive - Rodrigo Jose Sampaio Oliveira.pdf",
        pdfBase64: patPdfBase64,
        bytes: patBytes,
        dataPat: new Date("2025-06-30"),
        status: "extraido",
        perspectiva: "Baixa",
        ambienteCelula: 12,
        ambienteNome: "Controlado",
        orientacao: "Técnico",
        aproveitamento: "Sobreaproveitado",
        principaisCompetencias: [
          "Empreendedorismo",
          "Visão sistêmica",
          "Criatividade corporativa",
        ],
        caracteristicas: [
          "Sincero",
          "Criativo",
          "Preocupado",
          "Imaginativo",
          "Determinado",
          "Empreendedor",
          "Dinâmico",
          "Rápido",
          "Aprende depressa",
        ],
        estrutural: {
          spread: 30,
          spreadNivel: "Médio",
          suporteEstrutural: 38,
          suporteNivel: "Baixo",
          perspectivaValor: -8,
          aproveitamento: "Sobreaproveitado",
          cicloAlertaHoras: 7,
        },
        iconeEstrutural: {
          analiseAprendizagem: { tipo: "Intuitiva", valor: 17, intensidade: "Intenso" },
          fonteMotivadora: { tipo: "Próprias Ideias", valor: 7, intensidade: "Moderado" },
          estrategiaTempo: { tipo: "Hoje Melhor", valor: 13, intensidade: "Intenso" },
          confortoAmbiente: { tipo: "Estruturado", valor: 3, intensidade: "Moderado" },
          orientacao: { tipo: "Técnica", valor: 24, intensidade: "Extremo" },
          ponderacao: { tipo: "Equilibrada", valor: 0, intensidade: "Moderado" },
        },
        tendencias: {
          foco: 46, // % Especialista
          orientacao: 9, // 100 - 91 (% Social)
          acao: 100, // % Promovedor
          conexao: 20, // % Ponderada
          relacionamento: 33, // % Informal
          regras: 53, // % Cuidadoso
          suportePressao: 32,
        },
        risco: { estrutural: 1.6, interno: 3.5, atual: 2.1 },
        competenciasEstrategicas: [],
        ambiente: {
          celula: 12,
          nome: "Controlado",
          desafios: 25,
          habilidades: 14,
          percepcaoPredominante: "Consciente, sem autonomia, refém do ambiente.",
        },
        resumido:
          "Rodrigo é um excelente pensador analítico intuitivo e estruturado. Forte senso de urgência, sempre interessado na forma lógica e racional de efetuar as suas atividades. Critérios bastante pessoais para analisar o novo. Aplica-se ao trabalho de forma completa, conhecendo todos os detalhes envolvidos. Conhecido como competente, mantém comunicação franca e direta. Visão clara sobre possibilidades futuras, com potencial para organizar e implantar ideias. Adora desafios complexos e sintetiza rapidamente assuntos teóricos e abstratos. Hábil e criativo com o que é científico, eficiente e orientado para resultados. A automotivação é ingrediente-chave neste perfil. Constante busca por atividades diversas e rápido a observar coisas novas, sem perder o senso original de direção.",
        detalhado:
          "## Precisão cirúrgica de processos\nExtremamente preciso nas decisões em relação a ações que envolvam risco dentro de suas habilidades. Mostra bastante imaginação, capacidade de criação e implementação de novas ideias. Capaz de analisar, compreender e melhorar técnicas, sistemas. Pessoa de bom nível de ação, focado nos resultados. Trabalho regido pela motivação e interesse profissional. Suas ações são resultado de cautelosa estratégia. Valoriza muito o conhecimento, exigente quanto à competência própria e dos outros. Não aprecia confusão, bagunça e ineficiência.\n\n## Comunicação\nEm assuntos sociais pode se mostrar privativo e tímido. Mais à vontade em situações mistas do que em ambientes sociais por essência. Quando encontra conversa que lhe agrada, expressa ampla e convincentemente. Comunicação pode ser mais impositiva que persuasiva, mais dura e curta — mas também direta, concisa e comedida.\n\n## Estratégia através do tempo\nFaz as coisas de forma rápida e correta. Senso de urgência aguçado — parte imediatamente para resolução de problemas, colocando pressão sobre si e sobre os outros. Pode se sobrecarregar — alto padrão de qualidade dificulta delegar.\n\n## Aprendizado\nRápido e preciso, com grande capacidade de abstração. Motivado pelo novo. Pode se tornar perito nas áreas a que se dedica. Raciocínio profundo e analítico.\n\n## Resultado\nObservação e captação de qualquer falha dentro da sua área. Capacitação intelectual e habilidade técnica como alicerce. Dedica grande importância às suas atividades e responsabilidades. Necessita estar ativo grande parte do tempo. Impaciente com má vontade ou incapacidade dos outros de manter o ritmo. Reage rápido a novos desenvolvimentos sem perder objetivos.\n\n## Como é visto\nReservado, difícil de conhecer, distante. Conceitual, original e independente. Habilidade de transformar criatividade e visão interna em planos. Pode ser considerado difícil porque não expressa a visão diretamente. Disposto a mudar de opinião ao surgir novas evidências.",
        sugestoes:
          '- Conscientizar-se mais do impacto das suas ideias nos outros;\n- Aprender a dar reconhecimento às pessoas;\n- Pedir "feedback" e sugestões;\n- Aprender quando desistir de uma ideia que não seja prática;\n- Trabalhar na própria comunicação para que esta seja mais eficaz.',
        gerencial:
          "## Contribuições para a organização\n- Apresenta forte capacidade de expandir e controlar os negócios.\n- Melhora os produtos para aumentar a competitividade.\n- Organiza ideias em planos de ação.\n- Trabalha para remover todos os obstáculos e atingir os objetivos.\n- Apresenta forte noção do que a organização pode vir a ser.\n\n## Estilo de liderança\n- Exige muito de si mesmo e dos outros para atingir os objetivos.\n- Apresenta ideias originais e adequadas ao momento.\n- Prático e realista com os outros e consigo mesmo.\n- Conceitualiza, desenha e constrói novos modelos.\n- Quando necessário, disposto a reorganizar incessantemente todo o sistema.\n- Tende a centralizar autoridade e detalhes — pode ficar sobrecarregado.\n\n## Ambiente de trabalho preferido\n- Com pessoas determinadas, intelectualmente desafiadoras, concentradas em visões de longo prazo.\n- Que permita privacidade para reflexão.\n- Com pessoas efetivas, produtivas e comprometidas.\n- Que confie e encoraje a sua autonomia.\n\n## Quando pressionado\nQuando muito pressionado, pode participar exageradamente de atividades sensitivas (TV, jogos, comer em excesso). Pode também se concentrar exageradamente em detalhes específicos.\n\n## Estratégias eficazes de gerenciamento\n1. Ter autonomia para expressar ideias e realizá-las.\n2. Oportunidade para crescimento pessoal e profissional.\n3. Oportunidades de conhecimentos técnicos.\n4. Envolvimento com pessoas deve partir da decisão dele (direcionar para IE — Inteligência Emocional).\n5. Poder para assumir maiores responsabilidades.\n6. Reconhecer resultados alcançados.\n7. Prover desafios profissionais e intelectuais.\n\n## Pontos de alerta\n- Pode criticar os outros em sua busca pelo ideal.\n- Pode ter dificuldade em abrir mão de suas ideias.\n- Pode não ter consciência do impacto de suas ideias ou estilo nas pessoas.\n- Pode parecer frio ao decidir sobre pessoas.\n- Pode parecer duro com as pessoas a ponto de causar medo de aproximação.",
      },
    });
    console.log("  + PAT 30/06/2025 | Baixa | Controlado | Técnico");
  }

  // 4) Acordo comercial
  console.log("\n💼 Acordo comercial:");
  const acordoExistente = await prisma.acordoComercial.findFirst({
    where: { pessoaId, dataFim: null, tipo: "misto" },
  });

  if (acordoExistente) {
    console.log("  ↻ Já tem acordo vigente");
  } else {
    let pdfBase64: string | null = null;
    let pdfBytes: number | null = null;
    try {
      const buf = fs.readFileSync(CONTRATO_PDF);
      pdfBase64 = buf.toString("base64");
      pdfBytes = buf.length;
    } catch (e) {
      console.log(
        `  ⚠ Falha ao ler contrato: ${(e as Error).message.slice(0, 80)} — salvando sem PDF`,
      );
    }

    await prisma.acordoComercial.create({
      data: {
        pessoaId,
        tipo: "misto",
        dataInicio: new Date("2024-06-01"),
        regrasEspeciais: `Antecipação de lucros mínima:
• R$ 16.000,00/mês fixo

OU (alternativa, o que for maior):
• 40% da receita líquida dos negócios captados diretamente pelo SÓCIO
• + 30% da receita líquida da área Corporate da ONIX (negócios captados por outros assessores)

Cláusulas relevantes:
• Vínculo mínimo: 12 meses (multa R\$ 100.000 se sair antes)
• Renovação automática se faturamento Corporate > R\$ 800.000 (sem aditivo)
• Plano de saúde Onx (limite R\$ 2.000) com inclusão de 2 dependentes
• Pagamento até dia 22 do mês subsequente; comissionamento divulgado até dia 15

Promessa de bonificação:
• Se aprovar Ancord até 31/12/2024 → bonificado com 6.000 cotas (3% do capital social)
• Em caso de retirada antes de 5 anos da assinatura → devolução das cotas`,
        observacoes:
          "Ajuste Particular 2 com Onx Agro Corretora (CNPJ 31.238.019/0001-02). Revoga o ajuste de 30/06/2023. Assinado em 22-29/07/2024 via Clicksign. Vigência 12 meses (auto-renovável se meta cumprida). Sócio em formação.",
        contratoFilename: "2024_06 - Ajuste Particular 2 - Rodrigo Sampaio - Ass.pdf",
        contratoMimeType: pdfBase64 ? "application/pdf" : null,
        contratoBase64: pdfBase64,
        contratoBytes: pdfBytes,
      },
    });
    const tag = pdfBase64 ? `📎 ${Math.round((pdfBytes ?? 0) / 1024)}KB` : "(sem PDF)";
    console.log(`  + misto | 2024-06-01 | ${tag}`);
  }

  console.log("\n✅ Concluído — Rodrigo cadastrado em /time");
}

main()
  .catch((e) => {
    console.error("FALHOU:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
