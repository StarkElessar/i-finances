# Migration map

| Legacy source | Target module | Status | Notes |
| --- | --- | --- | --- |
| `src/server/db` | `apps/api/src/infrastructure/database` | scaffolded | Moved mechanically; SQL and schema content unchanged. |
| `drizzle` | `apps/api/drizzle` | scaffolded | Existing migrations, snapshots, and journal preserved. |
| `src/server/category` | `apps/api/src/modules/category` | pending | First business vertical slice. |
| `src/server/account` | `apps/api/src/modules/account` | pending | Preserve currency correction and household isolation. |
| `src/server/contact` | `apps/api/src/modules/contact` | pending | Preserve normalization and archive behavior. |
| `src/server/operation` | `apps/api/src/modules/operation` | pending | Preserve versioning, rates, and minor units. |
| `src/server/auth` | `apps/api/src/modules/auth` | pending | Preserve cookies, CSRF, sessions, and WebAuthn. |
| `src/server/receipt-import` | `apps/api/src/modules/receipt-import` | pending | Preserve worker lease and file ownership rules. |
| `src/views`, `src/widgets`, `src/shared/ui` | `apps/web` | pending | Migrate only after the corresponding API slice exists. |
