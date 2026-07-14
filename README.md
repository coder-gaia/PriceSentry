# PriceSentry

Serviço de monitoramento de preço orientado a fila. Você cadastra um produto (URL + seletor CSS + preço-alvo), e um pipeline assíncrono verifica o preço periodicamente, registra o histórico e dispara e-mail quando o preço cruza o alvo.

## Por que fila, e não só um cron simples

Um cron que itera todos os produtos numa única execução não escala (uma trava lenta ou um site fora do ar bloqueia os outros) e não tem retry/backoff nativo. Aqui:

- Uma única **fila `scheduler`** roda um repeatable job a cada `SCHEDULER_INTERVAL_MS` e faz *fan-out*: busca produtos vencidos e enfileira um job por produto na fila `price-check` — em vez de um repeatable job por produto (não escala em memória do Redis).
- A **fila `price-check`** processa cada produto isoladamente: se falhar (site fora do ar, seletor quebrado), o BullMQ reagenda sozinho com backoff exponencial (5 tentativas). Um `jobId` fixo (`check-<id>`) evita duplicar o mesmo produto na fila enquanto ele ainda está pendente.
- Um **throttle por domínio** (Redis `SET NX PX`) garante espaçamento mínimo entre requisições ao mesmo domínio, mesmo com vários workers rodando em paralelo — sem isso, dá pra derrubar um site de terceiro com concorrência.
- A **fila `notify`** é separada da `price-check` de propósito: se o provedor de e-mail cair, isso não deve travar nem re-executar verificações de preço.

## Por que uma "loja falsa" em vez de scraping de site real

Scraping de e-commerce real quebra a cada mudança de layout e esbarra em termos de uso. O scraper (`genericCssScraper`) é genérico — recebe URL + seletor CSS e funciona contra qualquer página. Para a demo, `src/routes/mockStore.routes.ts` sobe uma página HTML própria com preço que varia a cada request, então o pipeline inteiro roda de ponta a ponta sem depender de terceiros. Trocar para um site real de produção é só cadastrar a URL + seletor certos — a arquitetura não muda.

## Rodando localmente

```bash
npm install
npx prisma migrate dev --name init
npx prisma generate

# API
npm run dev

# Workers (processo separado)
npm run dev:worker
```

Variáveis de ambiente em `.env` (veja `.env.example`). Sem `SMTP_HOST` configurado, o e-mail é logado no console em vez de enviado (`jsonTransport`).

## Testando o fluxo manualmente

```bash
# 1. Registrar e logar
curl -X POST localhost:4000/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"senha1234"}'

# 2. Cadastrar um produto apontando pra loja falsa (troque TOKEN pelo token retornado acima)
curl -X POST localhost:4000/products -H 'Content-Type: application/json' -H 'Authorization: Bearer TOKEN' \
  -d '{"url":"http://localhost:4000/mock-store/products/demo-1","name":"Produto demo","selector":".price","targetPriceCents":6000,"checkIntervalMinutes":5}'

# 3. Forçar checagem imediata (em vez de esperar o scheduler)
curl -X POST localhost:4000/products/<id>/check-now -H 'Authorization: Bearer TOKEN'

# 4. Ver histórico de preço
curl localhost:4000/products/<id>/history -H 'Authorization: Bearer TOKEN'
```

## Testes

```bash
npm test
```

Suite cobre: parsing de preço (BRL e US), scraper contra a loja falsa (sucesso e seletor ausente), roundtrip real de fila/worker no BullMQ (sucesso e retry até falhar), e o throttle por domínio contra Redis ao vivo. Não depende de banco — só de Redis.

## Próximos passos sugeridos

- Frontend em React + TS (formulário de produto, gráfico de histórico de preço com Recharts, mesmo padrão do Faturei/Snapbook)
- Dashboard de filas (Bull Board) pra visualizar jobs pendentes/falhos
- Deploy: API e workers como dois serviços separados (ex. Render), Redis gerenciado (Upstash/Redis Cloud)
