# Statistics Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/stats` with two charts — category spend for a selected month (vs. budget or historical average) and monthly expense/income trend — backed by new read-only aggregation endpoints.

**Architecture:** New Drizzle aggregation queries in `OperationRepository` → two new `OperationService` methods → two new Hono controller handlers/routes, mirroring the existing `monthly-summary` vertical slice exactly. Frontend: new `@i-finances/contracts` schemas, a `category-stats`/`monthly-trend` pair of `query()`-wrapped fetchers in `entities/operation`, pure chart-data builders (unit-tested, DOM-free), and `solid-chartjs` (`Bar`/`Line`) components in a new `views/statistics` slice. No DB schema changes.

**Tech Stack:** Hono + Drizzle (better-sqlite3) on the API; SolidJS + `@solidjs/router` query/action + `solid-chartjs`/`chart.js` (new deps) on the web; Vitest on both sides.

**Spec:** `docs/superpowers/specs/2026-09-22-statistics-page-design.md`

## Global Constraints

- All money aggregation uses `operations.amountInHouseholdBaseCurrencyMinor` — never `amountMinor` (mixed currencies).
- Soft-deleted operations (`deletedAt IS NOT NULL`) are always excluded.
- No new DB tables/columns — reuse `categories.monthlyBudgetMinor` as-is.
- Significant-deviation threshold is `20` (`Math.abs(deltaPercent) >= 20`).
- Tabs indentation, single quotes, Stroustrup braces, `@typescript-eslint/consistent-type-imports`, import order styles → side-effects → `node:` → externals → `@/` aliases → relatives (lint-enforced, see `AGENTS.md`).
- SCSS: mobile-first base styles, `@use "@/shared/styles/mixins" as mx;`, `mx.media-mn(...)` only, camelCase CSS-module classnames, double quotes.
- Each task commits its own work at the end of its steps (per-task commits, as written into every task below) — the user selected Subagent-Driven Development execution, which commits per task by design.

---

## File map

| File | Responsibility |
|------|----------------|
| `packages/contracts/src/operation.ts` | New `CategoryStats`/`MonthlyTrend` response schemas + types |
| `packages/contracts/src/index.ts` | Re-export the new schemas/types |
| `apps/api/src/modules/operation/operation-repository.ts` | `listCategoryExpenseHistory`, `listMonthlyTotals` aggregation queries |
| `apps/api/src/modules/operation/index.ts` | Re-export new repository types |
| `apps/api/src/modules/operation/operation-service.ts` | `getCategoryStats`, `getMonthlyTrend` |
| `apps/api/src/http/operation-controller.ts` | `categoryStats()`, `monthlyTrend()` handlers |
| `apps/api/src/app.ts` | Register `GET /api/operations/category-stats`, `GET /api/operations/monthly-trend` |
| `apps/api/tests/operation-stats-service.test.ts` | New — repository/service/HTTP tests for both endpoints |
| `apps/web/package.json` | Add `solid-chartjs`, `chart.js` |
| `apps/web/src/entities/operation/model/types.ts` | FE-local `CategoryStatItem`/`CategoryStats`/`MonthlyTrendPoint`/`MonthlyTrend` types |
| `apps/web/src/entities/operation/api/operation.contract.ts` | `CategoryStatsResult`/`MonthlyTrendResult` aliases |
| `apps/web/src/entities/operation/api/operation.client.ts` | `getCategoryStats`, `getMonthlyTrend` queries |
| `apps/web/src/entities/operation/api/index.ts` | Re-export the two new queries + types |
| `apps/web/src/entities/operation/index.ts` | Re-export the two new model types |
| `apps/web/src/features/operations/api/operation-client.ts` | `OperationClient.categoryStats()`, `.monthlyTrend()` |
| `apps/web/tests/operation-client.test.ts` | Tests for the two new client methods |
| `apps/web/src/views/statistics/lib/build-category-chart-data.ts` | Pure: stats + categories → Chart.js bar data + delta list (budget-or-average per Q13) |
| `apps/web/src/views/statistics/lib/build-trend-chart-data.ts` | Pure: trend → Chart.js line data + month label formatting |
| `apps/web/tests/statistics-chart-data.test.ts` | Unit tests for both pure builders |
| `apps/web/src/views/statistics/ui/month-navigator/month-navigator.tsx` (+ `.module.scss`) | Prev/next month control, fixed `mode: 'month'` |
| `apps/web/src/views/statistics/ui/category-breakdown-chart/category-breakdown-chart.tsx` (+ `.module.scss`) | `Bar` chart + delta legend list |
| `apps/web/src/views/statistics/ui/monthly-trend-chart/monthly-trend-chart.tsx` (+ `.module.scss`) | `Line` chart |
| `apps/web/src/views/statistics/page.tsx` (+ `.module.scss`) | Assembles the page, fetches data, owns month state |
| `apps/web/src/app/router.tsx` | Register `/stats` → `StatisticsPage` |

---

### Task 1: Contracts — `CategoryStats` / `MonthlyTrend` schemas

**Files:**
- Modify: `packages/contracts/src/operation.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Produces: `categoryStatsSchema` (parses to `CategoryStats`), `monthlyTrendSchema` (parses to `MonthlyTrend`), both importable from `@i-finances/contracts`.
- Consumes: existing `currencyCodeSchema` (from `./category`), existing `getMonthlyExpenseSummaryInputSchema` (reused unchanged as the `category-stats` input — same `{ month }` shape).

- [ ] **Step 1: Add the schemas**

In `packages/contracts/src/operation.ts`, directly below `monthlyExpenseSummarySchema` (after the block ending `export type MonthlyExpenseSummary = z.infer<typeof monthlyExpenseSummarySchema>;`), add:

```ts
export const categoryStatItemSchema = z.object({
	averageMinor: safeIntegerSchema.nullable(),
	categoryId: operationIdSchema,
	currentMinor: safeIntegerSchema,
	deltaPercent: z.number().int().nullable(),
	monthsIncludedCount: z.number().int().nonnegative()
});

export type CategoryStatItem = z.infer<typeof categoryStatItemSchema>;

export const categoryStatsSchema = z.object({
	baseCurrency: currencyCodeSchema,
	items: z.array(categoryStatItemSchema),
	month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/)
});

export type CategoryStats = z.infer<typeof categoryStatsSchema>;

export const monthlyTrendPointSchema = z.object({
	expenseMinor: safeIntegerSchema,
	incomeMinor: safeIntegerSchema,
	month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/)
});

export type MonthlyTrendPoint = z.infer<typeof monthlyTrendPointSchema>;

export const monthlyTrendSchema = z.object({
	baseCurrency: currencyCodeSchema,
	points: z.array(monthlyTrendPointSchema)
});

export type MonthlyTrend = z.infer<typeof monthlyTrendSchema>;
```

- [ ] **Step 2: Re-export from the package index**

In `packages/contracts/src/index.ts`, inside the existing `export { ... } from './operation';` block (`index.ts:117-162`), add these entries in alphabetical position (matching the file's existing sort order):

```ts
	type CategoryStatItem,
	categoryStatItemSchema,
	type CategoryStats,
	categoryStatsSchema,
```
right after `categoryOperationsSchema,` (before `type ChangeOperationDeletionStateInput,`), and:
```ts
	type MonthlyTrend,
	monthlyTrendSchema,
	type MonthlyTrendPoint,
	monthlyTrendPointSchema,
