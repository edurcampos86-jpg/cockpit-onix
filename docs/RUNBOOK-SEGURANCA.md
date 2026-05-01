# Runbook de Incidentes de Segurança — Cockpit Onix

Guia operacional para detecção, contenção e recuperação de incidentes.
Mantenha este documento curto, atualizado e impresso (literal) num lugar
acessível offline.

---

## 1. Como detectar

Sinais de que algo está errado, em ordem do mais comum:

| Sinal | Onde olhar |
|---|---|
| Pico de `login.fail` ou `login.rate_limited` | `/configuracoes/seguranca` (admin) — stat card "Falhas (24h)" |
| Login bem-sucedido em horário/IP atípico | mesma tela, lista de eventos |
| `totp.disable` que você não fez | mesma tela, ícone âmbar |
| `integration.secret_set` que você não fez | mesma tela, ícone âmbar |
| Usuário relata "fui deslogado / não consigo entrar" | múltiplos canais (WhatsApp, e-mail) |
| Endpoint público externo retornando 5xx em massa | logs do Railway |
| Custo da API Anthropic/Claude pulando | painel Anthropic |

Cheque o painel `/configuracoes/seguranca` **toda segunda-feira** como ritual.

---

## 2. Classificação de severidade

| Nível | Exemplo | SLA de resposta |
|---|---|---|
| **P0** — Crítico | DB comprometido, `SECRETS_ENCRYPTION_KEY` vazada, conta admin tomada | imediato (≤15 min) |
| **P1** — Alto | Senha de algum usuário vazada, força bruta ativa, secret de integração vazado | ≤2h |
| **P2** — Médio | Tentativa isolada de invasão sem sucesso, abuso de webhook, padrão suspeito | ≤24h |
| **P3** — Baixo | Erro de validação, log estranho, falso positivo | dias |

---

## 3. Procedimentos por tipo

### 3.1 Suspeita de senha comprometida (1 usuário)

1. **Forçar logout do usuário:** trocar `SESSION_SECRET` no Railway invalida **todas** as sessões — use só se P0/P1 generalizado. Para 1 usuário:
   - peça ao próprio usuário trocar a senha em `/configuracoes`
   - ou (admin) no Railway → console do Postgres:
     ```sql
     UPDATE "User" SET password = '$2b$12$RESETME...' WHERE cpf = '12345678901';
     ```
     (gere o hash com `node -e 'console.log(require("bcryptjs").hashSync("nova-senha-temporaria", 12))'` e force troca no próximo login)
2. Verifique audit log do usuário em `/configuracoes/seguranca` — procure logins anteriores ao alerta.
3. Se 2FA não estava ativo, force ativação.
4. Documente o evento (data, IP suspeito, ações tomadas).

### 3.2 Força bruta ativa em `/login`

1. Confirme o padrão no audit log: muitas `login.fail` ou `login.rate_limited` do mesmo IP/range.
2. **Mitigação imediata** — bloqueio no WAF/Railway (quando configurado). Por hoje, sem WAF: o rate limiter já bloqueia em 5 tentativas/15min e por 30min.
3. Se for um único IP persistente:
   - Registre no painel para análise posterior (não temos block de IP no app ainda)
   - Se possível, ative WAF Cloudflare e adicione regra "challenge" para o IP/ASN
4. Se vários IPs (botnet): considere fechar o login publicamente até estabilizar (env var emergencial — implementar se acontecer).

### 3.3 Conta admin tomada (P0)

1. **Imediato:**
   - Trocar `SESSION_SECRET` no Railway (invalida todas as sessões; redeploy automático)
   - Trocar a senha do admin afetado direto no DB (ver 3.1)
   - Desabilitar 2FA do admin afetado e forçar reconfiguração:
     ```sql
     UPDATE "User"
        SET "totpEnabled" = false, "totpSecret" = NULL, "totpRecoveryHashes" = '{}'
      WHERE id = '<userId>';
     ```
