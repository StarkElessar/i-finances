# План: FSD + SolidStart — Семейный финансовый учёт

## TL;DR

Пошаговый план разработки приложения для учёта финансов семьи на SolidStart с архитектурой Feature-Sliced Design. Бекенд — встроенный Nitro-сервер SolidStart, БД — SQLite + Drizzle ORM, API — через SolidStart Server Functions (`"use server"`). Два пользователя (муж и жена), вход по JWT (access + refresh токены), без регистрации.

---

## Этап 1: Фундамент — структура FSD и настройка окружения

### Шаг 1.1 — Файловая структура FSD-слоёв

Создать директории согласно FSD-методологии внутри `src/`:

```
src/
  app/            # Инициализация: провайдеры, стили, лейаут
  pages/          # Композиционные страницы (роуты SolidStart)
  widgets/        # Сложные UI-блоки из фич и сущностей
  features/       # Сценарии пользователя (auth, transactions, accounts)
  entities/       # Бизнес-сущности + server functions к ним
  shared/         # Переиспользуемое: UI-kit, типы, хелперы, конфиг
  server/         # Серверная инфраструктура: БД, мидлвари
```

**Файлы для создания:**
- `src/shared/config/` — константы приложения
- `src/shared/lib/` — утилиты (форматирование дат, валют, http-клиент)
- `src/shared/ui/` — базовые UI-компоненты (Button, Input, Modal, Select, Icon)
- `src/shared/types/` — общие TypeScript-типы
- `src/server/db/` — Drizzle schema, миграции, connection

### Шаг 1.2 — Установка зависимостей

Установить и настроить:

| Пакет | Назначение |
|---|---|
| `drizzle-orm` + `drizzle-kit` | ORM и CLI для миграций |
| `better-sqlite3` + `@types/better-sqlite3` | Драйвер SQLite |
| `jsonwebtoken` + `@types/jsonwebtoken` | JWT (access + refresh) |
| `bcryptjs` + `@types/bcryptjs` | Хеширование паролей |
| `zod` | Валидация на клиенте и сервере |

### Шаг 1.3 — Настройка Drizzle

- Создать `drizzle.config.ts` в корне проекта
- Настроить путь к схеме: `src/server/db/schema.ts`
- Настроить output для миграций: `src/server/db/migrations/`
- Создать `src/server/db/index.ts` — экспорт connection и клиента Drizzle

---

## Этап 2: Слой Entities — бизнес-сущности и Server Functions

### Шаг 2.1 — Модели БД (Drizzle schema)

Создать `src/server/db/schema.ts` с таблицами:

**`users`**
| Поле | Тип | Примечание |
|---|---|---|
| `id` | `text` (UUID) | PK |
| `username` | `text` | уникальный, для входа |
| `passwordHash` | `text` | bcrypt |
| `displayName` | `text` | отображаемое имя |
| `createdAt` | `text` (ISO) | |

**`accounts`**
| Поле | Тип | Примечание |
|---|---|---|
| `id` | `text` (UUID) | PK |
| `userId` | `text` | FK → users.id |
| `name` | `text` | название счёта |
| `color` | `text` | hex-цвет |
| `highlightColor` | `integer` | 0/1 — bool |
| `currency` | `text` | RUB, USD, EUR… |
| `initialBalance` | `real` | по умолчанию 0 |
| `comment` | `text` | nullable |
| `icon` | `text` | название/код иконки |
| `createdAt` | `text` (ISO) | |

**`categories`**
| Поле | Тип | Примечание |
|---|---|---|
| `id` | `text` (UUID) | PK |
| `name` | `text` | название категории |
| `type` | `text` | `'income'` / `'expense'` |
| `icon` | `text` | nullable |

**`recipients`**
| Поле | Тип | Примечание |
|---|---|---|
| `id` | `text` (UUID) | PK |
| `name` | `text` | название компании или ФИО |
| `type` | `text` | `'company'` / `'person'` |