```
right after `monthlyExpenseSummarySchema,` (before `type OperationCommandErrorCode,`).

- [ ] **Step 3: Typecheck the package**

Run: `pnpm --filter @i-finances/contracts typecheck`
Expected: PASS, no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/operation.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): add category-stats and monthly-trend schemas"
```

---

### Task 2: Repository — history & monthly-totals aggregation

**Files:**
- Modify: `apps/api/src/modules/operation/operation-repository.ts`
- Modify: `apps/api/src/modules/operation/index.ts`

**Interfaces:**
- Consumes: `operations` table columns (`householdId`, `type`, `categoryId`, `amountInHouseholdBaseCurrencyMinor`, `happenedOn`, `deletedAt`), existing `and`/`eq`/`isNull`/`isNotNull`/`lt`/`sql` imports already present at the top of the file.
- Produces: `OperationRepository.listCategoryExpenseHistory(householdId, beforeDate): Promise<CategoryExpenseHistoryTotal[]>` and `OperationRepository.listMonthlyTotals(householdId): Promise<MonthlyTotalRow[]>`, both exported as types from the module.

- [ ] **Step 1: Add the two record types**

In `apps/api/src/modules/operation/operation-repository.ts`, directly below the existing `export type ReferenceExpenseTotal = { referenceId: string; totalMinor: number; };` block (around line 88-91), add:

```ts
export type CategoryExpenseHistoryTotal = {
	categoryId: string;
	monthsIncludedCount: number;
	totalMinor: number;
};

export type MonthlyTotalRow = {
	expenseMinor: number;
	incomeMinor: number;
	month: string;
};
```

- [ ] **Step 2: Add the two repository methods**

Directly below the existing `listMonthlyContactExpenses` method (right after the closing brace of `private async listMonthlyReferenceExpenses(...)`, i.e. after line ~424 in the current file), add:

```ts
	public async listCategoryExpenseHistory(
		householdId: string,
		beforeDate: string
	): Promise<CategoryExpenseHistoryTotal[]> {
		return this.database.select({
			categoryId: operations.categoryId,
			monthsIncludedCount: sql<number>`
				count(distinct strftime('%Y-%m', ${operations.happenedOn}))
			`.mapWith(Number),
			totalMinor: sql<number>`sum(${operations.amountInHouseholdBaseCurrencyMinor})`.mapWith(Number)
		})
			.from(operations)
			.where(and(
				eq(operations.householdId, householdId),
				eq(operations.type, 'expense'),
				isNull(operations.deletedAt),
				isNotNull(operations.categoryId),
				lt(operations.happenedOn, beforeDate)
			))
			.groupBy(operations.categoryId) as unknown as CategoryExpenseHistoryTotal[];
	}

	public async listMonthlyTotals(householdId: string): Promise<MonthlyTotalRow[]> {
		const monthExpression = sql`strftime('%Y-%m', ${operations.happenedOn})`;

		return this.database.select({
			expenseMinor: sql<number>`
				coalesce(sum(case when ${operations.type} = 'expense' then ${operations.amountInHouseholdBaseCurrencyMinor} else 0 end), 0)
			`.mapWith(Number),
			incomeMinor: sql<number>`
				coalesce(sum(case when ${operations.type} = 'income' then ${operations.amountInHouseholdBaseCurrencyMinor} else 0 end), 0)
			`.mapWith(Number),
			month: sql<string>`${monthExpression}`
		})
			.from(operations)
			.where(and(
				eq(operations.householdId, householdId),
				isNull(operations.deletedAt)
			))
			.groupBy(monthExpression)
			.orderBy(monthExpression) as unknown as MonthlyTotalRow[];
	}
```

- [ ] **Step 3: Re-export the new types**

In `apps/api/src/modules/operation/index.ts`, inside the existing repository re-export block, change:

```ts
export {
	type NewOperationRecord,
	type OperationLedgerRow,
	type OperationRecord,
	OperationRepository,
	type OperationUpdateValues,
	type ReferenceExpenseTotal
} from './operation-repository';
```

to:

```ts
export {
	type CategoryExpenseHistoryTotal,
	type MonthlyTotalRow,
	type NewOperationRecord,
	type OperationLedgerRow,
	type OperationRecord,
	OperationRepository,
	type OperationUpdateValues,
	type ReferenceExpenseTotal
} from './operation-repository';
```

- [ ] **Step 4: Typecheck the API**

Run: `pnpm --filter @i-finances/api typecheck`
Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/operation/operation-repository.ts apps/api/src/modules/operation/index.ts
git commit -m "feat(api): add category-history and monthly-totals repository queries"
```

---

### Task 3: Service — `getCategoryStats` / `getMonthlyTrend` (TDD)

**Files:**
- Modify: `apps/api/src/modules/operation/operation-service.ts`
- Create: `apps/api/tests/operation-stats-service.test.ts`

**Interfaces:**
- Consumes: `OperationRepository.listMonthlyCategoryExpenses` (existing), `.listCategoryExpenseHistory`, `.listMonthlyTotals` (Task 2); `HouseholdResolver.requireForUser` (existing); private `getMonthRange` helper (existing, same file).
- Produces: `OperationService.getCategoryStats(userId: string, input: GetMonthlyExpenseSummaryInput): Promise<CategoryStats>`, `OperationService.getMonthlyTrend(userId: string): Promise<MonthlyTrend>`.

- [ ] **Step 1: Write the failing test file**

Create `apps/api/tests/operation-stats-service.test.ts`. It mirrors the fixture setup in `apps/api/tests/operation-service.test.ts:1-90` exactly (same imports, same `beforeEach`/`afterEach`, same `createService()` helper) but adds a second category and operations across three months so the history/average math is verifiable:

```ts
import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import {
	accounts,
	categories,
	householdMembers,
	households,
	users
} from '@/infrastructure/database/schema';
import { AccountRepository } from '@/modules/account';
import { CategoryRepository } from '@/modules/category';
import { ContactRepository } from '@/modules/contact';
import { ExchangeRateRepository, ExchangeRateService } from '@/modules/exchange-rate';
import { HouseholdRepository, HouseholdResolver } from '@/modules/household';
import { OperationRepository, OperationService } from '@/modules/operation';

import { createOperationInputSchema } from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const USER_ID = 'user-1';
const HOUSEHOLD_ID = 'household-1';
const FIXED_DATE = new Date('2026-09-08T10:00:00.000Z');

let connection: Database.Database;
let database: AppDatabase;

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });

	await database.insert(users).values({
		createdAt: FIXED_DATE,
		displayName: 'Sergei Test',
		id: USER_ID,
		isActive: true,
		passwordHash: 'hash',
		updatedAt: FIXED_DATE,
		username: 'sergei'
	});
	await database.insert(households).values({
		baseCurrency: 'BYN',
		createdAt: FIXED_DATE,
		id: HOUSEHOLD_ID,
		name: 'Семья',
		updatedAt: FIXED_DATE
	});
	await database.insert(householdMembers).values({
		householdId: HOUSEHOLD_ID,
		joinedAt: FIXED_DATE,
		role: 'owner',
		userId: USER_ID
	});
	await database.insert(accounts).values({
		archivedAt: null,
		color: '#3f77a8',
		createdAt: FIXED_DATE,
		createdByUserId: USER_ID,
		currency: 'BYN',
		description: '',
		householdId: HOUSEHOLD_ID,
		id: 'account-main',
		initialBalanceMinor: 0,
		isColorAccentEnabled: false,
		isIncludedInFamilyTotal: true,
		name: 'Основной счёт',
		type: 'card',
		updatedAt: FIXED_DATE,
		version: 1
	});
	await database.insert(categories).values({
		archivedAt: null,
		color: '#68a063',
		createdAt: FIXED_DATE,
		createdByUserId: USER_ID,
		description: '',
		householdId: HOUSEHOLD_ID,
		id: 'category-food',
		monthlyBudgetMinor: null,
		name: 'Продукты',
		normalizedName: 'продукты',
		updatedAt: FIXED_DATE,
		version: 1
	});
});

