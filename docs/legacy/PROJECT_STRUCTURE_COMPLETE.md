# Structure

## Root structure

```
/Users/stark/Documents/web/experimental/i-finances/
  │  .junie
  │  pnpm-lock.yaml
  │  .cursor
  │  tools/
  │  tools/plop/
  │  tools/plop/templates/
  │  │  component/
  │  │    ✓ component.tsx.hbs
  │  │    ✓ styles.module.scss.hbs
  │  │    ✓ index.ts.hbs
  │  │  view/
  │  │    ✓ page.tsx.hbs
  │  │    ✓ route.tsx.hbs
  │  │    ✓ styles.module.scss.hbs
  │  .nitro/
  │  PROECT_STRUCTURE.md (this file)
  │  dist/
  │  .output/
  │  node_modules/
  │  tests/
  │    server/
  │      ✓ account/
  │        ✓ account-service.test.ts
  │      ✓ auth/
  │        ✓ login-rate-limit.test.ts
  │        ✨ validate-return-path.test.ts
  │        ✨ origin-guard.test.ts
  │        ✓ passkey-encoding.test.ts
  │        └─ auth-service
  │        └─ auth-session
  │      ✓ category/
  │        ✓ category-service.test.ts
  │      ✨ operation/
  │        ✓ operation-service.test.ts
  │        ✓ exchange-rate-client.test.ts
  │      ✓ exchange-rate/
  │        ✓ exchange-rate-service.test.ts
  │        ✨ national-bank-client.test.ts
  │      ✓ contact/
  │        ✓ contact-service.test.ts
  │    entities/
  │    ✓ account/
  │      └─ model
  │    ✓ category/
  │      ✓ selectors.test.ts
  │    ✨ operation/
  |      ✨ selectors.test.ts
  │    ✓ exchange-rate/
  |      ✨ contract.test.ts
  │    ✨ contact/
  |      ✨ selectors.test.ts
  │    ✨ payee/
  │      └─ model
  │  pnpm-workspace.yaml
  │  .gitignore
  │  .editorconfig
  │  .env.example
  │  AGENTS.md
```

## Source code

