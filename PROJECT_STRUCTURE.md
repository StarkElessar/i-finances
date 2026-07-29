# Структура проекта i-finances

## Общие сведения о проекте

**i-finances** — веб-приложение для управления финансами на базе SolidStart 2.0 (alpha).

### Технологии
- **Фреймворк**: SolidStart 2.0 (Solid 1.9, Vite 7, Nitro)
- **Бэкенд/SSR**: Nitro (Nuxt-like)
- **База данных**: SQLite (better-sqlite3) + Drizzle ORM
- **Язык**: TypeScript 7 (npm alias typescript@7.0.2)
- **CSS**: SCSS + PostCSS (mobile-first, desktop-first)
- **Управление версиями**: pnpm workspace

### Ключевые фичи
- **Auth**: Session-based с Argon2 + WebAuthn (passkeys)
- **Multi-household**: Поддержка нескольких домашних хозяйств
- **Курсы валют**: Интеграция с национальным банком + ручное обновление
- **Сущности**: Accounts, Categories, Contacts, Operations, Exchange-rate
- **UI**: Rеusable компоненты с CSS Modules и SCSS

---

## Древо папок и файлов

```
/Users/stark/Documents/web/experimental/i-finances/

.config/
├── .editorconfig
├── .gitignore
├── tsconfig.json
├── vite.config.ts
└── pnpm-workspace.yaml

.idea/
├── (IntelliJ IDEA settings)

.cursor/
└── rules/
    ├── function-style.mdc
    ├── interactive-styles.mdc
    ├── local-api-usage.mdc
    └── responsive-styles.mdc

.scripts/
├── migrate-db.ts
├── seed-auth-user.ts
├── upsert-exchange-rate.ts
├── import-ifinance-*.ts
└── classify-ifinance-contacts.ts

.src/
├── app/
│   ├── app.tsx
│   ├── global.scss
│   └── root-layout.tsx
├── entry-client.tsx
├── entry-server.tsx
├── global.d.ts
├── middleware.ts
├── src/routes/
│   ├── (app)/
│   │   ├── 404.tsx
│   │   ├── index.tsx
│   │   ├── ui-kit.tsx
│   │   ├── [categories].tsx
│   │   └── [contacts].tsx
│   └── (auth)/
│       ├── logout.ts
│       └── sign-in.tsx
├── src/shared/
│   ├── lib/
│   │   └── index.ts
│   ├── styles/
│   │   ├── mixins.scss
│   │   ├── functions.scss
│   │   └── tokens.scss
│   └── ui/
│       ├── button/
│       ├── dialog/
│       ├── modal/
│       ├── form-field/
│       ├── grid/
│       ├── combobox/
│       ├── switch/
│       ├── text-field/
│       ├── context-menu/
│       ├── color-picker/
│       ├── input/
│       ├── dropdown/
│       ├── icon-button/
│       ├── card/
│       ├── table/
│       ├── breadcrumbs/
│       ├── tabs/
│       ├── badge/
│       └── avatar/
├── @/
├── src/entities/
│   ├── account/
│   │   ├── index.ts
│   │   ├── model/
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   └── api/
│   │       ├── types.ts
│   │       └── index.ts
│   ├── category/
│   ├── contact/
│   ├── exchange-rate/
│   └── operation/
├── src/features/
│   └── feature-a/
└── src/views/
    ├── home/
    ├── categories/
    ├── contacts/
    └── (auth)/
        └── sign-in/
```

**Примечание**: Полный список всех файлов см. в приложенном файле.

---

## Описание ключевых модулей

### 🏠 Сущности (src/entities/)

Шардинг кода для сущностей, доступный как на клиенте, так и на сервере.

- **account** (`src/entities/account/`)
  - `src/entities/account/model/types.ts` - типы счёта (название, валюта, тип, household-id)
  - `src/entities/account/model/index.ts` - публичный API клиента
  - `src/entities/account/api/types.ts` - контракты
  - `src/entities/account/api/index.ts` - публичный API
  - `src/entities/account/api/account.server.ts` - server implementation
  - `drizzle/schema/accounts.ts` - schema

- **category** (`src/entities/category/`)
  - `src/entities/category/model/types.ts` - типы категории (название, тип, архив)
  - `src/entities/category/model/normalization.ts` - нормализация
  - `src/entities/category/model/selectors.ts` - селекторы
  - `src/entities/category/model/money.ts` - money representation
  - `src/entities/category/api/types.ts` - контракты
  - `src/entities/category/use-cases/*.ts` - use-cases (create, update, list)
  - `drizzle/schema/categories.ts` - schema

