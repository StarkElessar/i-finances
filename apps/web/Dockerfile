# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS builder
WORKDIR /app

RUN npm i -g pnpm@11.12.0

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json           ./apps/api/
COPY apps/web/package.json           ./apps/web/
COPY apps/mcp/package.json           ./apps/mcp/
COPY packages/contracts/package.json ./packages/contracts/
RUN pnpm install --frozen-lockfile --filter "@i-finances/web..."

COPY packages/contracts ./packages/contracts
COPY apps/web          ./apps/web

# No VITE_* build args on purpose: the api client uses a relative '' base and
# calls /api/..., so web and api must be served from one origin behind nginx.
RUN pnpm --filter @i-finances/web build

# No CMD: homelab's compose supplies the command that publishes dist into the
# shared volume.
