# Account Type Details Design

## Problem

Счёт сейчас плоский: `accounts` хранит одинаковый набор полей для всех типов (`card | cash | other | savings`). Пользователь хочет:

1. у карты — необязательные реквизиты: номер (16 цифр, маска `0000 0000 0000 0000`) и срок действия (`MM/YY`, месяц `01–12`);
2. у **любого** счёта — необязательное поле «Кому принадлежит» (`owner`), чтобы различать «карта Сергея» и «карта жены».

У других типов (например, `cash`) скоро появятся свои поля. Нужен механизм «детали, зависящие от типа счёта», а не `if (type === 'card')` по всему коду и не набор nullable-колонок в `accounts` под каждый тип.

## Goal

- Расширяемая модель «детали типа»: один реестр в контрактах, один на сервере, один на клиенте. Новый тип или поле добавляются по короткому чек-листу (см. конец документа).
- Поля карты: номер и срок, хранятся открыто. В списке номер виден как `•••• •••• •••• 1234`, полностью — только в форме редактирования. Если срок истёк, он подсвечивается.
- Общее поле `owner` у всех счетов: видно в списке, отдаётся в MCP `list_accounts`.

## Non-goals (v1)

- CVV. Не храним и не вводим: проект будет открыт другим пользователям, им нужно спокойствие.
- Шифрование номера и раскрытие по биометрии (см. «Отложено»).
- Детали для `cash` / `savings` / `other`: механизм готов, полей пока нет.
- `owner` как ссылка на пользователя или контакт: это свободный текст.
- Копирование номера в буфер обмена, напоминания «карта истекает», банк и платёжная система (BIN-lookup).

## Сверка с кодом

| Утверждение | Что в коде |
|---|---|
| MCP `list_accounts` отдаёт `collection.items` целиком | Нет. `apps/mcp/src/register-tools.ts` проецирует `{ currency, id, name, type }`. Но сам `GET /api/accounts` под bearer-ключом (`ApiKeySessionResolver`) отдаёт полный `PersistedAccount`, поэтому границу держим на API |
| `entities/account/api/account.contract.ts` дублирует контракты | Дублирует, но живых потребителей нет: схемы только реэкспортируются из `entities/account/index.ts` и `entities/account/api/index.ts`. Клиент `features/accounts/api/account-client.ts` уже работает на `@i-finances/contracts`. Используются только типы `Account` / `PersistedAccount` из `entities/account/model/types.ts`, и они написаны вручную |
| `AccountRecord` выводится из Drizzle | В `account-repository.ts` это отдельный рукописный тип и маппер `mapAccount`. Новые поля добавляются в него вручную |
| Корректор валюты пишет поля счёта | `AccountCurrencyCorrectionRepository.apply` делает `.set({ ...input.accountValues })`, поэтому новые поля в `AccountUpdateValues` проходят без дополнительного кода |

## Decisions

| # | Вопрос | Решение | Почему |
|---|---|---|---|
| D1 | Где хранить детали типа | JSON-колонка `accounts.details` | См. «Модель данных» |
| D2 | Форма контракта | `z.discriminatedUnion('type', …)` для create, update и persisted | `type` и `details` валидируются вместе, TS сужает тип `details` по `type` |
| D3 | `owner` | Обычная колонка `accounts.owner text NOT NULL DEFAULT ''`, поле в `editableAccountFields` | Поле общее для всех типов, а `details` только для полей конкретного типа |
| D4 | Полный номер в API | В `GET /api/accounts` только `cardNumberLast4`. Полный номер — в новом `GET /api/accounts/:id`, его вызывает только форма редактирования | Список читают MCP и все экраны, а полный номер нужен ровно одному месту |
| D5 | Смена типа (card → cash) | Сервер сбрасывает `details` до значения нового типа. В форме заранее предупреждаем, отдельного серверного подтверждения нет | Реквизиты можно заново ввести с карты. Второй протокол `confirmation-required` рядом с валютным не нужен |
| D6 | Luhn | Строгий: и в форме, и на сервере | Настоящий номер карты всегда проходит Luhn. Ошибка почти всегда означает опечатку |
| D7 | Срок в прошлом | Сохранять можно. Подсвечиваем «истёк», если текущая дата позже последнего дня месяца `MM/20YY` | Старые карты бывают нужны. Карта действует до конца указанного месяца |

## Модель данных

### Сравнение вариантов для деталей типа