**`transactions`**
| Поле | Тип | Примечание |
|---|---|---|
| `id` | `text` (UUID) | PK |
| `userId` | `text` | FK → users.id |
| `accountId` | `text` | FK → accounts.id |
| `categoryId` | `text` | FK → categories.id, nullable |
| `recipientId` | `text` | FK → recipients.id, nullable |
| `date` | `text` (ISO) | дата операции |
| `name` | `text` | название операции |
| `amount` | `real` | сумма (отрицательная для расхода) |
| `type` | `text` | `'income'` / `'expense'` |
| `comment` | `text` | nullable |
| `createdAt` | `text` (ISO) | |

**`refreshTokens`**
| Поле | Тип | Примечание |
|---|---|---|
| `id` | `text` (UUID) | PK |
| `userId` | `text` | FK → users.id |
| `token` | `text` | уникальный |
| `expiresAt` | `text` (ISO) | |
| `createdAt` | `text` (ISO) | |

### Шаг 2.2 — Entity-слой FSD: типы и Server Functions

Для каждой сущности создать в `src/entities/<entity>/`:

```
src/entities/
  user/
    model.ts          # Типы: User, LoginInput, AuthResponse
    api.ts            # Server Functions: login(), refreshToken(), logout(), getMe()
  account/
    model.ts          # Типы: Account, CreateAccountInput, UpdateAccountInput
    api.ts            # Server Functions: getAccounts(), createAccount(), updateAccount(), deleteAccount()
  transaction/
    model.ts          # Типы: Transaction, CreateTransactionInput, filters
    api.ts            # Server Functions: create/read/update/delete, getBalance()
  category/
    model.ts
    api.ts
  recipient/
    model.ts
    api.ts
```

**Паттерн Server Function** (внутри `api.ts`):
```typescript
"use server";  // директива SolidStart — код выполняется только на сервере
```

Каждая функция:
1. Принимает входные данные (с валидацией через Zod)
2. Проверяет аутентификацию (из кук/заголовков)
3. Работает с БД через Drizzle
4. Возвращает типизированный результат

### Шаг 2.3 — Индексы и миграции

- Создать индексы: `transactions(userId)`, `transactions(accountId)`, `transactions(date)`, `accounts(userId)`
- Сгенерировать первую миграцию: `npx drizzle-kit generate`
- Создать скрипт для сидирования двух пользователей (seed.ts)

---

## Этап 3: Слой Features — пользовательские сценарии

### Шаг 3.1 — Фича `features/auth/`

**Состав:**
- `ui/LoginForm.tsx` — форма входа (username + password)
- `ui/ProtectedRoute.tsx` — обёртка, редиректит на /login если нет токена
- `model/useAuth.ts` — SolidJS store для состояния авторизации
- `lib/tokenStorage.ts` — работа с access/refresh токенами (httpOnly cookies или localStorage)

**Логика токенов:**
1. При логине сервер возвращает `accessToken` (живёт ~15 мин) и `refreshToken` (живёт ~7 дней)
2. `accessToken` хранится в памяти (SolidJS store)
3. `refreshToken` хранится в httpOnly cookie (безопаснее) и в БД
4. При 401 ответе — автоматический запрос на `/api/auth/refresh`, если рефреш-токен валиден → новый accessToken
5. Если рефреш-токен протух → редирект на `/login`

### Шаг 3.2 — Фича `features/transactions/`

**Состав:**
- `ui/TransactionForm.tsx` — форма создания/редактирования
- `ui/TransactionList.tsx` — список с пагинацией
- `ui/TransactionFilters.tsx` — фильтры (дата, категория, счёт, тип)
- `model/useTransactions.ts` — хук для CRUD операций

### Шаг 3.3 — Фича `features/accounts/`

**Состав:**
- `ui/AccountForm.tsx` — форма создания/редактирования счёта
- `ui/AccountCard.tsx` — карточка счёта с балансом и цветом
- `ui/AccountList.tsx` — список счетов
- `model/useAccounts.ts` — хук для CRUD

### Шаг 3.4 — Фича `features/categories/`

Аналогично — управление категориями доходов/расходов.

---

## Этап 4: Слой Widgets — композиционные блоки

### Шаг 4.1 — `widgets/Dashboard/`

- `BalanceOverview.tsx` — сводка по всем счетам (сумма балансов)
- `RecentTransactions.tsx` — последние N транзакций
- `IncomeExpenseChart.tsx` — график доходов/расходов (опционально, можно позже)

