---
name: backoffice-btg-onix
description: Rotina diária de backoffice da Onix Capital — exporta 3 relatórios do BTG Access (Saldo D0, Base BTG, Informações), importa no Ecossistema Onix na ordem correta, audita os números e confirma por DM no Slack. Use SEMPRE que Eduardo pedir para "rodar o backoffice", "baixar/atualizar os relatórios do BTG", "atualizar a base de clientes", "importar no Onix/Ecossistema", "sincronizar saldo/clientes", "rodar a rotina diária", ou qualquer variação que envolva levar dados do BTG Access para o Ecossistema Onix — mesmo que ele cite só uma parte do fluxo (ex.: "baixa o Saldo D0 pra mim"). Use também quando uma tarefa agendada pedir a execução da rotina BTG → Onix.
version: 1.0
updated: 2026-08-13
---

# Backoffice BTG → Ecossistema Onix

Rotina de atualização diária da base de clientes da Onix: **exportar** 3 relatórios do BTG Access, **importar** no Ecossistema Onix na ordem correta, **auditar** e **notificar** no Slack.

**Política de falha parcial:** importe o que deu certo e reporte exatamente o que falhou e por quê. Uma base parcialmente atualizada com aviso claro vale mais que nenhuma atualização silenciosa.

## Ferramentas

- **Todo clique no navegador** é via Claude in Chrome (`mcp__Claude_in_Chrome__*`: `navigate`, `computer`, `get_page_text`, `find`, `file_upload`). Nunca use computer-use de desktop para clicar no browser — navegadores são tier "read" (só screenshot).
- **Slack:** DM para Eduardo — `channel_id = U0ANXQPQHBL`.
- Se as ferramentas estiverem deferred, carregue tudo em um único ToolSearch.

## Etapa 0 — Gate de sessão

1. `navigate` → `https://access.btgpactual.com/reports/management-reports?segmentId=23594a3c-41ca-4b0a-8457-73a1f0476443`
2. Se cair em tela de login (`/login`):
   - DM Slack: "⏰ Backoffice BTG: sessão expirada. Faça login em access.btgpactual.com que eu retomo. Re-checo em 5 min (até 3x)."
   - Aguarde 5 min e re-cheque, até 3 tentativas. Persistindo: DM "❌ Backoffice abortado hoje: sessão não autenticada." e encerre.

O gate existe porque o BTG usa 2FA — só o Eduardo pode autenticar. Não tente contornar o login.

## Etapas 1–3 — Exportar os 3 relatórios

A página abre o relatório embedado "Relatórios Gerenciais — Investimentos (D-1 e D0)" (estilo Power BI). O padrão de export é igual nos três:

> Passe o mouse (mouse_move) sobre o canto superior direito do cartão/tabela → aparecem ícones → clique **"..." (Mais opções)** → **Exportar dados** → modal "Quais dados você deseja exportar?" → mantenha **"Dados com layout atual"** e **.xlsx** → **Exportar** → aguarde o download concluir (15–25s).

Os menus só aparecem no hover — sempre tire screenshot após o mouse_move para confirmar que os ícones surgiram antes de clicar.

| # | Caminho no relatório | Onde fazer hover | Arquivo esperado |
|---|---|---|---|
| 1 | Gerencial > **Financeiro** | cabeçalho do cartão **Saldo D0** | `Saldo em CC (D 0) (N).xlsx` |
| 2 | ← Voltar → Cliente > **Base BTG** | canto sup. direito da tabela (coluna Carteira Administrada) | `Base BTG (N).xlsx` |
| 3 | ← Voltar → Cliente > **Informações** | canto sup. direito da tabela (coluna Perfil Suitability) | `Informações (N).xlsx` |

Cuidados que evitam 90% das falhas:

- **Aguarde os dados carregarem** antes de exportar (tabelas preenchidas, KPIs com valores). Exportar durante o load gera arquivo vazio/parcial.
- **No relatório Base BTG, anote os KPIs `Contas` e `PL Total (R$)`** — são a referência da auditoria final.
- **Não altere filtros** (Escritório/Assessor/Conta = Todos; Data Posição = D-1 padrão). Filtro alterado contamina a base inteira.
- **Somente leitura no BTG:** navegar e exportar, nada além.

### Identificar os arquivos baixados

Os downloads acumulam versões numeradas — use **sempre a mais recente** e **nunca apague/mova as antigas**.

1. `navigate` → `chrome://downloads` e leia com `get_page_text`: capture os nomes exatos (com o `(N)`) e confirme que os 3 são **de hoje, dos últimos minutos** e **concluídos**.
2. Se `chrome://downloads` não for acessível pela extensão, pergunte ao Eduardo via Slack o nome exato dos 3 arquivos antes de importar. Adivinhar o índice `(N)` arrisca importar dado de ontem — pior cenário possível.

Caminho base: `/Users/eduardorodrigues/Downloads/`.

## Etapa 4 — Importar no Ecossistema Onix

**Ordem obrigatória: 1º Base BTG → 2º Informações → 3º Saldo em CC.** Primeiro o cadastro, depois o complemento, por último a posição financeira — invertido, registros novos do saldo não encontram o cliente correspondente.

1. `navigate` → `https://www.ecossistemaonix.com.br/empresas/investimentos/clientes`
2. **Anote os KPIs ANTES:** Patrimônio líquido total, nº de clientes, Saldo parado, Saldo negativo.
3. Clique **Importar dados**. **Não interaja com o seletor de arquivos nativo do macOS** (não é controlável). Use `mcp__Claude_in_Chrome__file_upload` no input de arquivo da página, com caminho completo, ex.: `/Users/eduardorodrigues/Downloads/Base BTG (36).xlsx`.
4. Aguarde a confirmação de processamento na UI (toast/status) antes do próximo arquivo — imports concorrentes podem colidir.
5. Se um import falhar: screenshot + mensagem de erro, siga para o próximo e reporte no Slack.

## Etapa 5 — Auditoria

Recarregue a página de Clientes e compare:

1. nº de clientes Onix ≈ card `Contas` do BTG — divergência > 1% → ⚠️
2. Patrimônio líquido total Onix ≈ `PL Total` do BTG — divergência > 1% → ⚠️
3. 3 downloads de hoje + 3 imports confirmados na UI
4. Screenshot final como evidência

A tolerância de 1% existe porque BTG e Onix podem fechar números em momentos ligeiramente diferentes do dia — divergência pequena é timing, divergência grande é dado errado.

## Etapa 6 — Notificação Slack (DM `U0ANXQPQHBL`)

Sucesso:
```
✅ Backoffice BTG → Onix concluído (DD/MM/AAAA HH:MM)
• Exportados: Saldo D0 ✅ | Base BTG ✅ | Informações ✅
• Importados (Base BTG → Informações → Saldo CC): ✅✅✅
• Auditoria: Contas BTG X vs Onix Y | PL BTG R$ X vs Onix R$ Y → OK
```

Falha parcial/divergência: mesmo formato com ❌/⚠️ na etapa específica, motivo em 1 linha e o que exige ação manual. Falha total: mensagem única explicando o bloqueio.

## Princípios invioláveis

1. Nunca importar fora da ordem Base BTG → Informações → Saldo em CC.
2. Em dúvida sobre qual arquivo usar, pergunte no Slack — base inconsistente custa mais que atraso.
3. Somente leitura no BTG; jamais executar qualquer ação transacional.
4. Não prosseguir "no escuro": cada clique em menu de hover deve ser precedido de screenshot confirmando o alvo.
