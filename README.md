# PriceSentry

Serviço de monitoramento de preço orientado a fila. Você cadastra um produto (URL + seletor CSS + preço-alvo), e um pipeline assíncrono verifica o preço periodicamente, registra o histórico e avisa via e-mail e/ou webhook (Slack/Discord) quando o preço cruza o alvo — com um painel de observabilidade das filas e atualização em tempo real pro front.

## Arquitetura

### Por que fila, e não só um cron simples

Um cron que itera todos os produtos numa única execução não escala (uma trava lenta ou um site fora do ar bloqueia os outros) e não tem retry/backoff nativo. Aqui:

- Uma única **fila `scheduler`** roda um repeatable job a cada `SCHEDULER_INTERVAL_MS` e faz _fan-out_: busca produtos vencidos e enfileira um job por produto na fila `price-check` — em vez de um repeatable job por produto (não escala em memória do Redis).
- A **fila `price-check`** processa cada produto isoladamente: se falhar (site fora do ar, seletor quebrado), o BullMQ reagenda sozinho com backoff exponencial (5 tentativas). Um `jobId` fixo (`check-<id>`) evita duplicar o mesmo produto na fila enquanto ele ainda está pendente.
- Um **throttle por domínio** (Redis `SET NX PX`) garante espaçamento mínimo entre requisições ao mesmo domínio, mesmo com vários workers rodando em paralelo — sem isso, dá pra derrubar um site de terceiro com concorrência.
- A **fila `notify`** é separada da `price-check` de propósito: se o provedor de e-mail/webhook cair, isso não deve travar nem re-executar verificações de preço.

### Por que uma "loja falsa" em vez de scraping de site real

Scraping de e-commerce real quebra a cada mudança de layout e esbarra em termos de uso. O scraper (`genericCssScraper`) é genérico — recebe URL + seletor CSS e funciona contra qualquer página. Para a demo, `src/routes/mockStore.routes.ts` sobe uma página HTML própria com preço que varia a cada request, então o pipeline inteiro roda de ponta a ponta sem depender de terceiros. Trocar para um site real de produção é só cadastrar a URL + seletor certos — a arquitetura não muda.

### Observabilidade: Bull Board

O worker roda num processo separado da API — sem visibilidade, um job travado ou falho é uma caixa preta. `/admin/queues` (protegido por basic auth, credenciais em `BULL_BOARD_USER`/`BULL_BOARD_PASSWORD`) expõe as 3 filas em tempo real: quantos jobs esperando/ativos/falhos, payload de cada um, stack trace de erro, retry manual.

### Tempo real: worker → Redis → API → cliente

O worker (processo separado da API) não tem acesso direto ao servidor Socket.io — são processos Node distintos. A ponte é o Redis: o worker publica um evento (`sentinel:updated`) via `@socket.io/redis-emitter`; o servidor Socket.io da API escuta esse canal via `@socket.io/redis-adapter` e entrega pro cliente certo (sala `user:<id>`, isolada por usuário via JWT verificado no handshake da conexão). O front usa isso pra atualizar o dashboard instantaneamente após uma checagem, sem esperar o próximo poll (que continua existindo como rede de segurança, a cada 60s).

### Autenticação: access token em memória + refresh via cookie httpOnly

Access token (`JWT_EXPIRES_IN`, padrão 15min) nunca é persistido no front — vive só em memória, imune a roubo por XSS via localStorage. Persistência de sessão entre reloads vem de um refresh token de longa duração (`JWT_REFRESH_EXPIRES_IN`, padrão 30 dias) num cookie `httpOnly`, escopado a `/auth`. `POST /auth/refresh` troca o cookie por um access token novo; o front tenta isso silenciosamente ao carregar a página e também quando qualquer chamada autenticada recebe 401 (retry automático, transparente pro usuário).

### Canais de notificação

Quando uma sentinela cruza o preço-alvo: e-mail sempre (via `SMTP_HOST`, ou logado no console se vazio) e, opcionalmente, um webhook Slack ou Discord configurado por usuário (`PATCH /auth/webhook`) — payload nativo de cada plataforma (blocks no Slack, embed no Discord).

## Rodando localmente

### Opção A — Docker Compose (Postgres, Redis, API e worker)

```bash
docker-compose up --build
```

Sobe Postgres, Redis, a API (`localhost:4000`) e o worker num comando só. A API roda `prisma migrate deploy` automaticamente antes de subir — isso só funciona se você já tem migrations geradas (pasta `prisma/migrations/`, criada rodando `npx prisma migrate dev --name init` localmente pelo menos uma vez). Se essa pasta ainda não existe no seu repo, gera ela primeiro fora do Docker, commita, e só então sobe o compose.

