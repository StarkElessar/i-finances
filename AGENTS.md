# Agent Instructions

## Project shape

This repository is a pnpm workspace with two applications and deliberately small shared packages:

- `apps/api` — Hono on Node.js; owns HTTP, auth, application services, repositories, SQLite, Drizzle migrations, and workers.
- `apps/web` — client-only Solid.js application built with Vite.
- `packages/contracts` — serializable Zod contracts shared by API and web.

The old SolidStart implementation is not part of this worktree. Its behavior is referenced from the sibling `master` worktree at `/Users/stark/Documents/web/experimental/i-finances` when a migration slice requires it.

## Non-negotiable database rule

- Existing Drizzle SQL migrations, snapshots, and journal are historical data infrastructure. Do not edit, regenerate, reorder, rename, or delete them while reorganizing the repository.
- Never run migration experiments against a user or production database. Use `DATABASE_URL=:memory:` or an explicitly disposable database path.
- Before and after database-related changes, compare migration checksums and verify the Drizzle journal and resulting schema.
- `apps/api` is the only owner of database code and migrations. `apps/web` must not import them.

## Boundaries

- `apps/web` communicates with `apps/api` through HTTP only.
- `apps/api` may depend on `packages/contracts`; it must not depend on `apps/web`.
- `packages/contracts` must not depend on Hono, Solid, Drizzle, Node-only libraries, or database row types.
- Hono `Context`, `Request`, `Response`, and status codes stop at HTTP controllers.
- Drizzle types stop at repositories/infrastructure.
- Use explicit constructor dependencies and a visible composition root. Do not add Inversify, decorators, `reflect-metadata`, service locators, or a custom route DSL.

## Code style

- Tabs for indentation, single quotes, semicolons, and Stroustrup braces.
- Prefer function declarations for top-level functions and const arrow functions inside functions/components.
- Keep TypeScript strict and use type-only imports where appropriate.
- SCSS is mobile-first, uses logical properties and kebab-case selectors.
- Do not add abstractions without a concrete variation, ownership boundary, or testing seam.

## Migration workflow

Work one vertical slice at a time. Inspect the old slice's tests and call sites, write down invariants, define the public contract, implement API transport, then connect the web client. Keep migration map and characterization tests updated.
