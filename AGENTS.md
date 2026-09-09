# Agent Instructions

## Project shape

This repository is a pnpm workspace with three applications and deliberately small shared packages:

- `apps/api` — Hono on Node.js; owns HTTP, auth, application services, repositories, SQLite, Drizzle migrations, and workers.
- `apps/web` — client-only Solid.js application built with Vite.
- `apps/mcp` — stdio MCP server; a thin HTTP client of `apps/api`, same as `apps/web`.
- `packages/contracts` — serializable Zod contracts shared by API, web, and mcp.

## Non-negotiable database rule

- Existing Drizzle SQL migrations, snapshots, and journal are historical data infrastructure. Do not edit, regenerate, reorder, rename, or delete them while reorganizing the repository.
- Never run migration experiments against a user or production database. Use `DATABASE_URL=:memory:` or an explicitly disposable database path.
- Before and after database-related changes, compare migration checksums and verify the Drizzle journal and resulting schema.
- `apps/api` is the only owner of database code and migrations. `apps/web` and `apps/mcp` must not import them.

## Boundaries

- `apps/web` and `apps/mcp` communicate with `apps/api` through HTTP only.
- `apps/api` may depend on `packages/contracts`; it must not depend on `apps/web` or `apps/mcp`.
- `packages/contracts` must not depend on Hono, Solid, Drizzle, Node-only libraries, or database row types.
- Hono `Context`, `Request`, `Response`, and status codes stop at HTTP controllers.
- Drizzle types stop at repositories/infrastructure.
- Use explicit constructor dependencies and a visible composition root. Do not add Inversify, decorators, `reflect-metadata`, service locators, or a custom route DSL.

## Local API Usage

Before using or changing project components, utilities, hooks, services, config helpers, or other local APIs, inspect their public contract first.

Do not infer props, arguments, return values, supported options, class merging behavior, or side effects when the implementation or exports are available in the repository.

If the public API is unclear after inspection, ask a clarifying question before choosing an implementation.

## Function Style

Prefer function declarations for top-level functions, including exported helpers and components.

Use `const` arrow functions for functions declared inside another function or inside a component.

```ts
export function formatAmount(value: number) {
	return value.toString();
}

export function AmountLabel() {
	const handleClick = () => {
		// ...
	};

	return null;
}
```

## Solid Component Body Order

Inside Solid components (and functions that return JSX), keep this order and do not interleave effects between unrelated state/handlers:

1. Hooks / signals / stores / memos / derived accessors / in-component helpers
2. Event handlers and nested function declarations
3. Effects (`createEffect`, and similarly `createRenderEffect` / `onMount` / `onCleanup` when used as side-effect setup) — grouped together, last before `return`
4. `return` JSX

## Code Style (lint-enforced)

- Tabs for indentation (4-space width), 140 max line length
- Single quotes, semicolons required
- Brace style: Stroustrup (`} else {` on same line, `else` / `catch` / `finally` on new line)
- Import sorting via `simple-import-sort`: styles → side-effects → node: → externals → `@/` aliases → relatives
- `no-console` allowed only for `warn`/`error`
- `@typescript-eslint/consistent-type-imports`: prefer `type` imports with `separate-type-imports` fix style
- TypeScript strict mode, `no-explicit-any` is error
- `no-negated-condition` is error
- Prefer type-only imports where appropriate
- Do not add abstractions without a concrete variation, ownership boundary, or testing seam

## SCSS / Responsive Styles

Write responsive SCSS mobile-first: base styles must target the smallest viewport, and larger viewport overrides must be added with `min-width` media queries.

Always use the local responsive mixins from `apps/web/src/shared/styles/mixins.scss` instead of raw `@media` queries. Import them as:

```scss
@use "@/shared/styles/mixins" as mx;
```

Prefer `@include mx.media-mn(...)` for adaptive layout changes. Use `media-mx` or `media-mn-mx` only when the design requirement is explicitly max-width or bounded-range specific.

