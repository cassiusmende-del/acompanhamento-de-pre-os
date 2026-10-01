# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Dependências (inclui o CLI do Prisma; `postinstall` gera o client).
FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# Aplica migrations pendentes e encerra.
FROM deps AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM deps AS builder
COPY . .
RUN npm run build

# Imagem final: apenas o servidor standalone do Next.js.
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