afterEach(() => {
	connection.close();
});

function createService(): OperationService {
	let operationSequence = 0;
	const householdResolver = new HouseholdResolver(new HouseholdRepository(database), () => FIXED_DATE);
	const exchangeRateService = new ExchangeRateService(new ExchangeRateRepository(database));

	return new OperationService({
		accountRepository: new AccountRepository(database),
		categoryRepository: new CategoryRepository(database),
		contactRepository: new ContactRepository(database),
		createId: () => `operation-${++operationSequence}`,
		exchangeRateResolver: exchangeRateService,
		householdResolver,
		now: () => FIXED_DATE,
		operationRepository: new OperationRepository(database)
	});
}

describe('OperationService category stats', () => {
	it('averages history before the selected month and flags the delta', async () => {
		const service = createService();

		await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 10_000,
			categoryId: 'category-food',
			comment: '',
			contactId: null,
			happenedOn: '2026-07-05',
			title: 'Июль',
			type: 'expense'
		}));
		await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 20_000,
			categoryId: 'category-food',
			comment: '',
			contactId: null,
			happenedOn: '2026-08-05',
			title: 'Август',
			type: 'expense'
		}));
		await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 45_000,
			categoryId: 'category-food',
			comment: '',
			contactId: null,
			happenedOn: '2026-09-05',
			title: 'Сентябрь',
			type: 'expense'
		}));

		const stats = await service.getCategoryStats(USER_ID, { month: '2026-09' });

		expect(stats).toMatchObject({
			baseCurrency: 'BYN',
			month: '2026-09'
		});
		expect(stats.items).toEqual([{
			averageMinor: 15_000,
			categoryId: 'category-food',
			currentMinor: 45_000,
			deltaPercent: 200,
			monthsIncludedCount: 2
		}]);
	});

	it('returns null average and delta for a category with no history before the month', async () => {
		const service = createService();

		await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 5_000,
			categoryId: 'category-food',
			comment: '',
			contactId: null,
			happenedOn: '2026-09-05',
			title: 'Первая трата',
			type: 'expense'
		}));

		const stats = await service.getCategoryStats(USER_ID, { month: '2026-09' });

		expect(stats.items).toEqual([{
			averageMinor: null,
			categoryId: 'category-food',
			currentMinor: 5_000,
			deltaPercent: null,
			monthsIncludedCount: 0
		}]);
	});
});

describe('OperationService monthly trend', () => {
	it('aggregates expense and income per month across the full history', async () => {
		const service = createService();

		await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 10_000,
			categoryId: 'category-food',
			comment: '',
			contactId: null,
			happenedOn: '2026-08-05',
			title: 'Расход',
			type: 'expense'
		}));
		await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 200_000,
			categoryId: null,
			comment: '',
			contactId: null,
			happenedOn: '2026-08-10',
			title: 'Зарплата',
			type: 'income'
		}));
		await service.create(USER_ID, createOperationInputSchema.parse({
			accountId: 'account-main',
			amountMinor: 15_000,
			categoryId: 'category-food',
			comment: '',
			contactId: null,
			happenedOn: '2026-09-05',
			title: 'Расход',
			type: 'expense'
		}));

		const trend = await service.getMonthlyTrend(USER_ID);

		expect(trend).toEqual({
			baseCurrency: 'BYN',
			points: [
				{ expenseMinor: 10_000, incomeMinor: 200_000, month: '2026-08' },
				{ expenseMinor: 15_000, incomeMinor: 0, month: '2026-09' }
			]
		});
	});
});
```

Note: this file does not yet import `createApiApp`/`OperationHttpController`/`RequestSessionResolver` or define an `authenticatedSession` fixture — Task 4 adds those, together with the HTTP-boundary tests for both new routes, when it extends this same file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @i-finances/api test -- operation-stats-service`
Expected: FAIL — `service.getCategoryStats is not a function` (and `service.getMonthlyTrend is not a function`).

- [ ] **Step 3: Implement `getCategoryStats` and `getMonthlyTrend`**

In `apps/api/src/modules/operation/operation-service.ts`, add these two public methods directly below the existing `getMonthlyExpenseSummary` method (after its closing brace, before `public archive(...)`):

```ts
	public async getCategoryStats(
		userId: string,
		input: GetMonthlyExpenseSummaryInput
	): Promise<CategoryStats> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);
		const range = getMonthRange(input.month);
		const [currentExpenses, history] = await Promise.all([
			this.dependencies.operationRepository.listMonthlyCategoryExpenses(
				household.id,
				range.start,
				range.end
			),
			this.dependencies.operationRepository.listCategoryExpenseHistory(household.id, range.start)
		]);
		const historyByCategory = new Map(history.map((row) => [row.categoryId, row]));
		const categoryIds = new Set([
			...currentExpenses.map((row) => row.referenceId),
			...history.map((row) => row.categoryId)
		]);

		const items = [...categoryIds].map((categoryId) => {
			const currentMinor = currentExpenses.find((row) => row.referenceId === categoryId)?.totalMinor ?? 0;
			const historyRow = historyByCategory.get(categoryId);
			const averageMinor = historyRow === undefined || historyRow.monthsIncludedCount === 0
				? null
				: Math.round(historyRow.totalMinor / historyRow.monthsIncludedCount);
			const deltaPercent = averageMinor === null || averageMinor === 0
				? null
				: Math.round(((currentMinor - averageMinor) / averageMinor) * 100);

			return {
				averageMinor,
				categoryId,
				currentMinor,
				deltaPercent,
				monthsIncludedCount: historyRow?.monthsIncludedCount ?? 0
			};
		});

		return {
			baseCurrency: household.baseCurrency,
			items,
			month: input.month
		};
	}

	public async getMonthlyTrend(userId: string): Promise<MonthlyTrend> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);
		const rows = await this.dependencies.operationRepository.listMonthlyTotals(household.id);

		return {
			baseCurrency: household.baseCurrency,
			points: rows.map((row) => ({
				expenseMinor: row.expenseMinor,
				incomeMinor: row.incomeMinor,
				month: row.month
			}))
		};
	}
```

Add `CategoryStats` and `MonthlyTrend` to the existing `@i-finances/contracts` type-only import at the top of the file (same import statement that already lists `AccountBalance`, `AccountLedger`, etc.).

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @i-finances/api test -- operation-stats-service`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/operation/operation-service.ts apps/api/tests/operation-stats-service.test.ts
git commit -m "feat(api): add getCategoryStats and getMonthlyTrend service methods"
```

---

### Task 4: Controller + routes

**Files:**
- Modify: `apps/api/src/http/operation-controller.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/tests/operation-stats-service.test.ts` (extend the HTTP-boundary coverage)

**Interfaces:**
- Consumes: `OperationService.getCategoryStats`/`.getMonthlyTrend` (Task 3).
- Produces: `GET /api/operations/category-stats?month=YYYY-MM`, `GET /api/operations/monthly-trend`, both requiring an authenticated session (401 otherwise) and 400 on invalid `month`.