Additional SCSS rules:
- CSS Modules with `camelCaseOnly` class naming (e.g. `{ styles.fooBar }`)
- kebab-case for raw SCSS class/id selectors
- Double quotes in SCSS, logical properties (`csstools/use-logical`)
- `declaration-no-important` enabled
- PostCSS sorts media queries `desktop-first` at build time

## Interactive Styles

Do not apply hover effects, focus effects, or `cursor: pointer` to elements that are already active, selected, current, or checked.

When an interactive element has an active class or selected state, guard hover, focus, and pointer-cursor styles with `:not(...)` or an equivalent condition:

```scss
.option {
	&:not(.option-active) {
		cursor: pointer;

		&:hover {
			border-color: var(--color-border-strong);
		}

		&:focus-visible {
			box-shadow: 0 0 0 3px var(--color-focus-ring);
		}
	}
}
```

Active elements should keep their active visual treatment on hover and focus.

## Commands (run with pnpm, from the workspace root)

| Command | What it does |
|---|---|
| `pnpm dev` | Start `apps/api` (with migrations) and `apps/web` in parallel |
| `pnpm mcp` | Start the stdio MCP server against a running API |
| `pnpm build` | Build contracts, api, web, and mcp |
| `pnpm typecheck` | `tsc` across every package (uses the `typescript7` binary) |
| `pnpm test` | `vitest run` in api, web, and mcp |
| `pnpm lint` / `pnpm lint:fix` | ESLint + Stylelint over `apps/**` and `packages/**` |
| `pnpm db:migrate` | Apply pending migrations in `apps/api` |

`apps/api` also owns `db:generate` (drizzle-kit), `mcp:api-key`, `receipt:worker-key`, `receipt:claude-worker`, and `receipt:cleanup-images`.

## Architecture

`apps/api`:
- `src/http/` — Hono controllers, middleware, and routing; the only place that touches `Context`
- `src/modules/<name>/` — application services and domain errors per module
- `src/infrastructure/` — Drizzle repositories, database schema (19 tables), and adapters
- `src/composition-root.ts` — explicit wiring of dependencies
- `drizzle/` — generated SQL migrations, snapshots, and journal

`apps/web`:
- `src/app/` — router and application shell
- `src/views/<name>/` — page components
- `src/features/<name>/` — feature modules
- `src/entities/<name>/` — shared entity logic
- `src/widgets/` — composite UI blocks
- `src/shared/ui/` — reusable UI components (Button, Dialog, Grid, TextField, etc.)
- `src/shared/lib/` — pure utility functions
- `src/shared/styles/` — SCSS tokens, functions, mixins
- `@` alias maps to each app's `src/` (import via `@/shared/ui`)

## Database

- SQLite via better-sqlite3, wrapped with Drizzle ORM
- Schema: `apps/api/src/infrastructure/database/schema/`
- Migrations: `apps/api/drizzle/` (generated + applied)
- Test pattern: `:memory:` SQLite, `migrate(database, { migrationsFolder: './drizzle' })` in `beforeEach`, close in `afterEach`
- All monetary amounts stored as **minor units** (integers)
- Services use dependency injection (repositories, `createId`, `now`) for testability
- Cross-household isolation tested explicitly

## Auth

- Session-based auth with Argon2 password hashing + WebAuthn support
- API middleware guards authenticated routes and sets security headers: `x-content-type-options`, `x-frame-options`, `referrer-policy`, `permissions-policy`
- Environment: `AUTH_ORIGIN`, `WEBAUTHN_RP_ID`, `SESSION_COOKIE_NAME`, `SESSION_TTL_DAYS`
- `apps/mcp` authenticates with `MCP_API_KEY` as a bearer token instead of a browser session

## Deployment

Nginx is the public entry point: it serves the built `apps/web` assets and proxies `/api/*` to `apps/api`, preserving the `/api` prefix. See `docs/deployment.md` and `docs/architecture.md`.

## Node & package manager

- Node >= 22, pnpm
- No pre-commit hooks or lint-staged configuration
- No CI workflows in this repo
- Local OpenCode configuration is stored in `opencode.json`