```
/Users/stark/Documents/web/experimental/i-finances/src/
  │  entry-client.tsx
  │  entry-server.tsx
  │  global.d.ts
  │  middleware.ts           # Auth guards
  │  app/
  │    ✓ app.tsx
  │    ✓ root-layout.tsx
  │    ✓ global.scss
  │
  │  routes/
  │    (auth)/
  │      sign-in.tsx
  │      (auth)/
  │        sign-in.tsx
  │    (app)/
  │      ✨ ui-kit
  │        ✨ ui-kit.tsx
  │        ✨ categories
  │        ✨ contacts
  │        ✨ home
  │          ✨ page.tsx
  │          ✨ ui/
  │            ✨ operations-table
  │            ✨ categories
  │            ✨ contacts
  │        ✨ ...
  │    api/
  │      public/
  │        categories.ts
  │      auth/
  │        ✨ auth
  │        ✨ session
  │        ✨ rate-limit
  │        ✨ passkey/
  │          ✨ sign-in
  │          ✨ registration
  │
  │  entities/                 # Shared entity code
  │    account/
  │      model/
  │        ✓ types.ts
  │        ✨ types.ts
  │        ✨ money.ts
  │        ✨ index.ts
  │      api/
  │        ✓ types.ts
  │        ✨ account.contract.ts
  │        ✨ index.ts
  │        ✨ account.server.ts
  │    category/
  │      model/
  │        ✓ types.ts
  │        ✨ types.ts
  │        ✨ money.ts
  │        ✨ selectors.ts
  │        ✨ index.ts
  │      api/
  │        ✓ types.ts
  │        ✨ category.contract.ts
  │        ✨ category.server.ts
  │        ✨ index.ts
  │        ✨ public-categories.server.ts
  │      use-cases/
  │        ✨ create-category
  │    contact/
  │      model/
  │        ✨ types.ts
  │        ✨ types.ts
  │        ✨ selectors.ts
  │        ✨ contact.server.ts
  │        ✨ index.ts
  │    operation/
  │      model/
  │        ✨ types.ts
  │        ✨ selectors.ts
  │        ✨ normalization.ts
  │        ✨ table-types.ts
  │        ✨ index.ts
  │      api/
  │        ✨ types.ts
  │        ✨ index.ts
  │        ✨ operation.contract.ts
  │        ✨ operation.server.ts
  │    exchange-rate/
  │      model/
  │        ✓ types.ts
  │        ✨ types.ts
  │        ✨ contract.ts
  │        ✨ index.ts
  │      api/
  │        ✨ exchange-rate.server.ts
  │        ✨ index.ts
  │      index.ts           # Contract export
  │    viewer/
  │      model/
  │        ✓ types       # Viewer type
  │      api/
  │        ✨ get-current-viewer.ts
  │      index.ts
  │
  │  features/
  │    passkey-registration/
  │      api/
  │        ✨ passkey-registration.contract.ts
  │      ui/
  │        ✨ passkey-registration-menu-item.tsx
  │        ✨ passkey-registration-menu-item.module.scss
  │      index.ts
  │
  │  shared/
  │    ui/                         # Shared UI components
  │      button/
  │        ✨ button.tsx
  │        ✨ button.module.scss
  │        ✨ index.ts
  │      combobox/
  │        ✨ combobox.tsx
  │        ✨ combobox.module.scss
  │        ✨ index.ts
  │      container/
  │        ✨ container.tsx
  │        ✨ container.module.scss
  │      context-menu/
  │        ✨ context-menu.tsx
  │        ✨ context-menu.module.scss
  │      dialog/
  │        ✨ dialog.tsx
  │        ✨ dialog.module.scss
  │        ✨ index.ts
  │      modal/
  │      input/
  │      dropdown/
  │      switch/
  │      icon-button/
  │      icon/
  │      card/
  │      table/
  │      tabs/
  │      badge/
  │      avatar/
  │      tooltip/
  │      notification/
  │      skeleton/
  │      drag-action/
  │      grid/
  │    styles/                    # SCSS
  │      tokens.scss
  │      functions.scss
  │      ✨ mixins.scss           # Responsive mixins
  │    lib/           # Utility functions
  │      ✓ index.ts
  │      ✨ cn
  │      ✨ account-color
  │      ✨ date-formatter
  │      ✨ currency-converter
  │      ✨ currency-formatter
  │      ✨ date-formatter
  │      ✨ accent-color
  │      ✨ account-color
  │      ✨ currency-formatter
  │      ✨ date-formatter
  │      ✨ currency-code
  │      ✨ currency-converter
  │      ✨ money
  │
  │  views/                       # View components
  │    home/
  │      ✨ home.module.scss
  │      ✨ page.tsx
  │      ✨ ui/
  │        ✨ account-dialog/
  │        ✨ account-details/
  │        ✨ account-dialog/
  │          ✨ account-dialog.tsx
  │          ✨ account-dialog.module.scss
  │        ✨ operations-table/
  │          ✨ operations-table.tsx
  │          ✨ operations-table.module.scss
```

## Server

```
/Users/stark/Documents/web/experimental/i-finances/src/server/
  │  db/                          # Database layer
  │    ✓ client.ts
  │    schema/
  │      ✓ index.ts
  │      │  users            # Users table (auth users)
  │      │  sessions         # User sessions
  │      │  households      # Households
  │      │  members         # Household members
  │      │  households/
  │      │    ✓ accounts    # User accounts
  │      │    ✓ contacts    # User contacts
  │      │    ✓ categories
  │      │    ✓ keywords    # Keywords for ops
  │      │    ✓ exchange-rates
  │      │    ✓ operations  # Operations ledger
  │      │    ✓ webauthn*   # WebAuthn credentials
  │
  │  account/
  │    account-errors.ts
  │    account-repository.ts
  │    account-service.ts
  │
  │  category/
  │    ✨ category-errors.ts
  │    ✨ category-rules.ts
  │    ✨ category-mappers.ts
  │    ✨ category-service.ts
  │    ✨ category-service.types.ts
  │    ✨ category-use-case.types.ts
  │    ✨ use-cases/
  │      └─ create-category
  │
  │  contact/
  │    ✨ contact-errors.ts
  │    ✨ contact-rules.ts
  │    ✨ contact-mappers.ts
  │    ✨ contact-service.ts
  │    ✨ contact-service.types.ts
  │    ✨ contact-use-case.types.ts
  │    ✨ use-cases/
  │      └─ list-contacts
  │
  │  exchange-rate/
  │    ✨ exchange-rate-errors.ts
  │    ✨ exchange-rate-mappers.ts
  │    ✨ exchange-rate-repository.ts
  │    ✨ exchange-rate-service.ts
  │    ✨ exchange-rate-service.types.ts
  │    national-bank-client.ts
  │    🏦 national-bank-api.ts     # Client for National Bank API
  │    ✨ exchange-rate-date.ts    # Date parsing
  │
  │  household/
  │    ✨ household-service.ts
  │    ✨ household-repository.ts
  │    ✨ default-household.ts
  │
  │  operation/
  │    ✨ operation-errors.ts
  │    ✨ operation-rules.ts
  │    ✨ operation-mappers.ts
  │    ✨ operation-rate.ts
  │    ✨ operation-service.types.ts
  │    ✨ operation-service.ts
  │    ✨ use-cases/
  │      └─ create-operation
  │      └─ recalculate-operation-rate
```

