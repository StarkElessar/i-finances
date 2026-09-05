# Web application

The web app is a client-only Solid.js application built with Vite.

- Communicate with the API over HTTP; do not import `@i-finances/api` or server-only modules.
- `@i-finances/contracts` is the only workspace package allowed as a direct shared-code dependency at this stage.
- Do not import Hono server APIs, Drizzle, `better-sqlite3`, Node-only auth packages, or database schemas.
- SolidStart, server actions, server queries, and Nitro do not belong here.
- Use `@/*` for imports rooted at `apps/web/src`; keep same-feature implementation details relative.

## FSD-like feature structure

Keep each web feature split by responsibility under `src/features/<name>`:

- `api/` — contracts-backed HTTP clients and transport options;
- `model/` — feature state, form parsing, commands, and domain formatters;
- `lib/` — feature-local pure helpers and error mapping;
- `ui/` — presentational components and feature orchestration views;
- `index.ts` — the public feature entry point.

Keep list, form, formatting, error handling, and orchestration in separate
files when they have separate responsibilities. A feature view may compose
these parts, but should not become a container for unrelated components and
helpers.
