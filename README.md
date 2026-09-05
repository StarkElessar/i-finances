# i-finances

This branch is the migration workspace for splitting the original SolidStart application into a Hono API and a client-only Solid.js application.

## Workspace

```text
apps/api              Hono + Node.js API and database owner
apps/web              Solid.js + Vite client
packages/contracts    Zod API contracts shared by API and client
```

The old implementation remains available in the sibling `master` worktree:

```text
/Users/stark/Documents/web/experimental/i-finances
```

It is a behavior reference only. Do not import from that directory.

## Commands

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm lint
```

In development, `pnpm dev` applies pending API migrations before starting the
server. Production migrations remain an explicit deployment step.

The API shell listens on `http://localhost:3001`; the Vite web shell listens on `http://localhost:5173` and proxies `/api` to the API.

Production uses the same-origin topology documented in
[docs/architecture.md](docs/architecture.md): Nginx serves the built web
assets and proxies `/api/*` to the API process. Browser E2E smoke is not part
of migration validation; the final authenticated flow will be checked
manually after the split is complete.

## Database safety

The existing Drizzle migrations are owned by `apps/api/drizzle`. Their contents must remain unchanged during the split. Use a disposable `DATABASE_URL` for local migration checks and set an explicit database path for any real environment.

See [docs/architecture.md](docs/architecture.md), [docs/deployment.md](docs/deployment.md), and [docs/migration-map.md](docs/migration-map.md) for the current target boundaries, deployment topology, and migration status.
