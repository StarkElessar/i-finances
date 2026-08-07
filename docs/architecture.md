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

## First vertical slice: Categories

```text
Hono route
  ▼
CategoryHttpController ──► CategoryService ──► CategoryRules
                                  │
                                  ▼
                         CategoryRepository ──► Drizzle / SQLite
```

`CategoryHttpController` owns request parsing, session/origin checks, HTTP
status codes, and error mapping. `CategoryService` owns use-case orchestration
and receives only application inputs. `CategoryRules` centralizes household
scope, normalized-name uniqueness, and optimistic-lock invariants.

The classes are deliberately concrete and narrowly owned: there is no generic
base repository, service locator, decorator container, or route DSL. The
composition root wires the production graph, while tests inject a database,
clock, ID generator, and session resolver.

The category mutation endpoints require an existing session. Session validation
is read-only in this slice; login, logout, CSRF policy expansion, and WebAuthn
flows remain part of the later auth migration.

## Web client boundary

```text
Solid component
  ▼
CategoryClient ──► ApiClient ──► Fetch API / Vite proxy
       │
       └──────────────► packages/contracts
```

`ApiClient` owns JSON serialization, same-origin credentials, response parsing,
and transport errors. `CategoryClient` owns category paths and input/response
schemas. Solid components receive the feature client as a dependency and do
not import Hono, Drizzle, Node auth code, or API implementation modules.

## Password auth boundary

```text
Hono route
  ▼
AuthHttpController ──► PasswordSignInService
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
       PasswordUserRepo   PasswordService   SessionService
             │             (Argon2id)           │
             └────────────── SQLite ────────────┘
```

The controller owns HTTP status codes and cookie headers. The application
service owns credential validation, username normalization, rate limiting,
return-path validation, and session creation. Session tokens are opaque and
stored only as SHA-256 hashes. Auth mutations require a valid Origin or
Referer belonging to the API/app origin; WebAuthn remains a separate protocol
slice.

## WebAuthn boundary

```text
Hono route
  ▼
PasskeyHttpController ──► WebAuthnService
                                  │
                 ┌────────────────┼────────────────┐
                 ▼                ▼                ▼
       ChallengeRepository  CredentialRepository  SessionService
                 │                │                │
                 └──────────── SQLite ────────────┘
```

The controller owns origin checks, authentication requirements, HTTP statuses,
and session cookies. `WebAuthnService` owns ceremony policy: five-minute
one-time challenges, expected origins/RP ID, user verification, credential
counter updates, and passkey session creation. Repositories expose application
records and keep Drizzle rows inside the API infrastructure boundary. The web
client invokes the options/verification protocol through the shared contracts;
it does not import API or database code.

## Migration reference

The former SolidStart application is kept in the sibling `master` worktree at `/Users/stark/Documents/web/experimental/i-finances`. It is consulted only for observed behavior, tests, and invariants while a vertical slice is migrated.
