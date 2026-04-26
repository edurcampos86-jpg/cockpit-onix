/**
 * Insere os 3 PATs que extraí manualmente lendo os PDFs (sem custo Anthropic API).
 * Faltava o Thiago — PDF tem 13MB e excede o limite do leitor de PDF do Claude Code.
 *
 * Uso: npx tsx scripts/seed-pats-extracao-manual.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "node:fs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const PAT_DIR =
  "C:\\Users\\edurc\\iCloudDrive\\Onix Co\\Onix Investimentos\\GESTAO E PERFORMANCE\\Teste de Perfil Jul.2025";

type PatManual = {
  cpf: string;
  filename: string;
  dataPat: Date;
  perspectiva: "Baixa" | "Média" | "Alta";
  ambienteCelula: number;
  ambienteNome: string;
  orientacao: "Social" | "Técnico";
  aproveitamento: "Subaproveitado" | "Bem Aproveitado" | "Sobreaproveitado" | "Equilibrado";
  principaisCompetencias: string[];
  caracteristicas: string[];
  estrutural: {
    spread: number;
    spreadNivel: string;
    suporteEstrutural: number;
    suporteNivel: string;
    perspectivaValor: number;
    aproveitamento: string;
    cicloAlertaHoras: number;
  };
  iconeEstrutural: {
    analiseAprendizagem: { tipo: string; valor: number; intensidade: string };
    fonteMotivadora: { tipo: string; valor: number; intensidade: string };
    estrategiaTempo: { tipo: string; valor: number; intensidade: string };
    confortoAmbiente: { tipo: string; valor: number; intensidade: string };
    orientacao: { tipo: string; valor: number; intensidade: string };
    ponderacao: { tipo: string; valor: number; intensidade: string };
  };
  tendencias: {
    foco: number;
    orientacao: number;
    acao: number;
    conexao: number;
    relacionamento: number;
    regras: number;
    suportePressao: number;
  };
  risco: {
    estrutural: number;
    interno: number;
    atual: number;
  };
  ambiente: {
    celula: number;
    nome: string;
    desafios: number;
    habilidades: number;
    percepcaoPredominante: string;
  };
  resumido: string;
  detalhado: string;
  sugestoes: string;
  gerencial: string;
};

const PATS: PatManual[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // MATHEUS GONÇALVES CONCEIÇÃO MOREIRA — PAT 32 Analítico Estratégico Formal
  // ═══════════════════════════════════════════════════════════════════════
  {
    cpf: "84505729591",
    filename: "PAT Executive - Matheus Gonçalves Conceição Moreira.pdf",
    dataPat: new Date("2025-07-01"),
    perspectiva: "Baixa",
    ambienteCelula: 13,
    ambienteNome: "Fluxo",
    orientacao: "Técnico",
    aproveitamento: "Equilibrado",
    principaisCompetencias: [
      "Cultura da qualidade",
      "Criatividade corporativa",
      "Organização e planejamento",
    ],
    caracteristicas: [
      "Sincero",
      "Preocupado",
      "Exigente",
      "Discreto",
      "Reservado",
      "Exato",
      "Rápido",
      "Tem iniciativa (dentro da sua área)",
      "Controlador",
    ],
    estrutural: {
      spread: 34,
      spreadNivel: "Alto",
      suporteEstrutural: 70,
      suporteNivel: "Médio Alto",
      perspectivaValor: -5,
      aproveitamento: "Equilibrado",
      cicloAlertaHoras: 10,
    },
    iconeEstrutural: {
      analiseAprendizagem: { tipo: "Intuitiva", valor: 0.5, intensidade: "Moderado" },
      fonteMotivadora: { tipo: "Próprias Ideias", valor: 15.5, intensidade: "Intenso" },
      estrategiaTempo: { tipo: "Hoje Melhor", valor: 3.5, intensidade: "Moderado" },
      confortoAmbiente: { tipo: "Estruturado", valor: 18.5, intensidade: "Intenso" },
      orientacao: { tipo: "Técnica", valor: 16, intensidade: "Intenso" },
      ponderacao: { tipo: "Razão", valor: 0, intensidade: "Moderado" },
    },
    tendencias: {
      foco: 52, // % Especialista (do PDF: "52%")
      orientacao: 31, // 100 - 69 (PDF: 69% Técnico)
      acao: 11, // % Promovedor (do PDF: "11%")
      conexao: 35, // % Ponderada
      relacionamento: 0, // 100 - 100 (PDF: 100% Formal)
      regras: 64, // % Cuidadoso
      suportePressao: 35,
    },
    risco: { estrutural: 0.6, interno: 0.7, atual: 0.0 },
    ambiente: {
      celula: 13,
      nome: "Fluxo",
      desafios: 12,
      habilidades: 15,
      percepcaoPredominante:
        "Em situação ideal, producente, comprometido com o resultado, fluxo de resultados, centrado/autoconsciente, adaptado.",
    },
    resumido:
      "Matheus tende a buscar padrões bem altos de qualidade e exatidão. Como geralmente preza por isto com muito afinco, pode ser que isto seja interpretado como cautela. Embora possa hesitar em assumir riscos desnecessários, isto lhe permite fazer uma análise minuciosa dos fatores envolvidos e encontrar problemas dentro de sua área de especialização. Geralmente aprecia muito quando tudo é feito da maneira mais correta possível e tende a ser exigente em todos os aspectos. Geralmente prefere o que lhe parece previsível e sistemático e assim, pode ser interpretado por pessoas mais ativas como recatado e introvertido. Tende a valorizar conhecimento, metodologia e graduação, e geralmente requer evidências concretas. Tende a aplicar o seu conceito de organização e metodologia a tudo aquilo com o qual se envolve. Embora aprecie segurança e padrões bem estabelecidos, rotinas monótonas podem sufocar sua criatividade.",
    detalhado:
      "## Exatidão é o seu ponto forte\nMatheus tende a ter uma orientação técnica, com capacidade de apresentar soluções para problemas que possam surgir dentro da sua área de atuação. Tende a ser um especialista conservador, buscando altos padrões de qualidade que sigam à letra o manual corporativo. Seu desempenho geralmente se caracterizará como sendo regrado, ordenado e bem estruturado. Sempre apreciará e necessitará de um ambiente de trabalho bem estruturado.\n\n## Comunicação\nGeralmente será uma pessoa cautelosa também na sua comunicação, com pouca tendência a revelar informação sobre si mesmo. A sua comunicação tende a se caracterizar como bem própria, sucinta e direta. Fora da sua amplitude de atuação, geralmente se mostrará reservado e pensativo.\n\n## Estratégia através do tempo\nGeralmente demonstrará um senso de urgência e trabalhará num ritmo rápido. Ao agir dentro da sua esfera de experiência, treinamento e atuação, terá a capacidade de tomar decisões com rapidez.\n\n## Aprendizado\nAprendizado rápido e sério no que se relaciona a assuntos técnicos. Necessita de oportunidades onde possa desenvolver seu conhecimento técnico. Tende a ser muito eficaz desempenhando um papel que envolva logística.\n\n## Resultado\nProfissional sério, que preza pela qualidade de cada detalhe, que cobra a mesma qualidade dos outros que impõe a si mesmo. Tem séria aversão ao erro, podendo verificar e reverificar o trabalho. Por causa do seu estilo analítico, muitas vezes evitará ação e o risco de resultados negativos.\n\n## Como é visto\nReservado, original, independente, bastante privativo e até mesmo distante. Tem capacidade de transformar em planos a visão interna criativa, mas geralmente não costuma expressar isto abertamente.",
    sugestoes:
      '- Pedir "feedback" e sugestões;\n- Aprender a reconhecer as pessoas;\n- Aprender quando desistir de uma ideia não prática;\n- Concentrar-se mais no impacto das suas ideias nas outras pessoas;\n- Aprender a reconhecer e assumir os próprios erros.',
    gerencial:
      "## Contribuições para a organização\n- Controla e organiza.\n- Demonstra fidelidade e sigilo em cargos de confiança.\n- Localiza erros com rapidez e os corrige.\n- Age com rapidez e precisão em sua área de atuação.\n- Treina tecnicamente quando solicitado.\n- Atua com comprometimento e seriedade.\n- Possui ideias necessárias para a melhoria do setor que atua.\n\n## Estilo de liderança\n- Exige muito de si mesmo e dos outros para atingir os objetivos da organização.\n- Acompanha de perto cada passo do processo.\n- Usa uma linguagem direta, técnica e com pouco afago.\n- É justo quanto aos direitos.\n- É prático e realista.\n- É duro, exigente, mas sincero.\n\n## Ambiente de trabalho preferido\n- Previsível, onde tudo seja combinado antes.\n- Que aprecie a qualidade do trabalho.\n- Que ofereça constante treinamento.\n- Que permita privacidade para a reflexão.\n- Eficiente e organizado.\n- Com pessoas efetivas e produtivas.\n- Que não o exponha socialmente.\n- Concentrado.\n\n## Quando pressionado\nQuando muito pressionado pode reagir positivamente, se estiver bem treinado, caso contrário, vai exagerar em planejamentos muito detalhados, sendo crítico consigo mesmo e com os outros, resultando em somatizações orgânicas e emocionais. Verá pressão como crítica.\n\n## Estratégias eficazes de gerenciamento\n1. Clarificar as metas e objetivos da empresa.\n2. Definir quais as suas responsabilidades, deveres e autoridade.\n3. Oportunidades para demonstrar suas habilidades técnicas.\n4. Reconhecimento por sua competência e potencial.\n5. Se necessário, treinar e incentivar o relacionamento e a comunicação com as outras pessoas.\n\n## Pontos de alerta\n- Pode parecer tão distante que as pessoas fiquem com medo de se aproximarem ou de desafiá-lo.\n- Pode ser muito crítico dos outros, e até de si mesmo em sua busca pelo ideal.\n- Pode ter dificuldade em se libertar de ideias tradicionais.\n- Pode ignorar o impacto de suas ideias e estilo nas pessoas.",
  },
  // ═══════════════════════════════════════════════════════════════════════
  // RENAN AFONSO DE PAULA — PAT 110 Extro-Diligente
  // ═══════════════════════════════════════════════════════════════════════
  {
    cpf: "04784951539",
    filename: "PAT Executive - Renan Afonso de Paula.pdf",
    dataPat: new Date("2025-06-30"),
    perspectiva: "Alta",
    ambienteCelula: 7,
    ambienteNome: "Crescimento",
    orientacao: "Social",
    aproveitamento: "Subaproveitado",
    principaisCompetencias: [
      "Foco no cliente",
      "Cultura da qualidade",
      "Relacionamento interpessoal",
    ],
    caracteristicas: [
      "Empático",
      "Comunicativo",
      "Diplomático",
      "Organizado",
      "Prestativo",
      "Paciente",
      "Preocupado",
      "Gregário",
    ],
    estrutural: {
      spread: 8,
      spreadNivel: "Baixo",
      suporteEstrutural: 74,
      suporteNivel: "Médio Alto",
      perspectivaValor: 16,
      aproveitamento: "Subaproveitado",
      cicloAlertaHoras: 10,
    },
    iconeEstrutural: {
      analiseAprendizagem: { tipo: "Sensorial", valor: 5, intensidade: "Moderado" },
      fonteMotivadora: { tipo: "Expressão Verbal", valor: 1, intensidade: "Moderado" },
      estrategiaTempo: { tipo: "Amanhã Melhor", valor: 1, intensidade: "Moderado" },
      confortoAmbiente: { tipo: "Estruturado", valor: 3, intensidade: "Moderado" },
      orientacao: { tipo: "Social", valor: 6, intensidade: "Moderado" },
      ponderacao: { tipo: "Emoção", valor: 0, intensidade: "Extremo" },
    },
    tendencias: {
      foco: 100,
      orientacao: 75,
      acao: 25, // 100 - 75 (PDF: 75% Mantenedor)
      conexao: 1, // PDF: 1% Ponderada
      relacionamento: 25,
      regras: 62,
      suportePressao: 45,
    },
    risco: { estrutural: 1.2, interno: 1.6, atual: 2.0 },
    ambiente: {
      celula: 7,
      nome: "Crescimento",
      desafios: 37,
      habilidades: 25,
      percepcaoPredominante:
        "Convergente e aprendiz em crescimento, necessita clarificar um pouco mais as metas.",
    },
    resumido:
      "Renan tende a ser uma pessoa que desenvolve, com o tempo e treinamento adequado, ótimas habilidades para fazer suas tarefas de forma precisa e consciente. Geralmente terá um desempenho dentro das diretrizes e regulamentos corporativos estabelecidos. Tende a buscar uma existência pessoal e profissional que forneça firmeza, segurança e estabilidade. Dons como interesse pelos outros, calor e amabilidade, fazem com que seja notado e bem conhecido. Tende a ser sociável, cooperativo, podendo lidar de forma fácil e despretensiosa com uma variedade ampla de pessoas. Geralmente passará uma imagem sem alarde, com características tendendo mais para o conservador e a modéstia.",
    detalhado:
      "## Uma pessoa aplicada e rápida em tudo que se propõe a fazer\nRenan será uma pessoa cuidadosa, que aprecia seguir rigorosamente as políticas e regulamentos vigentes. Tipicamente não dará origem a alterações nos processos. Geralmente apreciará qualidade e será fortemente motivado quanto a responsabilidades e deveres.\n\n## Comunicação\nAfável e simpático, geralmente fazendo uso de uma comunicação fluente, motivadora, e influenciadora. Tende a buscar sempre desenvolver e manter a harmonia entre todos. Tem habilidade para ouvir com dedicação e paciência. Geralmente busca agradar tanto na sua comunicação quanto no seu desempenho. Tem senso bem definido de hierarquia.\n\n## Estratégia através do tempo\nConstante busca por segurança e estabilidade de rotinas no ambiente. Tende a se preocupar em montar uma estratégia correta de como seguir o que foi combinado, e a ficar apreensivo quando o seu tempo estiver sendo gasto com espera ou re-trabalho. Capaz de desenvolver atividades que requeiram atenção aos detalhes.\n\n## Aprendizado\nOtimizado quando realizado através da comprovação material e científica do assunto. Tudo deve ser sentido, experimentado e repetido para uma melhor fixação. Aprende num ritmo próprio, profundamente, e nunca superficialmente. Aprendiz dedicado e cooperador.\n\n## Resultado\nCapaz de desenvolver atividades que requeiram atenção a detalhes, estabilidade, constância e dedicação. Ao receber treinamento bem desenvolvido, terá um desempenho de alta qualidade e confiabilidade. Mesmo realizando o mesmo trabalho todos os dias não perde a concentração. Quando criticar, procurará fazê-lo de uma maneira positiva e agradável.\n\n## Como é visto\nSociável, comunicativo, entusiasmado, organizado, meticuloso, comprometido com a preservação das tradições. Tende a preferir concordar com as pessoas para a harmonia ser mantida. Valoriza laços familiares e sociais.",
    sugestoes:
      "- Aprender como valorizar e gerenciar um conflito;\n- Levar em consideração as necessidades humanas;\n- Escutar com cuidado o que os outros realmente necessitam ou querem;\n- Considerar as implicações lógicas e globais das suas decisões.",
    gerencial:
      "## Contribuições para a organização\n- Trabalha bem com as pessoas, especialmente em equipe.\n- Presta atenção às necessidades e desejos alheios.\n- Respeita regras e autoridades.\n- Lida com operações diárias eficientemente.\n- Contribui naturalmente para um bom clima.\n\n## Estilo de liderança\n- Lidera através de atenção pessoal para com os outros.\n- Obtém bons relacionamentos.\n- Mantém as pessoas bem informadas.\n- Valoriza e desenvolve os talentos.\n- Mantém as tradições da organização.\n- Observa atentamente os detalhes.\n\n## Ambiente de trabalho preferido\n- Com indivíduos cuidadosos e cooperativos, orientados para auxiliar as pessoas.\n- Com ausência de autoritarismo.\n- Organizado e com comunicações claras.\n- Amigável.\n- Com pessoas que saibam reconhecer.\n- Com pessoas sensíveis.\n- Que opere com foco definido.\n\n## Quando pressionado\nQuando muito pressionado, pode se tornar inseguro, ameaçado, medroso, descomprometido, hostil e crítico em relação a quem o pressiona.\n\n## Estratégias eficazes de gerenciamento\n1. Treinamento em sua função, direcionamento de responsabilidades.\n2. Necessita de apoio por parte da gerência e reconhecimento como membro da equipe.\n3. Permitir manter um ritmo próprio de trabalho.\n4. Oportunidade para se especializar.\n5. Reconhecimento quando seu trabalho apresenta qualidade.\n6. Trabalhar com pessoas onde haja organização e comunicação profissional.\n\n## Pontos de alerta\n- Pode parecer resistente a mudanças.\n- Pode atuar num ritmo abaixo do que se espera.\n- Pode aproximar-se demais do problema, deixando de ter uma visão mais ampla.\n- Pode mascarar problemas para evitar conflitos.\n- Pode parecer melindroso diante de críticas.",
  },
  // ═══════════════════════════════════════════════════════════════════════
  // ROSILENE OLIVEIRA DOS SANTOS — PAT 118 Intro-Diligente Livre
  // ═══════════════════════════════════════════════════════════════════════
  {
    cpf: "03240230577",
    filename: "PAT Executive - Rosilene Oliveira dos Santos 2.pdf",
    dataPat: new Date("2026-01-08"),
    perspectiva: "Baixa",
    ambienteCelula: 12,
    ambienteNome: "Controlado",
    orientacao: "Social",
    aproveitamento: "Sobreaproveitado",
    principaisCompetencias: [
      "Flexibilidade",
      "Relacionamento interpessoal",
      "Criatividade corporativa",
    ],
    caracteristicas: [
      "Paciente com pessoas",
      "Imaginativa",
      "Flexível",
      "Discreta",
      "Estável",
      "Atenciosa",
      "Bom ouvinte",
    ],
    estrutural: {
      spread: 2,
      spreadNivel: "Muito Baixo",
      suporteEstrutural: 20,
      suporteNivel: "Muito Baixo",
      perspectivaValor: -7,
      aproveitamento: "Sobreaproveitado",
      cicloAlertaHoras: 4,
    },
    iconeEstrutural: {
      analiseAprendizagem: { tipo: "Sensorial", valor: 0.5, intensidade: "Moderado" },
      fonteMotivadora: { tipo: "Próprias Ideias", valor: 0.5, intensidade: "Moderado" },
      estrategiaTempo: { tipo: "Amanhã Melhor", valor: 1.5, intensidade: "Moderado" },
      confortoAmbiente: { tipo: "Livre", valor: 0.5, intensidade: "Moderado" },
      orientacao: { tipo: "Social", valor: 0.5, intensidade: "Moderado" },
      ponderacao: { tipo: "Equilibrada", valor: 0, intensidade: "Moderado" },
    },
    tendencias: {
      foco: 1,
      orientacao: 1,
      acao: 0, // 100 - 100 Mantenedor
      conexao: 100,
      relacionamento: 1,
      regras: 0, // 100 - 100 Casual
      suportePressao: 15,
    },
    risco: { estrutural: 3.2, interno: 3.5, atual: 3.4 },
    ambiente: {
      celula: 12,
      nome: "Controlado",
      desafios: 22,
      habilidades: 16,
      percepcaoPredominante: "Consciente, sem autonomia, refém do ambiente.",
    },
    resumido:
      "Rosilene tende a ser uma pessoa com uma atitude otimista, especialmente em relação a outras pessoas. Geralmente não terá um estilo competitivo e tipicamente prefere evitar situações onde possa entrar em conflito com outros. Tem ritmo mais compassado e pouco sentido de urgência, podendo trabalhar em situações que outros achariam repetitivas. Estilo pessoal e profissional mais tranquilo, com capacidade de se adaptar aos fatores que estão acima do seu controle. Tende a viver o presente, silenciosamente alegre, valorizando a liberdade. Fiel em cumprir as obrigações relacionadas às pessoas e coisas que são importantes para ela. Tem afinidade com a natureza e com a beleza dos seres vivos.",
    detalhado:
      "## Uma pessoa moderada\nPessoa ponderada que planeja cuidadosamente suas palavras e ações e dificilmente age impulsivamente. Pode resultar em resistência às mudanças ou a uma ação direta. Busca estar em harmonia e ser flexível em relação às necessidades e sentimentos alheios.\n\n## Comunicação\nInterage confortavelmente com os outros, geralmente sendo mais passiva. Atenciosa, gentil e sensível, com habilidade nata para ouvir e se comunicar agradavelmente. Mais reativa que assertiva.\n\n## Estratégia através do tempo\nDesenvolve suas atividades dentro de um ritmo muito pessoal e provavelmente menos acelerado. Aprecia a estabilidade. Capaz de desenvolver atividades e processos repetitivos e rotineiros.\n\n## Aprendizagem\nOtimizado quando realizado através da comprovação e repetição. Tudo deve ser sentido, experimentado e repetido. Aprende num ritmo próprio. Geralmente aprenderá mais fazendo e repetindo do que lendo ou escutando.\n\n## Resultado\nDefine valores internos fundados nas próprias percepções e os coloca em vigor. Aprecia compasso mais calmo e estruturado. Quer contribuir para a felicidade e bem-estar alheios. Não aprecia mudanças. Sob liderança consciente que lhe auxilie, irá até o fim.\n\n## Como é vista\nQuieta, tímida, reservada e tolerante. Difícil de se conhecer pois afeto e bom humor podem não estar evidentes. Adaptável e flexível. Prefere observar e apoiar, nunca dominar.",
    sugestoes:
      '- Ser mais cética e desenvolver um método para analisar as informações;\n- Aprender a dar o "feedback" negativo para as pessoas e reconhecer suas próprias conquistas;\n- Desenvolver uma perspectiva mais orientada para o futuro;\n- Ser mais assertiva e direta com as pessoas;\n- Valorizar-se mais e não se subestimar.',
    gerencial:
      "## Contribuições para a organização\n- Atende às necessidades das pessoas dentro da organização.\n- Age para garantir o bem estar alheio.\n- Traz harmonia ao trabalho.\n- Une as pessoas e as tarefas através da virtude de sua natureza cooperativa.\n- Presta atenção aos aspectos humanos da organização.\n\n## Estilo de liderança\n- Prefere uma atuação com e através das pessoas.\n- Utiliza a lealdade pessoal para motivar as pessoas.\n- Costuma elogiar mais do que criticar.\n- Enfrenta situações difíceis e se adapta àquilo que for necessário.\n- Convence gentilmente utilizando-se das suas boas intenções.\n\n## Ambiente de trabalho preferido\n- Com pessoas cooperativas.\n- Que permita privacidade.\n- Flexível.\n- Esteticamente atraente.\n- Com colegas de trabalho educados.\n- Orientado para as pessoas.\n- Dinâmico, mas sem pressão exagerada.\n\n## Quando pressionada\nQuando muito pressionada, pode se tornar excessivamente insegura, desmotivada, hostil, crítica em relação aos outros, verbalizando sua irritação e julgamentos negativos para contaminar o grupo.\n\n## Estratégias eficazes de gerenciamento\n1. Mostrar a relevância de detalhes que comprometem o resultado. E clarificar muito bem as regras e normas da empresa.\n2. Liberdade para regras e normas.\n3. Quando o ambiente lhe oferece estrutura e apoio, é mais constante.\n4. Permitir manter um ritmo próprio.\n5. Trabalhar com pessoas sensíveis e gerência cautelosa ao fazer críticas.\n\n## Pontos de alerta\n- Pode atuar com lentidão quando a situação exige rapidez.\n- Pode ter dificuldade em concluir tarefas que apresentarem obstáculos.\n- Pode não ser firme com as pessoas quando necessário.\n- Pode não enxergar além dos fatos presentes para compreender as coisas dentro do contexto geral.",
  },
];

async function main() {
  console.log("🌱 PATs — extração manual (sem custo Anthropic API)\n");

  let criados = 0;
  let pulados = 0;

  for (const p of PATS) {
    const pessoa = await prisma.pessoa.findUnique({
      where: { cpf: p.cpf },
      select: { id: true, apelido: true, nomeCompleto: true },
    });
    if (!pessoa) {
      console.log(`  ✗ CPF ${p.cpf} não encontrado — pulando`);
      continue;
    }

    // Pula se já existe Pat extraído pra essa pessoa
    const existente = await prisma.pat.findFirst({
      where: { pessoaId: pessoa.id, status: "extraido" },
    });
    if (existente) {
      console.log(`  ↻ ${pessoa.apelido} — já tem PAT extraído, pulando`);
      pulados++;
      continue;
    }

    // Lê o PDF (pra salvar como base64)
    const pdfPath = `${PAT_DIR}\\${p.filename}`;
    let pdfBase64: string | null = null;
    let bytes: number | null = null;
    try {
      const buf = fs.readFileSync(pdfPath);
      pdfBase64 = buf.toString("base64");
      bytes = buf.length;
    } catch (e) {
      console.log(`  ⚠ ${pessoa.apelido}: não conseguiu ler PDF (${(e as Error).message.slice(0, 50)}) — salvando sem PDF`);
    }

    await prisma.pat.create({
      data: {
        pessoaId: pessoa.id,
        filename: p.filename,
        pdfBase64,
        bytes,
        dataPat: p.dataPat,
        status: "extraido",
        perspectiva: p.perspectiva,
        ambienteCelula: p.ambienteCelula,
        ambienteNome: p.ambienteNome,
        orientacao: p.orientacao,
        aproveitamento: p.aproveitamento,
        principaisCompetencias: p.principaisCompetencias,
        caracteristicas: p.caracteristicas,
        estrutural: p.estrutural,
        iconeEstrutural: p.iconeEstrutural,
        tendencias: p.tendencias,
        risco: p.risco,
        competenciasEstrategicas: [], // sem dados detalhados na extração manual
        ambiente: p.ambiente,
        resumido: p.resumido,
        detalhado: p.detalhado,
        sugestoes: p.sugestoes,
        gerencial: p.gerencial,
      },
    });
    criados++;
    console.log(
      `  ✓ ${pessoa.apelido} — ${p.dataPat.toISOString().slice(0, 10)} | ${p.perspectiva} | ${p.ambienteNome} | ${p.orientacao}`,
    );
  }

  console.log(`\n📊 ${criados} criados, ${pulados} pulados\n`);

  const totalPats = await prisma.pat.count();
  console.log(`Total de PATs no banco: ${totalPats}`);
}

main()
  .catch((e) => {
    console.error("FALHOU:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
