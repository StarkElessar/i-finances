# Workspace architecture

## Runtime boundaries

```text
Browser
  │ HTTP only
  ▼
apps/web ────────► apps/api ────────► SQLite / external services
     │                  ▲
     └──── contracts ───┘
```

`apps/web` is a client-only Solid.js application. `apps/api` is the only owner of HTTP, authentication, business services, repositories, SQLite, migrations, and worker endpoints. `packages/contracts` contains serializable Zod contracts and has no runtime dependency on either application.

## Layer rules

- Hono is limited to routes, middleware, and HTTP controllers.
- Application services receive application inputs and return application results; they do not receive Hono context or database rows.
- Repositories translate between application types and Drizzle rows.
- Contracts describe the public wire format, not persistence.
- Dependencies are constructed explicitly in the API composition root.

## Migration reference

The former SolidStart application is kept in the sibling `master` worktree at `/Users/stark/Documents/web/experimental/i-finances`. It is consulted only for observed behavior, tests, and invariants while a vertical slice is migrated.
