# Cockpit Onix — Tutorial Completo do Sistema

**Versão:** 1.0 | **Data:** 31/03/2026 | **Autor:** Claude Code + Eduardo Campos

---

## 1. Visão Geral

O **Cockpit Onix** (Eduardo — Mídias Sociais) é um painel de comando completo para gerenciar toda a operação de marketing de conteúdo, funil de vendas e automação do Grupo Onix.

### Stack Tecnológica
- **Frontend/Backend:** Next.js 16 (App Router) + TypeScript
- **UI:** Tailwind CSS 4 + shadcn/ui (dark mode com acentos dourados)
- **Banco de Dados:** SQLite via Prisma ORM 7.6 (libsql adapter)
- **Autenticação:** JWT via jose + bcryptjs, cookie httpOnly
- **Integrações:** ManyChat API, Microsoft Graph (Outlook), Claude AI, Zapier/Plaud.ai

### Acesso
- **URL:** `http://localhost:3333`
- **Login Admin:** CPF `015.362.475-29` / Senha `Edu@203028`
- **Login Suporte:** CPF `000.000.000-00` / Senha `suporte123`

---

## 2. Módulos do Sistema

### 2.1 Painel de Comando (/)
A tela principal responde à pergunta: "O que eu preciso fazer hoje?"

**Componentes:**
- **4 Cards de métricas:** Posts da semana (com barra de progresso segmentada por status), Tarefas pendentes, Tarefas de hoje, Reuniões agendadas (KPI âncora)
- **Calendário Semanal:** Visão rápida dos 7 dias com posts agendados por dia
- **Painel Hoje:** Checklist interativa das tarefas do dia com toggle de conclusão

### 2.2 Calendário Editorial (/calendario)
Planejamento visual de todo o conteúdo.

**Funcionalidades:**
- **Toggle Semana/Mês:** Alterne entre visão semanal (padrão) e mensal
- **Visão Semanal:** Colunas para cada dia com indicação dos quadros fixos esperados (verde = presente, vermelho = faltando, dourado = pendente)
- **Visão Mensal:** Grade completa do mês com todos os posts
- **Drag & Drop:** Arraste posts entre dias para reagendar
- **Novo Post:** Clique em qualquer dia para criar — formulário com vinculação de roteiro, seleção de CTA, horário
- **Edição rápida de status:** Clique em qualquer card de post para abrir dropdown de status (Rascunho → Roteiro Pronto → Gravado → Editado → Agendado → Publicado)
- **Indicador de CTA Explícito:** Posts com CTA Explícito têm borda vermelha e badge "CTA!"
- **Filtros:** Por formato (Reels/Stories/Carrossel) e status

**Regras de negócio:**
- Regra 80/20: Máximo 1 CTA Explícito por dia (bloqueio no backend + alerta visual)
- Geração automática de tarefas ao criar post (roteiro → gravação → edição → publicação)

### 2.3 Roteiros (/roteiros)
Banco de roteiros com templates pré-configurados.

**Funcionalidades:**
- **5 Templates:** Um para cada quadro fixo (Pergunta da Semana, Onix na Prática, Patrimônio sem Mimimi, Alerta Patrimonial, Sábado de Bastidores)
- **Editor estruturado:** Gancho (hook) + Corpo do roteiro + CTA com tipo (Explícito/Implícito/Identificação)
- **Busca e filtro:** Por título, conteúdo e categoria
- **Duplicar e editar:** A partir de templates ou roteiros existentes
- **Tempo estimado:** Campo para indicar duração do vídeo

### 2.4 Tarefas (/tarefas)
Gestão de tarefas vinculadas ao calendário editorial.

**Funcionalidades:**
- **Status cycle:** Clique no ícone para avançar (Pendente → Em Progresso → Concluída)
- **Prioridades:** Urgente, Alta, Média, Baixa (com cores)
- **Filtros:** Por status e prioridade
- **Alerta de atraso:** Tarefas vencidas ficam em vermelho
- **Criação rápida:** Dialog com título, descrição, prioridade e prazo

### 2.5 Pipeline de Leads (/leads)
Kanban visual para gestão de funil de vendas.

**Funcionalidades:**
- **5 Colunas:** Novo Lead → Qualificado → Reunião Agendada → Proposta Enviada → Cliente Ativo
- **Drag & Drop:** Arraste leads entre estágios
- **Timer de SLA em tempo real:** Barra de progresso que muda de cor (verde → amarelo → vermelho) baseada nos limites:
  - Lead quente: 5 minutos
  - Lead morno: 30 minutos
  - Lead frio: 2 horas