| Вариант | Плюсы | Минусы |
|---|---|---|
| Плоские nullable-колонки в `accounts` | Просто, SQL-типы | На каждый тип — колонки, которые у остальных всегда `NULL`. Инвариант «у cash нет номера» держится только кодом. Миграция на каждое поле |
| Отдельная таблица на тип | Строгие колонки | JOIN-ы в списке растут с числом типов. Смена типа — перенос между таблицами. Репозиторий на каждый тип |
| EAV (`account_attributes`) | Гибко | Нет типизации, неудобно читать. Абстракция без реальной потребности |
| **JSON `details` + discriminated union** | Одна колонка на все типы. Схема живёт в zod рядом с контрактом. Новое поле не требует миграции. Смена типа — замена одного значения | Нет SQL-валидации внутри JSON (компенсируется zod при записи и чтении), нельзя индексировать (не нужно) |

Выбор: **JSON `details`**. Правило «не добавлять абстракций без конкретной вариации» выполнено: вариация уже есть (у карты детали есть, у остальных пустые, `cash` заявлен следующим).

### Миграция (одна, этап 1)

| Колонка `accounts` | Drizzle | Notes |
|---|---|---|
| `owner` | `text('owner').notNull().default('')` | Существующие счета получают `''` (не задано) |
| `details` | `text('details', { mode: 'json' }).$type<StoredAccountDetails>().notNull().default({})` | Существующие строки получают `'{}'`. Для любого типа это валидно: поля карты необязательны |

Миграцию генерируем только через `pnpm --filter api db:generate`. Существующие `0000…0011` и `meta/_journal.json` не трогаем, до и после сверяем контрольные суммы. Обе колонки с default, старому коду не мешают, поэтому откат кода без отката БД безопасен. Откат БД — восстановление из бэкапа (`.backup` через контейнер `backup`).

Хранимая форма карты: `{ cardNumber?: string /* 16 цифр без пробелов */, expiry?: string /* MM/YY */ }`. `cardNumberLast4` вычисляется при чтении и не хранится, чтобы не было двух источников правды.

### Реестр типов: три стороны

```
packages/contracts              apps/api                               apps/web
account-details.ts              modules/account/details/               features/account-details/
  input/view/full схемы  ──►      account-details-handler.ts (iface) ◄─ HTTP ─► model/account-details-registry.ts
account.ts                        card-account-details-handler.ts              ui/card/card-details-form-section.tsx
  discriminated unions            empty-account-details-handler.ts             ui/card/card-details-summary.tsx
                                  account-details-handlers.ts                  shared/lib/card/* + shared/ui/card-*-field
                                  (Record<AccountType, Handler>)
```

Исчерпывающий охват обеспечивает компилятор: все реестры объявлены как `Record<AccountType, …>` (или через `satisfies`). Если добавить тип в `accountTypeSchema` и забыть про реестр, проект не соберётся.

#### Contracts

`packages/contracts/src/account-details.ts` (новый файл, экспорт через `src/index.ts`):

```ts
const cardNumberSchema = z.string()
	.transform((value) => value.replace(/\s/g, ''))
	.pipe(z.string()
		.regex(/^\d{16}$/, 'Номер карты — 16 цифр.')
		.refine(isLuhnValid, 'Проверьте номер карты: похоже на опечатку.'));
const cardExpirySchema = z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Срок действия в формате ММ/ГГ.');

// Ввод: полный снимок деталей типа, null = не задано.
export const cardAccountDetailsInputSchema = z.strictObject({
	cardNumber: cardNumberSchema.nullable(),
	expiry: cardExpirySchema.nullable()
});
// Список (GET /api/accounts): без полного номера.
export const cardAccountDetailsViewSchema = z.object({
	cardNumberLast4: z.string().regex(/^\d{4}$/).nullable(),
	expiry: z.string().nullable()
});
// Один счёт для формы (GET /api/accounts/:id): view + полный номер.
export const cardAccountDetailsFullSchema = cardAccountDetailsViewSchema.extend({
	cardNumber: z.string().nullable()
});
export const emptyAccountDetailsSchema = z.strictObject({});
```

`isLuhnValid` — чистая функция в контрактах (`card-number.ts`), её же переиспользует web.

`account.ts`:

```ts
const accountOwnerSchema = z.string().trim().max(60, 'Не длиннее 60 символов.');
const editableAccountFields = { /* как сейчас, без type */ owner: accountOwnerSchema };

export const createAccountInputSchema = z.discriminatedUnion('type', [
	z.object({ ...editableAccountFields, type: z.literal('card'), details: cardAccountDetailsInputSchema.optional() }),
	z.object({ ...editableAccountFields, type: z.literal('cash'), details: emptyAccountDetailsSchema.optional() }),
	// savings, other — так же
]);
// updateAccountInputSchema — тот же union, в каждой ветке ещё id, version, confirmCurrencyCorrection.
// persistedAccountSchema — union: owner: z.string(), details = view-схема типа.
// accountDetailsResultSchema (новая) — тот же union, details = full-схема типа.
```

