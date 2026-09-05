---
name: instagram-carousel-onix
description: >
  Criação de carrosseis completos para o Instagram @eduardorcampos (Onix Capital / Planejamento Patrimonial), incluindo slides visuais em React (.jsx) com identidade visual Onix e legenda otimizada para a persona Roberto. Use sempre que Eduardo pedir para criar um carrossel, post de carrossel, slides para Instagram, montar um carrossel, criar slides sobre X, ou qualquer variação que envolva conteúdo visual multi-slide para Instagram. Também use quando ele mencionar Patrimônio sem Mimimi, Alerta Patrimonial, ou pedir conteúdo educativo visual para redes sociais. A skill cobre o fluxo completo de estrutura dos slides, design visual, textos, legenda e sugestão de música.
version: 1.1
updated: 2026-09-05
---

# Skill: Carrossel Instagram Onix

Cria carrosseis completos para o perfil @eduardorcampos com identidade visual Onix, incluindo slides visuais (.jsx) e legenda otimizada.

## Quando usar

- Eduardo pede para criar um carrossel, slides, ou post educativo visual
- Menciona quadros fixos como "Patrimônio sem Mimimi" (Q4) ou "Alerta Patrimonial" (Q2)
- Pede conteúdo visual sobre temas financeiros, tributários, seguros, imóveis ou sucessório
- Compartilha um prompt ou briefing de carrossel (mesmo vindo de outra IA)

## Fluxo de produção

1. **Definir tema e pilar**: Identificar qual dos 4 pilares editoriais o carrossel atende
2. **Estruturar slides** (5-8 slides ideal): Capa com foto, slides internos visuais, CTA final com foto
3. **Produzir o .jsx** seguindo a identidade visual Onix
4. **Escrever legenda** alinhada ao framework de CTA v4
5. **Sugerir música** para Instagram (biblioteca nativa)

---

## Identidade Visual Onix v1

### Cores

| Nome | HEX | RGB | Uso |
|------|-----|-----|-----|
| Azul Escuro | #0D1B2A | 13, 27, 42 | Fundo principal |
| Azul Claro | #1B2E3E | 27, 46, 62 | Cards, elementos secundários |
| Dourado | #D4A55C | 212, 165, 92 | Destaques, títulos, linhas |
| Branco | #FFFFFF | 255, 255, 255 | Textos principais |
| Cinza Claro | #CCCCCC | 204, 204, 204 | Subtextos, fontes |
| Vermelho | #DC3545 | 220, 53, 69 | Alertas, urgência, badges de prazo |

### Tipografia

- Fonte: **Montserrat** (Google Fonts)
- Pesos: Light (300), Regular (400), Medium (500), SemiBold (600), Bold (700), ExtraBold (800), Black (900)

### Hierarquia de texto (NÃO exagerar no tamanho)

| Elemento | Peso | Tamanho | Cor |
|----------|------|---------|-----|
| Título destaque (capa) | 900 (Black) | 28-32px | Dourado |
| Subtítulo (capa) | 600 | 22-24px | Branco |
| Header de slide | 700 | 15-16px | Dourado |
| Número do slide | 700 | 14-15px | Dourado |
| Título de card | 800 | 14-16px | Dourado |
| Texto de card | 500 | 12-14px | Branco (opacity 0.9) |
| Texto de alerta | 700 | 12px | Vermelho |
| Logo tag | 600 | 12-13px | Cinza (opacity 0.6) |
| Badge | 700 | 11-12px | Dourado sobre fundo escuro |

**REGRA CRÍTICA**: Nunca usar fontSize acima de 32px. O erro mais comum é texto gigante que domina o slide. Manter proporção elegante, como nos exemplos da Manus.

### Componentes padrão

**Badge**: Retângulo com cantos arredondados (4px), fundo rgba(30,30,30,0.85), texto dourado uppercase, letterSpacing 1.2px. Posicionado nos cantos.

**Header de slide**: Número + título em dourado, linha separadora dourada abaixo (2px).

**Card**: Fundo azulClaro, borda 1.5px dourada, borderRadius 12px, padding 16-20px. Pode incluir ícone à esquerda.

**LogoTag**: @eduardorcampos no canto inferior direito, cinza, opacity 0.6.

---

## Estrutura dos slides

### Slide 1 (Capa) - SEMPRE com foto do Eduardo

- Foto como background (img com objectFit cover)
- Overlay gradiente: `linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0.8) 100%)`
- Badge superior esquerdo (ex: "ALERTA PATRIMONIAL", "PATRIMÔNIO SEM MIMIMI")
- Texto hook na parte inferior (máx 3 linhas)
- Badge inferior esquerdo: "ARRASTE →"
- LogoTag inferior direito

**Técnica de foto**: Se o usuário fornecer fotos, redimensionar para 540x675 (4:5) via Python/Pillow, converter para base64 JPEG quality 75, e embutir como constante no .jsx.

### Slides 2-6 (Conteúdo) - Visuais e impactantes

- Fundo: azulEscuro sólido
- Header com número + título do slide
- **OBRIGATÓRIO**: Incluir elementos visuais SVG relevantes ao tema:
  - Gráficos de barras para comparações ao longo do tempo
  - Gauges/medidores para estatísticas de impacto
  - Diagramas de rede para conexões entre entidades
  - Ícones representativos (emojis + SVG) para listas
  - Comparações lado a lado (cards "antes vs depois")
  - Escudos para proteção/risco
  - Celular/dispositivos para temas digitais