- [ ] **Step 1: Extend the HTTP test first**

Task 3 deliberately left this file without any HTTP-boundary coverage — those routes don't exist until this task. First, restore the imports and session fixture Task 3 omitted. In `apps/api/tests/operation-stats-service.test.ts`, change:

```ts
import type { AppDatabase } from '@/infrastructure/database/client';
```

to:

```ts
import { createApiApp } from '@/app';
import { OperationHttpController } from '@/http/operation-controller';
import type { RequestSessionResolver } from '@/http/session-resolver';
import type { AppDatabase } from '@/infrastructure/database/client';
```

and change:

```ts
import { AccountRepository } from '@/modules/account';
import { CategoryRepository } from '@/modules/category';
```

to:

```ts
import { AccountRepository } from '@/modules/account';
import type { AuthenticatedSession } from '@/modules/auth';
import { CategoryRepository } from '@/modules/category';
```

Then, directly below `const FIXED_DATE = new Date('2026-09-08T10:00:00.000Z');`, add back the session fixture:

```ts
const authenticatedSession: AuthenticatedSession = {
	expiresAt: new Date('2026-10-08T10:00:00.000Z'),
	id: 'session-1',
	user: {
		displayName: 'Sergei Test',
		id: USER_ID,
		username: 'sergei'
	}
};
```

Now add the two HTTP-boundary tests. Inside `describe('OperationService category stats', ...)`, add one more `it`:

```ts
	it('exposes category-stats through the authenticated HTTP boundary and rejects a bad month', async () => {
		const sessionResolver: RequestSessionResolver = { resolve: async () => authenticatedSession };
		const app = createApiApp({
			operationController: new OperationHttpController(createService(), sessionResolver)
		});

		const badMonth = await app.request('/api/operations/category-stats?month=not-a-month');

		expect(badMonth.status).toBe(400);

		const response = await app.request('/api/operations/category-stats?month=2026-09');

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ baseCurrency: 'BYN', items: [], month: '2026-09' });
	});
```

And inside `describe('OperationService monthly trend', ...)`, add one more `it`:

```ts
	it('exposes monthly-trend through the authenticated HTTP boundary', async () => {
		const noSessionResolver: RequestSessionResolver = { resolve: async () => null };
		const sessionResolver: RequestSessionResolver = { resolve: async () => authenticatedSession };
		const unauthenticatedApp = createApiApp({
			operationController: new OperationHttpController(createService(), noSessionResolver)
		});
		const authenticatedApp = createApiApp({
			operationController: new OperationHttpController(createService(), sessionResolver)
		});

		expect((await unauthenticatedApp.request('/api/operations/monthly-trend')).status).toBe(401);

		const response = await authenticatedApp.request('/api/operations/monthly-trend');

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ baseCurrency: 'BYN', points: [] });
	});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @i-finances/api test -- operation-stats-service`
Expected: FAIL — both new tests get 404 instead of 400/200/401 (routes not registered yet).

- [ ] **Step 3: Add the controller handlers**

In `apps/api/src/http/operation-controller.ts`, directly below the existing `monthlySummary()` method (after its closing brace, before `public create()`), add:

```ts
	public categoryStats() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.unauthenticated(context);
			}

			const parsedInput = getMonthlyExpenseSummaryInputSchema.safeParse({
				month: context.req.query('month')
			});

			if (!parsedInput.success) {
				return this.invalidInput(context, parsedInput.error);
			}

			try {
				return context.json(
					await this.operationService.getCategoryStats(session.user.id, parsedInput.data),
					200
				);
			}
			catch (error: unknown) {
				return this.domainFailure(context, error);
			}
		};
	}

	public monthlyTrend() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.unauthenticated(context);
			}

			try {
				return context.json(
					await this.operationService.getMonthlyTrend(session.user.id),
					200
				);
			}
			catch (error: unknown) {
				return this.domainFailure(context, error);
			}
		};
	}
```

- [ ] **Step 4: Register the routes**

In `apps/api/src/app.ts`, inside the `if (dependencies.operationController !== undefined) { ... }` block, directly below the existing `app.get('/api/operations/monthly-summary', operationController.monthlySummary());` line, add:

```ts
		app.get('/api/operations/category-stats', operationController.categoryStats());
		app.get('/api/operations/monthly-trend', operationController.monthlyTrend());
```

- [ ] **Step 5: Run the full API test suite**

Run: `pnpm --filter @i-finances/api test`
Expected: PASS, all suites green (including the extended `operation-stats-service.test.ts`).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @i-finances/api typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/http/operation-controller.ts apps/api/src/app.ts apps/api/tests/operation-stats-service.test.ts
git commit -m "feat(api): register category-stats and monthly-trend HTTP routes"
```

---

### Task 5: Frontend data layer

**Files:**
- Modify: `apps/web/src/entities/operation/model/types.ts`
- Modify: `apps/web/src/entities/operation/api/operation.contract.ts`
- Modify: `apps/web/src/entities/operation/api/operation.client.ts`
- Modify: `apps/web/src/entities/operation/api/index.ts`
- Modify: `apps/web/src/entities/operation/index.ts`
- Modify: `apps/web/src/features/operations/api/operation-client.ts`
- Modify: `apps/web/tests/operation-client.test.ts`

**Interfaces:**
- Consumes: `categoryStatsSchema`/`monthlyTrendSchema` (Task 1, from `@i-finances/contracts`).
- Produces: `getCategoryStats(input: GetMonthlyExpenseSummaryInput)` and `getMonthlyTrend()` — both `query()`-wrapped, callable from `createAsync` in views; `CategoryStatItem`/`CategoryStats`/`MonthlyTrendPoint`/`MonthlyTrend` FE types importable from `@/entities/operation`.

- [ ] **Step 1: Write the failing client test**

In `apps/web/tests/operation-client.test.ts`, add two more `it` blocks inside `describe('OperationClient', ...)`:

```ts
	it('loads category stats through the feature API client', async () => {
		const fetcher: typeof globalThis.fetch = async (input) => {
			expect(input).toBe('/api/operations/category-stats?month=2026-09');

			return new Response(JSON.stringify({
				baseCurrency: 'BYN',
				items: [{
					averageMinor: 15_000,
					categoryId: 'category-food',
					currentMinor: 45_000,
					deltaPercent: 200,
					monthsIncludedCount: 2
				}],
				month: '2026-09'
			}), {
				headers: { 'content-type': 'application/json' },
				status: 200
			});
		};
		const client = new OperationClient({ fetcher });

		await expect(client.categoryStats({ month: '2026-09' })).resolves.toMatchObject({
			month: '2026-09'
		});
	});

	it('loads the monthly trend through the feature API client', async () => {
		const fetcher: typeof globalThis.fetch = async (input) => {
			expect(input).toBe('/api/operations/monthly-trend');

			return new Response(JSON.stringify({
				baseCurrency: 'BYN',
				points: [{ expenseMinor: 10_000, incomeMinor: 200_000, month: '2026-08' }]
			}), {
				headers: { 'content-type': 'application/json' },
				status: 200
			});
		};
		const client = new OperationClient({ fetcher });

		await expect(client.monthlyTrend()).resolves.toEqual({
			baseCurrency: 'BYN',
			points: [{ expenseMinor: 10_000, incomeMinor: 200_000, month: '2026-08' }]
		});
	});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @i-finances/web test -- operation-client`
Expected: FAIL — `client.categoryStats is not a function`.

- [ ] **Step 3: Add the FE-local model types**

In `apps/web/src/entities/operation/model/types.ts`, at the end of the file (after `MonthlyExpenseSummary`), add:

```ts
export type CategoryStatItem = {
	averageMinor: number | null;
	categoryId: string;
	currentMinor: number;
	deltaPercent: number | null;
	monthsIncludedCount: number;
};

