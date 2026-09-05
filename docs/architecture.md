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

Both applications use the `@/*` TypeScript alias for imports rooted at their
own `src` directory. The web Vite resolver and API Vitest resolver mirror the
same mapping so editor, build, test, and runtime paths remain consistent.

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

## Account boundary and currency correction

```text
Hono route
  ▼
AccountHttpController ──► AccountService ──► AccountRules
                                  │                 │
                                  │                 └── HouseholdResolver
                                  ▼
                    AccountCurrencyCorrector
                       │                  │
                       ▼                  ▼
              ExchangeRateService   CorrectionRepository
                       │                  │
                       └────── SQLite transaction ──────┘
```

`AccountService` owns account use cases and optimistic-lock decisions.
`AccountRules` resolves the authenticated household and prevents cross-household
reads or writes. The repository exposes application records instead of Drizzle
rows. When a populated account changes currency, the service requires an
explicit `confirmCurrencyCorrection` command flag. The corrector resolves a
historical direct, inverse, or identity quote for every operation, and the
correction repository atomically updates the account plus operation rate
snapshots with version guards. Missing rates and stale rows fail the whole
transaction, so historical ledger data is never silently reinterpreted.

The account web feature talks to this boundary through `AccountClient` and the
shared contracts. Its confirmation prompt is an explicit user action; the API
does not infer consent from a completed background task or a changed form field.

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

Web features use an FSD-like responsibility split without introducing a second
framework or a global abstraction layer:

```text
features/<name>
  api/    contracts-backed HTTP clients
  model/  state, commands, form parsing, formatters
  lib/    feature-local pure helpers and error mapping
  ui/     presentational components and orchestration views
  index.ts public feature boundary
```

For example, the accounts feature keeps its view orchestration in
`AccountsView`, while account list, account form, form parsing, update command,
labels, and error mapping live in their respective `ui`, `model`, and `lib`
modules. The operations feature follows the same boundary and exposes its
HTTP client separately from balances, ledger, and orchestration components.

## Operations vertical slice

```text
Hono route
  ▼
OperationHttpController ──► OperationService ──► OperationRules
                                  │                    │
                    ┌─────────────┼────────────┐       ├── AccountRepository
                    ▼             ▼            ▼       ├── CategoryRepository
          OperationRepository  ExchangeRate  Household └── ContactRepository
                    │             │            │
                    └─────────────┴────────────┴──► Drizzle / SQLite
```

The operation service preserves minor-unit amounts, household isolation,
optimistic versions, soft deletion, source ordering, and historical exchange
rate snapshots. Updating an operation on the same date keeps its stored quote;
changing the date resolves a new historical quote. Recalculation is a separate
explicit command. Contact references now use the household-scoped contact
repository; a current archived reference remains editable, while selecting a
different archived contact is rejected.

The contact slice follows the same HTTP chain:

```text
Hono route
  ▼
ContactHttpController ──► ContactService ──► ContactRules ──► ContactRepository
                                                                    │
                                                                    ▼
                                                               SQLite
```

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

## Receipt import vertical slice

```text
Browser
  │ multipart upload / review commands
  ▼
ReceiptImportClient ──► ReceiptImportHttpController ──► ReceiptImportService
                                                               │
                         ┌─────────────────────────────────────┼──────────────────┐
                         ▼                                     ▼                  ▼
                ReceiptImageStorage               ReceiptImportRepository   OperationService
                         │                                     │                  │
                         └─────────────────────────────────────┴──────────────────┘
                                                               ▼
                                                          SQLite / private files

Worker
  │ Bearer API key + lease token
  ▼
ReceiptWorkerHttpController ──► ReceiptImportService
```

Receipt processing is review-first. Upload creates a `queued` import and a
processing job while storing an immutable snapshot of the active household
categories. The worker can lease one job, renew its lease, read the private
image, and submit a schema-versioned result. A completed job transitions to
`needs_review`; it never creates ledger operations by itself.

While an import is in `needs_review`, the browser can update the merchant, date,
amounts, item names, and category assignments through the review command. The
command uses the import version for optimistic locking and validates category
ids against the immutable snapshot. Approval therefore consumes the latest
saved review result rather than data held only in the browser.

The approve command is authenticated, household-scoped, and guarded by the
receipt version. It validates the account currency and item total, groups
items by the worker category snapshot, creates expense operations through the
existing `OperationService`, and writes `receipt_operation_links` for retry
idempotency. The browser calls only the receipt endpoint; it does not create
the grouped operations itself. The Mac Mini/OCR worker and broker are outside
this repository slice and use the protected worker endpoints when integrated.

## Migration reference

The former SolidStart application is kept in the sibling `master` worktree at `/Users/stark/Documents/web/experimental/i-finances`. It is consulted only for observed behavior, tests, and invariants while a vertical slice is migrated.

## Production topology

Nginx serves the static output of `apps/web` and proxies `/api/*` to the
standalone API process. The browser therefore keeps a single origin for the
Solid client, session cookie, CSRF origin checks, and API requests; the API
does not serve frontend assets.
