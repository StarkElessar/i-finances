# Agent Instructions

## Project Overview

SolidStart 2.0 (alpha) + Solid 1.9 + Vite 7 + SQLite (better-sqlite3) + Drizzle ORM.
TypeScript 7 (via `typescript7` npm alias), pnpm workspace, ESLint + Stylelint.

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
- Import sorting via `simple-import-sort`: styles → side-effects → node: → externals → `~/` aliases → relatives
- `no-console` allowed only for `warn`/`error`
- `@typescript-eslint/consistent-type-imports`: prefer `type` imports with `separate-type-imports` fix style
- TypeScript strict mode, `no-explicit-any` is error
- `no-negated-condition` is error

## SCSS / Responsive Styles

Write responsive SCSS mobile-first: base styles must target the smallest viewport, and larger viewport overrides must be added with `min-width` media queries.

Always use the local responsive mixins from `src/shared/styles/mixins.scss` instead of raw `@media` queries. Import them as:

```scss
@use "~/shared/styles/mixins" as mx;
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

## Commands (run with pnpm)

| Command | What it does |
|---|---|
| `pnpm dev` | Start Vite dev server (`http://localhost:5173`) |
| `pnpm build` | Runs `typecheck` then `vite build` (order matters) |
| `pnpm typecheck` | `tsc -p tsconfig.json` (uses `typescript7` binary) |
| `pnpm test` | `vitest run` |
| `pnpm test:watch` | `vitest` (watch mode) |
| `pnpm lint:js:fix` | ESLint `--fix` on `src/**/*.{js,ts,jsx,tsx}` |
| `pnpm lint:css:fix` | Stylelint `--fix` on `**/*.scss` |
| `pnpm g:component` | Plop generator for UI components (interactive or `pnpm g:component Name src/views/x --no-css`) |
| `pnpm g:view` | Plop generator for view + route (interactive or `pnpm g:view ViewName --route path`) |
| `pnpm db:generate` | `drizzle-kit generate` — creates SQL migration from schema changes |
| `pnpm db:migrate` | `tsx scripts/migrate-db.ts` — applies pending migrations |
| `pnpm db:rate` | Upsert exchange rate (`--from USD --to BYN --rate 3.25 --date 2026-07-24 --source manual`) |
| `pnpm db:seed` | Create initial auth user (requires `SEED_*` env vars) |

## Architecture

- `src/routes/(app)/*.tsx` — app routes, each exports `route` (RouteDefinition with `preload`) + default view component
- `src/routes/(auth)/*.tsx` — auth routes (sign-in, etc.)
- `src/routes/api/` — API endpoints
- `src/views/<name>/page.tsx` — page components (route defaults render these)
- `src/server/` — server-only code (services, repositories, DB schema), never imported on client
- `src/entities/<name>/` — shared entity logic (both server + client imports)
- `src/features/<name>/` — feature modules
- `src/shared/ui/` — reusable UI components (Button, Dialog, Grid, TextField, etc.)
- `src/shared/lib/` — pure utility functions
- `src/shared/styles/` — SCSS tokens, functions, mixins
- `~` alias maps to `src/` (import via `~/shared/ui`)

## Database

- SQLite via better-sqlite3, wrapped with Drizzle ORM
- Schema: `src/server/db/schema/` (14 tables)
- Migrations: `drizzle/` directory (generated + applied)
- Test pattern: `:memory:` SQLite, `migrate(database, { migrationsFolder: './drizzle' })` in `beforeEach`, close in `afterEach`
- All monetary amounts stored as **minor units** (integers)
- Services use dependency injection (repositories, `createId`, `now`) for testability
- Cross-household isolation tested explicitly

## Auth

- Middleware (`src/middleware.ts`) guards all document routes except `/sign-in*` and `/ui-kit*` (dev only)
- Security headers: `x-content-type-options`, `x-frame-options`, `referrer-policy`, `permissions-policy`
- Session-based auth with Argon2 password hashing + WebAuthn support
- Environment: `AUTH_ORIGIN`, `WEBAUTHN_RP_ID`, `SESSION_COOKIE_NAME`, `SESSION_TTL_DAYS`

## Node & package manager

- Node >= 22, pnpm
- No pre-commit hooks or lint-staged configuration (dependency is installed but unused)
- No CI workflows in this repo
- Local OpenCode configuration is stored in `opencode.json`