- Cards com ícones contextuais para a persona Roberto (🩺 médicos, 🏢 empresários, 📱 digital, 🏠 imóveis, 💰 investimentos)
- Boxes de alerta vermelho para exemplos práticos
- Analogias médicas sempre que possível (exame, diagnóstico, monitor, check-up)

### Slide final (CTA) - SEMPRE com foto do Eduardo

- Mesma estrutura da capa (foto + overlay)
- Badge de urgência se aplicável (ex: "PRAZO: 30 DE MAIO" em vermelho)
- CTA de Algoritmo: "SALVA ESSE POST" + "COMPARTILHA"
- Badge inferior esquerdo: "← VOLTAR AO INÍCIO"
- LogoTag

---

## Framework de CTA para legendas

Seguir a regra 80/20 do Projeto Instagram v4:

| Tipo | Descrição | Quando |
|------|-----------|--------|
| 🔴 EXPLÍCITO | "Manda BLINDAGEM no direct" | Máx 1 por dia, apenas Reels de conversão |

> `BLINDAGEM` aqui é a **tag do ManyChat**, não o posicionamento: é a palavra
> que o seguidor digita e que dispara o fluxo. Trocá-la no roteiro sem criar o
> gatilho novo no ManyChat perde o lead. O posicionamento é **planejamento
> patrimonial** — ver `src/lib/integrations/manychat.ts`, onde `PLANEJAMENTO`
> já responde e `BLINDAGEM` segue como legado.
| 🟡 IMPLÍCITO | Planta ideia sem pedir nada | Stories de contexto |
| 🟢 IDENTIFICAÇÃO | Não pede nada, só faz pensar | Reflexão, bastidores |
| 📊 ALGORITMO | "Salva esse post" / "Compartilha" | Todo conteúdo P1 e P3 (carrosseis) |

**Para carrosseis**: Usar CTA de Algoritmo (📊) como padrão. No slide final e na legenda.

### Estrutura da legenda

1. **Hook** (Framework PARE): Pergunta / Afirmação / Revelação / Emoção
2. **Corpo**: 3-5 parágrafos curtos, quebras de linha rítmicas
3. **Dados/fonte**: Estatística com fonte quando disponível
4. **CTA**: Duplo: salvar + compartilhar
5. **Hashtags**: 8-12 relevantes

**Tom de voz**: Professor que empodera, direto e sem enrolação, gera inquietação saudável, humano e autêntico. NUNCA vendedor que empurra produto.

---

## Persona Roberto (público-alvo)

- Médico/empresário/autônomo, 38-52 anos
- Renda acima de R$25k/mês, patrimônio R$500k-R$10MM
- Casado, filhos pequenos ou adolescentes
- Voyeur digital: salva e compartilha via WhatsApp, não curte publicamente
- Horário pico: 12h-13h e 20h-22h
- Medos: desvalorização profissional, cenário político, não ter aposentadoria digna
- Desejo: dormir tranquilo, liberdade, legado organizado

---

## Pilares editoriais

| Pilar | Tema | Formato preferido |
|-------|------|-------------------|
| P1 | Planejamento Patrimonial | Carrossel (Q4: Patrimônio sem Mimimi) |
| P2 | Casos Reais | Reel (Q1: Onix na Prática) |
| P3 | Cenário e Alertas | Carrossel ou Reel (Q2: Alerta Patrimonial) |
| P4 | Eduardo Pessoa | Post/Stories pessoal (Q5: Sábado de Bastidores) |

---

## Música

Sempre sugerir uma música da biblioteca nativa do Instagram com justificativa estratégica:
- Conteúdo de alerta/medo: Trilhas de tensão (Hans Zimmer, trilhas de documentário)
- Conteúdo educativo: Lo-fi, instrumental suave
- Conteúdo de reflexão/pessoal: Piano, acústico emocional
- Conteúdo de urgência/ação: Percussão, ritmo crescente

---

## Regras de produção

1. **Nunca usar em dashes (—)** em nenhum texto
2. **Acentuação**: Verificar todos os acentos em português (Você, já, caíram, automático, imóveis, patrimônio, etc.)
3. **Formato**: React (.jsx) com Tailwind-free (inline styles apenas)
4. **Biblioteca**: Apenas imports nativos do React (useState, useRef, useCallback)
5. **Google Fonts**: Importar Montserrat via link tag dentro do componente App
6. **Navegação**: Incluir botões Anterior/Próximo + indicadores de ponto
7. **Responsivo**: maxWidth 420px, aspectRatio 4/5
8. **Output**: Salvar em /mnt/user-data/outputs/ e usar present_files

---

## Checklist antes de entregar

- [ ] Capa com foto do Eduardo (ou placeholder atmosférico se sem foto)
- [ ] Slides internos com elementos visuais SVG, não apenas texto
- [ ] Texto com tamanhos equilibrados (máx 32px)
- [ ] CTA final com foto do Eduardo
- [ ] Legenda completa com hook PARE + CTA de Algoritmo
- [ ] Sugestão de música com justificativa
- [ ] Acentuação verificada
- [ ] Sem em dashes
