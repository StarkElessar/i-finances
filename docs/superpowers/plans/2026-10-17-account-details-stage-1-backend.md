# Account Details — Stage 1: Backend, Contracts, Owner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить счетам общее поле `owner` и расширяемые «детали типа» (`details`, для `card` — номер и срок) на уровне БД, контрактов, API и MCP, плюс поле «Кому принадлежит» в существующей форме и сайдбаре.

**Architecture:** JSON-колонка `accounts.details` + `z.discriminatedUnion('type', …)` в контрактах; серверный реестр `Record<AccountType, AccountDetailsHandler>`; `owner` — обычная колонка. В списке `GET /api/accounts` отдаётся только `cardNumberLast4`, полный номер — в новом `GET /api/accounts/:id`.

**Tech Stack:** TypeScript strict, Zod 4, Hono, Drizzle + better-sqlite3, vitest, Solid.js.

**Spec:** `docs/superpowers/specs/2026-10-17-account-type-details-design.md`

## Global Constraints

- Один класс — один файл; kebab-case для всех файлов (включая новые).
- Существующие миграции `apps/api/drizzle/0000…0011_*.sql`, `meta/*` НЕ редактировать; новая миграция только через `pnpm --filter @i-finances/api db:generate`. До и после сверять `shasum` старых файлов миграций.
- Никаких экспериментов на `data/i-finances.sqlite`; тесты на `:memory:`.
- `packages/contracts` не зависит от Hono/Solid/Drizzle/Node-only.
- Drizzle-типы остаются в репозиториях/инфраструктуре; Hono `Context` — только в контроллерах.
- Стиль: табы, одинарные кавычки, `;`, Stroustrup (`else`/`catch` на новой строке), функции верхнего уровня — `function`-декларации, внутри — `const` стрелки, `no-explicit-any`, `no-negated-condition`.
- Ключи `fieldErrors` для верхнеуровневых полей не меняются; для вложенных — через точку (`details.cardNumber`).
- CVV не храним и не вводим нигде. Полный номер карты — открытым текстом в `details`.
- `owner`: trim, ≤ 60 символов, по умолчанию `''`.
- Команды из корня репозитория: `pnpm --filter @i-finances/contracts test`, `pnpm --filter @i-finances/api test`, `pnpm typecheck`, `pnpm lint`.

## Deviations from spec (намеренные)

- Handlers принимают `(stored)` без `accountId`, поэтому `console.warn` с id счёта при мусоре в JSON не пишем: мусор молча трактуется как пустые детали (YAGNI, значение в лог не попадает в любом случае).
- `toStored(input: unknown, …)` повторно парсит вход своей схемой: так реестр не требует `any` и не зависит от корреляции типов union.

## File Structure

| Файл | Действие | Ответственность |
|---|---|---|
| `packages/contracts/src/card-number.ts` | Create | `isLuhnValid`, `extractCardDigits` |
| `packages/contracts/src/account-details.ts` | Create | zod-схемы деталей: input/view/full/stored |
| `packages/contracts/src/field-errors.ts` | Create | `collectFieldErrors(ZodError)` |
| `packages/contracts/src/account.ts` | Modify | `owner`, union по `type`, full-схема |
| `packages/contracts/src/index.ts` | Modify | экспорты |
| `packages/contracts/tests/account-details.test.ts` | Create | тесты контрактов |
| `apps/api/src/infrastructure/database/schema/accounts.ts` | Modify | колонки `owner`, `details` |
| `apps/api/src/infrastructure/database/schema/column-types.ts` | Modify | `StoredAccountDetails` |
| `apps/api/drizzle/0012_*.sql` | Generate | миграция |
| `apps/api/src/modules/account/details/account-details-handler.ts` | Create | интерфейс |
| `apps/api/src/modules/account/details/card-account-details-handler.ts` | Create | карта |
| `apps/api/src/modules/account/details/empty-account-details-handler.ts` | Create | cash/savings/other |
| `apps/api/src/modules/account/details/account-details-handlers.ts` | Create | `Record<AccountType, Handler>` |
| `apps/api/src/modules/account/account-repository.ts` | Modify | `owner`, `details` в типах и маппере |
| `apps/api/src/modules/account/account-service.ts` | Modify | маппинг, `get`, create/update |
| `apps/api/src/modules/account/index.ts` | Modify | экспорты |
| `apps/api/src/http/account-controller.ts` | Modify | `get()`, `collectFieldErrors` |
| `apps/api/src/app.ts` | Modify | роут `GET /api/accounts/:id` |
| `apps/api/tests/account-service.test.ts`, `account-http.test.ts` | Modify | тесты |
| `apps/mcp/src/account-summary.ts` (+ `tests/account-summary.test.ts`) | Create | проекция для `list_accounts` |
| `apps/mcp/src/register-tools.ts` | Modify | использовать проекцию, `owner` |
| `apps/web/src/entities/account/…` | Modify/Delete | типы из контрактов, удалить мёртвый контракт |
| `apps/web/src/views/home/ui/account-dialog/account-dialog.tsx` (+scss) | Modify | поле owner |
| `apps/web/src/views/home/page.tsx` | Modify | owner в payload и сайдбаре |
| `apps/web/tests/account-client.test.ts` | Modify | фикстуры с `owner`/`details` |

---

### Task 1: Luhn и разбор цифр карты в контрактах

**Files:**
- Create: `packages/contracts/src/card-number.ts`
- Create: `packages/contracts/tests/account-details.test.ts`

**Interfaces:**
- Produces: `isLuhnValid(digits: string): boolean`, `extractCardDigits(value: string): string`

- [ ] **Step 1: Write the failing test**

```ts
// packages/contracts/tests/account-details.test.ts
import { describe, expect, it } from 'vitest';

import { extractCardDigits, isLuhnValid } from '../src/card-number';

describe('card number helpers', () => {
	it('accepts a Luhn-valid number', () => {
		expect(isLuhnValid('4276380012345678')).toBe(false);
		expect(isLuhnValid('4111111111111111')).toBe(true);
	});

	it('rejects non-digit and empty input', () => {
		expect(isLuhnValid('')).toBe(false);
		expect(isLuhnValid('4111 1111 1111 1111')).toBe(false);
	});

	it('extracts only digits', () => {
		expect(extractCardDigits('4111 1111-1111 1111')).toBe('4111111111111111');
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @i-finances/contracts test -- account-details`
Expected: FAIL — cannot find module `../src/card-number`

- [ ] **Step 3: Implement**

```ts
// packages/contracts/src/card-number.ts
/**
 * Keeps only decimal digits from a card number string.
 */
export function extractCardDigits(value: string): string {
	return value.replace(/\D/g, '');
}

/**
 * Luhn checksum over a string of digits (no spaces).
 */
export function isLuhnValid(digits: string): boolean {
	if (!/^\d+$/.test(digits)) {
		return false;
	}

	let sum = 0;
	let shouldDouble = false;

	for (let index = digits.length - 1; index >= 0; index -= 1) {
		let digit = Number(digits[index]);

		if (shouldDouble) {
			digit *= 2;

			if (digit > 9) {
				digit -= 9;
			}
		}

		sum += digit;
		shouldDouble = !shouldDouble;
	}

	return sum % 10 === 0;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @i-finances/contracts test -- account-details`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/card-number.ts packages/contracts/tests/account-details.test.ts