### Шаг 4.2 — `widgets/TransactionTable/`

- Таблица с сортировкой, фильтрацией, пагинацией
- Композиция из `features/transactions/ui/*` + `entities/transaction/api`

---

## Этап 5: Слой Pages — маршруты

### Шаг 5.1 — Структура роутов SolidStart

SolidStart использует файловую маршрутизацию из `src/routes/`. При FSD страницы лежат в `src/pages/`, а в `routes/` — реэкспорты.

```
src/routes/
  index.tsx           → реэкспорт из pages/DashboardPage
  login.tsx           → реэкспорт из pages/LoginPage
  transactions.tsx    → реэкспорт из pages/TransactionsPage
  accounts.tsx        → реэкспорт из pages/AccountsPage
  categories.tsx      → реэкспорт из pages/CategoriesPage
  recipients.tsx      → реэкспорт из pages/RecipientsPage
```

### Шаг 5.2 — `pages/LoginPage/`

- Если пользователь уже авторизован → редирект на `/`
- Иначе → рендер `features/auth/ui/LoginForm`

### Шаг 5.3 — `pages/DashboardPage/`

- `widgets/Dashboard/BalanceOverview`
- `widgets/Dashboard/RecentTransactions`

### Шаг 5.4 — `pages/TransactionsPage/`

- `widgets/TransactionTable/`
- Кнопка «Добавить» → модалка с `features/transactions/ui/TransactionForm`

### Шаг 5.5 — `pages/AccountsPage/`

- `features/accounts/ui/AccountList`
- Кнопка «Добавить счёт» → `features/accounts/ui/AccountForm`

---

## Этап 6: Слой App — провайдеры и лейаут

### Шаг 6.1 — `app/providers/`

- `AuthProvider` — оборачивает всё приложение, хранит состояние пользователя и токенов
- `QueryProvider` — если используется TanStack Query (опционально, для кеширования серверных данных)

### Шаг 6.2 — `app/layouts/`

- `BaseLayout.tsx` — шапка, боковое меню, контентная область
- Навигация: Dashboard, Транзакции, Счета, Категории

### Шаг 6.3 — `app/styles/`

- Глобальные стили, CSS-переменные, тема

---

## Этап 7: Серверная инфраструктура

### Шаг 7.1 — Middleware для аутентификации

В `src/server/middleware/auth.ts`:
- Извлечение JWT из заголовка `Authorization: Bearer <token>`
- Верификация токена
- Прокидывание `userId` в контекст запроса

### Шаг 7.2 — Утилиты JWT

В `src/server/utils/jwt.ts`:
- `generateAccessToken(userId)` — короткоживущий
- `generateRefreshToken(userId)` — долгоживущий, сохраняется в БД
- `verifyAccessToken(token)`
- `verifyRefreshToken(token)` — + проверка в БД

### Шаг 7.3 — Seed-скрипт

`src/server/db/seed.ts`:
- Создать двух пользователей (ты + жена) с bcrypt-хешированными паролями
- Создать базовые категории (Продукты, Транспорт, Зарплата, …)
- Создать пару счетов для каждого
- Запуск: `npx tsx src/server/db/seed.ts`

---

## Итоговая файловая структура