- **`owner`** сделан полем по умолчанию: в create и update оно `.default('')`. Так клиент, который его ещё не шлёт (MCP), ничего не ломает.
- **`details` в update необязателен.** Отсутствует — детали не меняются (кроме смены `type`, D5). Прислан — заменяются целиком, как `name` и `color`.
- `z.strictObject` отклоняет лишние ключи, например `cardNumber` у `cash`.

#### API (`apps/api/src/modules/account/`)

- `details/account-details-handler.ts` — интерфейс (в своём файле): `toStored(input, current)`, `toView(stored)`, `toFull(stored)`.
- `details/card-account-details-handler.ts`: `toView` берёт `cardNumber.slice(-4)`, `toFull` добавляет `cardNumber`.
- `details/empty-account-details-handler.ts` — для `cash`, `savings`, `other`.
- `details/account-details-handlers.ts` — `Record<AccountType, AccountDetailsHandler>`.
- Хранимое значение JSON при чтении проходит `safeParse` stored-схемой типа. Если там мусор, отдаём пустые детали и пишем `console.warn` с id счёта, без значения.
- `account-repository.ts`: `owner` и `details` добавляются в `AccountRecord`, `AccountUpdateValues` и `mapAccount`. Новый метод не нужен: `findById(householdId, id)` уже есть.
- `account-service.ts`:
  - `toPersistedAccount` строит `details` через `handlers[type].toView`, `owner` копирует;
  - новый `get(userId, id)` → `rules.requireCurrent` → `toFull`;
  - `create`/`update` добавляют `owner` и `details: handler.toStored(input.details, current)` в `accountValues`. При `current.type !== input.type` в `toStored` передаётся `current = undefined`.
- **Корректор валюты**: `owner` и `details` входят в `AccountUpdateValues` и записываются в той же транзакции `AccountCurrencyCorrectionRepository.apply` через уже существующий `...input.accountValues`. Изменений в корректоре нет, только тест.
- **`version`**: правка `owner` и `details` идёт через `PUT /api/accounts/:id` и увеличивает `version`, как любая правка счёта. Чтение `GET /:id` версию не меняет, а форма отправляет `version`, полученную вместе с деталями.
- **Архивация**: `setArchivedAt` не трогает ни `details`, ни `owner`.

### Полный номер: где отдавать (D4)

| Вариант | Оценка |
|---|---|
| Полный номер в `GET /api/accounts` | Проще всего, но номер попадает во все ответы списка: MCP (bearer-ключ получает весь JSON, даже если инструмент проецирует поля), кеш `query('accounts')`, devtools на каждом экране |
| **`cardNumberLast4` в списке + `GET /api/accounts/:id` с полным номером** | Один новый роут на уже существующем `findById`. Полный номер появляется только при открытии формы редактирования. В MCP нет инструмента для `/:id` |

Выбран второй вариант. Bearer-ключ технически может вызвать `GET /:id`. Отдельный запрет не вводим: ключ принадлежит самому пользователю, а номер хранится открыто и угрозой здесь не считается. Цель — не рассылать номер туда, где он не нужен.

### Контроллер (`http/account-controller.ts`)

- Новый `get()` — `GET /api/accounts/:id`, регистрируется в `app.ts` рядом с остальными `/api/accounts`. Ответ `accountDetailsResultSchema`, `404` по `AccountNotFoundError` через существующий `domainFailure`, cross-household → `404`.
- `invalidInput` сейчас берёт `issue.path[0]`, и ошибка номера стала бы `fieldErrors.details`. Меняем на ключ из полного пути через точку и выносим функцию в контракты, чтобы клиент строил те же ключи:

  ```ts
  // packages/contracts/src/field-errors.ts
  export function collectFieldErrors(error: z.ZodError): Record<string, string>
  // key = issue.path.join('.'); пустой путь пропускается; первая ошибка по ключу выигрывает
  ```

  Для верхнеуровневых полей (`name`, `initialBalanceMinor`, …) ключи не меняются. Сообщения — свои строки на русском. Zod 4 не кладёт в issue введённое значение, пока не включён `reportInput`.

### MCP (`apps/mcp/src/register-tools.ts`)

В проекцию `list_accounts` добавляется `owner`, в `description` инструмента — упоминание о нём. Детали карты в MCP не отдаём, проекция остаётся явной.

## UI

### Новые общие части

