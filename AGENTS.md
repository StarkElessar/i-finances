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
- Parse a value once into a named constant instead of repeating the conversion (`const year = Number(match[1])`); separate top-level `const` declarations with a blank line

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
- Size scale: sizes (heights, widths, paddings, gaps, radii, font sizes) are multiples of 4, plus the value 2 for fine details (2, 4, 8, 12, 16, 20, 24 ...); odd values such as 13, 57, 81 and even values off the row such as 6, 10, 14 are not used in new code. Border widths (1, 1.5, 3), `--radius-pill` and breakpoint/panel widths set by the mockup are exempt. The off-scale tokens that already exist are listed in `development/decisions/size-scale.md`; do not change them without a separate task. The app header is 60 px (`--header-block-size`)
- `touch-action: manipulation` is set on `html` and `body` (no double-tap zoom); pinch zoom stays, so never add `user-scalable=no` to the viewport
- PostCSS sorts media queries `desktop-first` at build time

## UI design and kit

Any UI work starts from the mockup and the UI kit, not from the code: design on paper first, then the component, then its Storybook story. The code follows the mockup.

Before changing or adding UI, load the `ifinances-ui` skill (`.claude/skills/ifinances-ui/SKILL.md`). It holds the mockup link, the registry "kit board → code", and the token name mapping. Decisions and the canvas contents are in `development/ui-mockup.md`.

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

Never hide the keyboard focus indicator (`:focus-visible`) without replacing it. This matters for a roving group (Segmented, Tabs, radio group), where the selected item is the only Tab stop: keep the selected item itself unchanged and draw the focus ring on the container, for example `.group:has(.selected:focus-visible)`. Switches, checkboxes and filter chips are not "already selected" elements: they keep the pointer cursor and the focus ring in both states.

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

