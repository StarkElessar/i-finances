# Migration map

| Legacy source | Target module | Status | Notes |
| --- | --- | --- | --- |
| `src/server/db` | `apps/api/src/infrastructure/database` | scaffolded | Moved mechanically; SQL and schema content unchanged. |
| `drizzle` | `apps/api/drizzle` | scaffolded | Existing migrations, snapshots, and journal preserved. |
| `src/server/category` | `apps/api/src/modules/category` + `apps/api/src/http/category-controller.ts` | implemented | Classes for repository, rules, application service, and Hono controller; public categories contract preserved. |
| `src/entities/category/api` | `packages/contracts` + `apps/web/src/features/categories/api` | partial | Wire schemas and HTTP client migrated; Solid UI currently covers the authenticated category read state. |
| `src/views/sign-in/api` | `packages/contracts` + `apps/web/src/features/auth` | partial | Password and passkey sign-in/session client and UI migrated; legacy visual parity remains. |
| `src/server/account` | `apps/api/src/modules/account` | pending | Preserve currency correction and household isolation. |
| `src/server/contact` | `apps/api/src/modules/contact` | pending | Preserve normalization and archive behavior. |
| `src/server/operation` | `apps/api/src/modules/operation` | pending | Preserve versioning, rates, and minor units. |
| `src/server/auth` | `apps/api/src/modules/auth` + `apps/api/src/http/auth-controller.ts` + `apps/api/src/http/passkey-controller.ts` | implemented | Password and WebAuthn ceremonies, Argon2 verification, rate limiting, strict origin guard, cookie sessions, replay-protected credentials, and revoke flow migrated. |
| `src/server/receipt-import` | `apps/api/src/modules/receipt-import` | pending | Preserve worker lease and file ownership rules. |
| `src/views`, `src/widgets`, `src/shared/ui` | `apps/web` | partial | New Solid shell and category read view exist; legacy screens remain intentionally unmigrated. |