| Слой | Файл | Содержание |
|---|---|---|
| `shared/lib/card/` | `card-number.ts` | `extractCardDigits`, `formatCardNumberInput` (группы по 4), `maskCardNumber(last4)` → `•••• •••• •••• 1234` |
| | `card-expiry.ts` | `formatCardExpiryInput` (`/` вставляется после 2 цифр; первая цифра `2–9` → `0X/`), `isCardExpired(expiry, today)` — истёк, если `today` позже последнего дня месяца `MM/20YY` |
| `shared/ui/` | `card-number-field/`, `card-expiry-field/` | Обёртки над `TextField` по образцу `PhoneField`: `onBeforeInput` отсекает нецифры и переполнение (paste и drop пропускаются), `onInput` нормализует и принудительно синхронизирует `input.value` и каретку |

Маски — чистые функции с unit-тестами в `apps/web/tests/`, паттерн тот же, что у `shared/lib/phone`.

Атрибуты полей: номер — `inputMode='numeric'`, `autocomplete='cc-number'`. Срок — `inputMode='numeric'`, `autocomplete='cc-exp'`. Оба `type='text'`. `cc-*` выбраны осознанно: браузер предложит подставить сохранённую карту, iOS Safari — отсканировать карту камерой. Такие поля не считаются паролями. Цена — Chrome может предложить «Сохранить карту», это выбор пользователя.

### Форма `AccountDialog`

- Поле **«Кому принадлежит»**: `TextField` с `optional`, `maxLength={60}`, placeholder «Например, Сергей», ошибка из `fieldErrors.owner`. Ставим под названием счёта.
- После radio-карточек типа рендерится `ACCOUNT_DETAILS_REGISTRY[accountType()]?.FormSection`. Если в реестре `null`, секции нет, и в `account-dialog.tsx` не появляется ни одного `if (type === 'card')`.
- Реестр: `features/account-details/model/account-details-registry.ts`, `Record<AccountTypeValue, AccountDetailsDescriptor | null>`. Дескриптор: `FormSection` (`initial`, `errors`, `disabled`, `onChange(input)`), `Summary` (`details`), `formatListHint(details)`. Компоненты в `shared/lib/account-type.ts` не кладём: `shared/lib` — чистые функции без UI.
- Режим edit: при открытии диалог загружает `GET /api/accounts/:id`. Пока идёт загрузка, поля `disabled`, у кнопки сохранения `loading`. Потом `CardNumberField` предзаполняется полным номером, `CardExpiryField` — сроком. Секция держит черновик, пока диалог открыт.
- `AccountDialogValue` получает `owner` и `details?: AccountDetailsInput`. `toAccountDialogValue` в `views/home/page.tsx` строится из ответа `GET /:id`, а не из элемента списка, и `version` берётся оттуда же.
- `fieldErrors` с префиксом `details.` уходят в секцию (`details.cardNumber` → проп `error` у `CardNumberField`).
- `AccountClient.create/update` сейчас делает `schema.parse(input)`, и невалидный ввод превращается в общее «Не удалось сохранить счет». Поэтому `AccountDialog` перед отправкой выполняет `safeParse` и `collectFieldErrors`, и ошибки маски и Luhn показываются у поля.
- При смене типа с карты, у которой есть реквизиты, под радиогруппой показываем «Реквизиты карты будут удалены при сохранении» (D5).

### Отображение

- **Сайдбар** (`css.accountItem` в `views/home/page.tsx`): под названием счёта — мета-строка `owner · formatListHint(details)`, например «Сергей · •••• 1234». Пустые части пропускаются. Для списка используем короткую форму `•••• 1234`, чтобы строка помещалась на мобильном.
- **Шапка счёта** (`css.accountHeader`, `previewKicker`): «Карта · Сергей». Под заголовком — `Summary` из реестра. `CardDetailsSummary` показывает «Номер `•••• •••• •••• 1234`» и «Срок `08/27`»; если `isCardExpired`, срок подсвечивается и рядом стоит метка «истёк».
- SCSS: mobile-first, только `mx.media-mn(...)`, логические свойства, без `!important`. Цифры — `font-variant-numeric: tabular-nums`. Новых интерактивных элементов, кроме полей формы, нет.

## Тесты