- **contact** (`src/entities/contact/`)
  - `src/entities/contact/model/types.ts` - типы контакта
  - `src/entities/contact/model/normalization.ts` - нормализация
  - `src/entities/contact/model/selectors.ts` - селекторы
  - `src/entities/contact/api/types.ts` - контракты
  - `src/entities/contact/api/index.ts` - API

- **operation** (`src/entities/operation/`)
  - `src/entities/operation/model/types.ts` - типы операции (date, amount, currency, accountId, contacts, payee)
  - `src/entities/operation/model/normalization.ts` - нормализация
  - `src/entities/operation/model/selectors.ts` - селекторы
  - `src/entities/operation/model/period.ts` - period calculations
  - `src/entities/operation/model/table-types.ts` - table types
  - `src/entities/operation/use-cases/create-operation.ts` - creation
  - `src/entities/operation/use-cases/recalculate-operation-rate.ts` - rate recalculation
  - `drizzle/schema/operations.ts` - schema

- **exchange-rate** (`src/entities/exchange-rate/`)
  - `src/entities/exchange-rate/model/types.ts` - типы курса валют
  - `src/entities/exchange-rate/model/contract.ts` - контракты
  - `src/entities/exchange-rate/api/index.ts` - API

- **viewer** (`src/entities/viewer/`)
  - `src/entities/viewer/model/types.ts` - типы пользователя
  - `src/entities/viewer/model/current-viewer-context.tsx` - context
  - `src/entities/viewer/api/get-current-viewer.ts` - API

### 🎯 Сервер (src/server/)

Серверный код (никогда не импортится на клиенте).

- **auth** (`src/server/`)
  - `src/server/auth/session/` - session management + repositories
  - `src/server/auth/password/` - password auth (Argon2)
  - `src/server/auth/passkey/` - WebAuthn (sign-in, registration, storage)
  - `src/server/auth/csrf/` - CSRF protection
  - `src/middleware.ts` - auth guards

- **categories** (`src/server/category/`)
  - `src/server/category/category-service.ts` - service
  - `src/server/category/category-repository.ts` - DB repository
  - `src/server/category/use-cases/*.ts` - бизнес логика
  - `src/entities/category/api/public-categories.server.ts` - публичный API

- **contacts** (`src/server/contact/`)
  - `src/server/contact/contact-service.ts` - service
  - `src/server/contact/contact-repository.ts` - DB repository
  - `src/server/contact/use-cases/*.ts` - бизнес логика

- **operations** (`src/server/operation/`)
  - `src/server/operation/operation-service.ts` - service
  - `src/server/operation/operation-repository.ts` - DB repository
  - `src/server/operation/use-cases/*.ts` - бизнес логика
  - `src/server/operation/account-currency-corrector.ts` - currency correction

- **exchange-rate** (`src/server/exchange-rate/`)
  - `src/server/exchange-rate/exchange-rate-service.ts` - service (National Bank API)
  - `src/server/exchange-rate/exchange-rate-repository.ts` - DB repository
  - `src/server/exchange-rate/national-bank-client.ts` - National Bank API client

- **household** (`src/server/household/`)
  - `src/server/household/household-service.ts` - service
  - `src/server/household/household-repository.ts` - DB repository
  - `src/server/household/default-household.ts` - initial state

- **db/schema/` (src/server/db/schema/)
  - `accounts.ts` - 8 columns, foreign keys to household
  - `contacts.ts` - 8 columns, foreign keys
  - `category-keywords.ts` - keyword-category
  - `exchange-rates.ts` - 5 columns, source (national-bank/manual)
  - `exchange-rate-refreshes.ts` - audit log
  - `operations.ts` - 12 columns (date, amount, currency, accountId, contactId, payee, categoryId, archived, period, rate, error, household), foreign keys to household, accounts, contacts, exchanges
  - `sessions.ts` - 6 columns
  - `users.ts` - 11 columns (WebAuthn)
  - `webauthn-credentials.ts` - WebAuthn storage
  - `households.ts` - 4 columns

### 🎨 UI (src/shared/ui/, src/widgets/)

- **src/shared/ui/*** - reusable компоненты
- **src/widgets/*** - верхнеуровень компоненты

### 📄 Views (src/views/)

- **home** (`src/views/home/`)
  - `page.tsx` - main view
  - `ui/account-dialog/` - account operations
  - `ui/operations-table/` - operations list
  - `ui/operation-details-panel/` - details form

- **categories** (`src/views/categories/`)
  - `page.tsx` - categories list
  - `ui/category-card/` - category item
  - `ui/category-dialog/` - category operations
  - `ui/keyword-input/` - keyword search

- **contacts** (`src/views/contacts/`)
  - `page.tsx` - contacts list
  - `ui/contact-card/` - contact item
  - `ui/contact-dialog/` - contact operations

- **sign-in** (`src/views/sign-in/`)
  - `page.tsx` - sign-in route
  - `ui/brand-panel/` - branding
  - `ui/identity-badge/` - provider info
  - `ui/passkey-sign-in-panel/` - WebAuthn
  - `ui/password-sign-in-panel/` - password

### 🧪 Tests (tests/)

```
tests/
├── server/
│   ├── account/
│   ├── auth/
│   ├── category/
│   ├── contact/
│   └── exchange-rate/
├── entities/
│   ├── account/
│   ├── category/
│   ├── contact/
│   └── operation/
└── shared/
    └── lib/