export type CategoryStats = {
	baseCurrency: CurrencyCodeValue;
	items: CategoryStatItem[];
	month: string;
};

export type MonthlyTrendPoint = {
	expenseMinor: number;
	incomeMinor: number;
	month: string;
};

export type MonthlyTrend = {
	baseCurrency: CurrencyCodeValue;
	points: MonthlyTrendPoint[];
};
```

- [ ] **Step 4: Wire the feature-level HTTP client**

In `apps/web/src/features/operations/api/operation-client.ts`:
- Add `categoryStatsSchema`, `monthlyTrendSchema` to the existing `@i-finances/contracts` named import.
- Add these two methods directly below the existing `monthlySummary` method:

```ts
	public categoryStats(input: GetMonthlyExpenseSummaryInput) {
		const parsedInput = getMonthlyExpenseSummaryInputSchema.parse(input);
		const query = new URLSearchParams(parsedInput);

		return this.client.get(
			`/api/operations/category-stats?${query.toString()}`,
			categoryStatsSchema
		);
	}

	public monthlyTrend() {
		return this.client.get('/api/operations/monthly-trend', monthlyTrendSchema);
	}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @i-finances/web test -- operation-client`
Expected: PASS, all tests green.

- [ ] **Step 6: Add the contract result aliases**

In `apps/web/src/entities/operation/api/operation.contract.ts`:
- Add `CategoryStats`, `MonthlyTrend` to the existing `import type { ... } from '../model/types';` block.
- At the end of the file, add:

```ts
export type CategoryStatsResult = CategoryStats;
export type MonthlyTrendResult = MonthlyTrend;
```

- [ ] **Step 7: Add the `query()`-wrapped entity fetchers**

In `apps/web/src/entities/operation/api/operation.client.ts`, directly below the existing `getMonthlyExpenseSummary` export, add:

```ts
export const getCategoryStats = query(
	(input: GetMonthlyExpenseSummaryInput) => client.categoryStats(input),
	'category-stats'
);

export const getMonthlyTrend = query(() => client.monthlyTrend(), 'monthly-trend');
```

- [ ] **Step 8: Re-export from the entity barrels**

In `apps/web/src/entities/operation/api/index.ts`:
- Add `getCategoryStats`, `getMonthlyTrend` to the existing named export from `./operation.client`.
- Add `CategoryStatsResult`, `MonthlyTrendResult` to the existing `export type { ... } from './operation.contract';` block.

In `apps/web/src/entities/operation/index.ts`, add `CategoryStatItem`, `CategoryStats`, `MonthlyTrendPoint`, `MonthlyTrend` to the existing `export type { ... } from './model/types';` block.

- [ ] **Step 9: Typecheck and run the full web suite**

Run: `pnpm --filter @i-finances/web typecheck && pnpm --filter @i-finances/web test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/entities/operation apps/web/src/features/operations/api/operation-client.ts apps/web/tests/operation-client.test.ts
git commit -m "feat(web): add category-stats and monthly-trend entity queries"
```

---

### Task 6: Pure chart-data builders (TDD)

**Files:**
- Create: `apps/web/src/views/statistics/lib/build-category-chart-data.ts`
- Create: `apps/web/src/views/statistics/lib/build-trend-chart-data.ts`
- Create: `apps/web/tests/statistics-chart-data.test.ts`

**Interfaces:**
- Consumes: `CategoryStats`, `Category`, `getCategoryBudgetSummary` (from `@/entities/category`), `MonthlyTrend`, `minorUnitsToAmount` (from `@/shared/lib`).
- Produces: `buildCategoryChartData(stats: CategoryStats, categories: readonly Category[]): CategoryChartResult`, `buildTrendChartData(trend: MonthlyTrend, colors: TrendChartColors): ChartData<'line'>`, `formatMonthLabel(monthKey: string): string` — all pure, no DOM access, consumed by Task 7's components.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/tests/statistics-chart-data.test.ts`:

```ts
import type { Category } from '@/entities/category';
import type { CategoryStats, MonthlyTrend } from '@/entities/operation';

import { buildCategoryChartData } from '@/views/statistics/lib/build-category-chart-data';
import { buildTrendChartData, formatMonthLabel } from '@/views/statistics/lib/build-trend-chart-data';

import { describe, expect, it } from 'vitest';

function makeCategory(overrides: Partial<Category> = {}): Category {
	return {
		color: '#68a063',
		createdAt: '2026-01-01',
		description: '',
		icon: 'shopping-cart',
		id: 'category-food',
		keywords: [],
		monthlyBudgetMinor: null,
		name: 'Продукты',
		updatedAt: '2026-01-01',
		...overrides
	};
}

describe('buildCategoryChartData', () => {
	it('uses the budget-based delta when the category has a budget', () => {
		const stats: CategoryStats = {
			baseCurrency: 'BYN',
			items: [{
				averageMinor: 30_000,
				categoryId: 'category-food',
				currentMinor: 45_000,
				deltaPercent: 50,
				monthsIncludedCount: 3
			}],
			month: '2026-09'
		};
		const categories = [makeCategory({ monthlyBudgetMinor: 50_000 })];

		const result = buildCategoryChartData(stats, categories);

		expect(result.deltas).toEqual([{
			categoryId: 'category-food',
			deltaPercent: -10,
			isSignificant: false,
			kind: 'budget',
			label: 'Продукты'
		}]);
		expect(result.data.labels).toEqual(['Продукты']);
		expect(result.data.datasets[0].backgroundColor).toEqual(['#68a063']);
	});

	it('falls back to the historical-average delta when there is no budget', () => {
		const stats: CategoryStats = {
			baseCurrency: 'BYN',
			items: [{
				averageMinor: 15_000,
				categoryId: 'category-food',
				currentMinor: 45_000,
				deltaPercent: 200,
				monthsIncludedCount: 2
			}],
			month: '2026-09'
		};
		const categories = [makeCategory()];

		const result = buildCategoryChartData(stats, categories);

		expect(result.deltas).toEqual([{
			categoryId: 'category-food',
			deltaPercent: 200,
			isSignificant: true,
			kind: 'average',
			label: 'Продукты'
		}]);
	});

	it('sorts categories by current spend, descending', () => {
		const stats: CategoryStats = {
			baseCurrency: 'BYN',
			items: [
				{ averageMinor: null, categoryId: 'category-small', currentMinor: 1_000, deltaPercent: null, monthsIncludedCount: 0 },
				{ averageMinor: null, categoryId: 'category-food', currentMinor: 45_000, deltaPercent: null, monthsIncludedCount: 0 }
			],
			month: '2026-09'
		};
		const categories = [
			makeCategory(),
			makeCategory({ color: '#a06368', id: 'category-small', name: 'Мелочи' })
		];

		const result = buildCategoryChartData(stats, categories);

		expect(result.data.labels).toEqual(['Продукты', 'Мелочи']);
	});
});

describe('buildTrendChartData', () => {
	it('builds two datasets in minor->major units with the given colors', () => {
		const trend: MonthlyTrend = {
			baseCurrency: 'BYN',
			points: [
				{ expenseMinor: 10_000, incomeMinor: 200_000, month: '2026-08' },
				{ expenseMinor: 15_000, incomeMinor: 0, month: '2026-09' }
			]
		};

		const data = buildTrendChartData(trend, { expense: '#c82d4d', income: '#147a50' });

		expect(data.labels).toHaveLength(2);
		expect(data.datasets).toEqual([
			expect.objectContaining({ borderColor: '#c82d4d', data: [100, 150], label: 'Расходы' }),
			expect.objectContaining({ borderColor: '#147a50', data: [2_000, 0], label: 'Доходы' })
		]);
	});
});

describe('formatMonthLabel', () => {
	it('formats a YYYY-MM key as a short Russian month + year', () => {
		expect(formatMonthLabel('2026-01')).toBe('Янв 2026');
		expect(formatMonthLabel('2026-12')).toBe('Дек 2026');
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @i-finances/web test -- statistics-chart-data`
Expected: FAIL — cannot find module `@/views/statistics/lib/build-category-chart-data`.