2. Auditar `SecurityEvent` dos últimos 30 dias para esse `userId`:
   ```sql
   SELECT type, ip, "userAgent", success, "createdAt", metadata
     FROM "SecurityEvent"
    WHERE "userId" = '<userId>'
    ORDER BY "createdAt" DESC
    LIMIT 200;
   ```
3. Verificar `integration.secret_set`: o atacante pode ter trocado tokens de integração.
4. Rotacionar **todos** os secrets de integração (BTG, Google, Anthropic, Meta, ManyChat) — o atacante pode tê-los exfiltrado da UI.
5. Avaliar notificação LGPD se houver indício de acesso a dados pessoais (CPFs, contratos).

### 3.4 `SECRETS_ENCRYPTION_KEY` vazada (P0)

Essa chave decodifica `User.totpSecret` e `.integrations.enc.json`.

1. Gerar nova chave: `node -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))'`
2. **Atenção:** trocar essa chave **invalida todos os 2FAs** e os secrets cifrados.
3. Plano de troca:
   - Avisar todos os usuários que vão precisar reconfigurar 2FA
   - Trocar `SECRETS_ENCRYPTION_KEY` no Railway
   - No console do Postgres, limpar todos os 2FAs:
     ```sql
     UPDATE "User"
        SET "totpEnabled" = false, "totpSecret" = NULL, "totpRecoveryHashes" = '{}';
     ```
   - Re-inserir todos os secrets de integração via UI ou env vars do Railway
4. Rotacionar todos os secrets externos (Google refresh token, BTG, Anthropic, Meta) — assuma que estavam cifrados com a chave vazada.

### 3.5 `SESSION_SECRET` vazada (P1)

Atacante consegue forjar JWTs e logar como qualquer usuário.

1. Gerar nova: `node -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))'`
2. Trocar no Railway → todos são deslogados imediatamente
3. Auditar últimos 7 dias do `SecurityEvent` por padrões de `login.ok` sem `login.totp_ok` correspondente (atacante pulou o 2FA forjando direto a sessão).

### 3.6 Secret de integração vazado (P1)

| Secret | Onde rotacionar |
|---|---|
| `ANTHROPIC_API_KEY` | console Anthropic → API keys → revoke + new |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → credentials |
| `GOOGLE_REFRESH_TOKEN` | reautorizar via UI `/integracoes` |
| `BTG_CLIENT_SECRET` | gerente BTG (não auto-serviço) |
| `META_ACCESS_TOKEN` | Meta Business → System Users |
| `MANYCHAT_API_TOKEN` | ManyChat → API → regenerate |
| `ZAPIER_WEBHOOK_SECRET` | gerar novo + atualizar Zap |
| `CRON_SECRET` | gerar novo + atualizar railway.toml NÃO precisa, é env |
| `DASHBOARD_API_SECRET` | gerar novo + atualizar sistema externo de ingestão |

Após rotacionar, atualizar via:
- Railway env vars (preferível)
- ou UI `/configuracoes/integracoes` (vai cifrar com `SECRETS_ENCRYPTION_KEY`)

### 3.7 DB comprometido / acesso não autorizado ao Postgres (P0)

1. Trocar a senha do Postgres no painel do Railway.
2. Trocar **todos** os secrets listados em 3.6.
3. Trocar `SESSION_SECRET` e `SECRETS_ENCRYPTION_KEY` (atenção ao impacto de 3.4).
4. Forçar reset de senha de **todos** os usuários: gerar hash temporário e enviar individualmente.
5. Avaliar notificação LGPD obrigatória — banco contém CPFs, contratos sociais, dados de carteira.
6. Considerar restaurar de backup anterior ao incidente se houver dúvida sobre integridade.

### 3.8 Admin perdeu acesso ao 2FA (sem recovery codes)