```

- In-memory SQLite tests
- Cross-household isolation
- Entity unit tests

### 🛠 Инструменты (tools/)

- **plop/templates** - code generators:
  - `component/` - UI компонента
  - `view/` - страница + route

---

## API Endpoints

### Document Routes (`/api/*`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/public/categories` | GET | Get all public categories |
| `/api/categories` | POST | Create category |
| `/api/categories/:id` | PUT | Update category |
| `/api/categories/:id/archive` | PATCH | Toggle archive |
| `/api/contacts` | GET | List contacts |
| `/api/contacts` | POST | Create contact |
| `/api/contacts/:id` | PUT | Update contact |
| `/api/contacts/:id/archive` | PATCH | Toggle archive |
| `/api/operations` | POST | Create operation |
| `/api/operations/:id` | PUT | Update operation |
| `/api/operations/:id/delete` | DELETE | Delete operation |
| `/api/accounts` | GET | List accounts |
| `/api/accounts` | POST | Create account |
| `/api/accounts/:id/correct-currency` | PUT | Correct currency |
| `/api/exchange-rates` | GET | List exchange rates |
| `/api/exchange-rates` | POST | Add exchange rate |
| `/api/operation-rates/recalculate/:date` | PUT | Recalculate rate |
| `/api/session` | POST | Login |
| `/api/passkey/sign-in/verify` | POST | WebAuthn verify |
| `/api/passkey/sign-in/options` | GET | WebAuthn options |
| `/api/passkey/register` | POST | Register passkey |
| `/api/passkey/register/verify` | POST | WebAuthn verify (register) |
| `/api/passkey/register/options` | GET | WebAuthn options (register) |
| `/api/logout` | POST | Logout |

---

## Database Schema

### Основные таблицы

1. **users** - пользователи (username, password_hash, household_id)
2. **households** - домашние хозяйства
3. **sessions** - сессии (session_id, user_id, household_id)
4. **accounts** - счета (name, currency, type, household_id)
5. **contacts** - контакты (name, type, email, phone, website, archived, household_id)
6. **operations** - операции (date_ms, amount, currency, currency_from, accountId, contactId, payee, categoryId, archived, period, rate, error, household)
7. **exchange-rates** - курсы валют (from, to, rate, source, date, household_id)
8. **exchange-rate-refreshes** - аудит обновления курсов

### Schema relationships

```
┌─────────────┐
│  households │──┐
└──────┬──────┘  │
       │        │
       │        │
│─┬────+--------+--------┬────┐
│ │  │    │           │    │  │
│ │  │    │           │    │  │
│ │  │    │           │    │  │
│ │  │    │          ┌┘    │  │
│ │  │   │           │     │  │
│ │  │   │           │     │  │
│ │  │   │          ┌─┘     │  │
│ │  │   │          │       │  │
├──┼──┼──┼───────   │       │  │
│ │ │ │ │           │       │  │
│   │   │          ┌─┘       │  │
│   │   │         ┌─┘       ┌─┘  │
├──│─┼──│────   ┌─┘        ┌─┘  │
│  │ │ │       ┌─┘         │     │
│  │ │ │      ┌─┘         ┌─┘     │
└──│─┘ └──────┘          └────   └─┘
   │              ←←←←←←←←←←←←←
   │
   │     ┌── accounts ─────────────────────────┐
   │     │  ┌─┐    contacts ──────────────────┼─┐
   │     │  └─┘    ┌─┐  ┌───────────────────┘  │
   │           ┌──┘      ┌─────────────────────┘
   │            │        │
   │            │       ┌─┤─── operations ─┐
   │            │       │   ┌────┐         │
   │            │       │   │    │         │
   │            │       │   │    │         │
   │            │       │   │    │         │
   │            │       │   │    │         │
   │            │       │   │    │         │
   │            │       │   │    │         │
   ◄────────────┘       │   │    │         │
   │                   │   │    │         │
   │                    └───┘    │         │
   │                             │         │
   │                          ←→   └─┘       ←─  category-keywords
   │                             │          ←─  categories
   │                        ┌────┘          ←─  keywords
   │                        └───────
```

---

## Ключевые файлы конфигурации

| Файл | Описание |
|------|----------|
| `package.json` | зависимости, скрипты |
| `pnpm-workspace.yaml` | workspace конфигурация |
| `tsconfig.json` | TypeScript конфигурация |
| `vite.config.ts` | Vite 7 конфиг |
| `drizzle.config.ts` | Drizzle конфиг |
| `opencode.json` | агентская конфигурация |
| `.editorconfig` | редактор настройки |
| `.env.example` | шаблон .env |

---

## Команды (pnpm)

### Dev

```bash
pnpm dev        # Vite dev (http://localhost:5173)
pnpm build      # typecheck + vite build
pnpm start      # SSR start
```

### Database

```bash
pnpm db:generate                    # drizzle-kit generate
pnpm db:migrate                     # migrate-db.ts
pnpm db:rate --from USD --to EUR    # upsert rate
pnpm db:seed                       # seed auth user
```

### Import

```bash
pnpm db:import:ifinance-operations   # import iFinances ops
pnpm db:import:ifinance-categories   # import iFinances cats
```

### Testing

```bash
pnpm test                # vitest run
pnpm test:watch          # vitest
```

### Linting

```bash
pnpm lint:fix           # eslint + stylelint
```

### Code Generation

```bash
pnpm g:component Name   # UI component
pnpm g:view Name        # view + route
```

---

## Конвенции

### Архитектура

```
┌────────────────────────────────────────────┐
│                  src/                     │
│  ┌────────┐  ┌──────────┐  ┌────────┐    │
│  │ app/   │  │ routes/  │  │ views/ │    │
│  │        │  │          │  └────────┘    │
│  └────────┘  └──────────┘                │
│  ┌────────────────────────┐              │
│  │  entities/            │              │
│  │ └─┐  │  └─┐  │  └─┐ │              │
│  └───┘  │     └─┘  │  └─┘ │              │
│  │      │         │  └─┐ │              │
│  │      │       ┌─────┐ │              │
│  │      │      ┌─┐  │ │              │
│  │      │     ┌─┘  └─┘ │              │
│  │      │     │  └─────┤              │
│  │      └─────┤────┐ ││              │
│  │           └────┐────┘              │
│  │                │                  │
│  │              ┌─┤                  │
│  │              └─┤──── server/     │
│  │               └─┤               │
│  │                 └────┌────────┐│
│  │                      │shared/ ││
│  │                     └────────┘│
│  └─────────────────────────────────┘
└─────────────────────────────────────┘

Entities → shared: both client/server
Server/Entities: API, types, repo, use-cases, service
```

### Entity Layer

1. **src/entities/<name>/model/** - бизнес логика:
   - `types.ts` - TypeScript типы
   - `index.ts` - экспорт в entity module (API)

2. **src/entities/<name>/api/** - контракты:
   - `types.ts` - API типы
   - `index.ts` - публичный API

3. **src/entities/<name>/api/*.server.ts** - server implementation:
   - `index.ts` - ре-экспорт server API
   - `*.server.ts` - server-only implementation

4. **src/server/<name>/use-cases/** - бизнес логика:
5. **src/server/db/schema/** - DB schema

### Shared / UI

```
src/shared/
├── lib/              - pure functions
│   └── ...
├── ui/              - reusable UI components
│   ├── button/
│   ├── dialog/
│   └── ...
└── styles/          - SCSS
    ├── mixins.scss  - responsive mixins
    ├── tokens.scss
    └── functions.scss
```

### Code Style

- **Tabs** для отступов, max 140 символов
- **Single quotes**, semicolons required
- **Braces**: Stroustrup (`} else {` on same line)
- **Imports**: styles → side-effects → node: → externals → `~/` → relatives
- **SCSS**: mobile-first, CSS modules, `camelCaseOnly`, logical properties
- **Auth**: session-based, Argon2 + WebAuthn
  - Cookie: `SESSION_COOKIE_NAME`
  - TTL: `SESSION_TTL_DAYS`
  - Origin: `AUTH_ORIGIN`
  - WebAuthn: `WEBAUTHN_RP_ID`

### Middleware

```ts
// src/middleware.ts
// Guards routes except /sign-in{, /ui-kit{ (dev only)
```

### DB

- SQLite + Drizzle ORM
- Все суммы: **minor units** (целые)
- В memory тестирование
- Cross-household изоляция
- DI: repositories, createId, now

---

## Статус

- ✅ Архитектура завершена
- ✅ Database schema
- ✅ Core entities
- ✅ Auth (password + WebAuthn)
- ✅ API layer
- ✅ Server layer
- ✅ UI components
- ⏳ Routes
- ✏️ Documentation
*/