- [ ] **Step 3: Implement `build-category-chart-data.ts`**

Create `apps/web/src/views/statistics/lib/build-category-chart-data.ts`:

```ts
import { getCategoryBudgetSummary } from '@/entities/category';
import type { Category } from '@/entities/category';
import type { CategoryStats } from '@/entities/operation';

import { minorUnitsToAmount } from '@/shared/lib';

import type { ChartData } from 'chart.js';

const SIGNIFICANT_DELTA_THRESHOLD_PERCENT = 20;
const UNCATEGORIZED_LABEL = 'Без категории';
const UNCATEGORIZED_COLOR = '#94a3b8';

export type CategoryChartDeltaKind = 'average' | 'budget';

export type CategoryChartDelta = {
	categoryId: string;
	deltaPercent: number | null;
	isSignificant: boolean;
	kind: CategoryChartDeltaKind;
	label: string;
};

export type CategoryChartResult = {
	data: ChartData<'bar'>;
	deltas: CategoryChartDelta[];
};

function isSignificantDelta(deltaPercent: number | null): boolean {
	return deltaPercent !== null && Math.abs(deltaPercent) >= SIGNIFICANT_DELTA_THRESHOLD_PERCENT;
}

export function buildCategoryChartData(
	stats: CategoryStats,
	categories: readonly Category[]
): CategoryChartResult {
	const categoriesById = new Map(categories.map((category) => [category.id, category]));
	const sortedItems = stats.items.toSorted((left, right) => right.currentMinor - left.currentMinor);

	const labels: string[] = [];
	const backgroundColors: string[] = [];
	const amounts: number[] = [];
	const deltas: CategoryChartDelta[] = [];

	for (const item of sortedItems) {
		const category = categoriesById.get(item.categoryId);
		const label = category?.name ?? UNCATEGORIZED_LABEL;

		labels.push(label);
		amounts.push(minorUnitsToAmount(item.currentMinor));
		backgroundColors.push(category?.color ?? UNCATEGORIZED_COLOR);

		const budgetSummary = category === undefined
			? undefined
			: getCategoryBudgetSummary(category, item.currentMinor);

		if (budgetSummary?.hasBudget) {
			const deltaPercent = budgetSummary.usagePercent === null
				? null
				: budgetSummary.usagePercent - 100;

			deltas.push({
				categoryId: item.categoryId,
				deltaPercent,
				isSignificant: isSignificantDelta(deltaPercent),
				kind: 'budget',
				label
			});
		}
		else {
			deltas.push({
				categoryId: item.categoryId,
				deltaPercent: item.deltaPercent,
				isSignificant: isSignificantDelta(item.deltaPercent),
				kind: 'average',
				label
			});
		}
	}

	return {
		data: {
			datasets: [{
				backgroundColor: backgroundColors,
				data: amounts,
				label: 'Расходы за месяц'
			}],
			labels
		},
		deltas
	};
}
```

- [ ] **Step 4: Implement `build-trend-chart-data.ts`**

Create `apps/web/src/views/statistics/lib/build-trend-chart-data.ts`:

```ts
import type { MonthlyTrend } from '@/entities/operation';

import { minorUnitsToAmount } from '@/shared/lib';

import type { ChartData } from 'chart.js';

export type TrendChartColors = {
	expense: string;
	income: string;
};

export function formatMonthLabel(monthKey: string): string {
	const [year, month] = monthKey.split('-').map(Number);
	const date = new Date(year, month - 1, 1);
	const formatted = new Intl.DateTimeFormat('ru-BY', { month: 'short', year: 'numeric' }).format(date);

	return formatted.charAt(0).toLocaleUpperCase('ru-BY') + formatted.slice(1);
}

export function buildTrendChartData(trend: MonthlyTrend, colors: TrendChartColors): ChartData<'line'> {
	return {
		datasets: [
			{
				borderColor: colors.expense,
				data: trend.points.map((point) => minorUnitsToAmount(point.expenseMinor)),
				label: 'Расходы',
				tension: 0.25
			},
			{
				borderColor: colors.income,
				data: trend.points.map((point) => minorUnitsToAmount(point.incomeMinor)),
				label: 'Доходы',
				tension: 0.25
			}
		],
		labels: trend.points.map((point) => formatMonthLabel(point.month))
	};
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @i-finances/web test -- statistics-chart-data`
Expected: PASS. Note: `formatMonthLabel` output capitalization/format depends on the Node ICU build — if the `Дек 2026`/`Янв 2026` assertion fails on exact spacing, adjust the test's expected string to whatever the local Node's `Intl.DateTimeFormat('ru-BY', ...)` actually returns (verify once with `node -e "console.log(new Intl.DateTimeFormat('ru-BY',{month:'short',year:'numeric'}).format(new Date(2026,0,1)))"`), not by changing the formatting logic.

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @i-finances/web typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/views/statistics/lib apps/web/tests/statistics-chart-data.test.ts
git commit -m "feat(web): add pure chart-data builders for the statistics page"
```

---

### Task 7: Statistics page — chart library, components, routing

**Files:**
- Modify: `apps/web/package.json` (add `solid-chartjs`, `chart.js`)
- Create: `apps/web/src/views/statistics/ui/month-navigator/month-navigator.tsx` (+ `.module.scss`)
- Create: `apps/web/src/views/statistics/ui/category-breakdown-chart/category-breakdown-chart.tsx` (+ `.module.scss`)
- Create: `apps/web/src/views/statistics/ui/monthly-trend-chart/monthly-trend-chart.tsx` (+ `.module.scss`)
- Create: `apps/web/src/views/statistics/page.tsx` (+ `.module.scss`)
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**
- Consumes: `getCategoryStats`, `getMonthlyTrend`, `getCategories` (`@/entities/category`), `buildCategoryChartData`, `buildTrendChartData` (Task 6), `shiftOperationPeriod`/`startOfPeriod`/`canMoveToNextOperationPeriod`/`formatLocalDateKey` (`@/entities/operation`).
- Produces: `StatisticsPage` component, mounted at `/stats`.

- [ ] **Step 1: Install the chart library**

Run: `pnpm --filter @i-finances/web add solid-chartjs chart.js`
Expected: `apps/web/package.json` dependencies gain `"chart.js": "^4.x"` and `"solid-chartjs": "^1.3.11"`; `pnpm-lock.yaml` updates.

- [ ] **Step 2: Build the month navigator**

Create `apps/web/src/views/statistics/ui/month-navigator/month-navigator.module.scss`:

```scss
@use "@/shared/styles/mixins" as mx;