```
src/
  app/
    app.tsx                  # Уже есть, доработать
    index.tsx                # Уже есть, доработать
    providers/
      AuthProvider.tsx
    layouts/
      BaseLayout.tsx
    styles/
      global.scss
      variables.scss

  pages/
    DashboardPage/
      index.tsx
    LoginPage/
      index.tsx
    TransactionsPage/
      index.tsx
    AccountsPage/
      index.tsx
    CategoriesPage/
      index.tsx
    RecipientsPage/
      index.tsx

  widgets/
    Dashboard/
      BalanceOverview.tsx
      RecentTransactions.tsx
    TransactionTable/
      index.tsx

  features/
    auth/
      ui/
        LoginForm.tsx
        ProtectedRoute.tsx
      model/
        useAuth.ts
      lib/
        tokenStorage.ts
    transactions/
      ui/
        TransactionForm.tsx
        TransactionList.tsx
        TransactionFilters.tsx
      model/
        useTransactions.ts
    accounts/
      ui/
        AccountForm.tsx
        AccountCard.tsx
        AccountList.tsx
      model/
        useAccounts.ts
    categories/
      ui/
        CategoryForm.tsx
        CategoryList.tsx
      model/
        useCategories.ts

  entities/
    user/
      model.ts
      api.ts
    account/
      model.ts
      api.ts
    transaction/
      model.ts
      api.ts
    category/
      model.ts
      api.ts
    recipient/
      model.ts
      api.ts

  shared/
    config/
      constants.ts
    lib/
      formatDate.ts
      formatCurrency.ts
      httpClient.ts
    types/
      common.ts
    ui/
      Button/
      Input/
      Modal/
      Select/
      Icon/

  server/
    db/
      schema.ts
      index.ts          # Drizzle client
      seed.ts
      migrations/
    utils/
      jwt.ts
    middleware/
      auth.ts

  routes/
    index.tsx
    login.tsx
    transactions.tsx
    accounts.tsx
    categories.tsx
    recipients.tsx
    [...404].tsx          # Уже есть
    about.tsx             # Можно удалить
```

---

## Порядок реализации (рекомендуемый)

| Фаза | Шаги | Что на выходе |
|---|---|---|
| **1. Фундамент** | 1.1 → 1.2 → 1.3 | Структура папок FSD, зависимости, Drizzle готов |
| **2. Данные** | 2.1 → 2.3 | Схема БД, миграции, seed с пользователями |
| **3. Auth** | 3.1 + entity `user/api.ts` | Работающий вход с JWT |
| **4. Ядро** | 2.2 для всех entity → 3.2 + 3.3 + 3.4 | CRUD операций через Server Functions |
| **5. UI** | 4.1 + 4.2 → 5.1–5.5 → 6.1–6.3 | Полноценный интерфейс |

Фазы 1 и 2 можно частично делать параллельно с продумыванием структуры. Фаза 3 критична — всё остальное зависит от auth. Фазы 4 и 5 могут идти параллельно в рамках одной сущности (например: сделать entity `account` + feature `accounts` + page `AccountsPage` как вертикальный срез).

---

## Ключевые архитектурные решения

1. **Server Functions, а не REST-роуты** — SolidStart нативно поддерживает `"use server"`, что позволяет вызывать серверный код прямо из компонентов как async-функции. FSD-entity `api.ts` будет содержать эти server-функции.

2. **Баланс счёта — вычисляемое поле** — не храним в БД, считаем на лету: `SUM(transactions.amount) + account.initialBalance`. Это гарантирует консистентность.

3. **Транзакции с типом (income/expense)** — сумма всегда положительная, знак определяется типом. Альтернативно: сумма отрицательная для расхода — проще для суммирования. Выбрать один подход и придерживаться.

4. **Рефреш-токены в httpOnly cookie** — безопаснее localStorage. Access-токен в памяти JS.

5. **Категории и получатели — глобальные** — не привязаны к пользователю (семейный учёт). Если в будущем понадобится разделение — добавить `userId`.

6. **Валидация через Zod** — одни и те же схемы используются и на клиенте (формы) и на сервере (server functions).

---

## Что сознательно исключено

- Регистрация новых пользователей (создаются через seed)
- Ролевая модель (оба пользователя равноправны)
- Бюджетирование и цели
- Экспорт/импорт данных
- Мобильное приложение (PWA можно добавить позже)

---

## Верификация

1. **После Этапа 1**: `npx drizzle-kit generate` создаёт миграции без ошибок
2. **После Этапа 2**: `npx tsx src/server/db/seed.ts` наполняет БД тестовыми данными
3. **После Этапа 3**: ручной тест — логин с кредами из seed → получен токен → редирект на дашборд → при истечении access-токена автоматический рефреш
4. **После Этапа 4**: ручной тест — создание счёта, создание транзакции, проверка баланса
5. **После Этапа 5**: все страницы открываются, данные отображаются, формы работают
6. **После Этапа 6**: навигация работает, авторизация сохраняется при переходах между страницами
