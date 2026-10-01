# Histórico de preços — Amazon Brasil (uso pessoal)

Ferramenta pessoal para responder, com dados observados:

> "Como o preço atual se comporta em relação ao histórico deste produto?"

O sistema registra cada observação de preço sem sobrescrever o histórico e calcula métricas
descritivas (mínimo, máximo, média, mediana, mínimos por janela, percentil, posição na faixa,
ocorrências de preços baixos). Ele não recomenda compra e não faz previsões.

A análise técnica completa, com as decisões tomadas, está em
[`docs/ANALISE_TECNICA.md`](docs/ANALISE_TECNICA.md).

## Situação

| Etapa | Conteúdo                                                          | Estado    |
| ----- | ----------------------------------------------------------------- | --------- |
| 0     | Base: Next.js, PostgreSQL, Prisma, Docker, CI, histórico imutável | concluída |
| 1     | Núcleo de análise (funções puras e testes)                        | concluída |
| 2     | Produtos e captura (formulário, extensão, fila de captura)        | pendente  |
| 3     | Processamento (eventos, snapshot, correções)                      | pendente  |
| 4     | Telas de análise                                                  | pendente  |
| 5     | Alertas                                                           | pendente  |

## Rodar com Docker (uso normal)

Requisitos: Docker com Compose.

```bash
cp .env.example .env      # defina POSTGRES_PASSWORD (e ajuste DATABASE_URL com a mesma senha)
docker compose up -d --build
```

- Aplicação: http://localhost:3000 (exposta apenas em `127.0.0.1`).
- Serviços: `db` (PostgreSQL 16), `migrate` (aplica migrations e encerra), `web` e `backup`.
- Para exigir senha ao abrir a aplicação, defina `APP_PASSWORD` no `.env`.

## Desenvolvimento

Requisitos: Node.js 22.

```bash
npm install
docker compose up -d db   # ou um PostgreSQL próprio; ajuste DATABASE_URL no .env
npm run db:deploy         # aplica as migrations
npm run dev
```

| Comando              | O que faz                                                  |
| -------------------- | ---------------------------------------------------------- |
| `npm test`           | Testes unitários (análise e domínio)                       |
| `npm run test:db`    | Testes de integração do banco; exige `TEST_DATABASE_URL`   |
| `npm run typecheck`  | Verificação de tipos                                       |
| `npm run lint`       | ESLint                                                     |
| `npm run db:migrate` | Cria uma nova migration a partir do `prisma/schema.prisma` |

## Backup e restauração

O serviço `backup` gera um `pg_dump` ao iniciar e depois a cada 24 h em `./backups`,
mantendo 14 diários e 12 mensais (configurável no `.env`). Copie essa pasta para fora da
máquina periodicamente.

Para restaurar um arquivo em um banco novo:

```bash
docker compose cp backups/daily/<arquivo>.dump db:/tmp/restore.dump
docker compose exec db createdb -U precos precos_restaurado
docker compose exec db pg_restore -U precos -d precos_restaurado /tmp/restore.dump
```

## Princípios do histórico

- `price_observations` é append-only: o banco rejeita `UPDATE`, `DELETE` e `TRUNCATE`.
- Correções são registros novos em `observation_corrections`; o dado original permanece.
- Ausência de preço nunca é gravada como zero.
- Valores em centavos (inteiros); datas em UTC, exibidas no fuso de São Paulo.

## Estrutura

```
prisma/            schema e migrations (inclui triggers e constraints escritos à mão)
src/domain/        dinheiro, ASIN e datas
src/analytics/     métricas — funções puras, sem acesso a banco
src/lib/           cliente do banco
src/app/           páginas e rotas (Next.js)
tests/db/          testes de integração do banco
scripts/backup.sh  rotina de backup do serviço `backup`
```