.root {
    display: flex;
    gap: var(--space-4);
    align-items: center;
    justify-content: center;

    @include mx.media-mn(640) {
        justify-content: flex-start;
    }
}

.label {
    min-inline-size: 10ch;
    font-weight: var(--font-weight-semibold);
    text-align: center;
}
```

Create `apps/web/src/views/statistics/ui/month-navigator/month-navigator.tsx`:

```tsx
import css from './month-navigator.module.scss';

import { Button } from '@/shared/ui';

import {
	canMoveToNextOperationPeriod,
	formatLocalDateKey,
	shiftOperationPeriod
} from '@/entities/operation';

import { ChevronLeft, ChevronRight } from 'lucide-solid';

export type MonthNavigatorProps = {
	anchor: Date;
	now: Date;
	onChange: (anchor: Date) => void;
};

function formatMonthNavigatorLabel(anchor: Date): string {
	const value = new Intl.DateTimeFormat('ru-BY', { month: 'long', year: 'numeric' }).format(anchor);

	return value.charAt(0).toLocaleUpperCase('ru-BY') + value.slice(1);
}

export function MonthNavigator(props: MonthNavigatorProps) {
	const canMoveNext = () => canMoveToNextOperationPeriod(props.anchor, 'month', props.now);

	return (
		<div class={css.root}>
			<Button
				aria-label='Предыдущий месяц'
				iconOnly
				size='sm'
				variant='ghost'
				onClick={() => props.onChange(shiftOperationPeriod(props.anchor, 'month', -1))}
			>
				<ChevronLeft size={18}/>
			</Button>
			<span class={css.label}>{formatMonthNavigatorLabel(props.anchor)}</span>
			<Button
				aria-label='Следующий месяц'
				disabled={!canMoveNext()}
				iconOnly
				size='sm'
				variant='ghost'
				onClick={() => props.onChange(shiftOperationPeriod(props.anchor, 'month', 1))}
			>
				<ChevronRight size={18}/>
			</Button>
		</div>
	);
}

export function toMonthKey(anchor: Date): string {
	return formatLocalDateKey(anchor).slice(0, 7);
}
```

- [ ] **Step 3: Build the category breakdown chart**

Create `apps/web/src/views/statistics/ui/category-breakdown-chart/category-breakdown-chart.module.scss`:

```scss
@use "@/shared/styles/mixins" as mx;

.root {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
}

.canvas {
    position: relative;
    block-size: 280px;

    @include mx.media-mn(960) {
        block-size: 360px;
    }
}

.legend {
    display: grid;
    gap: var(--space-3);
}

.legend-row {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    font-size: var(--font-size-body-sm);
    color: var(--color-text-secondary);
}

.swatch {
    inline-size: var(--space-6);
    block-size: var(--space-6);
    flex: none;
    border-radius: var(--radius-round);
}

.name {
    flex: 1 1 auto;
    color: var(--color-text-primary);
}

.delta {
    font-weight: var(--font-weight-medium);
}

.delta-up {
    color: var(--color-danger);
}

.delta-down {
    color: var(--color-success);
}
```

Create `apps/web/src/views/statistics/ui/category-breakdown-chart/category-breakdown-chart.tsx`:

```tsx
import css from './category-breakdown-chart.module.scss';

import { cn } from '@/shared/lib';

import type { CategoryChartResult } from '@/views/statistics/lib/build-category-chart-data';

import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';
import { TrendingDown, TrendingUp } from 'lucide-solid';
import { Bar } from 'solid-chartjs';
import { For, onMount, Show } from 'solid-js';

export type CategoryBreakdownChartProps = {
	result: CategoryChartResult;
};

function formatDeltaLabel(deltaPercent: number | null, kind: 'average' | 'budget'): string {
	if (deltaPercent === null) {
		return kind === 'budget' ? 'Бюджет не задан' : 'Нет истории для сравнения';
	}

	const sign = deltaPercent > 0 ? '+' : '';
	const suffix = kind === 'budget' ? 'к бюджету' : 'к среднему';

	return `${sign}${deltaPercent}% ${suffix}`;
}

export function CategoryBreakdownChart(props: CategoryBreakdownChartProps) {
	onMount(() => {
		Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);
	});

	return (
		<div class={css.root}>
			<div class={css.canvas}>
				<Bar
					data={props.result.data}
					options={{
						maintainAspectRatio: false,
						plugins: { legend: { display: false } },
						responsive: true
					}}
				/>
			</div>
			<ul class={css.legend}>
				<For each={props.result.deltas}>
					{(delta, index) => (
						<li class={css.legendRow}>
							<span
								class={css.swatch}
								style={{ 'background-color': props.result.data.datasets[0]?.backgroundColor?.[index()] as string }}
							/>
							<span class={css.name}>{delta.label}</span>
							<Show when={delta.isSignificant}>
								{delta.deltaPercent !== null && delta.deltaPercent > 0
									? <TrendingUp aria-hidden='true' size={16}/>
									: <TrendingDown aria-hidden='true' size={16}/>}
							</Show>
							<span
								class={cn(
									css.delta,
									delta.isSignificant && delta.deltaPercent !== null && delta.deltaPercent > 0 && css.deltaUp,
									delta.isSignificant && delta.deltaPercent !== null && delta.deltaPercent < 0 && css.deltaDown
								)}
							>
								{formatDeltaLabel(delta.deltaPercent, delta.kind)}
							</span>
						</li>
					)}
				</For>
			</ul>
		</div>
	);
}
```

- [ ] **Step 4: Build the monthly trend chart**

Create `apps/web/src/views/statistics/ui/monthly-trend-chart/monthly-trend-chart.module.scss`:

```scss
@use "@/shared/styles/mixins" as mx;

.canvas {
    position: relative;
    block-size: 280px;

    @include mx.media-mn(960) {
        block-size: 360px;
    }
}
```

Create `apps/web/src/views/statistics/ui/monthly-trend-chart/monthly-trend-chart.tsx`:

```tsx
import css from './monthly-trend-chart.module.scss';

import type { ChartData } from 'chart.js';
import {
	CategoryScale,
	Chart,
	Legend,
	LinearScale,
	LineController,
	LineElement,
	PointElement,
	Tooltip
} from 'chart.js';
import { Line } from 'solid-chartjs';
import { onMount } from 'solid-js';

export type MonthlyTrendChartProps = {
	data: ChartData<'line'>;
};

export function MonthlyTrendChart(props: MonthlyTrendChartProps) {
	onMount(() => {
		Chart.register(
			CategoryScale,
			LinearScale,
			LineController,
			LineElement,
			PointElement,
			Legend,
			Tooltip
		);
	});

	return (
		<div class={css.canvas}>
			<Line
				data={props.data}
				options={{
					maintainAspectRatio: false,
					plugins: { legend: { position: 'top' } },
					responsive: true
				}}
			/>
		</div>
	);
}
```

- [ ] **Step 5: Build the page**

Create `apps/web/src/views/statistics/statistics.module.scss`:

```scss
@use "@/shared/styles/mixins" as mx;

.root {
    overflow: hidden;
    display: flex;
    flex: 1 1 0;
    flex-direction: column;

    min-block-size: 0;
    padding-block: var(--space-7) calc(var(--space-12) + var(--space-9));

    background-color: var(--color-canvas);

    @include mx.media-mn(960) {
        padding-block: var(--space-9);
    }
}

