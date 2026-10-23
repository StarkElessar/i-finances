# Workspace architecture

## Runtime boundaries

```text
Browser
  │ HTTP only
  ▼
apps/web ────────► apps/api ────────► SQLite / external services
     │                  ▲
     └──── contracts ───┤
apps/mcp ── HTTP ───────┘
```

`apps/web` is a client-only Solid.js application. `apps/api` is the only owner of HTTP, authentication, business services, repositories, SQLite, migrations, and worker endpoints. `apps/mcp` is a separate stdio MCP process that calls the API over HTTP with a bearer key. `packages/contracts` contains serializable Zod contracts shared by all three applications and has no runtime dependency on them.

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

The category mutation endpoints require an existing session. During the first
vertical slice, session validation was read-only and auth migration was still
pending. Login, logout, origin checks, WebAuthn, and Telegram sign-in are now
wired in `apps/api/src/app.ts` and `apps/api/src/composition-root.ts`.

## Account boundary and currency locking

```text
Hono route
  ▼
AccountHttpController ──► AccountService ──► AccountRules ──► HouseholdResolver
                                  │
                                  ▼
                           AccountRepository ──► Drizzle / SQLite
```

`apps/api/src/modules/account/account-service.ts` owns account use cases and
optimistic-lock decisions. `AccountRules` resolves the household and scopes
reads and writes. The repository exposes application records instead of Drizzle
rows. Changing an account's currency when it has operations throws
`AccountCurrencyLockedError`; the current service has no currency-correction
collaborator or `confirmCurrencyCorrection` flag. Account details are handled by
`modules/account/details/account-details-handlers.ts`. The browser uses
`features/accounts/api/account-client.ts` and the shared contracts.

<details>
<summary>Earlier description, retained as history; it does not describe the current implementation</summary>

### Historical currency-correction design

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

</details>

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

The accounts and operations features currently expose HTTP clients through
`features/accounts/api/account-client.ts` and
`features/operations/api/operation-client.ts`. Page orchestration lives in
`views/home/page.tsx`; its account dialog, operation list/table, details panel,
and workspace live under `views/home/ui/`. Account-type details are split into
`features/account-details/model/` and `features/account-details/ui/`. The earlier
`AccountsView` feature layout is no longer the current file structure.

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
records and keep Drizzle rows inside API repositories (`modules/auth/*-repository.ts`). The web
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

ReceiptProcessingLoop (in-process background poller)
  │ claims a queued job, reads the stored image, normalizes it to JPEG
  ▼
LiteLlmClient ──► corporate LiteLLM proxy (vision OCR, then categorization)
  │ validated ReceiptWorkerResult
  ▼