| Слой | Что проверяем |
|---|---|
| contracts (`packages/contracts/tests/account-details.test.ts`) | union: `cardNumber` у `cash` отклоняется. Номер с пробелами нормализуется. Luhn (опечатка → ошибка). Срок `00/27`, `13/27` → ошибка. `owner`: trim, 61 символ → ошибка, отсутствие → `''`. `collectFieldErrors` даёт `details.cardNumber` |
| `account-service.test.ts` (`:memory:` + migrate) | create карты с деталями и `owner`. Update без `details` не трогает детали. Смена card→cash сбрасывает детали. Конфликт `version`. Смена валюты сохраняет `owner` и `details` через корректор. Архив и restore сохраняют детали. `get` возвращает полный номер |
| `account-http.test.ts` | `GET /api/accounts`: в сериализованном JSON нет 16-значного номера, есть `cardNumberLast4` и `owner`. `GET /:id` отдаёт полный номер. Чужой household → 404 на `GET /:id` и `PUT`. `fieldErrors['details.cardNumber']` |
| MCP | `list_accounts` содержит `owner` и не содержит `details` |
| web (`apps/web/tests/`) | маски номера и срока, `maskCardNumber`, `isCardExpired` (последний день месяца ещё валиден, первый день следующего — истёк) |
| Визуально | форма и сайдбар на мобильном и десктопном вьюпорте в браузере. Без этой проверки вёрстку не считаем готовой |

## Этапы (каждый выкатывается независимо)

1. **Backend и контракты.** Миграция (`owner`, `details`). `owner` во всех слоях API и в MCP `list_accounts`. Union-контракты с картой (номер, срок), `collectFieldErrors`, handlers, `GET /api/accounts/:id`. В web: удалить мёртвый `entities/account/api/account.contract.ts`, типы `Account` / `PersistedAccount` вывести из контрактов, поле «Кому принадлежит» в диалоге и в сайдбаре.
2. **Клиент для деталей карты.** `ACCOUNT_DETAILS_REGISTRY`, `shared/lib/card/*`, `CardNumberField`, `CardExpiryField`, `CardDetailsFormSection` с загрузкой через `GET /:id`, `CardDetailsSummary`, маскированный номер в сайдбаре и шапке, подсветка истёкшего срока.

## Чек-лист: как добавить поля для `cash`

Пример: у наличных появляется `location` («сейф», «кошелёк»).

1. `packages/contracts/src/account-details.ts`: `cashAccountDetailsInputSchema`, `…ViewSchema`, `…FullSchema` (если в списке поле не скрывается, view и full совпадают).
2. `packages/contracts/src/account.ts`: в ветке `cash` всех union-ов заменить `emptyAccountDetailsSchema` на новые схемы.
3. `apps/api/src/modules/account/details/cash-account-details-handler.ts` и запись в `account-details-handlers.ts` (компилятор подскажет место).
4. `apps/web/src/features/account-details/ui/cash/` — `CashDetailsFormSection`, `CashDetailsSummary`, запись в `ACCOUNT_DETAILS_REGISTRY`.
5. Тесты: contracts (валидация), `account-service` (create, update, смена типа), web (если есть маска).

Миграция **не нужна**: поле живёт в `details`. Если же поле общее для всех типов (как `owner`), это колонка `accounts` и `editableAccountFields`, а не `details`.

## Отложено / не делаем (и почему)

CVV не храним совсем. Номер карты храним открытым текстом. Шифрование, WebAuthn-раскрытие, rate limit и журнал раскрытий не делаем: пользователь принял, что номер без CVV — приемлемый риск, а сложность (ключи, ротация, бэкапы) не окупается. Решение обратимо. Если позже понадобится скрывать номер, нужно: вынести `cardNumber` из `details` в отдельную таблицу `account_secrets` с AES-256-GCM-шифротекстом (ключ из env, AAD = `householdId:accountId:kind`). Одноразовой миграцией-скриптом зашифровать существующие номера и оставить в `details` только `cardNumberLast4`. Отдачу полного номера в `GET /api/accounts/:id` заменить на step-up-эндпоинт WebAuthn с `userVerification: 'required'`, а в форме вернуть семантику «пусто = не менять». Контракт списка (`cardNumberLast4`) при этом не меняется: решение D4 заложено ровно ради этого.

## Открытые вопросы

Нет. Все решения (CVV, хранение номера, Luhn, срок в прошлом, `owner`) приняты пользователем.

## Safety for production DB

Как и в предыдущих спеках: никаких экспериментов на `data/i-finances.sqlite`.

```bash
cp data/i-finances.sqlite data/i-finances.dev.sqlite
DATABASE_URL=./data/i-finances.dev.sqlite pnpm db:migrate
DATABASE_URL=./data/i-finances.dev.sqlite pnpm dev
```

Автотесты — на `:memory:`. Перед выкаткой этапа 1 — бэкап через контейнер `backup` и `PRAGMA integrity_check`, по текущей процедуре деплоя.