.page {
    display: flex;
    flex-direction: column;
    gap: var(--space-9);

    inline-size: 100%;
}

.title-row {
    display: flex;
    gap: var(--space-4);
    align-items: center;
    color: var(--color-primary);

    h1 {
        margin: 0;
        font-size: var(--font-size-heading-1);
        color: var(--color-text-primary);
    }
}

.section {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);

    padding: var(--space-7);

    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
}

.section-header {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    align-items: center;
    justify-content: space-between;

    h2 {
        margin: 0;
        font-size: var(--font-size-heading-3);
    }
}
```

Create `apps/web/src/views/statistics/page.tsx`:

```tsx
import css from './statistics.module.scss';

import { Container } from '@/shared/ui';

import { getCategories } from '@/entities/category';
import { getCategoryStats, getMonthlyTrend } from '@/entities/operation';

import { MonthNavigator, toMonthKey } from './ui/month-navigator/month-navigator';
import { CategoryBreakdownChart } from './ui/category-breakdown-chart/category-breakdown-chart';
import { MonthlyTrendChart } from './ui/monthly-trend-chart/monthly-trend-chart';
import { buildCategoryChartData } from './lib/build-category-chart-data';
import { buildTrendChartData } from './lib/build-trend-chart-data';

import { Title } from '@solidjs/meta';
import { createAsync } from '@solidjs/router';
import { ChartColumnBig } from 'lucide-solid';
import { createMemo, createSignal, ErrorBoundary, Show } from 'solid-js';
import { startOfPeriod } from '@/entities/operation';

function resolveThemeColor(variableName: string, fallback: string): string {
	if (typeof window === 'undefined') {
		return fallback;
	}

	const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();

	return value || fallback;
}

function StatisticsContent() {
	const now = new Date();
	const [monthAnchor, setMonthAnchor] = createSignal(startOfPeriod(now, 'month'));
	const monthKey = createMemo(() => toMonthKey(monthAnchor()));

	const categories = createAsync(() => getCategories({ status: 'active' }));
	const categoryStats = createAsync(() => getCategoryStats({ month: monthKey() }));
	const monthlyTrend = createAsync(() => getMonthlyTrend());

	const categoryChart = createMemo(() => {
		const stats = categoryStats();
		const categoryList = categories();

		return stats === undefined || categoryList === undefined
			? undefined
			: buildCategoryChartData(stats, categoryList.items);
	});

	const trendChart = createMemo(() => {
		const trend = monthlyTrend();

		return trend === undefined
			? undefined
			: buildTrendChartData(trend, {
				expense: resolveThemeColor('--color-danger', '#c82d4d'),
				income: resolveThemeColor('--color-success', '#147a50')
			});
	});

	return (
		<main class={css.root}>
			<Container class={css.page}>
				<div class={css.titleRow}>
					<ChartColumnBig aria-hidden='true' size={28}/>
					<h1>Статистика</h1>
				</div>

				<section class={css.section}>
					<div class={css.sectionHeader}>
						<h2>Траты по категориям</h2>
						<MonthNavigator anchor={monthAnchor()} now={now} onChange={setMonthAnchor}/>
					</div>
					<Show when={categoryChart()} fallback={<p>Загрузка…</p>}>
						{(result) => <CategoryBreakdownChart result={result()}/>}
					</Show>
				</section>

				<section class={css.section}>
					<div class={css.sectionHeader}>
						<h2>Динамика по месяцам</h2>
					</div>
					<Show when={trendChart()} fallback={<p>Загрузка…</p>}>
						{(data) => <MonthlyTrendChart data={data()}/>}
					</Show>
				</section>
			</Container>
		</main>
	);
}

function StatisticsLoadError() {
	return (
		<main class={css.root}>
			<Container class={css.page}>
				<div class={css.section}>
					<h1>Не удалось загрузить статистику</h1>
					<p>Обновите страницу и повторите попытку.</p>
				</div>
			</Container>
		</main>
	);
}

/**
 * Renders category spend (vs. budget or history) and the monthly trend.
 */
export function StatisticsPage() {
	return (
		<>
			<Title>Статистика — iFinances</Title>
			<ErrorBoundary fallback={<StatisticsLoadError/>}>
				<StatisticsContent/>
			</ErrorBoundary>
		</>
	);
}
```

Note on import order: move the `startOfPeriod` import up into the existing `@/entities/operation` import line (`{ getCategoryStats, getMonthlyTrend, startOfPeriod }`) when writing the real file — it is split above only for readability in this plan. Follow the project's `simple-import-sort` order (styles → side-effects → `node:` → externals → `@/` aliases → relatives) exactly as the other view files do; run `pnpm lint:fix` in Step 7 to normalize this automatically.

- [ ] **Step 6: Register the route**

In `apps/web/src/app/router.tsx`:
- Add `import { StatisticsPage } from '@/views/statistics/page';` next to the other view imports.
- Add `<Route path='/stats' component={() => protectedPage(<StatisticsPage/>)}/>` next to the other protected routes, before the `*404` route.

- [ ] **Step 7: Lint, typecheck, and run the full web suite**

Run: `pnpm lint:fix && pnpm --filter @i-finances/web typecheck && pnpm --filter @i-finances/web test`
Expected: PASS. Fix any import-order or `no-explicit-any` findings lint surfaces (the plan's inline snippets are not guaranteed pre-sorted).

- [ ] **Step 8: Manual verification in the browser**

Run: `pnpm dev` (or `pnpm --filter @i-finances/api dev` + `pnpm --filter @i-finances/web dev` in two terminals).
Open `http://localhost:5173/stats`, sign in, and confirm:
- The category bar chart renders with real category colors and a legend showing `%` deltas (budget-based for any category with `monthlyBudgetMinor` set, average-based otherwise).
- The month navigator moves the bar chart between months and disables "next" on the current month.
- The trend line chart shows expense (red) and income (green) lines across the available months.
- Layout doesn't break at a narrow (mobile) width — acceptable if cramped, but nothing must overflow horizontally per the mobile-first CSS rule.

This is a UI change — do not report the task complete without having actually seen it render correctly in the browser (per project convention on CSS/visual changes).

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/src/views/statistics apps/web/src/app/router.tsx
git commit -m "feat(web): add the statistics page with category and trend charts"
```

---

## Self-review notes

- **Spec coverage:** Graph 1 (categories + budget-or-average delta + month selector) → Tasks 2/3/4/6/7. Graph 2 (monthly trend, red/green) → Tasks 2/3/4/6/7. Base-currency-only aggregation → enforced in every new repository query (`amountInHouseholdBaseCurrencyMinor`). Category color identity → `build-category-chart-data.ts`. Significant-deviation threshold (20%) → `isSignificantDelta`. Router/nav → Task 7 Step 6 (nav link already existed).
- **No placeholders:** every step above ships literal, complete code — the one exception is the explicit note in Task 7 Step 5 about running the project's own import sorter, which is a formatting step, not missing logic.
- **Type consistency check:** `CategoryStats`/`CategoryStatItem`/`MonthlyTrend`/`MonthlyTrendPoint` are named identically across `packages/contracts` (Task 1), the API service (Task 3), and the FE entity layer (Task 5) — matching the existing `MonthlyExpenseSummary` precedent exactly. `buildCategoryChartData`/`buildTrendChartData`/`formatMonthLabel` signatures in Task 6 match their call sites in Task 7 verbatim.