O front **não** está no compose de propósito — ele continua rodando nativo (`npm run dev` no projeto do front) pra manter o hot-reload do Vite, que é bem mais rápido fora de container.

### Opção B — tudo manual (sem Docker)

```bash
npm install
npx prisma migrate dev --name init
npx prisma generate

# API
npm run dev

# Workers (processo separado)
npm run dev:worker
```

### Variáveis de ambiente

Veja `.env.example` para todas. As mais importantes:

| Variável                                        | Padrão                  | Uso                                                                            |
| ----------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `DATABASE_URL`                                  | —                       | Postgres                                                                       |
| `REDIS_URL`                                     | —                       | BullMQ + Socket.io adapter/emitter + throttle                                  |
| `JWT_SECRET` / `JWT_EXPIRES_IN`                 | 15m                     | Access token                                                                   |
| `JWT_REFRESH_SECRET` / `JWT_REFRESH_EXPIRES_IN` | 30d                     | Refresh token (cookie httpOnly)                                                |
| `CORS_ORIGIN`                                   | `http://localhost:5173` | Precisa bater com a origem do front — obrigatório com `credentials: true`      |
| `BULL_BOARD_USER` / `BULL_BOARD_PASSWORD`       | admin/admin             | Acesso ao painel `/admin/queues`                                               |
| `SCHEDULER_INTERVAL_MS`                         | 60000                   | De quanto em quanto tempo o scheduler procura produtos vencidos                |
| `SMTP_HOST` (+ `SMTP_PORT`/`USER`/`PASS`)       | vazio                   | Sem isso, e-mail é logado no console (`jsonTransport`), não enviado de verdade |

## Testando o fluxo manualmente

```bash
# 1. Registrar (retorna token de acesso + seta cookie de refresh)
curl -c cookies.txt -X POST localhost:4000/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"senha1234"}'

# 2. Cadastrar um produto apontando pra loja falsa (troque TOKEN pelo token retornado acima)
curl -X POST localhost:4000/products -H 'Content-Type: application/json' -H 'Authorization: Bearer TOKEN' \
  -d '{"url":"http://localhost:4000/mock-store/products/demo-1","name":"Produto demo","selector":".price","targetPriceCents":6000,"currency":"BRL","checkIntervalMinutes":5}'

# 3. Forçar checagem imediata (em vez de esperar o scheduler)
curl -X POST localhost:4000/products/<id>/check-now -H 'Authorization: Bearer TOKEN'

# 4. Ver histórico de preço
curl localhost:4000/products/<id>/history -H 'Authorization: Bearer TOKEN'

# 5. Configurar webhook de alerta (Slack ou Discord)
curl -X PATCH localhost:4000/auth/webhook -H 'Content-Type: application/json' -H 'Authorization: Bearer TOKEN' \
  -d '{"webhookUrl":"https://discord.com/api/webhooks/...","webhookType":"discord"}'

# 6. Trocar o cookie de refresh por um access token novo (sem precisar logar de novo)
curl -b cookies.txt -X POST localhost:4000/auth/refresh
```

Painel de filas: `http://localhost:4000/admin/queues` (usuário/senha de `BULL_BOARD_USER`/`BULL_BOARD_PASSWORD`).

## Testes

```bash
npm test
```

16 testes (Vitest), todos contra comportamento real, não mocks superficiais:

- Parsing de preço (formato BRL e US)
- Scraper contra a loja falsa (sucesso e seletor ausente)
- Roundtrip real de fila/worker no BullMQ (sucesso e retry até falhar)
- Throttle por domínio contra Redis ao vivo
- Handshake de autenticação do Socket.io + entrega de evento cross-processo via Redis (incluindo teste negativo: evento de outro usuário não vaza)
- Payload de webhook Slack e Discord contra um receptor HTTP local, com formatação de moeda (BRL e GBP)

Precisa de um Redis rodando (`redis-server` local ou `docker-compose up redis`) — não depende de Postgres.

## Próximos passos sugeridos

- Code-splitting / otimização de bundle (não se aplica ao backend, mas ver README do front)
- Rate limiting no `/auth/login` e `/auth/register` (proteção básica contra força bruta)
- Reautenticação do socket quando o access token é renovado via refresh (hoje a conexão fica aberta com o token original mesmo após expirar)
- Testes de integração ponta a ponta com Postgres real (hoje a suite roda só contra Redis; Prisma/Postgres foi testado manualmente ao longo do desenvolvimento)