ReceiptImportService
```

Receipt processing is review-first. Upload creates a `queued` import and a
processing job while storing immutable snapshots of the active household
categories and contacts. A background loop inside the API process — started
from `main.ts` when `RECEIPT_LITELLM_API_KEY` is nonblank, once per API process — claims the oldest
queued job, reads the private image directly from storage, normalizes it with
`sharp`, and makes two outbound calls to the corporate LiteLLM proxy: a vision
model transcribes the receipt, then a text model assembles the structured JSON,
assigns a category to each line, and picks a contact. The result is validated
against `receiptWorkerResultSchema` plus the stored category/contact snapshots.
A completed job transitions to `needs_review`; it never creates ledger
operations by itself. A failed job stays `failed` — there is no automatic
retry. The user can explicitly retry a failed import through
`POST /api/receipt-imports/:id/retry`; requesting revision is a separate command.
A job left `leased` by a crash is reset to `queued` before the processing loop
starts (`composition-root.ts`, `ReceiptImportService.recoverStaleProcessingJobs`).

While an import is in `needs_review`, the browser can update the merchant, date,
amounts, item names, and category assignments through the review command. The
command uses the import version for optimistic locking and validates category
ids against the immutable snapshot. Approval therefore consumes the latest
saved review result rather than data held only in the browser.

The approve command is authenticated, household-scoped, and guarded by the
receipt version. The browser submits the finalized operation groups it built in
the review dialog; the server validates the account currency, that every receipt
line is covered exactly once, that every category and the contact come from the
stored snapshots, and that the operation amounts sum to the receipt total. It
then creates expense operations through the existing `OperationService` and
writes `receipt_operation_links` keyed by the covered item indexes, so a retried
approval after a partial failure neither duplicates nor silently skips a group.

## Code inventory (2026-10-23)

These are immediate subdirectories, counted with
`find <directory> -mindepth 1 -maxdepth 1 -type d | sort`:

| Directory | Count | Names |
|---|---|---|
| `apps/api/src/modules` | 12 | `account`, `app-invitation`, `auth`, `category`, `contact`, `exchange-rate`, `household`, `operation`, `receipt-import`, `telegram`, `telegram-auth`, `transfer` |
| `apps/web/src/features` | 13 | `account-details`, `accounts`, `auth`, `categories`, `contacts`, `exchange-rate`, `household`, `invitation`, `operations`, `receipt-import`, `security`, `telegram-request`, `transfers` |
| `apps/web/src/entities` | 8 | `account`, `category`, `contact`, `exchange-rate`, `operation`, `receipt-import`, `transfer`, `viewer` |
| `apps/web/src/widgets` | 1 | `app-header` |
| `apps/web/src/views` | 7 | `categories`, `contacts`, `home`, `invite`, `onboarding`, `receipts`, `statistics` |

API repositories and external adapters currently live alongside their modules
(for example `modules/category/category-repository.ts` and
`modules/receipt-import/litellm-client.ts`). `src/infrastructure/database/`
contains the database client, migration runner, and schema. The schema declares
21 tables; `drizzle/meta/_journal.json` has 18 entries (0000–0017).

## API routes (2026-10-23)

Source: `apps/api/src/app.ts`, 78 explicit method/path registrations (not counting
middleware or the fallback handler). Every route except health is registered
only when its controller is supplied; `composition-root.ts` supplies the normal
runtime controllers. `/api/dev/telegram/confirm` is supplied only with
`DEV_TELEGRAM_LOGIN=true`, is loopback-only, and is forbidden in production.
`/api/telegram/webhook` is supplied only in `webhook` mode.

```text
GET     /api/health
GET     /api/auth/session
POST    /api/auth/sign-in
POST    /api/auth/sign-out
PUT     /api/auth/display-name
POST    /api/auth/telegram/start
POST    /api/auth/telegram/complete
POST    /api/auth/telegram/cancel
POST    /api/dev/telegram/confirm
POST    /api/auth/telegram/link/start
POST    /api/auth/telegram/link/complete
GET     /api/accounts
GET     /api/accounts/:id
POST    /api/accounts
PUT     /api/accounts/:id
POST    /api/accounts/:id/archive
POST    /api/accounts/:id/restore
POST    /api/auth/passkey/sign-in/options
POST    /api/auth/passkey/sign-in/verification
POST    /api/auth/passkey/registration/options
POST    /api/auth/passkey/registration/verification
GET     /api/security/passkeys
DELETE  /api/security/passkeys/:id
POST    /api/security/password
GET     /api/security/sessions
DELETE  /api/security/sessions/others
DELETE  /api/security/sessions/:id
GET     /api/categories
POST    /api/categories
PUT     /api/categories/:id
POST    /api/categories/:id/archive
POST    /api/categories/:id/restore
GET     /api/public/categories
OPTIONS /api/public/categories
GET     /api/contacts
POST    /api/contacts
PUT     /api/contacts/:id
POST    /api/contacts/:id/archive
POST    /api/contacts/:id/restore
GET     /api/exchange-rates/current
GET     /api/household
POST    /api/household
PUT     /api/household
POST    /api/household/members/:userId/remove
POST    /api/household/leave
POST    /api/household/invitations
GET     /api/household/invitations
POST    /api/household/invitations/:id/revoke
POST    /api/invitations/preview
POST    /api/invitations/accept
POST    /api/app-invitations
GET     /api/app-invitations
POST    /api/app-invitations/:id/revoke
GET     /api/operations/balances
GET     /api/operations/ledger
GET     /api/operations/by-category
GET     /api/operations/by-contact
GET     /api/operations/monthly-summary
GET     /api/operations/category-stats
GET     /api/operations/monthly-trend
GET     /api/operations/monthly-breakdown
POST    /api/operations
PUT     /api/operations/:id
POST    /api/operations/:id/archive
POST    /api/operations/:id/restore
POST    /api/operations/:id/recalculate-rate
GET     /api/receipt-imports
POST    /api/receipt-imports
GET     /api/receipt-imports/:id/image
POST    /api/receipt-imports/:id/revision
POST    /api/receipt-imports/:id/retry
PUT     /api/receipt-imports/:id/review
POST    /api/receipt-imports/:id/approve
GET     /api/transfers/:id
POST    /api/transfers
PUT     /api/transfers/:id
POST    /api/transfers/:id/delete
POST    /api/telegram/webhook
```

Finance controllers use the composite cookie/bearer resolver. Household,
invitation, Telegram-link, passkey-registration, and security management use the
cookie resolver; see the wiring in `composition-root.ts`. The public categories
GET/OPTIONS pair has its own controller handling; it is not a general CORS
policy for the API.

## Migration reference

The former SolidStart application is kept in the sibling `master` worktree at `/Users/stark/Documents/web/experimental/i-finances`. It is consulted only for observed behavior, tests, and invariants while a vertical slice is migrated.

## Production topology

Nginx serves the static output of `apps/web` and proxies `/api/*` to the
standalone API process. The browser therefore keeps a single origin for the
Solid client, session cookie, CSRF origin checks, and API requests; the API
does not serve frontend assets.
