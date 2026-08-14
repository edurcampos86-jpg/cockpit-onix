---
name: story-fitness-onix
description: Retoque sutil e natural de fotos do Eduardo (selfies de treino/academia) para Stories do Instagram @eduardorcampos, com realce da marca Onix, harmonização facial leve, tom de pele saudável/bronzeado, definição muscular sutil (peito, braços, abdômen) e legenda estóica sobre saúde e disciplina. Use SEMPRE que Eduardo enviar uma foto pessoal e pedir para "ajustar para o story", "retocar", "dar um trato na foto", "realçar a marca/Onix", "harmonizar o rosto", "bronzear", "definir o abdômen/braços" ou variações — mesmo que ele cite só parte dos ajustes. Use também quando ele pedir "legenda estóica" ou legenda de saúde/disciplina para acompanhar foto de treino.
version: 1.0
updated: 2026-08-13
---

# Story Fitness Onix

Retoque fotográfico sutil + legenda estóica para Stories de treino do Eduardo (@eduardorcampos).

## Princípio central

**Sutileza acima de tudo.** O resultado deve parecer "boa luz e boa câmera", nunca "foto editada". Pense como um assessor calibrando uma carteira: rebalanceamentos de 3–6% por ativo, nunca giros de 50%. Se o antes/depois lado a lado gritar diferença, recue os parâmetros.

## Fluxo (sempre nesta ordem)

1. **Carregar a foto** de `/mnt/user-data/uploads/` e checar dimensões.
2. **Rodar `scripts/retoque_story.py`** (adaptar caminhos SRC/OUT). O script faz, nesta sequência:
   - Detecção facial via Haar cascade (`haarcascade_frontalface_default.xml`) — todas as regiões corporais são derivadas da posição do rosto (peito ≈ face_y + 2.3×face_h; abdômen ≈ +4.1×face_h).
   - **Bronzeado saudável**: máscara de pele YCrCb (Cr 135–180, Cb 85–135) limitada à região do corpo, warm shift (R×1.055, B×0.965) com opacidade ~65%.
   - **Harmonização facial**: bilateral filter (d=15, σ=45) misturado a 55% dentro de máscara elíptica com feather; + leve glow (saturação +10, brilho +6 locais).
   - **Definição muscular**: "clarity" local (unsharp de baixa frequência, σ=18, peso 1.45/−0.45) em máscaras elípticas sobre peito, braços e abdômen, opacidade ~60%.
   - **Realce da marca Onix**: sharpen (σ=6, 1.6/−0.6) + brilho (×1.06 +4) a 70% sobre os logos (camiseta e garrafa/acessórios). **Sempre inspecionar crops para posicionar as máscaras dos logos manualmente** — a posição varia por foto.
   - **Acabamento**: contraste ×1.05, saturação ×1.04, vinheta suave (mín. 0.78).
3. **Validar visualmente** com preview lado a lado (antes|depois reduzido) E crops do rosto e dos logos. Corrigir centros de máscara se necessário e re-rodar.
4. **Entregar** o JPEG final (qualidade 95, resolução original preservada) via present_files.

## Restrições técnicas do ambiente

- Usar **Python + OpenCV + PIL + NumPy** (rembg/u2net estão bloqueados — nunca tentar).
- Nunca deformar geometria (liquify/warp de rosto ou corpo) — apenas tom, contraste e micro-contraste. Isso mantém naturalidade e evita o "uncanny valley".
- Preservar resolução e proporção originais (formato story 9:16 já vem do iPhone).

## Legenda estóica (sempre em PT-BR)

Estrutura que funciona para a persona Roberto (consome em silêncio, age no privado):

1. **Gancho estóico curto** (1 linha, ideia de Sêneca/Marco Aurélio/Epicteto — parafraseada, nunca citação literal longa).
2. **Ponte pessoal** (2–3 linhas): saúde como prioridade inegociável, disciplina antes de motivação, corpo como primeiro patrimônio.
3. **Fechamento com identidade** (1 linha): conexão sutil com gestão de patrimônio/longo prazo — sem CTA agressivo.

Tom: sóbrio, direto, sem emojis em excesso (máx. 1–2), sem hashtags no story.

Exemplo de esqueleto: "Ninguém cuida do que é seu por você. / Treino cedo não por estética — por lucidez. Saúde é o único ativo sem liquidez de recompra. / Patrimônio começa no espelho."

## Sugestões proativas (oferecer 2–3 por sessão)

Ao entregar, sugerir melhorias de alcance/estética, por exemplo: melhor horário de postagem para o público dele, enquadramento/crop alternativo, sticker de link ou música, sequência de stories (foto → texto → enquete), variação para feed. Lembrar: Meta Business Suite do Eduardo opera +1h à frente de Brasília — agendar sempre com +1h.