1. Confirmar identidade fora da banda (videochamada, conhecimento factual).
2. (Outro admin) Limpar 2FA do usuário no Postgres:
   ```sql
   UPDATE "User"
      SET "totpEnabled" = false, "totpSecret" = NULL, "totpRecoveryHashes" = '{}'
    WHERE id = '<userId>';
   ```
3. Pedir reconfiguração imediata de 2FA pelo usuário.
4. Registrar manualmente no audit log:
   ```sql
   INSERT INTO "SecurityEvent" (id, type, "userId", success, metadata)
   VALUES (gen_random_uuid()::text, 'totp.disable', '<userId>', true,
           '{"via":"admin_recovery","reason":"perdeu_app"}');
   ```

### 3.9 Webhook Zapier sendo abusado

Sintomas: pico de chamadas em `/api/integracoes/zapier/webhook`, custo da API Anthropic explodindo (cada webhook dispara `analyzeMeeting`).

1. Imediato: trocar `ZAPIER_WEBHOOK_SECRET` no Railway → webhook passa a recusar todas as requests.
2. Atualizar o Zap legítimo com o novo secret.
3. Investigar como o secret antigo vazou (logs do Zapier, repositórios públicos, screenshots).
4. Adicionar rate limit por IP no webhook se ainda não tem.

---

## 4. Procedimentos comuns

### Rotacionar SESSION_SECRET (deslogar todo mundo)

```bash
node -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))'
# cole no Railway → Variables → SESSION_SECRET → save
# Railway redeploya. Todos os cookies passam a ser inválidos.
```

### Bloquear login para todos (modo emergência)

Não há flag dedicada hoje. Aproximação: trocar a senha do Postgres no Railway → app fica indisponível. Adicionar uma flag `LOGIN_DISABLED=true` é trivial — implementar quando precisar.

### Exportar audit log para análise externa

```sql
COPY (
  SELECT * FROM "SecurityEvent"
   WHERE "createdAt" > NOW() - INTERVAL '30 days'
   ORDER BY "createdAt" DESC
) TO STDOUT WITH CSV HEADER;
```

(Rodar via `psql` ou painel SQL do Railway.)

### Verificar ambiente está ok depois da troca

```bash
npm run check:env
```

---

## 5. Pós-incidente

Toda vez que rodar este runbook, depois:

1. Escrever um **post-mortem curto** (≤1 página): o que aconteceu, como detectou, o que fez, o que poderia ter prevenido.
2. Atualizar este runbook se descobrir algo novo (passo que não estava aqui, comando que não funcionou, etc).
3. Decidir se precisa **notificar LGPD** (ANPD): se houve acesso confirmado/provável a dado pessoal de cliente/colaborador, sim — prazo é de 2 dias úteis para comunicação preliminar.
4. Comunicar afetados se aplicável.

---

## 6. Contatos

Preencher conforme a operação real:

| Papel | Quem | Como contatar (24/7) |
|---|---|---|
| Owner do produto | Eduardo | (preencher) |
| DBA / infra | (preencher) | (preencher) |
| Encarregado LGPD (DPO) | (preencher) | (preencher) |
| Suporte Railway | support@railway.app | painel |
| Suporte BTG (compliance) | (preencher) | (preencher) |

---

## 7. Pré-incidente (preparação)

Coisas que devem estar prontas **antes** de precisar:

- [ ] `SECRETS_ENCRYPTION_KEY`, `SESSION_SECRET`, `CRON_SECRET`, `DASHBOARD_API_SECRET`, `ZAPIER_WEBHOOK_SECRET` configuradas no Railway com 32+ chars
- [ ] Backup automático diário do Postgres ativo
- [ ] Pelo menos 2 admins com 2FA ativado e códigos de recuperação salvos em cofre
- [ ] Runbook impresso ou em local offline acessível
- [ ] Acesso de emergência ao Railway documentado (quem tem)
- [ ] Lista de contatos atualizada (seção 6)