git commit -m "feat(contracts): add Luhn and card digit helpers"
```

---

### Task 2: `collectFieldErrors`

**Files:**
- Create: `packages/contracts/src/field-errors.ts`
- Modify: `packages/contracts/tests/account-details.test.ts`

**Interfaces:**
- Produces: `collectFieldErrors(error: z.ZodError): Record<string, string>` — ключ `issue.path.join('.')`, пустой путь пропускается, первая ошибка по ключу выигрывает.

- [ ] **Step 1: Write the failing test** (добавить в тот же файл)

```ts
import { z } from 'zod';

import { collectFieldErrors } from '../src/field-errors';

describe('collectFieldErrors', () => {
	it('uses dotted paths and keeps the first message per key', () => {
		const schema = z.object({
			details: z.object({ cardNumber: z.string().min(16, 'short').regex(/^\d+$/, 'digits') }),
			name: z.string().min(1, 'name')
		});
		const result = schema.safeParse({ details: { cardNumber: 'ab' }, name: '' });

		expect(result.success).toBe(false);
		expect(collectFieldErrors(result.error!)).toEqual({
			'details.cardNumber': 'short',
			name: 'name'
		});
	});

	it('skips issues without a path', () => {
		const result = z.string().min(3, 'x').safeParse('a');

		expect(collectFieldErrors(result.error!)).toEqual({});
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @i-finances/contracts test -- account-details`
Expected: FAIL — cannot find module `../src/field-errors`

- [ ] **Step 3: Implement**

```ts
// packages/contracts/src/field-errors.ts
import type { z } from 'zod';

/**
 * Flattens Zod issues into `{ 'path.to.field': message }`.
 * The first issue per key wins; issues without a path are skipped.
 */
export function collectFieldErrors(error: z.ZodError): Record<string, string> {
	const fieldErrors: Record<string, string> = {};

	error.issues.forEach((issue) => {
		if (issue.path.length === 0) {
			return;
		}

		const key = issue.path.join('.');

		if (!(key in fieldErrors)) {
			fieldErrors[key] = issue.message;
		}
	});

	return fieldErrors;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @i-finances/contracts test -- account-details`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/field-errors.ts packages/contracts/tests/account-details.test.ts
git commit -m "feat(contracts): add collectFieldErrors with dotted paths"
```

---

### Task 3: Схемы деталей типа

**Files:**
- Create: `packages/contracts/src/account-details.ts`
- Modify: `packages/contracts/tests/account-details.test.ts`

**Interfaces:**
- Consumes: `isLuhnValid` (Task 1)
- Produces: `cardAccountDetailsInputSchema`, `cardAccountDetailsViewSchema`, `cardAccountDetailsFullSchema`, `storedCardAccountDetailsSchema`, `emptyAccountDetailsSchema`, `isCardExpiryFormat`-free regex в схеме; типы `CardAccountDetailsInput`, `CardAccountDetailsView`, `CardAccountDetailsFull`

- [ ] **Step 1: Write the failing test** (добавить)

```ts
import {
	cardAccountDetailsInputSchema,
	emptyAccountDetailsSchema,
	storedCardAccountDetailsSchema
} from '../src/account-details';

describe('card details input', () => {
	it('normalises spaces and accepts a valid snapshot', () => {
		const result = cardAccountDetailsInputSchema.parse({
			cardNumber: '4111 1111 1111 1111',
			expiry: '08/27'
		});

		expect(result).toEqual({ cardNumber: '4111111111111111', expiry: '08/27' });
	});

	it('accepts nulls for both fields', () => {
		expect(cardAccountDetailsInputSchema.parse({ cardNumber: null, expiry: null }))
			.toEqual({ cardNumber: null, expiry: null });
	});

	it('rejects a Luhn typo and wrong length', () => {
		expect(cardAccountDetailsInputSchema.safeParse({ cardNumber: '4111111111111112', expiry: null }).success).toBe(false);
		expect(cardAccountDetailsInputSchema.safeParse({ cardNumber: '4111', expiry: null }).success).toBe(false);
	});

	it('rejects months outside 01–12', () => {
		expect(cardAccountDetailsInputSchema.safeParse({ cardNumber: null, expiry: '00/27' }).success).toBe(false);
		expect(cardAccountDetailsInputSchema.safeParse({ cardNumber: null, expiry: '13/27' }).success).toBe(false);
	});

	it('rejects unknown keys', () => {
		expect(cardAccountDetailsInputSchema.safeParse({ cardNumber: null, expiry: null, cvv: '123' }).success).toBe(false);
	});
});

describe('other detail schemas', () => {
	it('empty details reject extra keys', () => {
		expect(emptyAccountDetailsSchema.safeParse({ cardNumber: '4111111111111111' }).success).toBe(false);
		expect(emptyAccountDetailsSchema.safeParse({}).success).toBe(true);
	});

	it('stored card details tolerate absent fields', () => {
		expect(storedCardAccountDetailsSchema.parse({})).toEqual({});
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @i-finances/contracts test -- account-details`
Expected: FAIL — cannot find module `../src/account-details`

- [ ] **Step 3: Implement**

```ts
// packages/contracts/src/account-details.ts
import { z } from 'zod';

import { isLuhnValid } from './card-number';

const cardNumberSchema = z.string()
	.transform((value) => value.replace(/\s/g, ''))
	.pipe(
		z.string()
			.regex(/^\d{16}$/, 'Номер карты — 16 цифр.')
			.refine(isLuhnValid, 'Проверьте номер карты: похоже на опечатку.')
	);

const cardExpirySchema = z.string()
	.regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Срок действия в формате ММ/ГГ.');

/**
 * Input: a full snapshot of card details; `null` means "not set".
 */
export const cardAccountDetailsInputSchema = z.strictObject({
	cardNumber: cardNumberSchema.nullable(),
	expiry: cardExpirySchema.nullable()
});

export type CardAccountDetailsInput = z.infer<typeof cardAccountDetailsInputSchema>;

/**
 * List representation (`GET /api/accounts`): never contains the full number.
 */
export const cardAccountDetailsViewSchema = z.object({
	cardNumberLast4: z.string().regex(/^\d{4}$/).nullable(),
	expiry: z.string().nullable()
});

export type CardAccountDetailsView = z.infer<typeof cardAccountDetailsViewSchema>;

/**
 * Single-account representation (`GET /api/accounts/:id`) for the edit form.
 */
export const cardAccountDetailsFullSchema = cardAccountDetailsViewSchema.extend({
	cardNumber: z.string().nullable()
});

export type CardAccountDetailsFull = z.infer<typeof cardAccountDetailsFullSchema>;

/**
 * Shape persisted in `accounts.details` for cards (all fields optional).
 */
export const storedCardAccountDetailsSchema = z.object({
	cardNumber: z.string().regex(/^\d{16}$/).optional(),
	expiry: cardExpirySchema.optional()
});

export type StoredCardAccountDetails = z.infer<typeof storedCardAccountDetailsSchema>;

/**
 * Types without type-specific fields yet (cash, savings, other).
 */
export const emptyAccountDetailsSchema = z.strictObject({});

export type EmptyAccountDetails = z.infer<typeof emptyAccountDetailsSchema>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @i-finances/contracts test -- account-details`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/account-details.ts packages/contracts/tests/account-details.test.ts
git commit -m "feat(contracts): add account type detail schemas"
```

---

### Task 4: `owner` и union по типу в `account.ts`

**Files:**
- Modify: `packages/contracts/src/account.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/tests/account-details.test.ts`

**Interfaces:**
- Consumes: схемы Task 3
- Produces: `createAccountInputSchema`, `updateAccountInputSchema`, `persistedAccountSchema`, `persistedAccountFullSchema` (union по `type`); типы `CreateAccountInput`, `UpdateAccountInput`, `PersistedAccount`, `PersistedAccountFull`. `accountCollectionSchema` и `accountCommandResultSchema` остаются, продолжают ссылаться на `persistedAccountSchema`. Новое: `accountDetailsResultSchema` не нужен — `GET /:id` отдаёт `persistedAccountFullSchema` напрямую.

- [ ] **Step 1: Write the failing test** (добавить)

```ts
import {
	createAccountInputSchema,
	persistedAccountSchema,
	updateAccountInputSchema
} from '../src/account';

const baseFields = {
	color: '#3f77a8',
	currency: 'BYN',
	description: '',
	initialBalanceMinor: 0,
	isColorAccentEnabled: false,
	isIncludedInFamilyTotal: true,
	name: 'Основная'
} as const;

describe('account input contracts', () => {
	it('defaults owner to empty string and trims it', () => {
		expect(createAccountInputSchema.parse({ ...baseFields, type: 'card' }).owner).toBe('');
		expect(createAccountInputSchema.parse({ ...baseFields, owner: '  Сергей ', type: 'card' }).owner).toBe('Сергей');
	});

	it('rejects owner longer than 60 chars', () => {
		const result = createAccountInputSchema.safeParse({ ...baseFields, owner: 'я'.repeat(61), type: 'card' });

		expect(result.success).toBe(false);
	});

	it('rejects card details on a cash account', () => {
		const result = createAccountInputSchema.safeParse({
			...baseFields,
			details: { cardNumber: '4111111111111111', expiry: null },
			type: 'cash'
		});

		expect(result.success).toBe(false);
	});

	it('accepts details omitted on create', () => {
		expect(createAccountInputSchema.safeParse({ ...baseFields, type: 'card' }).success).toBe(true);
	});

	it('update requires id and version in every branch', () => {
		expect(updateAccountInputSchema.safeParse({ ...baseFields, type: 'cash' }).success).toBe(false);
		expect(updateAccountInputSchema.safeParse({ ...baseFields, id: 'a', type: 'cash', version: 1 }).success).toBe(true);
	});

	it('persisted card exposes only last4 in the view', () => {
		const persisted = persistedAccountSchema.parse({
			...baseFields,
			archivedAt: null,
			createdAt: '2026-10-17T00:00:00.000Z',
			details: { cardNumberLast4: '1111', expiry: '08/27' },
			id: 'a',
			owner: 'Сергей',
			type: 'card',
			updatedAt: '2026-10-17T00:00:00.000Z',
			version: 1
		});

		expect(persisted.details).toEqual({ cardNumberLast4: '1111', expiry: '08/27' });
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @i-finances/contracts test -- account-details`
Expected: FAIL (owner отсутствует / cash принимает details)

- [ ] **Step 3: Implement** — заменить в `packages/contracts/src/account.ts` блоки схем (верх файла и всё между `editableAccountFields` и `accountCollectionSchema`); `accountListInputSchema`, `changeAccountArchiveStateInputSchema`, `accountCollectionSchema`, error-коды и `accountCommandResultSchema` не менять.

```ts
import { z } from 'zod';

import {
	cardAccountDetailsFullSchema,
	cardAccountDetailsInputSchema,
	cardAccountDetailsViewSchema,
	emptyAccountDetailsSchema
} from './account-details';
import { currencyCodeSchema } from './category';

export const accountTypeSchema = z.enum(['card', 'cash', 'other', 'savings']);

export type AccountType = z.infer<typeof accountTypeSchema>;

// ... accountIdSchema, accountVersionSchema, safeIntegerSchema, accountNameSchema,
// accountDescriptionSchema — без изменений ...

const accountOwnerSchema = z.string()
	.trim()
	.max(60, 'Не длиннее 60 символов.')
	.default('');

const editableAccountFields = {
	color: z.string().regex(/^#[\da-f]{6}$/i, 'Укажите цвет в HEX-формате.'),
	currency: currencyCodeSchema,
	description: accountDescriptionSchema,
	initialBalanceMinor: safeIntegerSchema,
	isColorAccentEnabled: z.boolean(),
	isIncludedInFamilyTotal: z.boolean(),
	name: accountNameSchema,
	owner: accountOwnerSchema
};

const updateIdentityFields = {
	confirmCurrencyCorrection: z.boolean().default(false),
	id: accountIdSchema,
	version: accountVersionSchema
};

export const createAccountInputSchema = z.discriminatedUnion('type', [
	z.object({ ...editableAccountFields, details: cardAccountDetailsInputSchema.optional(), type: z.literal('card') }),
	z.object({ ...editableAccountFields, details: emptyAccountDetailsSchema.optional(), type: z.literal('cash') }),
	z.object({ ...editableAccountFields, details: emptyAccountDetailsSchema.optional(), type: z.literal('other') }),
	z.object({ ...editableAccountFields, details: emptyAccountDetailsSchema.optional(), type: z.literal('savings') })
]);

export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;

export const updateAccountInputSchema = z.discriminatedUnion('type', [
	z.object({ ...editableAccountFields, ...updateIdentityFields, details: cardAccountDetailsInputSchema.optional(), type: z.literal('card') }),
	z.object({ ...editableAccountFields, ...updateIdentityFields, details: emptyAccountDetailsSchema.optional(), type: z.literal('cash') }),
	z.object({ ...editableAccountFields, ...updateIdentityFields, details: emptyAccountDetailsSchema.optional(), type: z.literal('other') }),
	z.object({ ...editableAccountFields, ...updateIdentityFields, details: emptyAccountDetailsSchema.optional(), type: z.literal('savings') })
]);

export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;

const accountDateSchema = z.string().min(1);

const persistedAccountFields = {
	archivedAt: accountDateSchema.nullable(),
	color: z.string(),
	createdAt: accountDateSchema,
	currency: currencyCodeSchema,
	description: z.string(),
	id: z.string().min(1),
	initialBalanceMinor: safeIntegerSchema,
	isColorAccentEnabled: z.boolean(),
	isIncludedInFamilyTotal: z.boolean(),
	name: z.string().min(1),
	owner: z.string(),
	updatedAt: accountDateSchema,
	version: accountVersionSchema
};

export const persistedAccountSchema = z.discriminatedUnion('type', [
	z.object({ ...persistedAccountFields, details: cardAccountDetailsViewSchema, type: z.literal('card') }),
	z.object({ ...persistedAccountFields, details: emptyAccountDetailsSchema, type: z.literal('cash') }),
	z.object({ ...persistedAccountFields, details: emptyAccountDetailsSchema, type: z.literal('other') }),
	z.object({ ...persistedAccountFields, details: emptyAccountDetailsSchema, type: z.literal('savings') })
]);

export type PersistedAccount = z.infer<typeof persistedAccountSchema>;

/**
 * One account with full details, for the edit form (`GET /api/accounts/:id`).
 */
export const persistedAccountFullSchema = z.discriminatedUnion('type', [
	z.object({ ...persistedAccountFields, details: cardAccountDetailsFullSchema, type: z.literal('card') }),
	z.object({ ...persistedAccountFields, details: emptyAccountDetailsSchema, type: z.literal('cash') }),
	z.object({ ...persistedAccountFields, details: emptyAccountDetailsSchema, type: z.literal('other') }),
	z.object({ ...persistedAccountFields, details: emptyAccountDetailsSchema, type: z.literal('savings') })
]);

export type PersistedAccountFull = z.infer<typeof persistedAccountFullSchema>;
```

`packages/contracts/src/index.ts` — добавить экспорты:

```ts
export {
	type CardAccountDetailsFull,
	cardAccountDetailsFullSchema,
	type CardAccountDetailsInput,
	cardAccountDetailsInputSchema,
	type CardAccountDetailsView,
	cardAccountDetailsViewSchema,
	type EmptyAccountDetails,
	emptyAccountDetailsSchema,
	type StoredCardAccountDetails,
	storedCardAccountDetailsSchema
} from './account-details';
export { type PersistedAccountFull, persistedAccountFullSchema } from './account'; // добавить к существующему блоку account
export { extractCardDigits, isLuhnValid } from './card-number';
export { collectFieldErrors } from './field-errors';
```

(импорты в `index.ts` отсортировать по правилу `simple-import-sort`: `pnpm lint:fix`.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @i-finances/contracts test && pnpm --filter @i-finances/contracts typecheck`
Expected: PASS. Typecheck контрактов зелёный; typecheck `api`/`web` сейчас упадёт — это ожидаемо, чинится в Task 5–12.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): owner and per-type details for accounts"
```

---

### Task 5: Схема БД и миграция

**Files:**
- Modify: `apps/api/src/infrastructure/database/schema/column-types.ts`
- Modify: `apps/api/src/infrastructure/database/schema/accounts.ts`
- Generate: `apps/api/drizzle/0012_*.sql`, `meta/0012_snapshot.json`, `meta/_journal.json` (только дописывается)

**Interfaces:**
- Produces: тип `StoredAccountDetails = Record<string, unknown>`; колонки `accounts.owner`, `accounts.details`

- [ ] **Step 1: Зафиксировать контрольные суммы старых миграций**

Run: `cd apps/api && shasum drizzle/*.sql drizzle/meta/*.json > /private/tmp/claude-501/-Users-stark-Documents-web-i-finances/744032fa-043a-4ea5-97c4-94fbbcdae7cb/scratchpad/migrations-before.sha`
Expected: файл создан

- [ ] **Step 2: Добавить тип** в `column-types.ts`

```ts
/**
 * Type-specific account fields stored as JSON; validated by the account details handlers.
 */
export type StoredAccountDetails = Record<string, unknown>;
```

- [ ] **Step 3: Добавить колонки** в `accounts.ts` (после `description`), импорт `StoredAccountDetails`

```ts
import type { AccountTypeValue, CurrencyCodeValue, StoredAccountDetails } from './column-types';
// ...
		owner: text('owner').notNull().default(''),
		details: text('details', { mode: 'json' })
			.$type<StoredAccountDetails>()
			.notNull()
			.default({}),
```

- [ ] **Step 4: Сгенерировать миграцию**

Run: `pnpm --filter @i-finances/api db:generate`
Expected: создан `drizzle/0012_*.sql` с `ALTER TABLE accounts ADD owner text DEFAULT '' NOT NULL;` и `ALTER TABLE accounts ADD details text DEFAULT '{}' NOT NULL;`. Если drizzle-kit спросил о переименовании — ответить «create», это новые колонки.

- [ ] **Step 5: Проверить, что старое не тронуто**

Run: `cd apps/api && shasum -c /private/tmp/claude-501/-Users-stark-Documents-web-i-finances/744032fa-043a-4ea5-97c4-94fbbcdae7cb/scratchpad/migrations-before.sha 2>&1 | grep -v ': OK' ; git diff --stat drizzle`
Expected: единственное изменение старых файлов — `meta/_journal.json` (дописан idx 12; контрольная сумма журнала изменится, остальное `OK`). Если изменился любой `.sql` или старый snapshot — откатить `git checkout` и разобраться.

- [ ] **Step 6: Проверить миграцию на чистой БД**

Run: `DATABASE_URL=:memory: pnpm --filter @i-finances/api db:migrate`
Expected: без ошибок

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/infrastructure apps/api/drizzle
git commit -m "feat(api): add accounts.owner and accounts.details columns"
```

---

### Task 6: Handlers деталей типа

**Files:**
- Create: `apps/api/src/modules/account/details/account-details-handler.ts`
- Create: `apps/api/src/modules/account/details/card-account-details-handler.ts`
- Create: `apps/api/src/modules/account/details/empty-account-details-handler.ts`
- Create: `apps/api/src/modules/account/details/account-details-handlers.ts`
- Test: `apps/api/tests/account-details-handlers.test.ts`

**Interfaces:**
- Consumes: `StoredAccountDetails` (Task 5), схемы контрактов (Task 3)
- Produces:

```ts
export interface AccountDetailsHandler {
	toStored(input: unknown, current: StoredAccountDetails | undefined): StoredAccountDetails;
	toView(stored: StoredAccountDetails): Record<string, unknown>;
	toFull(stored: StoredAccountDetails): Record<string, unknown>;
}
export const ACCOUNT_DETAILS_HANDLERS: Record<AccountType, AccountDetailsHandler>;
```

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/tests/account-details-handlers.test.ts
import { ACCOUNT_DETAILS_HANDLERS } from '@/modules/account/details/account-details-handlers';

import { describe, expect, it } from 'vitest';

const card = ACCOUNT_DETAILS_HANDLERS.card;
const cash = ACCOUNT_DETAILS_HANDLERS.cash;

describe('card details handler', () => {
	it('stores provided fields and drops nulls', () => {
		expect(card.toStored({ cardNumber: '4111111111111111', expiry: null }, undefined))
			.toEqual({ cardNumber: '4111111111111111' });
	});

	it('keeps current details when input is undefined', () => {
		expect(card.toStored(undefined, { cardNumber: '4111111111111111', expiry: '08/27' }))
			.toEqual({ cardNumber: '4111111111111111', expiry: '08/27' });
	});

	it('starts empty when neither input nor current exists', () => {
		expect(card.toStored(undefined, undefined)).toEqual({});
	});

	it('view exposes only last4, full exposes the number', () => {
		const stored = { cardNumber: '4111111111111111', expiry: '08/27' };

		expect(card.toView(stored)).toEqual({ cardNumberLast4: '1111', expiry: '08/27' });
		expect(card.toFull(stored)).toEqual({
			cardNumber: '4111111111111111',
			cardNumberLast4: '1111',
			expiry: '08/27'
		});
	});

	it('treats garbage in storage as empty details', () => {
		expect(card.toView({ cardNumber: 'oops' })).toEqual({ cardNumberLast4: null, expiry: null });
	});
});

describe('empty details handler', () => {
	it('always stores an empty object and renders empty', () => {
		expect(cash.toStored({ any: 1 }, { cardNumber: '4111111111111111' })).toEqual({});
		expect(cash.toView({ cardNumber: '4111111111111111' })).toEqual({});
		expect(cash.toFull({})).toEqual({});
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @i-finances/api test -- account-details-handlers`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
// account-details-handler.ts
import type { StoredAccountDetails } from '@/infrastructure/database/schema/column-types';

/**
 * Converts between API details and the JSON stored in `accounts.details`.
 */
export interface AccountDetailsHandler {
	toFull(stored: StoredAccountDetails): Record<string, unknown>;
	toStored(input: unknown, current: StoredAccountDetails | undefined): StoredAccountDetails;
	toView(stored: StoredAccountDetails): Record<string, unknown>;
}
```

```ts
// empty-account-details-handler.ts
import type { StoredAccountDetails } from '@/infrastructure/database/schema/column-types';

import type { AccountDetailsHandler } from './account-details-handler';

/**
 * Handler for account types that have no type-specific fields yet.
 */
export class EmptyAccountDetailsHandler implements AccountDetailsHandler {
	public toFull(): Record<string, unknown> {
		return {};
	}

	public toStored(): StoredAccountDetails {
		return {};
	}

	public toView(): Record<string, unknown> {
		return {};
	}
}
```

```ts
// card-account-details-handler.ts
import type { StoredAccountDetails } from '@/infrastructure/database/schema/column-types';

import {
	cardAccountDetailsInputSchema,
	type StoredCardAccountDetails,
	storedCardAccountDetailsSchema
} from '@i-finances/contracts';

import type { AccountDetailsHandler } from './account-details-handler';

function readStored(stored: StoredAccountDetails): StoredCardAccountDetails {
	const parsed = storedCardAccountDetailsSchema.safeParse(stored);

	return parsed.success ? parsed.data : {};
}

/**
 * Card details: optional 16-digit number and `MM/YY` expiry.
 */
export class CardAccountDetailsHandler implements AccountDetailsHandler {
	public toFull(stored: StoredAccountDetails): Record<string, unknown> {
		const card = readStored(stored);

		return {
			cardNumber: card.cardNumber ?? null,
			cardNumberLast4: card.cardNumber?.slice(-4) ?? null,
			expiry: card.expiry ?? null
		};
	}

	public toStored(input: unknown, current: StoredAccountDetails | undefined): StoredAccountDetails {
		if (input === undefined) {
			return current === undefined ? {} : readStored(current);
		}

		const details = cardAccountDetailsInputSchema.parse(input);
		const stored: StoredCardAccountDetails = {};

		if (details.cardNumber !== null) {
			stored.cardNumber = details.cardNumber;
		}

		if (details.expiry !== null) {
			stored.expiry = details.expiry;
		}

		return stored;
	}

	public toView(stored: StoredAccountDetails): Record<string, unknown> {
		const card = readStored(stored);

		return {
			cardNumberLast4: card.cardNumber?.slice(-4) ?? null,
			expiry: card.expiry ?? null
		};
	}
}
```

```ts
// account-details-handlers.ts
import type { AccountType } from '@i-finances/contracts';

import type { AccountDetailsHandler } from './account-details-handler';
import { CardAccountDetailsHandler } from './card-account-details-handler';
import { EmptyAccountDetailsHandler } from './empty-account-details-handler';

const emptyHandler = new EmptyAccountDetailsHandler();

/**
 * Exhaustive registry: adding a type to `accountTypeSchema` fails the build until it is listed here.
 */
export const ACCOUNT_DETAILS_HANDLERS: Record<AccountType, AccountDetailsHandler> = {
	card: new CardAccountDetailsHandler(),
	cash: emptyHandler,
	other: emptyHandler,
	savings: emptyHandler
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @i-finances/api test -- account-details-handlers`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/account/details apps/api/tests/account-details-handlers.test.ts
git commit -m "feat(api): add account details handlers and registry"
```

---

### Task 7: Репозиторий — `owner` и `details`

**Files:**
- Modify: `apps/api/src/modules/account/account-repository.ts`
- Modify: `apps/api/src/modules/account/index.ts`

**Interfaces:**
- Produces: `AccountRecord` и `AccountUpdateValues` получают `owner: string` и `details: StoredAccountDetails`; `mapAccount` их заполняет. `NewAccountRecord` наследует автоматически (`Omit<AccountRecord, 'version'>`).

- [ ] **Step 1: Изменить типы и маппер**

В `account-repository.ts`: импортировать `import type { StoredAccountDetails } from '@/infrastructure/database/schema/column-types';`. В `AccountRecord` добавить `details: StoredAccountDetails;` (между `description` и `householdId`) и `owner: string;` (между `name` и `type`). В `AccountUpdateValues` — те же два поля. В `mapAccount` добавить `details: record.details,` и `owner: record.owner,`. Остальные методы (`insert`, `update`, `setArchivedAt`) менять не нужно: `insert` пишет `values(record)`, `update` — `...values`, `setArchivedAt` details/owner не трогает.

- [ ] **Step 2: Проверка типов репозитория**

Run: `pnpm --filter @i-finances/api typecheck 2>&1 | grep account-repository`
Expected: ошибок в `account-repository.ts` нет (остальные файлы ещё красные — чинятся в Task 8).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/account/account-repository.ts
git commit -m "feat(api): carry owner and details through account repository"
```

---

### Task 8: Сервис — маппинг, create/update, `get`

**Files:**
- Modify: `apps/api/src/modules/account/account-service.ts`
- Modify: `apps/api/tests/account-service.test.ts`

**Interfaces:**
- Consumes: `ACCOUNT_DETAILS_HANDLERS` (Task 6), `AccountRecord` (Task 7), контракты (Task 4)
- Produces: `AccountService.get(userId: string, accountId: string): Promise<PersistedAccountFull>`; `toPersistedAccount` отдаёт `owner` и `details` (view).

- [ ] **Step 1: Write the failing tests** — добавить в `describe('AccountService', …)` файла `account-service.test.ts` (хелпер `accountInput` расширить: второй необязательный параметр `overrides` — `Record<string, unknown>` — и `createAccountInputSchema.parse({ …базовые поля, ...overrides })`, `type: 'card'` оставить по умолчанию):

```ts
const CARD = '4111111111111111';

it('stores owner and card details; list exposes only last4', async () => {
	const service = createService();
	const created = await service.create(USER_ID, accountInput('BYN', {
		details: { cardNumber: CARD, expiry: '08/27' },
		owner: 'Сергей'
	}));

	expect(created.owner).toBe('Сергей');
	expect(created.details).toEqual({ cardNumberLast4: '1111', expiry: '08/27' });
	expect(JSON.stringify(await service.list(USER_ID, false))).not.toContain(CARD);
});

it('get returns the full number', async () => {
	const service = createService();
	const created = await service.create(USER_ID, accountInput('BYN', {
		details: { cardNumber: CARD, expiry: null }
	}));
	const full = await service.get(USER_ID, created.id);

	expect(full.details).toMatchObject({ cardNumber: CARD, cardNumberLast4: '1111' });
});

it('update without details keeps them; with details replaces them', async () => {
	const service = createService();
	const created = await service.create(USER_ID, accountInput('BYN', {
		details: { cardNumber: CARD, expiry: '08/27' }
	}));
	const kept = await service.update(USER_ID, updateAccountInputSchema.parse({
		...accountInput(), id: created.id, name: 'Переименован', version: created.version
	}));

	expect(kept.details).toEqual({ cardNumberLast4: '1111', expiry: '08/27' });

	const replaced = await service.update(USER_ID, updateAccountInputSchema.parse({
		...accountInput(), details: { cardNumber: null, expiry: '01/30' }, id: created.id, version: kept.version
	}));

	expect(replaced.details).toEqual({ cardNumberLast4: null, expiry: '01/30' });
});

it('changing type from card to cash drops the details', async () => {
	const service = createService();
	const created = await service.create(USER_ID, accountInput('BYN', {
		details: { cardNumber: CARD, expiry: '08/27' }
	}));
	const changed = await service.update(USER_ID, updateAccountInputSchema.parse({
		...accountInput(), id: created.id, type: 'cash', version: created.version
	}));

	expect(changed.type).toBe('cash');
	expect(changed.details).toEqual({});
});

it('archive and restore keep owner and details', async () => {
	const service = createService();
	const created = await service.create(USER_ID, accountInput('BYN', {
		details: { cardNumber: CARD, expiry: '08/27' },
		owner: 'Жена'
	}));
	const archived = await service.archive(USER_ID, { id: created.id, version: created.version });
	const restored = await service.restore(USER_ID, { id: created.id, version: archived.version });

	expect(restored.owner).toBe('Жена');
	expect(restored.details).toEqual({ cardNumberLast4: '1111', expiry: '08/27' });
});

it('get does not leak across households', async () => {
	const service = createService();

	await database.insert(accounts).values({
		archivedAt: null, color: '#d95959', createdAt: FIXED_DATE, createdByUserId: USER_ID,
		currency: 'USD', description: '', householdId: OTHER_HOUSEHOLD_ID, id: 'account-other',
		initialBalanceMinor: 1, isColorAccentEnabled: false, isIncludedInFamilyTotal: true,
		name: 'Чужой', type: 'card', updatedAt: FIXED_DATE, version: 1
	});

	await expect(service.get(USER_ID, 'account-other')).rejects.toBeInstanceOf(AccountNotFoundError);
});
```

Импорты: `AccountNotFoundError` из `@/modules/account` (добавить в существующий блок). Тест смены валюты: в существующем тесте корректора (если есть проверка полей) добавить `owner: 'Сергей'` в create и `expect(corrected.owner).toBe('Сергей')` после корректировки — корректор пишет `...accountValues`, код менять не нужно.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @i-finances/api test -- account-service`
Expected: FAIL (нет `owner`/`get`; typecheck-ошибки)

- [ ] **Step 3: Implement** — изменения в `account-service.ts`:

Импорты: добавить `type PersistedAccountFull` из контрактов и `import { ACCOUNT_DETAILS_HANDLERS } from './details/account-details-handlers';`.

Заменить `toPersistedAccount` и добавить `toPersistedAccountFull`:

```ts
function toBasePersistedFields(record: AccountRecord) {
	return {
		archivedAt: record.archivedAt?.toISOString() ?? null,
		color: record.color,
		createdAt: record.createdAt.toISOString(),
		currency: record.currency,
		description: record.description,
		id: record.id,
		initialBalanceMinor: record.initialBalanceMinor,
		isColorAccentEnabled: record.isColorAccentEnabled,
		isIncludedInFamilyTotal: record.isIncludedInFamilyTotal,
		name: record.name,
		owner: record.owner,
		type: record.type,
		updatedAt: record.updatedAt.toISOString(),
		version: record.version
	};
}

// The handler registry is the single place that correlates `type` with the shape of `details`,
// so the union cannot be narrowed statically here.
function toPersistedAccount(record: AccountRecord): PersistedAccount {
	return {
		...toBasePersistedFields(record),
		details: ACCOUNT_DETAILS_HANDLERS[record.type].toView(record.details)
	} as PersistedAccount;
}

function toPersistedAccountFull(record: AccountRecord): PersistedAccountFull {
	return {
		...toBasePersistedFields(record),
		details: ACCOUNT_DETAILS_HANDLERS[record.type].toFull(record.details)
	} as PersistedAccountFull;
}

function toEditableValues(input: CreateAccountInput | UpdateAccountInput) {
	return {
		color: input.color,
		currency: input.currency,
		description: input.description,
		initialBalanceMinor: input.initialBalanceMinor,
		isColorAccentEnabled: input.isColorAccentEnabled,
		isIncludedInFamilyTotal: input.isIncludedInFamilyTotal,
		name: input.name,
		owner: input.owner,
		type: input.type
	};
}
```

Добавить метод:

```ts
public async get(userId: string, accountId: string): Promise<PersistedAccountFull> {
	const current = await this.rules.requireCurrent(userId, accountId);

	return toPersistedAccountFull(current.record);
}
```

`create`: вместо `...input` —

```ts
const record = await this.dependencies.accountRepository.insert({
	...toEditableValues(input),
	archivedAt: null,
	createdAt: timestamp,
	createdByUserId: userId,
	details: ACCOUNT_DETAILS_HANDLERS[input.type].toStored(input.details, undefined),
	householdId: household.id,
	id: this.createId(),
	updatedAt: timestamp,
	version: 1
});
```

`update`: заменить построение `accountValues` на

```ts
const sameType = current.record.type === input.type;
const accountValues = {
	...toEditableValues(input),
	details: ACCOUNT_DETAILS_HANDLERS[input.type].toStored(
		input.details,
		sameType ? current.record.details : undefined
	),
	updatedAt: this.now()
};
```

Остальная часть `update` (корректор валюты, `repository.update`) без изменений.

В `modules/account/index.ts` экспорты менять не нужно (handlers внутренние).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @i-finances/api test -- account-service`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/account apps/api/tests/account-service.test.ts
git commit -m "feat(api): account service handles owner, details and full get"
```

---

### Task 9: HTTP — `GET /api/accounts/:id` и вложенные `fieldErrors`

**Files:**
- Modify: `apps/api/src/http/account-controller.ts`
- Modify: `apps/api/src/app.ts:47-51`
- Modify: `apps/api/tests/account-http.test.ts`

**Interfaces:**
- Consumes: `AccountService.get` (Task 8), `collectFieldErrors` (Task 2), `persistedAccountFullSchema`
- Produces: `AccountHttpController.get()`; ответ 200 — `PersistedAccountFull`, ошибки — `AccountCommandResult`.

- [ ] **Step 1: Write the failing tests** — по образцу существующих тестов в `account-http.test.ts` (посмотреть, как они строят `createController`, `createApiApp`, запросы с `origin` и cookie/resolver) добавить:

```ts
it('list never serialises the full card number; GET /:id does', async () => {
	// create через POST с details { cardNumber: '4111111111111111', expiry: '08/27' }
	// затем GET /api/accounts
	expect(listBody).not.toContain('4111111111111111');
	expect(JSON.parse(listBody).items[0].details).toEqual({ cardNumberLast4: '1111', expiry: '08/27' });
	// GET /api/accounts/account-http
	expect(JSON.parse(detailBody).details.cardNumber).toBe('4111111111111111');
});

it('returns 404 for GET /:id of another household and for unknown ids', async () => {
	// запрос id 'missing' → status 404, errorCode 'not-found'
});

it('reports nested field errors with dotted keys', async () => {
	// POST с details.cardNumber '4111111111111112' (Luhn typo)
	// status 400, body.fieldErrors['details.cardNumber'] === 'Проверьте номер карты: похоже на опечатку.'
	// и body.fieldErrors не содержит 'details'
});

it('GET /:id requires a session', async () => {
	// noSessionResolver → 401
});
```

(Тело каждого теста писать по образцу соседних тестов этого файла: те же хелперы запросов и `Origin`-заголовок для мутаций.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @i-finances/api test -- account-http`
Expected: FAIL (route отсутствует, `details` в fieldErrors)

- [ ] **Step 3: Implement**

В `account-controller.ts` импортировать `collectFieldErrors` из `@i-finances/contracts`. Заменить тело `invalidInput`:

```ts
private invalidInput(context: Context<ApiEnvironment>, error: z.ZodError): Response {
	return context.json<AccountCommandResult>({
		errorCode: 'invalid-input',
		fieldErrors: collectFieldErrors(error),
		message: 'Проверьте поля счёта.',
		ok: false
	}, 400);
}
```

Добавить метод (рядом с `list`):

```ts
public get() {
	return async (context: Context<ApiEnvironment>): Promise<Response> => {
		const session = await this.requireSession(context);

		if (session === undefined) {
			return this.unauthenticated(context);
		}

		try {
			return context.json(
				await this.accountService.get(session.user.id, context.req.param('id')),
				200
			);
		}
		catch (error: unknown) {
			return this.domainFailure(context, error);
		}
	};
}
```

В `app.ts` после строки `app.get('/api/accounts', …)` добавить `app.get('/api/accounts/:id', accountController.get());`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @i-finances/api test -- account-http && pnpm --filter @i-finances/api typecheck`
Expected: PASS, typecheck `api` зелёный

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/http apps/api/src/app.ts apps/api/tests/account-http.test.ts
git commit -m "feat(api): GET /api/accounts/:id and dotted field errors"
```

---

### Task 10: Остальные тесты API и полный прогон

**Files:**
- Modify (по необходимости): `apps/api/tests/{transfer,operation,operation-breakdown,operation-stats,receipt-import}-service.test.ts`

- [ ] **Step 1:** Run: `pnpm --filter @i-finances/api test`
Expected: если какие-то тесты падают из-за отсутствия `owner`/`details` в прямых `insert(accounts)` — колонки имеют default, падений быть не должно. Если упали из-за типов `CreateAccountInput` — добавить недостающие поля в фикстуры минимально.

- [ ] **Step 2:** Run: `pnpm --filter @i-finances/api typecheck && pnpm lint`
Expected: PASS. Если `lint` ругается на порядок импортов — `pnpm lint:fix` и проверить diff.

- [ ] **Step 3: Commit** (только если были правки)

```bash
git add apps/api/tests
git commit -m "test(api): adapt account fixtures to owner and details"
```

---

### Task 11: MCP — `owner` в `list_accounts`

**Files:**
- Create: `apps/mcp/src/account-summary.ts`
- Create: `apps/mcp/tests/account-summary.test.ts`
- Modify: `apps/mcp/src/register-tools.ts:105-125`

**Interfaces:**
- Produces: `toAccountSummary(account: PersistedAccount): { currency; id; name; owner; type }` — `details` не попадает в проекцию.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mcp/tests/account-summary.test.ts
import type { PersistedAccount } from '@i-finances/contracts';
import { describe, expect, it } from 'vitest';

import { toAccountSummary } from '../src/account-summary';

describe('toAccountSummary', () => {
	it('exposes owner and never details', () => {
		const account = {
			archivedAt: null,
			color: '#3f77a8',
			createdAt: '2026-10-17T00:00:00.000Z',
			currency: 'BYN',
			description: '',
			details: { cardNumberLast4: '1111', expiry: '08/27' },
			id: 'a1',
			initialBalanceMinor: 0,
			isColorAccentEnabled: false,
			isIncludedInFamilyTotal: true,
			name: 'Основная карта',
			owner: 'Сергей',
			type: 'card',
			updatedAt: '2026-10-17T00:00:00.000Z',
			version: 1
		} satisfies PersistedAccount;

		expect(toAccountSummary(account)).toEqual({
			currency: 'BYN',
			id: 'a1',
			name: 'Основная карта',
			owner: 'Сергей',
			type: 'card'
		});
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @i-finances/mcp test -- account-summary`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
// apps/mcp/src/account-summary.ts
import type { PersistedAccount } from '@i-finances/contracts';

/**
 * Explicit MCP projection of an account: card details never leave the API through MCP.
 */
export function toAccountSummary(account: PersistedAccount) {
	return {
		currency: account.currency,
		id: account.id,
		name: account.name,
		owner: account.owner,
		type: account.type
	};
}
```

В `register-tools.ts`: заменить `.map((account) => ({ … }))` на `.map(toAccountSummary)`, добавить импорт `import { toAccountSummary } from './account-summary';` (в блок относительных импортов), в `description` инструмента дописать: `'Lists household accounts with their ids, names, owners, currencies and types. The owner (e.g. "Сергей", "Жена") helps to pick the right card. '`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @i-finances/mcp test && pnpm --filter @i-finances/mcp typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mcp
git commit -m "feat(mcp): expose account owner in list_accounts"
```

---

### Task 12: Web — типы из контрактов, удаление мёртвого контракта

**Files:**
- Modify: `apps/web/src/entities/account/model/types.ts`
- Delete: `apps/web/src/entities/account/api/account.contract.ts`
- Modify: `apps/web/src/entities/account/index.ts`, `apps/web/src/entities/account/api/index.ts`
- Modify: `apps/web/tests/account-client.test.ts`

**Interfaces:**
- Produces: `PersistedAccount` — реэкспорт из контрактов; `Account` — `DistributiveOmit<PersistedAccount, 'archivedAt' | 'createdAt' | 'updatedAt' | 'version'>`.

- [ ] **Step 1: Переписать `model/types.ts`**

```ts
import type { PersistedAccount as ContractPersistedAccount } from '@i-finances/contracts';

type DistributiveOmit<TValue, TKey extends PropertyKey> = TValue extends unknown ? Omit<TValue, TKey> : never;

/**
 * Canonical account DTO returned by the server (list representation).
 */
export type PersistedAccount = ContractPersistedAccount;

/**
 * Account without persistence metadata, used by presentational code.
 */
export type Account = DistributiveOmit<PersistedAccount, 'archivedAt' | 'createdAt' | 'updatedAt' | 'version'>;
```

- [ ] **Step 2:** Удалить `apps/web/src/entities/account/api/account.contract.ts`; из `entities/account/index.ts` и `entities/account/api/index.ts` убрать оба блока `export … from './api/account.contract'` / `'./account.contract'`; вместо них в `entities/account/index.ts` оставить только то, что реально используется. Перед удалением убедиться: `grep -rn "account.contract\|createAccountInputSchema\|updateAccountInputSchema\|changeAccountArchiveStateInputSchema" apps/web/src` — потребителей вне `entities/account` быть не должно (спека это подтверждает; если нашёлся — импортировать из `@i-finances/contracts`).

- [ ] **Step 3: Обновить фикстуру `account-client.test.ts`** — в объект `account` добавить `details: { cardNumberLast4: null, expiry: null }` и `owner: ''`; в вызов `client.create({…})` добавить `owner: ''`. Добавить тест на `AccountClient.get` будет в Stage 2 (метод клиента добавляется там).

- [ ] **Step 4:** Run: `pnpm --filter @i-finances/web typecheck 2>&1 | head -40`
Expected: ошибки только в `views/home/page.tsx` и `account-dialog.tsx` (нет `owner`/`details`) — чинится в Task 13.

- [ ] **Step 5: Commit** (после Task 13, вместе — чтобы не коммитить красный typecheck; если нужен промежуточный коммит, использовать `git commit --no-verify` нельзя: хуков в репо нет, но красный typecheck в истории нежелателен)

---

### Task 13: Web — поле «Кому принадлежит» в форме и сайдбаре

**Files:**
- Modify: `apps/web/src/views/home/ui/account-dialog/account-dialog.tsx`
- Modify: `apps/web/src/views/home/page.tsx` (`toAccountDialogValue` ~120, `submitAccount` ~552, сайдбар ~996)

**Interfaces:**
- Consumes: `PersistedAccount.owner`
- Produces: `AccountDialogValue.owner: string`

- [ ] **Step 1: `account-dialog.tsx`**

- В `AccountDialogValue` добавить `owner: string;`; в `createDefaultDialogValue` — `owner: ''`.
- Добавить сигнал `const [accountOwner, setAccountOwner] = createSignal('');`, в `createEffect` — `setAccountOwner(value.owner);`.
- Обработчик: `const handleOwnerInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => { setAccountOwner(event.currentTarget.value); };`
- В `handleSubmit` добавить `owner: accountOwner().trim(),` в `onSubmit({…})`.
- После `TextField` «Название счета» добавить:

```tsx
<TextField
	class={css.formFieldFull}
	error={props.fieldErrors?.owner}
	label='Кому принадлежит'
	maxLength={60}
	optional
	placeholder='Например, Сергей'
	value={accountOwner()}
	onInput={handleOwnerInput}
/>
```

- [ ] **Step 2: `views/home/page.tsx`**

- `toAccountDialogValue`: добавить `owner: account.owner,`.
- `submitAccount`: в `editableFields` добавить `owner: accountValue.owner,`. Поле `details` Stage 1 не шлёт (создание — детали пустые; update без `details` не трогает существующие).
- Типизация: `editableFields.type` — union литералов, а `CreateAccountInput` — discriminated union; прямая передача `{…editableFields}` в `runCreateAccount` не скомпилируется. Решение для Stage 1: перед отправкой прогнать через схему, она возвращает корректно типизированный union:

```ts
import { createAccountInputSchema, updateAccountInputSchema } from '@i-finances/contracts';
// ...
const parsedInput = currentAccount
	? updateAccountInputSchema.safeParse({ ...editableFields, confirmCurrencyCorrection, id: currentAccount.id, version: currentAccount.version })
	: createAccountInputSchema.safeParse(editableFields);

if (!parsedInput.success) {
	setAccountDialogFieldErrors(collectFieldErrors(parsedInput.error));
	setAccountDialogError('Проверьте поля счёта.');
	return;
}
```

и вызывать `runUpdateAccount(parsedInput.data)` / `runCreateAccount(parsedInput.data)` — две ветки с разными типами `parsedInput`: оформить как два раздельных `if (currentAccount) {…} else {…}` блока, каждый со своим `safeParse`, либо вынести в локальные функции `submitUpdate`/`submitCreate`.

- Сайдбар (`css.accountMeta`, ~строка 999): рядом с `{accountTypeMeta.label}` и описанием добавить владельца: заменить `<span>{item.description || 'Без группы'}</span>` на `<span>{item.owner || item.description || 'Без группы'}</span>`. (Описание остаётся запасным значением, чтобы не пустить регресс по текущему виду; в Stage 2 meta-строка станет `owner · •••• 1234`.)

- [ ] **Step 3: Проверка**

Run: `pnpm --filter @i-finances/web typecheck && pnpm --filter @i-finances/web test && pnpm lint`
Expected: PASS

- [ ] **Step 4: Визуальная проверка в браузере** (обязательна по правилам проекта). Запустить `pnpm dev` с копией БД (`DATABASE_URL=./data/i-finances.dev.sqlite`, см. раздел Safety спеки), открыть мобильный (390 px) и десктопный вьюпорт: создать счёт с владельцем «Сергей», убедиться, что поле на месте, сохраняется, виден в сайдбаре; редактирование открывает форму с тем же значением.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): account owner field, types derived from contracts"
```

---

### Task 14: Финальная проверка этапа

- [ ] **Step 1:** `pnpm typecheck && pnpm test && pnpm lint` — всё зелёное.
- [ ] **Step 2:** Сверить миграции: `cd apps/api && shasum -c …/migrations-before.sha 2>&1 | grep -v ': OK'` → только `meta/_journal.json`.
- [ ] **Step 3:** Прогнать миграцию на копии боевой БД: `cp data/i-finances.sqlite data/i-finances.dev.sqlite && DATABASE_URL=./data/i-finances.dev.sqlite pnpm db:migrate` и `sqlite3 data/i-finances.dev.sqlite "PRAGMA integrity_check; SELECT owner, details FROM accounts LIMIT 3;"` → `ok`, `|{}`.
- [ ] **Step 4:** Выкатка по процедуре из памяти «Деплой i-finances»: бэкап через контейнер `backup` + `PRAGMA integrity_check`, затем обычная выкатка. Откат кода без отката БД безопасен (колонки с default).