---

## Shared UI components

```
src/shared/ui/button/               # Main action button
src/shared/ui/combobox/             # Multi-select dropdown
src/shared/ui/container/            # Responsive container
src/shared/ui/context-menu/         # Right-click menu
src/shared/ui/dialog/               # Modal dialogs
src/shared/ui/modal/                # Full-screen overlay
src/shared/ui/form-field/           # Form field wrapper
src/shared/ui/switch/               # Toggle switch
src/shared/ui/input/                # Text input field
src/shared/ui/dropdown/             # Simple dropdown
src/shared/ui/icon-button/          # Icon button
src/shared/ui/card/                 # Card container
src/shared/ui/table/                # Data table
src/shared/ui/breadcrumbs/          # Navigation breadcrumbs
src/shared/ui/tabs/                 # Tab navigation
src/shared/ui/badge/                # Status badge
src/shared/ui/avatar/              # User avatar
src/shared/ui/color-picker/         # Color picker
src/shared/ui/typography/           # Text component
src/shared/ui/icon/                # Icon component
src/shared/ui/dropdown-menu/        # Dropdown with menus
src/shared/ui/notification/        # Toast notifications
src/shared/ui/skeleton/            # Loading skeleton
src/shared/ui/tabs/                # Tab navigation
src/shared/ui/drag-action/         # Drag actions
src/shared/ui/grid/                # Data grid
src/shared/ui/form/                # Form container
src/shared/ui/modal-page/          # Modal page overlay
src/shared/ui/search-bar/          # Search input
src/shared/ui/pin-input/           # PIN input
```

## Development

```
/Users/stark/Documents/web/experimental/i-finances/development/
  ✨ plan.md
```
```
/Users/stark/Documents/web/experimental/i-finances/development/receipt-photo-import-plan.md
```

## Drizzle migrations

```
drizzle/
  ✓ 0000_orange_smiling_tiger.sql
  ✓ 0001_household_accounts.sql
  ✓ 0002_unique_kingpin.sql
  ✓ 0003_fine_overlord.sql
  ✓ 0004_bouncy_namora.sql
  ✓ 0005_breezy_lady_ursula.sql
  ✓ 0006_panoramic_franklin_richards.sql
  meta/
    ✓ snapshot files
  ✨ database.sql
```

## Build output

```
./dist/
  server/              # Nitro server builds
    _build/
      ✨ index.mjs
      ✨ entry-server.mjs
      ✨ app.mjs
      ✨ ...
```

./dist/client/
  _build/
    ✨ index.mjs
    ✨ entry-client.mjs
    ✨ ...assets/

./.output/
  server/              # Dev output only
    _build/
    ✨ nitro.mjs
```

## Database

```
data/i-finances.sqlite
```

## Scripts

```
scripts/
  ✨ migrate-db.ts                 # Apply DB changes
  ✨ seed-auth-user.ts         # Create initial auth user
  ✨ upsert-exchange-rate.ts    # Add exchange rate
  ✨ import-ifinance-contacts.ts
  ✨ import-ifinance-categories.ts
  ✨ import-ifinance-operations.ts
  ✨ classify-ifinance-contacts.ts
```
*/