- **Classificação:** Por temperatura (quente/morno/frio), origem (ManyChat/DM/Indicação) e produto de interesse
- **Criação de leads:** Dialog com todos os campos

### 2.6 Relatório Semanal (/relatorio)
Dashboard analítico com métricas da semana.

**Funcionalidades:**
- **Meta semanal:** Card destaque com progresso 0/5 posts (verde quando atingida)
- **Conteúdo:** Posts por status, quadros fixos (faltando/presente), distribuição de CTAs
- **Tarefas:** Taxa de conclusão com barra segmentada (concluídas/em progresso/pendentes)
- **Leads:** Novos leads por temperatura (quente/morno/frio) e por produto
- **Navegação:** Setas para ver semanas anteriores

### 2.7 Reuniões (/reunioes)
Transcrições do Plaud.ai com análise inteligente.

**Funcionalidades:**
- **Importação automática:** Transcrições do Plaud.ai são importadas do Google Drive
- **Webhook Zapier:** Endpoint para receber dados automaticamente
- **Análise com IA:** Clique "Analisar com IA" para extrair:
  - Resumo executivo da reunião
  - Insights para criação de conteúdo
  - Itens de ação
  - Oportunidades de cross-sell
- **Geração de roteiros:** Selecione qualquer quadro fixo para gerar um roteiro personalizado baseado na reunião
- **Associação com leads:** Reuniões são automaticamente vinculadas a leads pelo nome

### 2.8 Integrações (/integracoes)
Central de conexão com ferramentas externas.

**Integrações disponíveis:**

| Integração | Status | O que faz |
|---|---|---|
| ManyChat | Configurado | Importa leads, classifica por temperatura e produto |
| Claude AI | Pronto | Sugere roteiros, analisa performance, aborda leads |
| Outlook | Configurado | Sync agenda, cria eventos de publicação/gravação |
| Zapier + Plaud | Pronto | Recebe transcrições via webhook |
| Meta Graph API | Estrutura pronta | Métricas Instagram (Fase 2) |
| Manus AI | Em breve | Aguardando API pública |

### 2.9 Configurações (/configuracoes)
- Alterar senha de acesso
- Dicas de segurança

---

## 3. Integrações — Como Configurar

### 3.1 ManyChat
**Status:** Token configurado, pronto para uso.

1. O token API já foi obtido (ManyChat > Configurações > API)
2. Na página Integrações do Cockpit, o token está salvo
3. Clique "Sincronizar Leads" para importar contatos

**O que acontece automaticamente:**
- Subscribers são importados como leads no pipeline
- Tags do ManyChat definem a temperatura (quente/morno/frio)
- Palavras-chave definem o produto de interesse (BLINDAGEM → Investimentos, SEGURO → Seguro de Vida, etc.)

### 3.2 Outlook (Microsoft Graph)
**Status:** App Azure configurado, aguardando autorização OAuth.

**Credenciais configuradas:**
- Client ID: `d6c717b8-747e-432b-be1f-9f1039a6946e`
- Tenant ID: `6e0a8fc0-28df-4c97-bfa6-597e4173a3f2`
- Client Secret: Salvo no `.integrations.json`
- Redirect URI: `http://localhost:3333/api/integracoes/outlook/callback`

**Para ativar:**
1. Rode o servidor (`npm run dev -- --port 3333`)
2. Vá em Integrações > Outlook > "Autorizar Outlook"
3. Faça login com sua conta Microsoft
4. Aceite as permissões (Calendários, Email)
5. Será redirecionado de volta ao Cockpit com a integração ativa

**Funcionalidades após ativação:**
- "Sincronizar Agenda" cria eventos no Outlook para posts agendados e gravações
- Conta reuniões da semana automaticamente (KPI do dashboard)

### 3.3 Claude AI
**Status:** Código implementado, precisa da API key da Anthropic.

**Para ativar:**
1. Obtenha sua API key em console.anthropic.com
2. Na página Integrações, cole a key no campo "ANTHROPIC_API_KEY"
3. Clique "Salvar Chave"

**Funcionalidades:**
- `/api/integracoes/ai` (POST com `action: "suggest_script"`) — Gera roteiro completo
- `/api/integracoes/ai` (POST com `action: "analyze"`) — Analisa performance semanal
- `/api/integracoes/ai` (POST com `action: "ideas"`) — Gera ideias de conteúdo
- `/api/integracoes/ai` (POST com `action: "lead_approach"`) — Sugere abordagem para lead

### 3.4 Plaud.ai via Google Drive
**Status:** 4 reuniões já importadas, funcionando.

**Fluxo atual:** Plaud exporta transcrições como Google Docs → Sync manual/Zapier → Cockpit armazena e analisa

