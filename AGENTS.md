<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Projeto

Aplicação pessoal de histórico de preços (Amazon Brasil). Leia `docs/ANALISE_TECNICA.md`
(em especial as seções 12 e 13, que prevalecem sobre as anteriores) antes de mudar algo.

- Idioma da interface, mensagens e documentação: português do Brasil.
- Dinheiro em centavos inteiros; nunca `float` para valores gravados.
- `price_observations` e `observation_corrections` são append-only (triggers no banco).
- `src/analytics` é puro (sem banco). Toda métrica nova precisa de teste.
- Frases para o usuário são descritivas: nunca recomendar compra nem prever preço.
- Nada de automação de navegador contra a Amazon (decisão do usuário).
- Prisma 7: client gerado em `src/generated/prisma` (`npm run db:generate`).