`apps/api` also owns `db:generate` (drizzle-kit), `mcp:api-key`, `receipt:cleanup-images`, and `telegram:reset` (service recovery of a user's Telegram link, see Auth).

## Architecture

`apps/api`:
- `src/http/` — Hono controllers, middleware, and routing; the only place that touches `Context`
- `src/modules/<name>/` — application services and domain errors per module
- `src/infrastructure/` — Drizzle repositories, database schema (21 tables), and adapters
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
- Environment: `AUTH_ORIGIN`, `WEBAUTHN_RP_ID`, `SESSION_COOKIE_NAME`, `SESSION_TTL_DAYS`, `TRUSTED_PROXY_COUNT` (reverse proxies in front of the API, default 0, must be set explicitly when `NODE_ENV=production` or the API refuses to start; see `development/decisions/client-ip.md`)
- `apps/mcp` authenticates with `MCP_API_KEY` as a bearer token instead of a browser session
- Three ways to sign in, all kept: password, passkey, Telegram. The full design, with the reasons, is `development/decisions/telegram-auth-and-households-v1.md` (sections Р1–Р13); this section is the short version.
- **Sign-in through Telegram** is a bot deep link, not a widget: `POST /api/auth/telegram/start` creates a request (code in `https://t.me/<bot>?start=<code>`, secret in the httpOnly cookie `i_finances_tg_login`, only its hash in `telegram_login_requests`), the user presses «Войти» in the bot, the browser polls `complete` and gets a session. Identity comes only from updates that reach `POST /api/telegram/webhook` with the right `X-Telegram-Bot-Api-Secret-Token`; the client never sends its own. Requests move `pending → confirmed|rejected → used` only through conditional `UPDATE`s checked with `changes === 1`.
- **Linking** (`link/start`, `link/complete`, session required) attaches Telegram to an existing account; an empty duplicate created earlier by a Telegram sign-up is merged. There is no unlink in v1; recovery is the script below.
- Users created by a Telegram sign-up have no password (`users.password_hash` is NULL) and the username `tg-<telegram id>` (`tg-<telegram id>-<n>`, the smallest free `n` from 2, when an earlier user of the same Telegram keeps that name after `telegram:reset`; the same Telegram then signs up as a new user, never back into the old account). The prefix `tg-` is reserved: `seed-auth-user.ts` refuses it. Never treat a NULL hash as a wrong password: use `hasUsablePassword`.
- Recovery of access without a password (Р10): `pnpm --filter @i-finances/api telegram:reset <username>` (`apps/api/scripts/reset-user-telegram.ts`) removes that user's Telegram link and revokes their open login requests. Dry run by default; `--apply` asks to type the username; `--end-sessions` also ends their sessions; it refuses a user with no password and no passkey unless `--allow-lockout`. It never deletes the user or data. Server use is in `docs/deployment.md`.
- Telegram environment (Р12; the schema is `modules/telegram/telegram-config.ts`, the template is `.env.example`): `TELEGRAM_BOT_TOKEN` (secret), `TELEGRAM_BOT_USERNAME`, `TELEGRAM_UPDATES` (`off` default, `webhook`, `polling`), `TELEGRAM_WEBHOOK_SECRET` (secret), `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_LOGIN_TTL_MINUTES`, `TELEGRAM_REGISTRATION_ENABLED` (default `false`), `HOUSEHOLD_INVITATION_TTL_HOURS` (default 168), `DEV_TELEGRAM_LOGIN` (the API refuses to start with it when `NODE_ENV=production`). A bad value stops the start; messages name variables, never values.
- **Registration is closed; new people come only by invitation** (owner's decision 2026-10-22, `development/decisions/app-invitations-v1.md`). `TELEGRAM_REGISTRATION_ENABLED` stays `false`. `POST /api/auth/telegram/start` takes an optional `{ invitationToken }`; if it opens a live invitation, only its SHA-256 is bound to the request (`telegram_login_requests.invitation_token_hash`), and `complete` lets an unknown Telegram sign up when that invitation is still live **inside the transaction that creates the user** (`TelegramAccountRepository.signIn`, the only place a user is created). There it is spent with a conditional `UPDATE` (`changes === 1`, else everything rolls back and the answer is `registration-closed`): an invitation into the application is consumed; a household invitation keeps working for `accept` and only loses its one sign-up (`household_invitations.registered_user_id`). A known Telegram signs in as before and spends nothing. The bot says the same two texts whatever the reason.
- **Platform administrator** (`PLATFORM_ADMIN_USERNAMES`, logins separated by commas, normalized; empty means nobody): decided by `users.username` of the session only (`PlatformAdminPolicy`), never by the display name or a household role. Only an administrator creates **invitations into the application** (`app_invitations`; `POST|GET /api/app-invitations`, `POST /api/app-invitations/:id/revoke`; cookie session only, the MCP key gets 401; to anyone else the routes answer exactly like a missing route, 404 `not_found`). At most 20 active and 50 created a day; lifetime `APP_INVITATION_TTL_HOURS` (default 168). `GET /api/auth/session` has `isPlatformAdmin`.
- Never run with the production bot token locally and never test with a real token: tests use `TELEGRAM_UPDATES=off` and a fake bot client. `DEV_TELEGRAM_LOGIN=true` signs in as any user of the database, so it is for a disposable local database only, never for a copy of the production one.

## Households

- A user belongs to **one** household (unique `household_members(user_id)`); roles are `owner` and `member`. A household has at least one owner.
- **The household is never created implicitly.** `HouseholdResolver.requireForUser` creates nothing: a user without membership gets 403 `household-required` on every household route (one mapping, `http/household-required-response.ts`; controllers let the error through) and `GET /api/auth/session` returns `household: null`. The web onboarding creates the household or accepts an invitation.
- **Only the browser cookie session manages the household and its membership.** Household, invitation and Telegram-link routes are wired to `cookieSessionResolver`; the MCP bearer key gets 401 there. A leaked `MCP_API_KEY` must not be able to invite, remove or rename anything. Finance routes use the composite resolver (cookie or key). New routes that change membership or add a way to sign in follow the cookie-only rule.
- Invitations are one-time links `https://<domain>/invite#<token>` (the token is in the fragment, never in a path or query: those reach access logs). Only the SHA-256 of the token is stored; the link is shown once; at most 3 active per household; the lifetime is `HOUSEHOLD_INVITATION_TTL_HOURS`. `preview` and `accept` take the token in the JSON body. A dead link is always the same 404 `invitation-unavailable` in one shape; only the optional `reason` (`expired` | `used` | `revoked` | `unknown`) differs, and only for a well-formed token (a malformed one is 400 with no `reason`). Every token is looked up by hash in both invitation tables, one query each, so the work is the same for every cause and kind.
- **Two kinds of invitation, one link.** An *invitation into a household* (any owner, the guest joins as `member` through `accept`) and an *invitation into the application* (platform administrator only, the guest signs up and founds their own household as owner; `accept` refuses it with 409 `app-invitation-not-acceptable`). The server tells the kind by the hash; `preview` answers `kind: 'household' | 'app'` (for `app`: the inviter's name and the deadline, no household).
- Removing a member deletes the membership and all their sessions in one transaction; the user row is never deleted. `leave` keeps the sessions.
- Routes (all under `/api`): `POST /auth/telegram/start|complete|cancel`; `POST /auth/telegram/link/start|complete`; `POST /telegram/webhook` (Telegram only, secret header, no `Origin` check); `POST /dev/telegram/confirm` (only with `DEV_TELEGRAM_LOGIN`, loopback peers only); `GET|POST|PUT /household`; `POST /household/members/:userId/remove`; `POST /household/leave`; `GET|POST /household/invitations`; `POST /household/invitations/:id/revoke`; `POST /invitations/preview`; `POST /invitations/accept`; `GET|POST /app-invitations`; `POST /app-invitations/:id/revoke`.

## Deployment

Nginx is the public entry point: it serves the built `apps/web` assets and proxies `/api/*` to `apps/api`, preserving the `/api` prefix. See `docs/deployment.md` and `docs/architecture.md`.

## Node & package manager

- Node >= 22, pnpm
- No pre-commit hooks or lint-staged configuration
- No CI workflows in this repo
- Local OpenCode configuration is stored in `opencode.json`