**Para automatizar via Zapier:**
1. No Zapier, crie um novo Zap
2. Trigger: Google Drive > "New File in Folder"
3. Selecione a pasta onde o Plaud exporta (ID: `143JvWu6Tor0d2ShG5o0CQvkJGeb3B3Mk`)
4. Action: Webhooks by Zapier > POST
5. URL: `http://SEU-DOMINIO/api/integracoes/zapier/webhook`
6. Body: `{ "title": "{{File Name}}", "transcription": "{{File Content}}", "date": "{{Created Time}}" }`

---

## 4. Estrutura Técnica

### Diretórios principais
```
cockpit-onix/
├── prisma/
│   ├── schema.prisma          # Modelos: User, Post, Script, Task, Lead, Meeting
│   └── seed.ts                # Dados iniciais (2 users, 5 templates, 5 posts, 20 tasks)
├── src/
│   ├── app/
│   │   ├── page.tsx           # Dashboard principal
│   │   ├── calendario/        # Calendário editorial
│   │   ├── roteiros/          # Banco de roteiros
│   │   ├── tarefas/           # Gestão de tarefas
│   │   ├── leads/             # Pipeline Kanban
│   │   ├── relatorio/         # Relatório semanal
│   │   ├── reunioes/          # Transcrições Plaud
│   │   ├── integracoes/       # Central de integrações
│   │   ├── configuracoes/     # Configurações
│   │   ├── login/             # Tela de login
│   │   └── api/               # 20+ endpoints de API
│   ├── components/
│   │   ├── calendario/        # Grid mensal/semanal, cards, dialog
│   │   ├── dashboard/         # Stats, calendário semana, painel hoje
│   │   ├── leads/             # Timer SLA
│   │   ├── roteiros/          # Editor, templates, lista
│   │   ├── layout/            # Sidebar, header, shell
│   │   └── ui/                # shadcn/ui components
│   └── lib/
│       ├── integrations/      # ManyChat, Outlook, Claude AI, Zapier, Config
│       ├── prisma.ts          # Cliente Prisma
│       ├── session.ts         # JWT session management
│       ├── types.ts           # Tipos TypeScript
│       └── utils.ts           # Utilitários
├── .integrations.json         # Secrets das integrações (NÃO commitar)
└── .env                       # Variáveis de ambiente
```

### API Endpoints
```
Auth:      GET  /api/auth/me
Posts:     GET|POST /api/posts, PATCH|DELETE /api/posts/[id]
Scripts:   GET|POST /api/scripts, PATCH|DELETE /api/scripts/[id]
Tasks:     GET|POST /api/tasks, PATCH|DELETE /api/tasks/[id]
Leads:     GET|POST /api/leads, PATCH|DELETE /api/leads/[id]
Dashboard: GET  /api/dashboard
Relatório: GET  /api/relatorio
Meetings:  GET  /api/meetings, GET|POST /api/meetings/[id], POST /api/meetings/sync-drive

Integrações:
  GET  /api/integracoes/status
  POST /api/integracoes/config
  GET  /api/integracoes/manychat/test
  POST /api/integracoes/manychat/sync
  GET  /api/integracoes/outlook/auth
  GET  /api/integracoes/outlook/callback
  GET|POST /api/integracoes/outlook/events
  POST /api/integracoes/outlook/sync
  GET|POST /api/integracoes/ai
  GET|POST /api/integracoes/zapier/webhook
```

---

## 5. Como Rodar

```bash
# Instalar dependências
npm install

# Gerar cliente Prisma
npx prisma generate

# Criar banco e popular com dados iniciais
npx prisma db push
npx tsx prisma/seed.ts

# Rodar em desenvolvimento
npm run dev -- --port 3333

# Build de produção
npm run build
npm start
```

---

## 6. Roadmap

### Fase 1 (Concluída)
- Dashboard, Calendário, Roteiros, Tarefas, Leads, Login, Configurações

### Fase 2 (Em progresso)
- Integrações (ManyChat, Outlook, Claude AI, Plaud.ai)
- Relatório Semanal
- Reuniões com análise IA

### Fase 3 (Próximo)
- SDR Virtual (qualificação automática via ManyChat)
- Cross-sell Tracker (alerta 30 dias)
- Integração Google Calendar para KPI de reuniões
- Meta Graph API para métricas Instagram

### Fase 4 (Futuro)
- IA para sugestão de roteiros baseados em performance
- Otimização de horários de postagem
- Dashboard de ROI
- Integração Manus (quando API disponível)

---

*Documento gerado em 31/03/2026 — Cockpit Onix v1.0*
