-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'support',
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'rascunho',
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "scheduledTime" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedUrl" TEXT,
    "ctaType" TEXT,
    "hashtags" TEXT,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "googleCalendarEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,
    "scriptId" TEXT,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Script" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "hook" TEXT,
    "body" TEXT NOT NULL,
    "cta" TEXT,
    "ctaType" TEXT,
    "estimatedTime" TEXT,
    "hashtags" TEXT,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptVersion" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "hook" TEXT,
    "body" TEXT NOT NULL,
    "cta" TEXT,
    "ctaType" TEXT,
    "estimatedTime" TEXT,
    "hashtags" TEXT,
    "changeReason" TEXT NOT NULL DEFAULT 'edição manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scriptId" TEXT NOT NULL,

    CONSTRAINT "ScriptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "priority" TEXT NOT NULL DEFAULT 'media',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "type" TEXT NOT NULL DEFAULT 'geral',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "postId" TEXT,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'manychat',
    "stage" TEXT NOT NULL DEFAULT 'novo',
    "temperature" TEXT NOT NULL DEFAULT 'morno',
    "productInterest" TEXT,
    "notes" TEXT,
    "lastContactAt" TIMESTAMP(3),
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assignedToId" TEXT NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Relatorio" (
    "id" TEXT NOT NULL,
    "vendedor" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "periodoInicio" TIMESTAMP(3) NOT NULL,
    "periodoFim" TIMESTAMP(3) NOT NULL,
    "dataExecucao" TIMESTAMP(3) NOT NULL,
    "conversasAnalisadas" INTEGER NOT NULL,
    "pdfPath" TEXT,
    "secao1" TEXT NOT NULL,
    "secao2" TEXT NOT NULL,
    "secao3" TEXT NOT NULL,
    "secao4" TEXT NOT NULL,
    "secao5" TEXT NOT NULL,
    "secao0" TEXT,
    "scriptSemana" TEXT,
    "termometro" TEXT,
    "retomada" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Relatorio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Acao" (
    "id" TEXT NOT NULL,
    "relatorioId" TEXT NOT NULL,
    "vendedor" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "concluidaEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Acao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Metrica" (
    "id" TEXT NOT NULL,
    "relatorioId" TEXT NOT NULL,
    "vendedor" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "conversasAnalisadas" INTEGER NOT NULL,
    "conversasSemResposta" INTEGER NOT NULL DEFAULT 0,
    "reunioesAgendadas" INTEGER NOT NULL DEFAULT 0,
    "leadsPerdidos" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Metrica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RelatorioColetivo" (
    "id" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "periodoInicio" TIMESTAMP(3) NOT NULL,
    "periodoFim" TIMESTAMP(3) NOT NULL,
    "dataExecucao" TIMESTAMP(3) NOT NULL,
    "vendedoresAnalisados" TEXT NOT NULL,
    "metricasConsolidadas" TEXT,
    "scoreIndividual" TEXT,
    "termometroTime" TEXT,
    "objecoesRecorrentes" TEXT,
    "padroesPositivos" TEXT,
    "padroesRisco" TEXT,
    "scriptColetivo" TEXT,
    "planoColetivo" TEXT,
    "cumprimentoAnterior" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelatorioColetivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meta" (
    "id" TEXT NOT NULL,
    "vendedor" TEXT NOT NULL,
    "metrica" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER,
    "participants" TEXT,
    "vendedor" TEXT,
    "transcription" TEXT,
    "summary" TEXT,
    "actionItems" TEXT,
    "insights" TEXT,
    "source" TEXT NOT NULL DEFAULT 'plaud',
    "externalId" TEXT,
    "audioUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "leadId" TEXT,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "InstagramPost" (
    "id" TEXT NOT NULL,
    "instagramId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "caption" TEXT,
    "permalink" TEXT,
    "pilar" TEXT,
    "formato" TEXT,
    "ctaType" TEXT,
    "tema" TEXT,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saved" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "totalInteractions" INTEGER NOT NULL DEFAULT 0,
    "engagementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saveRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "insightsCollectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyAnalysis" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "totalPosts" INTEGER NOT NULL DEFAULT 0,
    "newFollowers" INTEGER NOT NULL DEFAULT 0,
    "lostFollowers" INTEGER NOT NULL DEFAULT 0,
    "totalFollowers" INTEGER NOT NULL DEFAULT 0,
    "metricas" TEXT NOT NULL,
    "descobertas" TEXT NOT NULL,
    "recomendacoes" TEXT NOT NULL,
    "proximosTemas" TEXT,
    "geradoPor" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recommendation" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "impactoEsperado" TEXT,
    "prioridade" TEXT NOT NULL DEFAULT 'media',
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "weeklyAnalysisId" TEXT,

    CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptAdjustment" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT,
    "ajuste" TEXT NOT NULL,
    "motivacao" TEXT NOT NULL,
    "statusAntes" TEXT,
    "statusDepois" TEXT,
    "aplicado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recommendationId" TEXT NOT NULL,

    CONSTRAINT "ScriptAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaMensal" (
    "id" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "metaFaturamento" DOUBLE PRECISION NOT NULL,
    "faturamentoAtual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaMensal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NegocioPipeline" (
    "id" TEXT NOT NULL,
    "nomeCliente" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "responsavel" TEXT NOT NULL,
    "etapa" TEXT NOT NULL,
    "ultimaAtividade" TIMESTAMP(3) NOT NULL,
    "externalId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "motivoPerda" TEXT,
    "dataPerda" TIMESTAMP(3),
    "dataRecontato" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NegocioPipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertaResolucao" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "acaoTomada" TEXT NOT NULL,
    "resolvidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertaResolucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RitualExecucao" (
    "id" TEXT NOT NULL,
    "ritualId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "realizado" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RitualExecucao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClienteBackoffice" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "numeroConta" TEXT NOT NULL,
    "saldo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "saldoConta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "classificacao" TEXT NOT NULL DEFAULT 'C',
    "classificacaoManual" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "telefone" TEXT,
    "aniversario" TIMESTAMP(3),
    "profissao" TEXT,
    "nicho" TEXT,
    "endereco" TEXT,
    "complemento" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "cep" TEXT,
    "estadoCivil" TEXT,
    "genero" TEXT,
    "nacionalidade" TEXT,
    "cpfConjuge" TEXT,
    "tipoConta" TEXT,
    "perfilEmocional" TEXT,
    "observacoes" TEXT,
    "ultimoContatoAt" TIMESTAMP(3),
    "ultimaReuniaoAt" TIMESTAMP(3),
    "proximaReuniaoAt" TIMESTAMP(3),
    "proximoContatoAt" TIMESTAMP(3),
    "ultimaSyncDatacrazy" TIMESTAMP(3),
    "receitaAnual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cpfCnpj" TEXT,
    "perfilInvestidor" TEXT,
    "suitabilityValidoAte" TIMESTAMP(3),
    "tipoInvestidor" TEXT,
    "faixaCliente" TEXT,
    "ativacaoConta" TEXT,
    "pendenciaCadastral" TEXT,
    "dataAberturaConta" TIMESTAMP(3),
    "dataUltimaRevisaoCadastral" TIMESTAMP(3),
    "dataProximaRevisaoCadastral" TIMESTAMP(3),
    "idClienteBtg" TEXT,
    "tipoParceiro" TEXT,
    "escritorio" TEXT,
    "codigoEscritorio" TEXT,
    "assessorCge" TEXT,
    "assessorNome" TEXT,
    "assessorEmail" TEXT,
    "breakdownProdutos" JSONB,
    "positionDate" TIMESTAMP(3),
    "coHolders" JSONB,
    "usuariosBtg" JSONB,
    "ultimaSyncBtg" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClienteBackoffice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReuniaoCliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "titulo" TEXT,
    "realizada" BOOLEAN NOT NULL DEFAULT false,
    "matchedVia" TEXT NOT NULL,
    "matchScore" INTEGER,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReuniaoCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentacaoBtg" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "numeroConta" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL,
    "descricao" TEXT,
    "mercado" TEXT,
    "ativo" TEXT,
    "valor" DOUBLE PRECISION NOT NULL,
    "valorLiquido" DOUBLE PRECISION,
    "hashUnico" TEXT NOT NULL,
    "payloadBruto" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentacaoBtg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BtgSyncLog" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "iniciado" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizado" TIMESTAMP(3),
    "sucesso" BOOLEAN NOT NULL DEFAULT false,
    "contasProcessadas" INTEGER NOT NULL DEFAULT 0,
    "contasComErro" INTEGER NOT NULL DEFAULT 0,
    "resumo" TEXT,
    "erros" JSONB,
    "trigger" TEXT,
    "userId" TEXT,

    CONSTRAINT "BtgSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InteracaoCliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "canal" TEXT,
    "assunto" TEXT NOT NULL,
    "resumo" TEXT,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duracaoMin" INTEGER,
    "rcaNotas" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InteracaoCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaCliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "prazoData" TIMESTAMP(3),
    "valorAlvo" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'ativa',
    "categoria" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoVida" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "recorrente" BOOLEAN NOT NULL DEFAULT false,
    "lembrar" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoVida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Indicacao" (
    "id" TEXT NOT NULL,
    "indicadorId" TEXT,
    "nomeIndicado" TEXT NOT NULL,
    "emailIndicado" TEXT,
    "telefoneIndicado" TEXT,
    "status" TEXT NOT NULL DEFAULT 'recebida',
    "valorEstimado" DOUBLE PRECISION,
    "agradecimentoEnviado" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Indicacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PerfilDescoberta" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "valoresVida" TEXT,
    "medos" TEXT,
    "sonhos" TEXT,
    "legado" TEXT,
    "experienciaPrev" TEXT,
    "linguagemPref" TEXT,
    "mentorReferencia" TEXT,
    "familiaSituacao" TEXT,
    "perguntaMagica" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerfilDescoberta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanoUmaPagina" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "visaoFamiliar" TEXT,
    "objetivoPrincipal" TEXT,
    "horizonteAnos" INTEGER,
    "perfilRisco" TEXT,
    "alocacaoAlvo" TEXT,
    "riscosPrincipais" TEXT,
    "proximosPassos" TEXT,
    "resumoExecutivo" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanoUmaPagina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistOrganizacao" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "testamento" BOOLEAN NOT NULL DEFAULT false,
    "seguroVida" BOOLEAN NOT NULL DEFAULT false,
    "planoSucessao" BOOLEAN NOT NULL DEFAULT false,
    "reservaEmergencia" BOOLEAN NOT NULL DEFAULT false,
    "planoSaude" BOOLEAN NOT NULL DEFAULT false,
    "procuracao" BOOLEAN NOT NULL DEFAULT false,
    "inventarioBens" BOOLEAN NOT NULL DEFAULT false,
    "beneficiariosAtual" BOOLEAN NOT NULL DEFAULT false,
    "declaracaoIR" BOOLEAN NOT NULL DEFAULT false,
    "planejamentoTributario" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistOrganizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryAnalogia" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "analogia" TEXT NOT NULL,
    "quandoUsar" TEXT,
    "tags" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryAnalogia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceitaItem" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "faturamento" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "imposto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "faturamentoLiquido" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "assessor" TEXT,
    "parceiro" TEXT,
    "departamento" TEXT,
    "classificacao" TEXT,
    "categoria" TEXT,
    "produto" TEXT,
    "nomeCliente" TEXT,
    "loteId" TEXT NOT NULL,
    "hash" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceitaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PainelPrioridade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "posicao" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "sugeridaPorBoot" BOOLEAN NOT NULL DEFAULT false,
    "bootMotivo" TEXT,
    "tempoEstimadoMin" INTEGER,
    "focusBlockEventId" TEXT,
    "focusBlockProvider" TEXT,
    "focusBlockStart" TIMESTAMP(3),
    "focusBlockEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PainelPrioridade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcaoPainel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "vence" TIMESTAMP(3),
    "importante" BOOLEAN NOT NULL DEFAULT false,
    "noMeuDia" BOOLEAN NOT NULL DEFAULT false,
    "quadrante" TEXT,
    "origem" TEXT NOT NULL,
    "externoId" TEXT,
    "projetoPm" TEXT,
    "pendingSync" BOOLEAN NOT NULL DEFAULT false,
    "syncOp" TEXT,
    "syncError" TEXT,
    "resultado" TEXT,
    "tempoGastoMin" INTEGER,
    "clienteVinculadoId" TEXT,
    "concluidaEm" TIMESTAMP(3),
    "registradaCrm" BOOLEAN NOT NULL DEFAULT false,
    "tempoEstimadoMin" INTEGER,
    "criadaDeEmailId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcaoPainel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PainelCacheExterno" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PainelCacheExterno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sources" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "SyncRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PainelSugestao" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "snoozedUntil" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "acaoId" TEXT,
    "clienteId" TEXT,
    "eventoCalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PainelSugestao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PainelRetrospectiva" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "semanaInicio" TIMESTAMP(3) NOT NULL,
    "semanaFim" TIMESTAMP(3) NOT NULL,
    "metricas" JSONB NOT NULL,
    "insight" TEXT NOT NULL,
    "dispensada" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PainelRetrospectiva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PainelEmailAI" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externoId" TEXT NOT NULL,
    "remetente" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "urgencia" TEXT NOT NULL,
    "quadranteSugerido" TEXT,
    "tituloAcao" TEXT,
    "venceSugerido" TIMESTAMP(3),
    "clienteVinculadoId" TEXT,
    "processado" BOOLEAN NOT NULL DEFAULT false,
    "arquivado" BOOLEAN NOT NULL DEFAULT false,
    "acaoGeradaId" TEXT,
    "classificadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PainelEmailAI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Filial" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "isMatriz" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Filial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Departamento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Departamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipe" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "departamentoId" TEXT NOT NULL,
    "liderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pessoa" (
    "id" TEXT NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "apelido" TEXT,
    "cpf" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "dataNascimento" TIMESTAMP(3),
    "cidade" TEXT,
    "fotoUrl" TEXT,
    "dataEntrada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataSaida" TIMESTAMP(3),
    "motivoSaida" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "cargoFamilia" TEXT NOT NULL,
    "cargoTitulo" TEXT,
    "teamRole" TEXT NOT NULL DEFAULT 'colaborador',
    "observacoes" TEXT,
    "filialId" TEXT NOT NULL,
    "departamentoId" TEXT NOT NULL,
    "equipeId" TEXT,
    "lideradoPorId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pessoa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Numerologia" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "nomeFonte" TEXT NOT NULL,
    "dataNascFonte" TIMESTAMP(3) NOT NULL,
    "caminhoVida" INTEGER NOT NULL,
    "expressao" INTEGER NOT NULL,
    "alma" INTEGER NOT NULL,
    "personalidade" INTEGER NOT NULL,
    "anoPessoal" INTEGER NOT NULL,
    "anoPessoalRef" INTEGER NOT NULL,
    "karmicos" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "masterNumbers" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "leitura" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Numerologia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContratoSocialUpload" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "pdfBase64" TEXT NOT NULL,
    "bytes" INTEGER,
    "nomeExtraido" TEXT,
    "cpfExtraido" TEXT,
    "dataNascExtraida" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "erroMensagem" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContratoSocialUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcordoComercial" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "regrasEspeciais" TEXT,
    "contratoFilename" TEXT,
    "contratoMimeType" TEXT DEFAULT 'application/pdf',
    "contratoBase64" TEXT,
    "contratoBytes" INTEGER,
    "dataInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFim" TIMESTAMP(3),
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcordoComercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConviteOnboarding" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConviteOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pat" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "filename" TEXT,
    "pdfBase64" TEXT,
    "bytes" INTEGER,
    "dataPat" TIMESTAMP(3) NOT NULL,
    "perspectiva" TEXT,
    "ambienteCelula" INTEGER,
    "ambienteNome" TEXT,
    "orientacao" TEXT,
    "aproveitamento" TEXT,
    "principaisCompetencias" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "caracteristicas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estrutural" JSONB,
    "iconeEstrutural" JSONB,
    "tendencias" JSONB,
    "risco" JSONB,
    "competenciasEstrategicas" JSONB,
    "ambiente" JSONB,
    "resumido" TEXT,
    "detalhado" TEXT,
    "sugestoes" TEXT,
    "gerencial" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "erroMensagem" TEXT,
    "pontosFortes" TEXT,
    "pontosAtencao" TEXT,
    "estiloComunicacao" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReuniaoTime" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "titulo" TEXT,
    "categoria" TEXT NOT NULL,
    "filename" TEXT,
    "pdfBase64" TEXT,
    "bytes" INTEGER,
    "transcricao" TEXT,
    "resumo" TEXT,
    "proximosPassos" JSONB,
    "criadoPorUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "erroMensagem" TEXT,
    "observacoes" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReuniaoTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReuniaoTimeParticipante" (
    "reuniaoId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,

    CONSTRAINT "ReuniaoTimeParticipante_pkey" PRIMARY KEY ("reuniaoId","pessoaId")
);

-- CreateTable
CREATE TABLE "Conversa" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "clienteId" TEXT,
    "instanceId" TEXT NOT NULL,
    "contactPhone" TEXT,
    "contactName" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "unmatched" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensagem" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "fromMe" BOOLEAN NOT NULL,
    "tipo" TEXT NOT NULL,
    "body" TEXT,
    "mediaUrl" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "recebidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mensagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrupoCliente" (
    "id" TEXT NOT NULL,
    "groupExternalId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "nomeGrupo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrupoCliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_cpf_key" ON "User"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Post_scriptId_key" ON "Post"("scriptId");

-- CreateIndex
CREATE INDEX "Relatorio_vendedor_idx" ON "Relatorio"("vendedor");

-- CreateIndex
CREATE INDEX "Relatorio_periodoInicio_idx" ON "Relatorio"("periodoInicio");

-- CreateIndex
CREATE INDEX "Acao_relatorioId_idx" ON "Acao"("relatorioId");

-- CreateIndex
CREATE INDEX "Acao_vendedor_concluida_idx" ON "Acao"("vendedor", "concluida");

-- CreateIndex
CREATE UNIQUE INDEX "Metrica_relatorioId_key" ON "Metrica"("relatorioId");

-- CreateIndex
CREATE INDEX "Metrica_vendedor_createdAt_idx" ON "Metrica"("vendedor", "createdAt");

-- CreateIndex
CREATE INDEX "RelatorioColetivo_periodoInicio_idx" ON "RelatorioColetivo"("periodoInicio");

-- CreateIndex
CREATE UNIQUE INDEX "Meta_vendedor_metrica_key" ON "Meta"("vendedor", "metrica");

-- CreateIndex
CREATE INDEX "Meeting_vendedor_date_idx" ON "Meeting"("vendedor", "date");

-- CreateIndex
CREATE UNIQUE INDEX "InstagramPost_instagramId_key" ON "InstagramPost"("instagramId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaMensal_mes_ano_key" ON "MetaMensal"("mes", "ano");

-- CreateIndex
CREATE UNIQUE INDEX "NegocioPipeline_externalId_key" ON "NegocioPipeline"("externalId");

-- CreateIndex
CREATE INDEX "NegocioPipeline_ativo_ultimaAtividade_idx" ON "NegocioPipeline"("ativo", "ultimaAtividade");

-- CreateIndex
CREATE INDEX "NegocioPipeline_etapa_idx" ON "NegocioPipeline"("etapa");

-- CreateIndex
CREATE INDEX "AlertaResolucao_negocioId_idx" ON "AlertaResolucao"("negocioId");

-- CreateIndex
CREATE INDEX "RitualExecucao_ritualId_idx" ON "RitualExecucao"("ritualId");

-- CreateIndex
CREATE INDEX "RitualExecucao_data_idx" ON "RitualExecucao"("data");

-- CreateIndex
CREATE UNIQUE INDEX "RitualExecucao_ritualId_data_key" ON "RitualExecucao"("ritualId", "data");

-- CreateIndex
CREATE INDEX "ClienteBackoffice_numeroConta_idx" ON "ClienteBackoffice"("numeroConta");

-- CreateIndex
CREATE INDEX "ClienteBackoffice_classificacao_idx" ON "ClienteBackoffice"("classificacao");

-- CreateIndex
CREATE INDEX "ClienteBackoffice_proximoContatoAt_idx" ON "ClienteBackoffice"("proximoContatoAt");

-- CreateIndex
CREATE INDEX "ClienteBackoffice_assessorCge_idx" ON "ClienteBackoffice"("assessorCge");

-- CreateIndex
CREATE INDEX "ClienteBackoffice_cpfCnpj_idx" ON "ClienteBackoffice"("cpfCnpj");

-- CreateIndex
CREATE INDEX "ClienteBackoffice_telefone_idx" ON "ClienteBackoffice"("telefone");

-- CreateIndex
CREATE INDEX "ReuniaoCliente_clienteId_startAt_idx" ON "ReuniaoCliente"("clienteId", "startAt");

-- CreateIndex
CREATE INDEX "ReuniaoCliente_source_startAt_idx" ON "ReuniaoCliente"("source", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReuniaoCliente_source_externalId_key" ON "ReuniaoCliente"("source", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "MovimentacaoBtg_hashUnico_key" ON "MovimentacaoBtg"("hashUnico");

-- CreateIndex
CREATE INDEX "MovimentacaoBtg_clienteId_data_idx" ON "MovimentacaoBtg"("clienteId", "data");

-- CreateIndex
CREATE INDEX "MovimentacaoBtg_numeroConta_idx" ON "MovimentacaoBtg"("numeroConta");

-- CreateIndex
CREATE INDEX "MovimentacaoBtg_data_idx" ON "MovimentacaoBtg"("data");

-- CreateIndex
CREATE INDEX "MovimentacaoBtg_tipo_idx" ON "MovimentacaoBtg"("tipo");

-- CreateIndex
CREATE INDEX "BtgSyncLog_tipo_iniciado_idx" ON "BtgSyncLog"("tipo", "iniciado");

-- CreateIndex
CREATE INDEX "BtgSyncLog_iniciado_idx" ON "BtgSyncLog"("iniciado");

-- CreateIndex
CREATE INDEX "InteracaoCliente_clienteId_data_idx" ON "InteracaoCliente"("clienteId", "data");

-- CreateIndex
CREATE INDEX "InteracaoCliente_tipo_idx" ON "InteracaoCliente"("tipo");

-- CreateIndex
CREATE INDEX "MetaCliente_clienteId_idx" ON "MetaCliente"("clienteId");

-- CreateIndex
CREATE INDEX "EventoVida_data_idx" ON "EventoVida"("data");

-- CreateIndex
CREATE INDEX "EventoVida_clienteId_idx" ON "EventoVida"("clienteId");

-- CreateIndex
CREATE INDEX "Indicacao_status_idx" ON "Indicacao"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PerfilDescoberta_clienteId_key" ON "PerfilDescoberta"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "PlanoUmaPagina_clienteId_key" ON "PlanoUmaPagina"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistOrganizacao_clienteId_key" ON "ChecklistOrganizacao"("clienteId");

-- CreateIndex
CREATE INDEX "StoryAnalogia_categoria_idx" ON "StoryAnalogia"("categoria");

-- CreateIndex
CREATE UNIQUE INDEX "ReceitaItem_hash_key" ON "ReceitaItem"("hash");

-- CreateIndex
CREATE INDEX "ReceitaItem_data_idx" ON "ReceitaItem"("data");

-- CreateIndex
CREATE INDEX "ReceitaItem_parceiro_idx" ON "ReceitaItem"("parceiro");

-- CreateIndex
CREATE INDEX "ReceitaItem_produto_idx" ON "ReceitaItem"("produto");

-- CreateIndex
CREATE INDEX "ReceitaItem_nomeCliente_idx" ON "ReceitaItem"("nomeCliente");

-- CreateIndex
CREATE INDEX "ReceitaItem_loteId_idx" ON "ReceitaItem"("loteId");

-- CreateIndex
CREATE INDEX "PainelPrioridade_userId_data_idx" ON "PainelPrioridade"("userId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "PainelPrioridade_userId_data_posicao_key" ON "PainelPrioridade"("userId", "data", "posicao");

-- CreateIndex
CREATE INDEX "AcaoPainel_userId_concluida_idx" ON "AcaoPainel"("userId", "concluida");

-- CreateIndex
CREATE INDEX "AcaoPainel_userId_origem_idx" ON "AcaoPainel"("userId", "origem");

-- CreateIndex
CREATE INDEX "AcaoPainel_userId_pendingSync_idx" ON "AcaoPainel"("userId", "pendingSync");

-- CreateIndex
CREATE INDEX "AcaoPainel_clienteVinculadoId_idx" ON "AcaoPainel"("clienteVinculadoId");

-- CreateIndex
CREATE INDEX "PainelCacheExterno_userId_idx" ON "PainelCacheExterno"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PainelCacheExterno_userId_source_key" ON "PainelCacheExterno"("userId", "source");

-- CreateIndex
CREATE INDEX "SyncRequest_userId_status_idx" ON "SyncRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "SyncRequest_userId_requestedAt_idx" ON "SyncRequest"("userId", "requestedAt");

-- CreateIndex
CREATE INDEX "PainelSugestao_userId_status_idx" ON "PainelSugestao"("userId", "status");

-- CreateIndex
CREATE INDEX "PainelSugestao_userId_tipo_idx" ON "PainelSugestao"("userId", "tipo");

-- CreateIndex
CREATE INDEX "PainelRetrospectiva_userId_createdAt_idx" ON "PainelRetrospectiva"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PainelRetrospectiva_userId_semanaInicio_key" ON "PainelRetrospectiva"("userId", "semanaInicio");

-- CreateIndex
CREATE INDEX "PainelEmailAI_userId_processado_idx" ON "PainelEmailAI"("userId", "processado");

-- CreateIndex
CREATE INDEX "PainelEmailAI_userId_tipo_idx" ON "PainelEmailAI"("userId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "PainelEmailAI_userId_externoId_key" ON "PainelEmailAI"("userId", "externoId");

-- CreateIndex
CREATE UNIQUE INDEX "Filial_nome_key" ON "Filial"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Departamento_nome_key" ON "Departamento"("nome");

-- CreateIndex
CREATE INDEX "Equipe_departamentoId_idx" ON "Equipe"("departamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipe_nome_departamentoId_key" ON "Equipe"("nome", "departamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "Pessoa_cpf_key" ON "Pessoa"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Pessoa_email_key" ON "Pessoa"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Pessoa_userId_key" ON "Pessoa"("userId");

-- CreateIndex
CREATE INDEX "Pessoa_status_idx" ON "Pessoa"("status");

-- CreateIndex
CREATE INDEX "Pessoa_filialId_departamentoId_idx" ON "Pessoa"("filialId", "departamentoId");

-- CreateIndex
CREATE INDEX "Pessoa_teamRole_idx" ON "Pessoa"("teamRole");

-- CreateIndex
CREATE UNIQUE INDEX "Numerologia_pessoaId_key" ON "Numerologia"("pessoaId");

-- CreateIndex
CREATE INDEX "ContratoSocialUpload_pessoaId_uploadedAt_idx" ON "ContratoSocialUpload"("pessoaId", "uploadedAt");

-- CreateIndex
CREATE INDEX "AcordoComercial_pessoaId_dataInicio_idx" ON "AcordoComercial"("pessoaId", "dataInicio");

-- CreateIndex
CREATE INDEX "AcordoComercial_pessoaId_dataFim_idx" ON "AcordoComercial"("pessoaId", "dataFim");

-- CreateIndex
CREATE UNIQUE INDEX "ConviteOnboarding_pessoaId_key" ON "ConviteOnboarding"("pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "ConviteOnboarding_token_key" ON "ConviteOnboarding"("token");

-- CreateIndex
CREATE INDEX "ConviteOnboarding_token_idx" ON "ConviteOnboarding"("token");

-- CreateIndex
CREATE INDEX "Pat_pessoaId_dataPat_idx" ON "Pat"("pessoaId", "dataPat");

-- CreateIndex
CREATE INDEX "Pat_pessoaId_uploadedAt_idx" ON "Pat"("pessoaId", "uploadedAt");

-- CreateIndex
CREATE INDEX "ReuniaoTime_data_idx" ON "ReuniaoTime"("data");

-- CreateIndex
CREATE INDEX "ReuniaoTime_categoria_data_idx" ON "ReuniaoTime"("categoria", "data");

-- CreateIndex
CREATE INDEX "ReuniaoTimeParticipante_pessoaId_idx" ON "ReuniaoTimeParticipante"("pessoaId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversa_externalId_key" ON "Conversa"("externalId");

-- CreateIndex
CREATE INDEX "Conversa_clienteId_lastMessageAt_idx" ON "Conversa"("clienteId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversa_contactPhone_idx" ON "Conversa"("contactPhone");

-- CreateIndex
CREATE INDEX "Conversa_unmatched_lastMessageAt_idx" ON "Conversa"("unmatched", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Mensagem_externalId_key" ON "Mensagem"("externalId");

-- CreateIndex
CREATE INDEX "Mensagem_conversaId_sentAt_idx" ON "Mensagem"("conversaId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "GrupoCliente_groupExternalId_key" ON "GrupoCliente"("groupExternalId");

-- CreateIndex
CREATE INDEX "GrupoCliente_clienteId_idx" ON "GrupoCliente"("clienteId");

-- CreateIndex
CREATE INDEX "GrupoCliente_instanceId_idx" ON "GrupoCliente"("instanceId");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Script" ADD CONSTRAINT "Script_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptVersion" ADD CONSTRAINT "ScriptVersion_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acao" ADD CONSTRAINT "Acao_relatorioId_fkey" FOREIGN KEY ("relatorioId") REFERENCES "Relatorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metrica" ADD CONSTRAINT "Metrica_relatorioId_fkey" FOREIGN KEY ("relatorioId") REFERENCES "Relatorio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_weeklyAnalysisId_fkey" FOREIGN KEY ("weeklyAnalysisId") REFERENCES "WeeklyAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScriptAdjustment" ADD CONSTRAINT "ScriptAdjustment_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "Recommendation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaResolucao" ADD CONSTRAINT "AlertaResolucao_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "NegocioPipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReuniaoCliente" ADD CONSTRAINT "ReuniaoCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoBtg" ADD CONSTRAINT "MovimentacaoBtg_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InteracaoCliente" ADD CONSTRAINT "InteracaoCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaCliente" ADD CONSTRAINT "MetaCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoVida" ADD CONSTRAINT "EventoVida_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Indicacao" ADD CONSTRAINT "Indicacao_indicadorId_fkey" FOREIGN KEY ("indicadorId") REFERENCES "ClienteBackoffice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerfilDescoberta" ADD CONSTRAINT "PerfilDescoberta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanoUmaPagina" ADD CONSTRAINT "PlanoUmaPagina_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistOrganizacao" ADD CONSTRAINT "ChecklistOrganizacao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PainelPrioridade" ADD CONSTRAINT "PainelPrioridade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcaoPainel" ADD CONSTRAINT "AcaoPainel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcaoPainel" ADD CONSTRAINT "AcaoPainel_clienteVinculadoId_fkey" FOREIGN KEY ("clienteVinculadoId") REFERENCES "ClienteBackoffice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PainelCacheExterno" ADD CONSTRAINT "PainelCacheExterno_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRequest" ADD CONSTRAINT "SyncRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PainelSugestao" ADD CONSTRAINT "PainelSugestao_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PainelRetrospectiva" ADD CONSTRAINT "PainelRetrospectiva_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PainelEmailAI" ADD CONSTRAINT "PainelEmailAI_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipe" ADD CONSTRAINT "Equipe_departamentoId_fkey" FOREIGN KEY ("departamentoId") REFERENCES "Departamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipe" ADD CONSTRAINT "Equipe_liderId_fkey" FOREIGN KEY ("liderId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pessoa" ADD CONSTRAINT "Pessoa_filialId_fkey" FOREIGN KEY ("filialId") REFERENCES "Filial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pessoa" ADD CONSTRAINT "Pessoa_departamentoId_fkey" FOREIGN KEY ("departamentoId") REFERENCES "Departamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pessoa" ADD CONSTRAINT "Pessoa_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pessoa" ADD CONSTRAINT "Pessoa_lideradoPorId_fkey" FOREIGN KEY ("lideradoPorId") REFERENCES "Pessoa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pessoa" ADD CONSTRAINT "Pessoa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Numerologia" ADD CONSTRAINT "Numerologia_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContratoSocialUpload" ADD CONSTRAINT "ContratoSocialUpload_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcordoComercial" ADD CONSTRAINT "AcordoComercial_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConviteOnboarding" ADD CONSTRAINT "ConviteOnboarding_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pat" ADD CONSTRAINT "Pat_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReuniaoTimeParticipante" ADD CONSTRAINT "ReuniaoTimeParticipante_reuniaoId_fkey" FOREIGN KEY ("reuniaoId") REFERENCES "ReuniaoTime"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReuniaoTimeParticipante" ADD CONSTRAINT "ReuniaoTimeParticipante_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "Pessoa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversa" ADD CONSTRAINT "Conversa_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "Conversa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrupoCliente" ADD CONSTRAINT "GrupoCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteBackoffice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

