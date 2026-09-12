# syntax=docker/dockerfile:1

# bookworm, not alpine: better-sqlite3 is native and glibc prebuilds are far
# more reliable than musl ones.
FROM node:24-bookworm-slim AS deps
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN npm i -g pnpm@11.12.0

# Every workspace manifest must be present or --frozen-lockfile rejects the lockfile.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json           ./apps/api/
COPY apps/web/package.json           ./apps/web/
COPY apps/mcp/package.json           ./apps/mcp/
COPY packages/contracts/package.json ./packages/contracts/

# Filtering to the api subgraph excludes the root project, whose devDependencies
# are git+ssh:// and unreachable from a build with no ssh agent.
# No --prod pruning: the app runs TypeScript through tsx, a devDependency.
RUN pnpm install --frozen-lockfile --filter "@i-finances/api..."

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app /app
# apps/api/tsconfig.json extends this; without it the "@/*" path alias never
# loads and tsx fails to resolve the very first import at runtime.
COPY tsconfig.base.json ./
# contracts is consumed as raw TS source ("exports": "./src/index.ts").
COPY packages/contracts ./packages/contracts
COPY apps/api          ./apps/api

# Created before the volumes mount so Docker seeds them owned by node.
RUN mkdir -p /app/apps/api/data /app/apps/api/storage/receipts \
 && chown -R node:node /app/apps/api/data /app/apps/api/storage

USER node
# DATABASE_URL (./data/...) and migrationsFolder ('./drizzle') resolve from CWD.
WORKDIR /app/apps/api
EXPOSE 3001
# migrate-db.ts is idempotent (drizzle tracks applied migrations), so running it
# on every start is safe. Without this, a deploy that ships a new migration
# would boot the API against a stale schema instead of failing loudly.
CMD ["sh", "-c", "./node_modules/.bin/tsx scripts/migrate-db.ts && ./node_modules/.bin/tsx src/main.ts"]
