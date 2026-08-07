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

The API shell listens on `http://localhost:3001`; the Vite web shell listens on `http://localhost:5173` and proxies `/api` to the API.

## Database safety

The existing Drizzle migrations are owned by `apps/api/drizzle`. Their contents must remain unchanged during the split. Use a disposable `DATABASE_URL` for local migration checks and set an explicit database path for any real environment.

See [docs/architecture.md](docs/architecture.md) and [docs/migration-map.md](docs/migration-map.md) for the current target boundaries and migration status.
