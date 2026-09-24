# Spending Comparison Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить на `/stats` вкладку «Сравнение»: траты по выбранным категориям или контактам, месяцы колонками, с графиком, сводкой, пунктом «Все» и выбором, живущим в URL.

**Architecture:** Один агрегирующий эндпоинт `GET /api/operations/monthly-breakdown` отдаёт разреженные ячейки `(referenceId, month, totalMinor)` по всем категориям/контактам за диапазон. Всё остальное (выбор строк, итоги, среднее, свёртка в «Остальные», цвета) — чистые функции на клиенте, покрытые юнит-тестами. UI — Solid-компоненты во `views/statistics`, график — существующие `solid-chartjs` + `chart.js`.

**Tech Stack:** Hono + Drizzle + better-sqlite3 (API), Zod (`@i-finances/contracts`), Solid.js + `@solidjs/router` + SCSS-модули + `solid-chartjs` (web), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-24-spending-comparison-design.md`. Утверждённый макет: https://claude.ai/artifact/4XS9fiHdE7sb6VHSVrR5aw

## Global Constraints

- Прочитать `AGENTS.md` (корень) перед любой правкой: табы, одинарные кавычки, `;`, Stroustrup, `simple-import-sort`, `consistent-type-imports`, `no-negated-condition`, function declarations на верхнем уровне и `const`-стрелки внутри, порядок тела Solid-компонента: сигналы/мемо → хендлеры → эффекты → JSX.
- Все новые файлы — kebab-case (`build-breakdown-matrix.ts`, `reference-multiselect.tsx`).
- SCSS: mobile-first, только `@include mx.media-mn(...)` для расширения, **без `!important`**, только токены из `apps/web/src/shared/styles/tokens.scss`. Классы в SCSS kebab-case, в TS — `css.camelCase`.
- `apps/web` и `apps/mcp` не импортируют код БД. Drizzle-типы не выходят за репозиторий, Hono-типы — за контроллер.
- Схема БД и миграции **не меняются**. Существующие файлы в `apps/api/drizzle/` не трогать.
- Тесты API — только на `:memory:` (как в `apps/api/tests/operation-stats-service.test.ts`), никогда на боевой или локальной базе.
- Суммы — `amountInHouseholdBaseCurrencyMinor` (курс на дату операции); только `type = 'expense'`, без удалённых, без переводов (`transfer_id IS NULL`).
- Максимальная длина диапазона — 24 месяца.
- Тексты UI — на русском, как в макете.
- Фаза 2 (дриллдаун по клику на ячейку) в этот план **не входит**.
- Команды проверки: `pnpm --filter @i-finances/contracts test`, `pnpm --filter @i-finances/api test`, `pnpm --filter @i-finances/web test`, `pnpm typecheck`, `pnpm lint` (из корня репозитория).

---

## File Structure

**Contracts**
- Modify `packages/contracts/src/operation.ts` — `monthKeySchema`, `breakdownDimensionSchema`, `getMonthlyBreakdownInputSchema`, `monthlyBreakdownCellSchema`, `monthlyBreakdownSchema`, типы.
- Modify `packages/contracts/src/index.ts` — экспорт.
- Create `packages/contracts/tests/monthly-breakdown.test.ts`.

**API**
- Modify `apps/api/src/modules/operation/operation-repository.ts` — тип `MonthlyReferenceTotalRow`, метод `listMonthlyReferenceBreakdown`.
- Modify `apps/api/src/modules/operation/operation-service.ts` — `getMonthlyBreakdown`.
- Modify `apps/api/src/http/operation-controller.ts` — `monthlyBreakdown()`.
- Modify `apps/api/src/app.ts` — маршрут.
- Create `apps/api/tests/operation-breakdown-service.test.ts`.

**Web — данные**
- Modify `apps/web/src/features/operations/api/operation-client.ts` — `monthlyBreakdown(input)`.
- Modify `apps/web/src/entities/operation/model/types.ts`, `apps/web/src/entities/operation/index.ts`, `apps/web/src/entities/operation/api/operation.client.ts`, `apps/web/src/entities/operation/api/index.ts` — тип и query `getMonthlyBreakdown`.
- Modify `apps/web/tests/operation-client.test.ts`.

**Web — чистая логика** (`apps/web/src/views/statistics/lib/`)
- Create `month-keys.ts` — `addMonths`, `listMonthKeys`, `countMonths`.
- Create `period-presets.ts` — `resolvePeriodPreset`, `isPresetActive`.
- Create `series-slots.ts` — `assignSeriesSlots`.
- Create `build-breakdown-matrix.ts` — `buildBreakdownMatrix`.
- Create `selection.ts` — `isAllSelected`, `toggleAll`, `toggleOne`, `sanitizeSelection`.
- Create `selection-storage.ts` — чтение/запись выбора и слотов в localStorage.
- Create `resolve-theme-color.ts` — вынос `resolveThemeColor` из `page.tsx`.
- Tests: `apps/web/tests/statistics-month-keys.test.ts`, `statistics-period-presets.test.ts`, `statistics-series-slots.test.ts`, `statistics-breakdown-matrix.test.ts`, `statistics-selection.test.ts`, `statistics-search-params.test.ts`.

**Web — URL**
- Create `apps/web/src/views/statistics/model/statistics-search-params.ts`.

**Web — UI** (`apps/web/src/views/statistics/ui/`)
- Create `reference-multiselect/reference-multiselect.tsx` + `.module.scss`.
- Create `period-range-picker/period-range-picker.tsx` + `.module.scss`.
- Create `breakdown-summary/breakdown-summary.tsx` + `.module.scss`.
- Create `breakdown-chart/breakdown-chart.tsx` + `.module.scss`.
- Create `breakdown-table/breakdown-table.tsx` + `.module.scss`.
- Create `compare-tab/compare-tab.tsx` + `.module.scss`.
- Modify `apps/web/src/views/statistics/page.tsx` + `statistics.module.scss` — табы.
- Modify `apps/web/src/shared/styles/tokens.scss` — палитра серий.

---

### Task 1: Контракты monthly-breakdown

**Files:**
- Modify: `packages/contracts/src/operation.ts` (после `monthlyTrendSchema`, ~стр. 275)
- Modify: `packages/contracts/src/index.ts:121-170`
- Test: `packages/contracts/tests/monthly-breakdown.test.ts`

**Interfaces:**
- Produces:
  - `monthKeySchema: z.ZodString` — `'YYYY-MM'`, месяц 01–12
  - `MONTHLY_BREAKDOWN_MAX_MONTHS = 24`
  - `breakdownDimensionSchema = z.enum(['category', 'contact'])`, `type BreakdownDimension`
  - `getMonthlyBreakdownInputSchema`, `type GetMonthlyBreakdownInput = { by: BreakdownDimension; from: string; to: string }`
  - `monthlyBreakdownCellSchema`, `type MonthlyBreakdownCell = { month: string; referenceId: string; totalMinor: number }`
  - `monthlyBreakdownSchema`, `type MonthlyBreakdown = { baseCurrency: CurrencyCode; by: BreakdownDimension; cells: MonthlyBreakdownCell[]; from: string; to: string }`

- [ ] **Step 1: Write the failing test**

```ts
// packages/contracts/tests/monthly-breakdown.test.ts
import { getMonthlyBreakdownInputSchema, monthlyBreakdownSchema } from '../src/operation';
import { describe, expect, it } from 'vitest';

describe('getMonthlyBreakdownInputSchema', () => {
	it('accepts a valid range for both dimensions', () => {
		expect(getMonthlyBreakdownInputSchema.parse({ by: 'category', from: '2026-01', to: '2026-09' }))
			.toEqual({ by: 'category', from: '2026-01', to: '2026-09' });
		expect(getMonthlyBreakdownInputSchema.safeParse({ by: 'contact', from: '2026-09', to: '2026-09' }).success)
			.toBe(true);
	});

	it('rejects an unknown dimension and malformed months', () => {
		expect(getMonthlyBreakdownInputSchema.safeParse({ by: 'account', from: '2026-01', to: '2026-02' }).success).toBe(false);
		expect(getMonthlyBreakdownInputSchema.safeParse({ by: 'category', from: '2026-13', to: '2026-12' }).success).toBe(false);
		expect(getMonthlyBreakdownInputSchema.safeParse({ by: 'category', from: '2026-1', to: '2026-12' }).success).toBe(false);
	});

	it('rejects from after to', () => {
		const result = getMonthlyBreakdownInputSchema.safeParse({ by: 'category', from: '2026-09', to: '2026-01' });

		expect(result.success).toBe(false);
	});

	it('accepts exactly 24 months and rejects 25', () => {
		expect(getMonthlyBreakdownInputSchema.safeParse({ by: 'category', from: '2024-10', to: '2026-09' }).success).toBe(true);
		expect(getMonthlyBreakdownInputSchema.safeParse({ by: 'category', from: '2024-09', to: '2026-09' }).success).toBe(false);
	});
});

describe('monthlyBreakdownSchema', () => {
	it('parses a response with sparse cells', () => {
		const response = {
			baseCurrency: 'BYN',
			by: 'category',
			cells: [{ month: '2026-08', referenceId: 'category-food', totalMinor: 49_316 }],
			from: '2026-08',
			to: '2026-09'
		};

		expect(monthlyBreakdownSchema.parse(response)).toEqual(response);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @i-finances/contracts test -- monthly-breakdown`
Expected: FAIL — `getMonthlyBreakdownInputSchema` is not exported.

- [ ] **Step 3: Implement the schemas**

В `packages/contracts/src/operation.ts` после `export type MonthlyTrend = ...` добавить:

```ts
export const monthKeySchema = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/, 'Укажите месяц в формате ГГГГ-ММ.');

export const MONTHLY_BREAKDOWN_MAX_MONTHS = 24;

export const breakdownDimensionSchema = z.enum(['category', 'contact']);

export type BreakdownDimension = z.infer<typeof breakdownDimensionSchema>;

function countMonthKeys(from: string, to: string): number {
	const [fromYear, fromMonth] = from.split('-').map(Number);
	const [toYear, toMonth] = to.split('-').map(Number);

	return (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
}

export const getMonthlyBreakdownInputSchema = z.object({
	by: breakdownDimensionSchema,
	from: monthKeySchema,
	to: monthKeySchema
}).refine(
	(input) => input.from <= input.to,
	{ message: 'Начальный месяц должен быть не позже конечного.', path: ['to'] }
).refine(
	(input) => input.from > input.to || countMonthKeys(input.from, input.to) <= MONTHLY_BREAKDOWN_MAX_MONTHS,
	{ message: `Период не может быть длиннее ${MONTHLY_BREAKDOWN_MAX_MONTHS} месяцев.`, path: ['to'] }
);

export type GetMonthlyBreakdownInput = z.infer<typeof getMonthlyBreakdownInputSchema>;

export const monthlyBreakdownCellSchema = z.object({
	month: monthKeySchema,
	referenceId: operationIdSchema,
	totalMinor: safeIntegerSchema
});

export type MonthlyBreakdownCell = z.infer<typeof monthlyBreakdownCellSchema>;

export const monthlyBreakdownSchema = z.object({
	baseCurrency: currencyCodeSchema,
	by: breakdownDimensionSchema,
	cells: z.array(monthlyBreakdownCellSchema),
	from: monthKeySchema,
	to: monthKeySchema
});

export type MonthlyBreakdown = z.infer<typeof monthlyBreakdownSchema>;
```

Существующие `getMonthlyExpenseSummaryInputSchema`, `monthlyExpenseSummarySchema`, `categoryStatsSchema`, `monthlyTrendPointSchema` **не трогать** в этой задаче: у первого другое сообщение об ошибке уже используется в API-тестах, рефакторинг не нужен для фичи.

В `packages/contracts/src/index.ts` в блок `from './operation'` добавить в алфавитном порядке (сортировку поправит `pnpm lint:fix`):

```ts
	type BreakdownDimension,
	breakdownDimensionSchema,
	type GetMonthlyBreakdownInput,
	getMonthlyBreakdownInputSchema,
	MONTHLY_BREAKDOWN_MAX_MONTHS,
	type MonthlyBreakdown,
	type MonthlyBreakdownCell,
	monthlyBreakdownCellSchema,
	monthlyBreakdownSchema,
	monthKeySchema,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @i-finances/contracts test && pnpm --filter @i-finances/contracts typecheck`
Expected: PASS, typecheck без ошибок.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/operation.ts packages/contracts/src/index.ts packages/contracts/tests/monthly-breakdown.test.ts
git commit -m "feat(contracts): add monthly-breakdown schemas"
```

---

### Task 2: API — репозиторий, сервис, HTTP-маршрут

**Files:**
- Modify: `apps/api/src/modules/operation/operation-repository.ts` (типы ~стр. 86–104, метод после `listMonthlyTotals` ~стр. 487)
- Modify: `apps/api/src/modules/operation/operation-service.ts` (метод после `getMonthlyTrend` ~стр. 420, хелпер рядом с `getMonthRange` ~стр. 576)
- Modify: `apps/api/src/http/operation-controller.ts` (импорт + метод после `monthlyTrend()`)
- Modify: `apps/api/src/app.ts:98`
- Test: `apps/api/tests/operation-breakdown-service.test.ts`

**Interfaces:**
- Consumes: `getMonthlyBreakdownInputSchema`, `GetMonthlyBreakdownInput`, `MonthlyBreakdown` (Task 1).
- Produces:
  - `OperationRepository.listMonthlyReferenceBreakdown(householdId: string, start: string, end: string, by: BreakdownDimension): Promise<MonthlyReferenceTotalRow[]>`, где `MonthlyReferenceTotalRow = { month: string; referenceId: string; totalMinor: number }`
  - `OperationService.getMonthlyBreakdown(userId: string, input: GetMonthlyBreakdownInput): Promise<MonthlyBreakdown>`
  - HTTP `GET /api/operations/monthly-breakdown?by=&from=&to=` → 200 `MonthlyBreakdown` | 400 | 401

- [ ] **Step 1: Write the failing tests**

Создать `apps/api/tests/operation-breakdown-service.test.ts`. Фикстуры (`beforeEach` с users/households/householdMembers/accounts/categories, `createService`, `createTransferServiceForTest`, `authenticatedSession`) **скопировать дословно** из `apps/api/tests/operation-stats-service.test.ts:1-140` и дополнить `beforeEach` второй категорией, контактом и второй household:

```ts
// дополнительно импортировать contacts из '@/infrastructure/database/schema'

	await database.insert(categories).values({
		archivedAt: null,
		color: '#be3d5e',
		createdAt: FIXED_DATE,
		createdByUserId: USER_ID,
		description: '',
		householdId: HOUSEHOLD_ID,
		id: 'category-fastfood',
		monthlyBudgetMinor: 20_000,
		name: 'Фастфуд',
		normalizedName: 'фастфуд',
		updatedAt: FIXED_DATE,
		version: 1
	});
	await database.insert(contacts).values({
		archivedAt: null,
		color: '#3f77a8',
		createdAt: FIXED_DATE,
		createdByUserId: USER_ID,
		householdId: HOUSEHOLD_ID,
		id: 'contact-evroopt',
		legalName: null,
		name: 'Евроопт',
		normalizedLegalName: null,
		normalizedName: 'евроопт',
		phone: null,
		type: 'company',
		updatedAt: FIXED_DATE,
		version: 1
	});
```

Хелпер для краткости:

```ts
function expense(overrides: {
	amountMinor: number;
	categoryId?: string | null;
	contactId?: string | null;
	happenedOn: string;
	type?: 'expense' | 'income';
}) {
	return createOperationInputSchema.parse({
		accountId: 'account-main',
		amountMinor: overrides.amountMinor,
		categoryId: overrides.categoryId ?? null,
		comment: '',
		contactId: overrides.contactId ?? null,
		happenedOn: overrides.happenedOn,
		title: 'Трата',
		type: overrides.type ?? 'expense'
	});
}
```

Тесты:

```ts
describe('OperationService monthly breakdown', () => {
	it('groups expenses by category and month inside the inclusive range', async () => {
		const service = createService();

		await service.create(USER_ID, expense({ amountMinor: 1_000, categoryId: 'category-food', happenedOn: '2026-06-30' }));
		await service.create(USER_ID, expense({ amountMinor: 2_000, categoryId: 'category-food', happenedOn: '2026-07-01' }));
		await service.create(USER_ID, expense({ amountMinor: 3_000, categoryId: 'category-food', happenedOn: '2026-07-31' }));
		await service.create(USER_ID, expense({ amountMinor: 4_000, categoryId: 'category-fastfood', happenedOn: '2026-08-15' }));
		await service.create(USER_ID, expense({ amountMinor: 5_000, categoryId: 'category-food', happenedOn: '2026-08-31' }));
		await service.create(USER_ID, expense({ amountMinor: 6_000, categoryId: 'category-food', happenedOn: '2026-09-01' }));

		const breakdown = await service.getMonthlyBreakdown(USER_ID, { by: 'category', from: '2026-07', to: '2026-08' });

		expect(breakdown).toMatchObject({ baseCurrency: 'BYN', by: 'category', from: '2026-07', to: '2026-08' });
		expect(breakdown.cells.toSorted((a, b) => `${a.referenceId}${a.month}`.localeCompare(`${b.referenceId}${b.month}`)))
			.toEqual([
				{ month: '2026-08', referenceId: 'category-fastfood', totalMinor: 4_000 },
				{ month: '2026-07', referenceId: 'category-food', totalMinor: 5_000 },
				{ month: '2026-08', referenceId: 'category-food', totalMinor: 5_000 }
			]);
	});

	it('groups by contact and ignores operations without a contact', async () => {
		const service = createService();

		await service.create(USER_ID, expense({ amountMinor: 7_000, contactId: 'contact-evroopt', happenedOn: '2026-09-02' }));
		await service.create(USER_ID, expense({ amountMinor: 9_000, categoryId: 'category-food', happenedOn: '2026-09-03' }));

		const breakdown = await service.getMonthlyBreakdown(USER_ID, { by: 'contact', from: '2026-09', to: '2026-09' });

		expect(breakdown.cells).toEqual([{ month: '2026-09', referenceId: 'contact-evroopt', totalMinor: 7_000 }]);
	});

	it('excludes income and deleted operations', async () => {
		const service = createService();

		await service.create(USER_ID, expense({ amountMinor: 100_000, categoryId: 'category-food', happenedOn: '2026-09-02', type: 'income' }));
		const deleted = await service.create(USER_ID, expense({ amountMinor: 8_000, categoryId: 'category-food', happenedOn: '2026-09-02' }));

		await service.archive(USER_ID, { id: deleted.id, version: deleted.version });

		const breakdown = await service.getMonthlyBreakdown(USER_ID, { by: 'category', from: '2026-09', to: '2026-09' });

		expect(breakdown.cells).toEqual([]);
	});

	it('excludes transfer legs even when they carry a contact', async () => {
		await database.insert(accounts).values({
			archivedAt: null,
			color: '#8899aa',
			createdAt: FIXED_DATE,
			createdByUserId: USER_ID,
			currency: 'BYN',
			description: '',
			householdId: HOUSEHOLD_ID,
			id: 'account-savings',
			initialBalanceMinor: 0,
			isColorAccentEnabled: false,
			isIncludedInFamilyTotal: true,
			name: 'Сбережения',
			type: 'savings',
			updatedAt: FIXED_DATE,
			version: 1
		});

		await createTransferServiceForTest().create(USER_ID, {
			comment: '',
			contactId: 'contact-evroopt',
			exchangeRate: '1',
			fromAccountId: 'account-savings',
			fromAmountMinor: 50_000,
			happenedOn: '2026-09-05',
			toAccountId: 'account-main'
		});

		const breakdown = await createService().getMonthlyBreakdown(USER_ID, { by: 'contact', from: '2026-09', to: '2026-09' });

		expect(breakdown.cells).toEqual([]);
	});

	it('exposes monthly-breakdown through the authenticated HTTP boundary', async () => {
		const noSessionResolver: RequestSessionResolver = { resolve: async () => undefined };
		const sessionResolver: RequestSessionResolver = { resolve: async () => authenticatedSession };
		const unauthenticatedApp = createApiApp({
			operationController: new OperationHttpController(createService(), noSessionResolver)
		});
		const app = createApiApp({
			operationController: new OperationHttpController(createService(), sessionResolver)
		});

		expect((await unauthenticatedApp.request('/api/operations/monthly-breakdown?by=category&from=2026-09&to=2026-09')).status)
			.toBe(401);
		expect((await app.request('/api/operations/monthly-breakdown?by=category&from=2026-09&to=2026-01')).status).toBe(400);
		expect((await app.request('/api/operations/monthly-breakdown?by=nope&from=2026-01&to=2026-02')).status).toBe(400);

		const response = await app.request('/api/operations/monthly-breakdown?by=category&from=2026-01&to=2026-09');

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ baseCurrency: 'BYN', by: 'category', cells: [], from: '2026-01', to: '2026-09' });
	});
});
```

Перед Step 3 проверить: сигнатура `service.archive(userId, { id, version })` и форма входа `createTransferServiceForTest().create` — сверить с `apps/api/tests/operation-stats-service.test.ts` и `packages/contracts/src/operation.ts:68` (`changeOperationDeletionStateInputSchema`). Если поля отличаются, привести тест к фактическому контракту, не меняя сам контракт.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @i-finances/api test -- operation-breakdown-service`
Expected: FAIL — `service.getMonthlyBreakdown is not a function`.

- [ ] **Step 3: Repository method**

В `operation-repository.ts` рядом с `MonthlyTotalRow`:

```ts
export type MonthlyReferenceTotalRow = {
	month: string;
	referenceId: string;
	totalMinor: number;
};
```

После `listMonthlyTotals` (импорт `BreakdownDimension` из `@i-finances/contracts` как type-only):

```ts
	public async listMonthlyReferenceBreakdown(
		householdId: string,
		start: string,
		end: string,
		by: BreakdownDimension
	): Promise<MonthlyReferenceTotalRow[]> {
		const referenceColumn = by === 'category' ? operations.categoryId : operations.contactId;
		const monthExpression = sql<string>`strftime('%Y-%m', ${operations.happenedOn})`;

		return this.database.select({
			month: monthExpression,
			referenceId: referenceColumn,
			totalMinor: sql<number>`sum(${operations.amountInHouseholdBaseCurrencyMinor})`.mapWith(Number)
		})
			.from(operations)
			.where(and(
				eq(operations.householdId, householdId),
				eq(operations.type, 'expense'),
				isNull(operations.deletedAt),
				isNull(operations.transferId),
				isNotNull(referenceColumn),
				gte(operations.happenedOn, start),
				lte(operations.happenedOn, end)
			))
			.groupBy(referenceColumn, monthExpression) as unknown as MonthlyReferenceTotalRow[];
	}
```

- [ ] **Step 4: Service method**

В `operation-service.ts` после `getMonthlyTrend` (импорты `GetMonthlyBreakdownInput`, `MonthlyBreakdown` — type-only из `@i-finances/contracts`):

```ts
	public async getMonthlyBreakdown(
		userId: string,
		input: GetMonthlyBreakdownInput
	): Promise<MonthlyBreakdown> {
		const household = await this.dependencies.householdResolver.requireForUser(userId);
		const rows = await this.dependencies.operationRepository.listMonthlyReferenceBreakdown(
			household.id,
			getMonthRange(input.from).start,
			getMonthRange(input.to).end,
			input.by
		);

		return {
			baseCurrency: household.baseCurrency,
			by: input.by,
			cells: rows.map((row) => ({
				month: row.month,
				referenceId: row.referenceId,
				totalMinor: row.totalMinor
			})),
			from: input.from,
			to: input.to
		};
	}
```

Если у `OperationService` есть интерфейс зависимостей с явным списком методов репозитория (`dependencies.operationRepository` типизирован через `Pick<OperationRepository, ...>` или интерфейс) — добавить туда `listMonthlyReferenceBreakdown`.

- [ ] **Step 5: Controller + route**

В `operation-controller.ts` добавить `getMonthlyBreakdownInputSchema` в импорт из `@i-finances/contracts` и метод после `monthlyTrend()`:

```ts
	public monthlyBreakdown() {
		return async (context: Context<ApiEnvironment>): Promise<Response> => {
			const session = await this.requireSession(context);

			if (session === undefined) {
				return this.unauthenticated(context);
			}

			const parsedInput = getMonthlyBreakdownInputSchema.safeParse({
				by: context.req.query('by'),
				from: context.req.query('from'),
				to: context.req.query('to')
			});

			if (!parsedInput.success) {
				return this.invalidInput(context, parsedInput.error);
			}

			try {
				return context.json(
					await this.operationService.getMonthlyBreakdown(session.user.id, parsedInput.data),
					200
				);
			}
			catch (error: unknown) {
				return this.domainFailure(context, error);
			}
		};
	}
```

В `apps/api/src/app.ts` после строки `monthly-trend`:

```ts
		app.get('/api/operations/monthly-breakdown', operationController.monthlyBreakdown());
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @i-finances/api test && pnpm --filter @i-finances/api typecheck`
Expected: весь набор API зелёный, включая старый `operation-stats-service.test.ts`.

- [ ] **Step 7: Verify migrations untouched**

Run: `git status --short apps/api/drizzle`
Expected: пустой вывод.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src apps/api/tests/operation-breakdown-service.test.ts
git commit -m "feat(api): add monthly-breakdown endpoint by category or contact"
```

---

### Task 3: Web — клиент и query

**Files:**
- Modify: `apps/web/src/features/operations/api/operation-client.ts` (после `monthlyTrend()` ~стр. 101)
- Modify: `apps/web/src/entities/operation/model/types.ts` (после `MonthlyTrend`)
- Modify: `apps/web/src/entities/operation/index.ts` (блок `export type {...} from './model/types'`)
- Modify: `apps/web/src/entities/operation/api/operation.client.ts` (после `getMonthlyTrend`)
- Modify: `apps/web/src/entities/operation/api/index.ts`
- Test: `apps/web/tests/operation-client.test.ts`

**Interfaces:**
- Consumes: `getMonthlyBreakdownInputSchema`, `monthlyBreakdownSchema`, `GetMonthlyBreakdownInput` (Task 1).
- Produces:
  - `OperationClient.monthlyBreakdown(input: GetMonthlyBreakdownInput): Promise<MonthlyBreakdown>`
  - `getMonthlyBreakdown` — Solid `query` с ключом `'monthly-breakdown'`
  - Типы `MonthlyBreakdown`, `MonthlyBreakdownCell`, `BreakdownDimension` из `@/entities/operation`

- [ ] **Step 1: Write the failing test**

Добавить в конец `describe` в `apps/web/tests/operation-client.test.ts`:

```ts
	it('loads the monthly breakdown through the feature API client', async () => {
		const fetcher: typeof globalThis.fetch = async (input) => {
			expect(input).toBe('/api/operations/monthly-breakdown?by=contact&from=2026-01&to=2026-09');

			return new Response(JSON.stringify({
				baseCurrency: 'BYN',
				by: 'contact',
				cells: [{ month: '2026-08', referenceId: 'contact-evroopt', totalMinor: 20_360 }],
				from: '2026-01',
				to: '2026-09'
			}), {
				headers: { 'content-type': 'application/json' },
				status: 200
			});
		};
		const client = new OperationClient({ fetcher });

		await expect(client.monthlyBreakdown({ by: 'contact', from: '2026-01', to: '2026-09' })).resolves.toEqual({
			baseCurrency: 'BYN',
			by: 'contact',
			cells: [{ month: '2026-08', referenceId: 'contact-evroopt', totalMinor: 20_360 }],
			from: '2026-01',
			to: '2026-09'
		});
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @i-finances/web test -- operation-client`
Expected: FAIL — `client.monthlyBreakdown is not a function`.

- [ ] **Step 3: Implement**

`operation-client.ts` — импортировать `GetMonthlyBreakdownInput` (type) и `getMonthlyBreakdownInputSchema`, `monthlyBreakdownSchema`, затем:

```ts
	public monthlyBreakdown(input: GetMonthlyBreakdownInput) {
		const parsedInput = getMonthlyBreakdownInputSchema.parse(input);
		const query = new URLSearchParams({ by: parsedInput.by, from: parsedInput.from, to: parsedInput.to });

		return this.client.get(
			`/api/operations/monthly-breakdown?${query.toString()}`,
			monthlyBreakdownSchema
		);
	}
```

`entities/operation/model/types.ts`:

```ts
export type BreakdownDimension = 'category' | 'contact';

export type MonthlyBreakdownCell = {
	month: string;
	referenceId: string;
	totalMinor: number;
};

export type MonthlyBreakdown = {
	baseCurrency: CurrencyCodeValue;
	by: BreakdownDimension;
	cells: MonthlyBreakdownCell[];
	from: string;
	to: string;
};
```

`entities/operation/index.ts` — добавить `BreakdownDimension`, `MonthlyBreakdown`, `MonthlyBreakdownCell` в `export type {...} from './model/types'`.

`entities/operation/api/operation.client.ts`:

```ts
export const getMonthlyBreakdown = query(
	(input: GetMonthlyBreakdownInput) => client.monthlyBreakdown(input),
	'monthly-breakdown'
);
```

(`GetMonthlyBreakdownInput` — type-import из `@i-finances/contracts`.) Экспортировать `getMonthlyBreakdown` из `entities/operation/api/index.ts` и из `entities/operation/index.ts` — там же, откуда сейчас экспортируются `getCategoryStats`/`getMonthlyTrend` (проверить `grep -n getMonthlyTrend apps/web/src/entities/operation/index.ts`).

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @i-finances/web test -- operation-client && pnpm --filter @i-finances/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/operations/api apps/web/src/entities/operation apps/web/tests/operation-client.test.ts
git commit -m "feat(web): add monthly-breakdown client and query"
```

---

### Task 4: Месяцы и пресеты периода

**Files:**
- Create: `apps/web/src/views/statistics/lib/month-keys.ts`
- Create: `apps/web/src/views/statistics/lib/period-presets.ts`
- Test: `apps/web/tests/statistics-month-keys.test.ts`, `apps/web/tests/statistics-period-presets.test.ts`

**Interfaces:**
- Produces:
  - `addMonths(monthKey: string, delta: number): string`
  - `listMonthKeys(from: string, to: string): string[]` (включительно, хронологически)
  - `countMonths(from: string, to: string): number`
  - `type PeriodPreset = '3' | '6' | '12' | 'ytd'`
  - `PERIOD_PRESETS: readonly { id: PeriodPreset; label: string }[]`
  - `resolvePeriodPreset(preset: PeriodPreset, currentMonth: string, earliestMonth: string): { from: string; to: string }`
  - `isPresetActive(preset: PeriodPreset, range: { from: string; to: string }, currentMonth: string, earliestMonth: string): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/tests/statistics-month-keys.test.ts
import { addMonths, countMonths, listMonthKeys } from '@/views/statistics/lib/month-keys';

import { describe, expect, it } from 'vitest';

describe('month keys', () => {
	it('adds months across year boundaries', () => {
		expect(addMonths('2026-01', -1)).toBe('2025-12');
		expect(addMonths('2025-11', 3)).toBe('2026-02');
		expect(addMonths('2026-09', 0)).toBe('2026-09');
	});

	it('lists months inclusively in chronological order', () => {
		expect(listMonthKeys('2025-11', '2026-02')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
		expect(listMonthKeys('2026-09', '2026-09')).toEqual(['2026-09']);
		expect(listMonthKeys('2026-09', '2026-01')).toEqual([]);
	});

	it('counts months inclusively', () => {
		expect(countMonths('2024-10', '2026-09')).toBe(24);
		expect(countMonths('2026-09', '2026-09')).toBe(1);
	});
});
```

```ts
// apps/web/tests/statistics-period-presets.test.ts
import { isPresetActive, resolvePeriodPreset } from '@/views/statistics/lib/period-presets';

import { describe, expect, it } from 'vitest';

const CURRENT = '2026-09';
const EARLIEST = '2025-01';

describe('resolvePeriodPreset', () => {
	it('resolves the last N months including the current one', () => {
		expect(resolvePeriodPreset('3', CURRENT, EARLIEST)).toEqual({ from: '2026-07', to: '2026-09' });
		expect(resolvePeriodPreset('12', CURRENT, EARLIEST)).toEqual({ from: '2025-10', to: '2026-09' });
	});

	it('resolves year-to-date', () => {
		expect(resolvePeriodPreset('ytd', CURRENT, EARLIEST)).toEqual({ from: '2026-01', to: '2026-09' });
	});

	it('never starts before the earliest month with data', () => {
		expect(resolvePeriodPreset('12', CURRENT, '2026-01')).toEqual({ from: '2026-01', to: '2026-09' });
	});
});

describe('isPresetActive', () => {
	it('matches the preset that produced the range', () => {
		expect(isPresetActive('6', { from: '2026-04', to: '2026-09' }, CURRENT, EARLIEST)).toBe(true);
		expect(isPresetActive('3', { from: '2026-04', to: '2026-09' }, CURRENT, EARLIEST)).toBe(false);
		expect(isPresetActive('ytd', { from: '2026-01', to: '2026-09' }, CURRENT, EARLIEST)).toBe(true);
	});

	it('is inactive when the range does not end in the current month', () => {
		expect(isPresetActive('3', { from: '2026-06', to: '2026-08' }, CURRENT, EARLIEST)).toBe(false);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @i-finances/web test -- statistics-month-keys statistics-period-presets`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```ts
// apps/web/src/views/statistics/lib/month-keys.ts
function toParts(monthKey: string): [number, number] {
	const [year, month] = monthKey.split('-').map(Number);

	return [year, month];
}

function fromIndex(index: number): string {
	const year = Math.floor(index / 12);
	const month = (index % 12) + 1;

	return `${year}-${String(month).padStart(2, '0')}`;
}

function toIndex(monthKey: string): number {
	const [year, month] = toParts(monthKey);

	return year * 12 + (month - 1);
}

export function addMonths(monthKey: string, delta: number): string {
	return fromIndex(toIndex(monthKey) + delta);
}

export function countMonths(from: string, to: string): number {
	return toIndex(to) - toIndex(from) + 1;
}

export function listMonthKeys(from: string, to: string): string[] {
	const length = countMonths(from, to);

	return length > 0 ? Array.from({ length }, (_, offset) => addMonths(from, offset)) : [];
}
```

```ts
// apps/web/src/views/statistics/lib/period-presets.ts
import { addMonths } from './month-keys';

export type PeriodPreset = '3' | '6' | '12' | 'ytd';

export type MonthRange = {
	from: string;
	to: string;
};

export const PERIOD_PRESETS: readonly { id: PeriodPreset; label: string }[] = [
	{ id: '3', label: '3 мес' },
	{ id: '6', label: '6 мес' },
	{ id: '12', label: '12 мес' },
	{ id: 'ytd', label: 'С начала года' }
];

export function resolvePeriodPreset(preset: PeriodPreset, currentMonth: string, earliestMonth: string): MonthRange {
	const from = preset === 'ytd'
		? `${currentMonth.slice(0, 4)}-01`
		: addMonths(currentMonth, -(Number(preset) - 1));

	return { from: from < earliestMonth ? earliestMonth : from, to: currentMonth };
}

export function isPresetActive(preset: PeriodPreset, range: MonthRange, currentMonth: string, earliestMonth: string): boolean {
	const resolved = resolvePeriodPreset(preset, currentMonth, earliestMonth);

	return resolved.from === range.from && resolved.to === range.to;
}
```

Примечание: при клампе к `earliestMonth` несколько пресетов могут совпасть с одним диапазоном и подсветиться одновременно — это ожидаемо.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @i-finances/web test -- statistics-month-keys statistics-period-presets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/views/statistics/lib/month-keys.ts apps/web/src/views/statistics/lib/period-presets.ts apps/web/tests/statistics-month-keys.test.ts apps/web/tests/statistics-period-presets.test.ts
git commit -m "feat(web): add month-key helpers and period presets for statistics"
```

---

### Task 5: Матрица, свёртка в «Остальные», слоты цветов

**Files:**
- Create: `apps/web/src/views/statistics/lib/series-slots.ts`
- Create: `apps/web/src/views/statistics/lib/build-breakdown-matrix.ts`
- Test: `apps/web/tests/statistics-series-slots.test.ts`, `apps/web/tests/statistics-breakdown-matrix.test.ts`

**Interfaces:**
- Consumes: `listMonthKeys` (Task 4), `MonthlyBreakdownCell` (Task 3).
- Produces:
  - `SERIES_SLOT_COUNT = 8`
  - `type SeriesSlotMap = Record<string, number>`
  - `assignSeriesSlots(chartedIds: readonly string[], previous: SeriesSlotMap): SeriesSlotMap`
  - `OTHER_SERIES_ID = '__other__'`
  - `type BreakdownReference = { budgetMinor: number | null; id: string; isArchived: boolean; name: string }`
  - `type BreakdownRow = { avgMinor: number | null; budgetMinor: number | null; id: string; isArchived: boolean; name: string; totalMinor: number; values: number[] }`
  - `type BreakdownSeries = { id: string; label: string; values: number[] }`
  - `type BreakdownMatrix = { avgMinor: number | null; colTotals: number[]; folded: BreakdownRow[]; hiddenZeroCount: number; months: string[]; rows: BreakdownRow[]; series: BreakdownSeries[]; totalMinor: number }`
  - `buildBreakdownMatrix(input: { cells: readonly MonthlyBreakdownCell[]; currentMonth: string; from: string; references: readonly BreakdownReference[]; selectedIds: readonly string[]; to: string }): BreakdownMatrix`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/tests/statistics-series-slots.test.ts
import { assignSeriesSlots } from '@/views/statistics/lib/series-slots';

import { describe, expect, it } from 'vitest';

describe('assignSeriesSlots', () => {
	it('gives new series the lowest free slot', () => {
		expect(assignSeriesSlots(['a', 'b', 'c'], {})).toEqual({ a: 0, b: 1, c: 2 });
	});

	it('keeps an existing series on its slot when others leave', () => {
		const first = assignSeriesSlots(['a', 'b', 'c'], {});

		expect(assignSeriesSlots(['a', 'c'], first)).toEqual({ a: 0, c: 2 });
	});

	it('reuses a freed slot for a newcomer without repainting survivors', () => {
		expect(assignSeriesSlots(['a', 'c', 'd'], { a: 0, c: 2 })).toEqual({ a: 0, c: 2, d: 1 });
	});
});
```

```ts
// apps/web/tests/statistics-breakdown-matrix.test.ts
import { buildBreakdownMatrix, type BreakdownReference, OTHER_SERIES_ID } from '@/views/statistics/lib/build-breakdown-matrix';

import { describe, expect, it } from 'vitest';

function reference(id: string, budgetMinor: number | null = null): BreakdownReference {
	return { budgetMinor, id, isArchived: false, name: id };
}

describe('buildBreakdownMatrix', () => {
	it('builds rows per month, sorted by total, with column totals', () => {
		const matrix = buildBreakdownMatrix({
			cells: [
				{ month: '2026-07', referenceId: 'food', totalMinor: 10_000 },
				{ month: '2026-08', referenceId: 'food', totalMinor: 20_000 },
				{ month: '2026-08', referenceId: 'sweets', totalMinor: 50_000 }
			],
			currentMonth: '2026-09',
			from: '2026-07',
			references: [reference('food', 15_000), reference('sweets')],
			selectedIds: ['food', 'sweets'],
			to: '2026-09'
		});

		expect(matrix.months).toEqual(['2026-07', '2026-08', '2026-09']);
		expect(matrix.rows.map((row) => row.id)).toEqual(['sweets', 'food']);
		expect(matrix.rows[1]).toMatchObject({ budgetMinor: 15_000, totalMinor: 30_000, values: [10_000, 20_000, 0] });
		expect(matrix.colTotals).toEqual([10_000, 70_000, 0]);
		expect(matrix.totalMinor).toBe(80_000);
	});

	it('averages over closed months only, excluding the current month', () => {
		const matrix = buildBreakdownMatrix({
			cells: [
				{ month: '2026-07', referenceId: 'food', totalMinor: 10_000 },
				{ month: '2026-08', referenceId: 'food', totalMinor: 30_000 },
				{ month: '2026-09', referenceId: 'food', totalMinor: 1_000 }
			],
			currentMonth: '2026-09',
			from: '2026-07',
			references: [reference('food')],
			selectedIds: ['food'],
			to: '2026-09'
		});

		expect(matrix.rows[0].avgMinor).toBe(20_000);
		expect(matrix.avgMinor).toBe(20_000);
	});

	it('returns null averages when the range holds only the current month', () => {
		const matrix = buildBreakdownMatrix({
			cells: [{ month: '2026-09', referenceId: 'food', totalMinor: 1_000 }],
			currentMonth: '2026-09',
			from: '2026-09',
			references: [reference('food')],
			selectedIds: ['food'],
			to: '2026-09'
		});

		expect(matrix.rows[0].avgMinor).toBeNull();
		expect(matrix.avgMinor).toBeNull();
	});

	it('hides selected rows with no spending and counts them', () => {
		const matrix = buildBreakdownMatrix({
			cells: [{ month: '2026-08', referenceId: 'food', totalMinor: 1_000 }],
			currentMonth: '2026-09',
			from: '2026-08',
			references: [reference('food'), reference('taxes')],
			selectedIds: ['food', 'taxes'],
			to: '2026-09'
		});

		expect(matrix.rows.map((row) => row.id)).toEqual(['food']);
		expect(matrix.hiddenZeroCount).toBe(1);
	});

	it('ignores cells of unselected references and unknown ids', () => {
		const matrix = buildBreakdownMatrix({
			cells: [
				{ month: '2026-08', referenceId: 'food', totalMinor: 1_000 },
				{ month: '2026-08', referenceId: 'sweets', totalMinor: 9_000 }
			],
			currentMonth: '2026-09',
			from: '2026-08',
			references: [reference('food'), reference('sweets')],
			selectedIds: ['food', 'deleted-category'],
			to: '2026-09'
		});

		expect(matrix.rows.map((row) => row.id)).toEqual(['food']);
		expect(matrix.totalMinor).toBe(1_000);
	});

	it('charts up to 8 rows as-is and folds the tail beyond 7 into «Остальные»', () => {
		const ids = Array.from({ length: 10 }, (_, index) => `r${index}`);
		const matrix = buildBreakdownMatrix({
			cells: ids.map((id, index) => ({ month: '2026-08', referenceId: id, totalMinor: (10 - index) * 1_000 })),
			currentMonth: '2026-09',
			from: '2026-08',
			references: ids.map((id) => reference(id)),
			selectedIds: ids,
			to: '2026-08'
		});

		expect(matrix.series).toHaveLength(8);
		expect(matrix.series.slice(0, 7).map((series) => series.id)).toEqual(ids.slice(0, 7));
		expect(matrix.series[7]).toEqual({ id: OTHER_SERIES_ID, label: 'Остальные (3)', values: [6_000] });
		expect(matrix.folded.map((row) => row.id)).toEqual(['r7', 'r8', 'r9']);
		expect(matrix.colTotals).toEqual([55_000]);
	});

	it('does not fold when exactly 8 rows are selected', () => {
		const ids = Array.from({ length: 8 }, (_, index) => `r${index}`);
		const matrix = buildBreakdownMatrix({
			cells: ids.map((id) => ({ month: '2026-08', referenceId: id, totalMinor: 1_000 })),
			currentMonth: '2026-09',
			from: '2026-08',
			references: ids.map((id) => reference(id)),
			selectedIds: ids,
			to: '2026-08'
		});

		expect(matrix.series).toHaveLength(8);
		expect(matrix.folded).toEqual([]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @i-finances/web test -- statistics-series-slots statistics-breakdown-matrix`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `series-slots.ts`**

```ts
// apps/web/src/views/statistics/lib/series-slots.ts
export const SERIES_SLOT_COUNT = 8;

export type SeriesSlotMap = Record<string, number>;

/**
 * Keeps each charted series on the colour slot it already had, so a filter
 * change never repaints the survivors; newcomers take the lowest free slot.
 */
export function assignSeriesSlots(chartedIds: readonly string[], previous: SeriesSlotMap): SeriesSlotMap {
	const next: SeriesSlotMap = {};

	for (const id of chartedIds) {
		if (previous[id] !== undefined) {
			next[id] = previous[id];
		}
	}

	for (const id of chartedIds) {
		if (next[id] !== undefined) {
			continue;
		}

		const used = new Set(Object.values(next));
		const free = Array.from({ length: SERIES_SLOT_COUNT }, (_, slot) => slot).find((slot) => !used.has(slot));

		if (free !== undefined) {
			next[id] = free;
		}
	}

	return next;
}
```

- [ ] **Step 4: Implement `build-breakdown-matrix.ts`**

```ts
// apps/web/src/views/statistics/lib/build-breakdown-matrix.ts
import type { MonthlyBreakdownCell } from '@/entities/operation';

import { listMonthKeys } from './month-keys';
import { SERIES_SLOT_COUNT } from './series-slots';

export const OTHER_SERIES_ID = '__other__';

export type BreakdownReference = {
	budgetMinor: number | null;
	id: string;
	isArchived: boolean;
	name: string;
};

export type BreakdownRow = BreakdownReference & {
	avgMinor: number | null;
	totalMinor: number;
	values: number[];
};

export type BreakdownSeries = {
	id: string;
	label: string;
	values: number[];
};

export type BreakdownMatrix = {
	avgMinor: number | null;
	colTotals: number[];
	folded: BreakdownRow[];
	hiddenZeroCount: number;
	months: string[];
	rows: BreakdownRow[];
	series: BreakdownSeries[];
	totalMinor: number;
};

export type BuildBreakdownMatrixInput = {
	cells: readonly MonthlyBreakdownCell[];
	currentMonth: string;
	from: string;
	references: readonly BreakdownReference[];
	selectedIds: readonly string[];
	to: string;
};

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

function averageOverClosedMonths(values: readonly number[], months: readonly string[], currentMonth: string): number | null {
	const closed = values.filter((_, index) => months[index] < currentMonth);

	return closed.length > 0 ? Math.round(sum(closed) / closed.length) : null;
}

export function buildBreakdownMatrix(input: BuildBreakdownMatrixInput): BreakdownMatrix {
	const months = listMonthKeys(input.from, input.to);
	const monthIndex = new Map(months.map((month, index) => [month, index]));
	const referencesById = new Map(input.references.map((reference) => [reference.id, reference]));
	const valuesById = new Map<string, number[]>();

	for (const cell of input.cells) {
		const index = monthIndex.get(cell.month);

		if (index === undefined) {
			continue;
		}

		const values = valuesById.get(cell.referenceId) ?? months.map(() => 0);

		values[index] += cell.totalMinor;
		valuesById.set(cell.referenceId, values);
	}

	const selectedRows = input.selectedIds.flatMap((id) => {
		const reference = referencesById.get(id);

		if (reference === undefined) {
			return [];
		}

		const values = valuesById.get(id) ?? months.map(() => 0);

		return [{
			...reference,
			avgMinor: averageOverClosedMonths(values, months, input.currentMonth),
			totalMinor: sum(values),
			values
		}];
	});
	const rows = selectedRows
		.filter((row) => row.totalMinor > 0)
		.toSorted((left, right) => right.totalMinor - left.totalMinor);
	const charted = rows.length <= SERIES_SLOT_COUNT ? rows : rows.slice(0, SERIES_SLOT_COUNT - 1);
	const folded = rows.slice(charted.length);
	const series: BreakdownSeries[] = charted.map((row) => ({ id: row.id, label: row.name, values: row.values }));

	if (folded.length > 0) {
		series.push({
			id: OTHER_SERIES_ID,
			label: `Остальные (${folded.length})`,
			values: months.map((_, index) => sum(folded.map((row) => row.values[index])))
		});
	}

	const colTotals = months.map((_, index) => sum(rows.map((row) => row.values[index])));

	return {
		avgMinor: averageOverClosedMonths(colTotals, months, input.currentMonth),
		colTotals,
		folded,
		hiddenZeroCount: selectedRows.length - rows.length,
		months,
		rows,
		series,
		totalMinor: sum(colTotals)
	};
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @i-finances/web test -- statistics-series-slots statistics-breakdown-matrix`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/views/statistics/lib/series-slots.ts apps/web/src/views/statistics/lib/build-breakdown-matrix.ts apps/web/tests/statistics-series-slots.test.ts apps/web/tests/statistics-breakdown-matrix.test.ts
git commit -m "feat(web): build the spending comparison matrix with stable series colours"
```

---

### Task 6: Выбор, «Все», URL и localStorage

**Files:**
- Create: `apps/web/src/views/statistics/lib/selection.ts`
- Create: `apps/web/src/views/statistics/lib/selection-storage.ts`
- Create: `apps/web/src/views/statistics/model/statistics-search-params.ts`
- Test: `apps/web/tests/statistics-selection.test.ts`, `apps/web/tests/statistics-search-params.test.ts`

**Interfaces:**
- Consumes: `SeriesSlotMap` (Task 5), `BreakdownDimension` (Task 3).
- Produces:
  - `isAllSelected(selected: readonly string[], allIds: readonly string[]): boolean`
  - `toggleAll(selected: readonly string[], allIds: readonly string[]): string[]`
  - `toggleOne(selected: readonly string[], id: string): string[]`
  - `sanitizeSelection(ids: readonly string[], allIds: readonly string[]): string[]`
  - `SELECT_ALL_TOKEN = 'all'`
  - `decodeSelectionParam(raw: string | undefined, allIds: readonly string[]): string[] | undefined`
  - `encodeSelectionParam(selected: readonly string[], allIds: readonly string[]): string | undefined`
  - `readStoredComparison(storage: Pick<Storage, 'getItem'>, by: BreakdownDimension): { ids: string[]; slots: SeriesSlotMap }`
  - `writeStoredComparison(storage: Pick<Storage, 'setItem'>, by: BreakdownDimension, value: { ids: readonly string[]; slots: SeriesSlotMap }): void`
  - `statisticsSearchParamsSchema` с полями `tab`, `by`, `from`, `to`, `ids` (все optional); `type StatisticsSearchParams`

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/tests/statistics-selection.test.ts
import {
	decodeSelectionParam,
	encodeSelectionParam,
	isAllSelected,
	sanitizeSelection,
	toggleAll,
	toggleOne
} from '@/views/statistics/lib/selection';
import { readStoredComparison, writeStoredComparison } from '@/views/statistics/lib/selection-storage';

import { describe, expect, it } from 'vitest';

const ALL = ['a', 'b', 'c'];

describe('«Все» selection', () => {
	it('selects everything from an empty or partial selection', () => {
		expect(toggleAll([], ALL)).toEqual(ALL);
		expect(toggleAll(['b'], ALL)).toEqual(ALL);
	});

	it('clears everything when all are selected', () => {
		expect(toggleAll(['c', 'a', 'b'], ALL)).toEqual([]);
	});

	it('derives «Все» from the selection: last item turns it on, removing one turns it off', () => {
		const almost = ['a', 'b'];

		expect(isAllSelected(almost, ALL)).toBe(false);
		expect(isAllSelected(toggleOne(almost, 'c'), ALL)).toBe(true);
		expect(isAllSelected(toggleOne(ALL, 'b'), ALL)).toBe(false);
	});

	it('is not «all» for an empty list of entities', () => {
		expect(isAllSelected([], [])).toBe(false);
	});
});

describe('selection param', () => {
	it('encodes a full selection as «all» and a partial one as ids', () => {
		expect(encodeSelectionParam(['c', 'a', 'b'], ALL)).toBe('all');
		expect(encodeSelectionParam(['a', 'c'], ALL)).toBe('a,c');
		expect(encodeSelectionParam([], ALL)).toBeUndefined();
	});

	it('decodes «all», drops unknown ids and treats absence as undefined', () => {
		expect(decodeSelectionParam('all', ALL)).toEqual(ALL);
		expect(decodeSelectionParam('a,zzz,c', ALL)).toEqual(['a', 'c']);
		expect(decodeSelectionParam(undefined, ALL)).toBeUndefined();
	});

	it('sanitizes against the current entity list and removes duplicates', () => {
		expect(sanitizeSelection(['a', 'a', 'x'], ALL)).toEqual(['a']);
	});
});

describe('selection storage', () => {
	it('round-trips ids and slots per dimension', () => {
		const data = new Map<string, string>();
		const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };

		writeStoredComparison(storage, 'contact', { ids: ['a'], slots: { a: 3 } });

		expect(readStoredComparison(storage, 'contact')).toEqual({ ids: ['a'], slots: { a: 3 } });
		expect(readStoredComparison(storage, 'category')).toEqual({ ids: [], slots: {} });
	});

	it('survives garbage and throwing storage', () => {
		expect(readStoredComparison({ getItem: () => '{not json' }, 'category')).toEqual({ ids: [], slots: {} });
		expect(readStoredComparison({ getItem: () => { throw new Error('blocked'); } }, 'category')).toEqual({ ids: [], slots: {} });
		expect(() => writeStoredComparison({ setItem: () => { throw new Error('quota'); } }, 'category', { ids: [], slots: {} }))
			.not.toThrow();
	});
});
```

```ts
// apps/web/tests/statistics-search-params.test.ts
import { parseRouteSearchParams } from '@/shared/lib/search-params';

import { statisticsSearchParamsSchema } from '@/views/statistics/model/statistics-search-params';

import { describe, expect, it } from 'vitest';

describe('statisticsSearchParamsSchema', () => {
	it('parses a full compare state', () => {
		expect(parseRouteSearchParams(statisticsSearchParamsSchema, {
			by: 'contact',
			from: '2026-01',
			ids: 'all',
			tab: 'compare',
			to: '2026-09'
		})).toEqual({ by: 'contact', from: '2026-01', ids: 'all', tab: 'compare', to: '2026-09' });
	});

	it('drops invalid values without throwing', () => {
		expect(parseRouteSearchParams(statisticsSearchParamsSchema, {
			by: 'account',
			from: '2026-13',
			tab: 'nope',
			to: 'soon'
		})).toEqual({ by: undefined, from: undefined, ids: undefined, tab: undefined, to: undefined });
	});
});
```

Перед Step 3 открыть `apps/web/src/shared/lib/search-params/parse.ts` и `apps/web/tests/home-search-params.test.ts`: если `parseRouteSearchParams` опускает `undefined`-ключи, а не возвращает их, поправить ожидание во втором тесте под фактическое поведение (как в `home-search-params.test.ts`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @i-finances/web test -- statistics-selection statistics-search-params`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `selection.ts`**

```ts
// apps/web/src/views/statistics/lib/selection.ts
export const SELECT_ALL_TOKEN = 'all';

export function sanitizeSelection(ids: readonly string[], allIds: readonly string[]): string[] {
	const known = new Set(allIds);

	return [...new Set(ids)].filter((id) => known.has(id));
}

export function isAllSelected(selected: readonly string[], allIds: readonly string[]): boolean {
	if (allIds.length === 0) {
		return false;
	}

	const chosen = new Set(selected);

	return allIds.every((id) => chosen.has(id));
}

/**
 * «Все» toggles between «everything» and «nothing»; its checked state is
 * always derived from the selection, never stored.
 */
export function toggleAll(selected: readonly string[], allIds: readonly string[]): string[] {
	return isAllSelected(selected, allIds) ? [] : [...allIds];
}

export function toggleOne(selected: readonly string[], id: string): string[] {
	return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
}

export function encodeSelectionParam(selected: readonly string[], allIds: readonly string[]): string | undefined {
	if (selected.length === 0) {
		return undefined;
	}

	return isAllSelected(selected, allIds) ? SELECT_ALL_TOKEN : selected.join(',');
}

export function decodeSelectionParam(raw: string | undefined, allIds: readonly string[]): string[] | undefined {
	if (raw === undefined) {
		return undefined;
	}

	return raw === SELECT_ALL_TOKEN ? [...allIds] : sanitizeSelection(raw.split(','), allIds);
}
```

- [ ] **Step 4: Implement `selection-storage.ts`**

```ts
// apps/web/src/views/statistics/lib/selection-storage.ts
import type { BreakdownDimension } from '@/entities/operation';

import type { SeriesSlotMap } from './series-slots';

export type StoredComparison = {
	ids: string[];
	slots: SeriesSlotMap;
};

const EMPTY: StoredComparison = { ids: [], slots: {} };

function storageKey(by: BreakdownDimension): string {
	return `i-finances:statistics-compare:${by}`;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isSlotMap(value: unknown): value is SeriesSlotMap {
	return typeof value === 'object' && value !== null
		&& Object.values(value).every((slot) => Number.isInteger(slot));
}

export function readStoredComparison(storage: Pick<Storage, 'getItem'>, by: BreakdownDimension): StoredComparison {
	try {
		const parsed: unknown = JSON.parse(storage.getItem(storageKey(by)) ?? 'null');

		if (typeof parsed !== 'object' || parsed === null) {
			return EMPTY;
		}

		const { ids, slots } = parsed as { ids?: unknown; slots?: unknown };

		return {
			ids: isStringArray(ids) ? ids : [],
			slots: isSlotMap(slots) ? slots : {}
		};
	}
	catch {
		return EMPTY;
	}
}

export function writeStoredComparison(
	storage: Pick<Storage, 'setItem'>,
	by: BreakdownDimension,
	value: { ids: readonly string[]; slots: SeriesSlotMap }
): void {
	try {
		storage.setItem(storageKey(by), JSON.stringify(value));
	}
	catch {
		// Storage can be unavailable (private mode, quota); the page works without it.
	}
}
```

- [ ] **Step 5: Implement `statistics-search-params.ts`**

```ts
// apps/web/src/views/statistics/model/statistics-search-params.ts
import { z } from 'zod';

const monthKey = z.string().trim().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/);

/**
 * Statistics page search state. Every field is optional and invalid values
 * fall back to absent, so a hand-edited URL never breaks the page.
 */
export const statisticsSearchParamsSchema = z.object({
	by: z.enum(['category', 'contact']).optional().catch(undefined),
	from: monthKey.optional().catch(undefined),
	ids: z.string().trim().min(1).max(8000).optional().catch(undefined),
	tab: z.enum(['overview', 'compare']).optional().catch(undefined),
	to: monthKey.optional().catch(undefined)
});

export type StatisticsSearchParams = z.infer<typeof statisticsSearchParamsSchema>;
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @i-finances/web test -- statistics-selection statistics-search-params`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/views/statistics/lib/selection.ts apps/web/src/views/statistics/lib/selection-storage.ts apps/web/src/views/statistics/model apps/web/tests/statistics-selection.test.ts apps/web/tests/statistics-search-params.test.ts
git commit -m "feat(web): add comparison selection, «Все» toggle and URL state"
```

---

### Task 7: Мультиселект с «Все» и поиском

**Files:**
- Create: `apps/web/src/views/statistics/ui/reference-multiselect/reference-multiselect.tsx`
- Create: `apps/web/src/views/statistics/ui/reference-multiselect/reference-multiselect.module.scss`

**Interfaces:**
- Consumes: `isAllSelected`, `toggleAll`, `toggleOne` (Task 6).
- Produces: компонент

```ts
export type ReferenceOption = {
	id: string;
	isArchived: boolean;
	name: string;
	periodTotalMinor: number;
};

export type ReferenceMultiselectProps = {
	colorOf: (id: string) => string;     // литеральный цвет для точки в чипе
	formatAmount: (minor: number) => string; // сумма за период рядом с пунктом
	noun: 'category' | 'contact';
	onChange: (ids: string[]) => void;
	options: readonly ReferenceOption[]; // уже отсортированы по periodTotalMinor desc
	selectedIds: readonly string[];
};
export function ReferenceMultiselect(props: ReferenceMultiselectProps): JSX.Element
```

Поведение (из спека, проверено на макете):
- Кнопка-триггер: `Категории: 4 ▾` / `Контакты: не выбраны ▾`.
- Поповер: поле поиска, список чекбоксов, подвал «выбрано X из N» + «Очистить».
- Первый пункт «Все»: `checked = isAllSelected`, `indeterminate = selected.length > 0 && !all`; `onChange(toggleAll(...))`. Пока `query.trim() !== ''`, пункт «Все» не рендерится.
- Пункт: имя, пометка «архив» при `isArchived`, справа сумма за период через `props.formatAmount`, `—` при нуле.
- Чипы под панелью: если выбрано всё — один чип «Все категории (N)» / «Все контакты (N)» с ×; иначе первые 8 чипов с точкой `colorOf(id)` и × + кнопка-чип «+ ещё N», которая открывает поповер.
- Закрытие: `pointerdown` на `document` вне корня компонента **и вне чипов**, `Escape`. Не `click` (перерисовка списка отсоединяет цель — баг, пойманный на макете).
- `indeterminate` выставляется через ref в `createEffect`, т.к. это не атрибут.
- Доступность: триггер `aria-haspopup="listbox"`, `aria-expanded`; поиск получает фокус при открытии.

- [ ] **Step 1: Проверить `shared/ui`**

Прочитать публичные API `apps/web/src/shared/ui/combobox/combobox.tsx` (одиночный выбор, `value: string | null` — не подходит) и `apps/web/src/shared/ui/button/button.tsx` (`variant`, `size`). Триггер и «Очистить» строить на `Button` из `@/shared/ui` (`variant='secondary'`, `size='sm'` и `variant='ghost'`).

- [ ] **Step 2: Implement component**

```tsx
// apps/web/src/views/statistics/ui/reference-multiselect/reference-multiselect.tsx
import css from './reference-multiselect.module.scss';

import { Button } from '@/shared/ui';

import { isAllSelected, toggleAll, toggleOne } from '@/views/statistics/lib/selection';

import { ChevronDown, X } from 'lucide-solid';
import { createEffect, createMemo, createSignal, For, type JSX, onCleanup, Show } from 'solid-js';

const CHIP_LIMIT = 8;

export type ReferenceOption = {
	id: string;
	isArchived: boolean;
	name: string;
	periodTotalMinor: number;
};

export type ReferenceMultiselectProps = {
	colorOf: (id: string) => string;
	formatAmount: (minor: number) => string;
	noun: 'category' | 'contact';
	onChange: (ids: string[]) => void;
	options: readonly ReferenceOption[];
	selectedIds: readonly string[];
};

const NOUNS = {
	category: { all: 'Все категории', trigger: 'Категории' },
	contact: { all: 'Все контакты', trigger: 'Контакты' }
} as const;

export function ReferenceMultiselect(props: ReferenceMultiselectProps): JSX.Element {
	let rootElement: HTMLDivElement | undefined;
	let chipsElement: HTMLDivElement | undefined;
	let searchInput: HTMLInputElement | undefined;
	let allCheckbox: HTMLInputElement | undefined;
	const [isOpen, setIsOpen] = createSignal(false);
	const [query, setQuery] = createSignal('');
	const allIds = createMemo(() => props.options.map((option) => option.id));
	const selectedSet = createMemo(() => new Set(props.selectedIds));
	const allSelected = createMemo(() => isAllSelected(props.selectedIds, allIds()));
	const filteredOptions = createMemo(() => {
		const needle = query().trim().toLowerCase();

		return needle === '' ? props.options : props.options.filter((option) => option.name.toLowerCase().includes(needle));
	});
	const namesById = createMemo(() => new Map(props.options.map((option) => [option.id, option.name])));
	const visibleChips = createMemo(() => props.selectedIds.slice(0, CHIP_LIMIT));
	const hiddenChipCount = createMemo(() => Math.max(0, props.selectedIds.length - CHIP_LIMIT));

	const open = () => {
		setIsOpen(true);
		queueMicrotask(() => searchInput?.focus());
	};
	const close = () => {
		setIsOpen(false);
		setQuery('');
	};
	const handlePointerDown = (event: PointerEvent) => {
		const target = event.target as Node;

		if (!rootElement?.contains(target) && !chipsElement?.contains(target)) {
			close();
		}
	};
	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			close();
		}
	};

	createEffect(() => {
		if (allCheckbox !== undefined) {
			allCheckbox.indeterminate = props.selectedIds.length > 0 && !allSelected();
		}
	});
	createEffect(() => {
		if (!isOpen()) {
			return;
		}

		// pointerdown, not click: re-rendering the list detaches the click target before it bubbles here.
		document.addEventListener('pointerdown', handlePointerDown);
		document.addEventListener('keydown', handleKeyDown);
		onCleanup(() => {
			document.removeEventListener('pointerdown', handlePointerDown);
			document.removeEventListener('keydown', handleKeyDown);
		});
	});

	return (
		<div class={css.root}>
			<div class={css.anchor} ref={rootElement}>
				<Button
					aria-expanded={isOpen()}
					aria-haspopup='listbox'
					endIcon={<ChevronDown aria-hidden='true' size={16}/>}
					onClick={() => (isOpen() ? close() : open())}
					size='sm'
					variant='secondary'
				>
					<span>
						{NOUNS[props.noun].trigger}: <b>{props.selectedIds.length > 0 ? props.selectedIds.length : 'не выбраны'}</b>
					</span>
				</Button>
				<Show when={isOpen()}>
					<div class={css.popover}>
						<input
							aria-label='Поиск'
							class={css.search}
							onInput={(event) => setQuery(event.currentTarget.value)}
							placeholder='Поиск…'
							ref={searchInput}
							type='search'
							value={query()}
						/>
						<div class={css.list} role='listbox' aria-multiselectable='true'>
							<Show when={query().trim() === '' && props.options.length > 0}>
								<label class={`${css.option} ${css.optionAll}`}>
									<input
										checked={allSelected()}
										onChange={() => props.onChange(toggleAll(props.selectedIds, allIds()))}
										ref={allCheckbox}
										type='checkbox'
									/>
									<span>Все</span>
									<small class={css.amount}>{props.options.length}</small>
								</label>
							</Show>
							<For each={filteredOptions()} fallback={<p class={css.empty}>Ничего не найдено</p>}>
								{(option) => (
									<label class={css.option}>
										<input
											checked={selectedSet().has(option.id)}
											onChange={() => props.onChange(toggleOne(props.selectedIds, option.id))}
											type='checkbox'
										/>
										<span class={css.optionName}>
											{option.name}
											<Show when={option.isArchived}>
												<small class={css.archived}>архив</small>
											</Show>
										</span>
										<small class={css.amount}>
											{option.periodTotalMinor > 0 ? props.formatAmount(option.periodTotalMinor) : '—'}
										</small>
									</label>
								)}
							</For>
						</div>
						<div class={css.footer}>
							<span>выбрано {props.selectedIds.length} из {props.options.length}</span>
							<Button onClick={() => props.onChange([])} size='sm' variant='ghost'>
								<span>Очистить</span>
							</Button>
						</div>
					</div>
				</Show>
			</div>
			<div class={css.chips} ref={chipsElement}>
				<Show
					when={allSelected()}
					fallback={(
						<>
							<For each={visibleChips()}>
								{(id) => (
									<span class={css.chip}>
										<span class={css.dot} style={{ 'background-color': props.colorOf(id) }}/>
										{namesById().get(id)}
										<button aria-label={`Убрать ${namesById().get(id) ?? ''}`} class={css.chipRemove} onClick={() => props.onChange(toggleOne(props.selectedIds, id))} type='button'>
											<X aria-hidden='true' size={14}/>
										</button>
									</span>
								)}
							</For>
							<Show when={hiddenChipCount() > 0}>
								<button class={`${css.chip} ${css.chipMore}`} onClick={open} type='button'>+ ещё {hiddenChipCount()}</button>
							</Show>
						</>
					)}
				>
					<span class={css.chip}>
						{NOUNS[props.noun].all} ({props.selectedIds.length})
						<button aria-label='Снять все' class={css.chipRemove} onClick={() => props.onChange([])} type='button'>
							<X aria-hidden='true' size={14}/>
						</button>
					</span>
				</Show>
			</div>
		</div>
	);
}
```

Если `Button` не пробрасывает `aria-*`/`onClick` (проверено в Step 1: `ButtonProps` = `Omit<ButtonHTMLAttributes, 'children' | 'class'>` — пробрасывает), оставить как есть. Если `cn` из `@/shared/lib` принят для склейки классов — использовать `cn(css.option, css.optionAll)` вместо шаблонной строки (так делает `category-breakdown-chart.tsx`).

- [ ] **Step 3: Styles**

```scss
// apps/web/src/views/statistics/ui/reference-multiselect/reference-multiselect.module.scss
.root {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.anchor {
    position: relative;
    align-self: flex-start;
}

.popover {
    position: absolute;
    z-index: 20;
    inset-block-start: calc(100% + var(--space-2));
    inset-inline-start: 0;

    display: flex;
    flex-direction: column;
    gap: var(--space-3);

    inline-size: min(340px, calc(100vw - 2 * var(--space-4)));
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);

    background-color: var(--color-surface);
    box-shadow: var(--shadow-md);
}

.search {
    inline-size: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);

    background-color: var(--color-surface-subtle);
}

.list {
    overflow: auto;
    display: flex;
    flex-direction: column;
    max-block-size: 300px;
}

.option {
    cursor: pointer;

    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: var(--space-3);
    align-items: center;

    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);

    &:hover {
        background-color: var(--color-surface-subtle);
    }
}

.option-all {
    margin-block-end: var(--space-1);
    border-block-end: 1px solid var(--color-border);
    font-weight: 600;
}

.option-name {
    overflow-wrap: anywhere;
}

.archived {
    margin-inline-start: var(--space-2);
    font-size: var(--font-size-label);
    color: var(--color-text-tertiary);
}

.amount {
    font-variant-numeric: tabular-nums;
    color: var(--color-text-tertiary);
}

.empty {
    margin: 0;
    padding: var(--space-5);
    text-align: center;
    color: var(--color-text-secondary);
}

.footer {
    display: flex;
    align-items: center;
    justify-content: space-between;

    font-size: var(--font-size-body-sm);
    color: var(--color-text-tertiary);
}

.chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);

    &:empty {
        display: none;
    }
}

.chip {
    display: inline-flex;
    gap: var(--space-2);
    align-items: center;

    padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: 999px;

    font-size: var(--font-size-body-sm);

    background-color: var(--color-surface-subtle);
}

.chip-more {
    cursor: pointer;
    padding-inline-end: var(--space-3);
    color: var(--color-primary);
}

.chip-remove {
    cursor: pointer;

    display: inline-grid;
    place-content: center;

    padding: var(--space-1);
    border: 0;

    color: var(--color-text-tertiary);

    background: none;
}

.dot {
    flex: none;
    inline-size: 10px;
    block-size: 10px;
    border-radius: 3px;
}
```

Сверить имена токенов (`--space-1..12`, `--radius-sm/md/lg`, `--shadow-md`, `--font-size-label`) с `apps/web/src/shared/styles/tokens.scss`; несуществующие заменить на ближайшие существующие.

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm --filter @i-finances/web typecheck && pnpm lint`
Expected: без ошибок. (Визуальная проверка — в Task 10, когда компонент встроен в страницу.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/views/statistics/ui/reference-multiselect
git commit -m "feat(web): add reference multiselect with «Все», search and chips"
```

---

### Task 8: Период, сводка, палитра серий

**Files:**
- Create: `apps/web/src/views/statistics/ui/period-range-picker/period-range-picker.tsx` + `.module.scss`
- Create: `apps/web/src/views/statistics/ui/breakdown-summary/breakdown-summary.tsx` + `.module.scss`
- Create: `apps/web/src/views/statistics/lib/resolve-theme-color.ts`
- Modify: `apps/web/src/views/statistics/page.tsx` (убрать локальный `resolveThemeColor`, импортировать из lib)
- Modify: `apps/web/src/shared/styles/tokens.scss` (светлый блок `:root, [data-theme="light"]` и тёмный `[data-theme="dark"]`)

**Interfaces:**
- Consumes: `PERIOD_PRESETS`, `isPresetActive`, `resolvePeriodPreset`, `MonthRange` (Task 4); `listMonthKeys` (Task 4); `BreakdownMatrix` (Task 5).
- Produces:
  - `PeriodRangePicker(props: { currentMonth: string; earliestMonth: string; onChange: (range: MonthRange) => void; range: MonthRange })`
  - `BreakdownSummary(props: { currentMonth: string; formatAmount: (minor: number) => string; matrix: BreakdownMatrix })`
  - `resolveThemeColor(variableName: string, fallback: string): string`
  - CSS-токены `--color-series-1` … `--color-series-8`, `--color-series-other`

- [ ] **Step 1: Series palette tokens**

В `tokens.scss`, в светлом блоке рядом с `--color-warning-soft`:

```scss
    // Categorical series palette (dataviz reference instance, CVD-validated order)
    --color-series-1: #2a78d6;
    --color-series-2: #eb6834;
    --color-series-3: #1baf7a;
    --color-series-4: #eda100;
    --color-series-5: #e87ba4;
    --color-series-6: #008300;
    --color-series-7: #4a3aa7;
    --color-series-8: #e34948;
    --color-series-other: #a3adbd;
```

В блоке `[data-theme="dark"]`:

```scss
    --color-series-1: #3987e5;
    --color-series-2: #d95926;
    --color-series-3: #199e70;
    --color-series-4: #c98500;
    --color-series-5: #d55181;
    --color-series-6: #008300;
    --color-series-7: #9085e9;
    --color-series-8: #e66767;
    --color-series-other: #5d6879;
```

Если в `tokens.scss` есть ещё блок `@media (prefers-color-scheme: dark)` с переопределением `--color-canvas` (проверить `grep -n "prefers-color-scheme" apps/web/src/shared/styles/tokens.scss`), продублировать тёмные значения и туда.

- [ ] **Step 2: `resolve-theme-color.ts`**

Перенести функцию из `page.tsx:19-27` без изменений:

```ts
// apps/web/src/views/statistics/lib/resolve-theme-color.ts
/**
 * Reads a CSS custom property from the document root; chart.js needs literal
 * colours, not `var(...)`.
 */
export function resolveThemeColor(variableName: string, fallback: string): string {
	if (typeof window === 'undefined') {
		return fallback;
	}

	const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();

	return value || fallback;
}
```

В `page.tsx` удалить локальное определение и добавить `import { resolveThemeColor } from './lib/resolve-theme-color';`.

- [ ] **Step 3: `PeriodRangePicker`**

```tsx
// apps/web/src/views/statistics/ui/period-range-picker/period-range-picker.tsx
import css from './period-range-picker.module.scss';

import { cn } from '@/shared/lib';

import { listMonthKeys } from '@/views/statistics/lib/month-keys';
import { isPresetActive, type MonthRange, PERIOD_PRESETS, resolvePeriodPreset } from '@/views/statistics/lib/period-presets';

import { createMemo, For, type JSX } from 'solid-js';

const MONTH_FORMATTER = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

function formatMonthOption(monthKey: string): string {
	const [year, month] = monthKey.split('-').map(Number);
	const label = MONTH_FORMATTER.format(new Date(year, month - 1, 1));

	return label.charAt(0).toUpperCase() + label.slice(1).replace(' г.', '');
}

export type PeriodRangePickerProps = {
	currentMonth: string;
	earliestMonth: string;
	onChange: (range: MonthRange) => void;
	range: MonthRange;
};

export function PeriodRangePicker(props: PeriodRangePickerProps): JSX.Element {
	const allMonths = createMemo(() => listMonthKeys(props.earliestMonth, props.currentMonth));

	return (
		<div class={css.root}>
			<span class={css.label}>Период</span>
			<For each={PERIOD_PRESETS}>
				{(preset) => (
					<button
						aria-pressed={isPresetActive(preset.id, props.range, props.currentMonth, props.earliestMonth)}
						class={cn(css.preset)}
						onClick={() => props.onChange(resolvePeriodPreset(preset.id, props.currentMonth, props.earliestMonth))}
						type='button'
					>
						{preset.label}
					</button>
				)}
			</For>
			<span class={css.range}>
				<select
					aria-label='С месяца'
					class={css.select}
					onChange={(event) => props.onChange({ from: event.currentTarget.value, to: props.range.to })}
					value={props.range.from}
				>
					<For each={allMonths().filter((month) => month <= props.range.to)}>
						{(month) => <option value={month}>{formatMonthOption(month)}</option>}
					</For>
				</select>
				<span aria-hidden='true'>—</span>
				<select
					aria-label='По месяц'
					class={css.select}
					onChange={(event) => props.onChange({ from: props.range.from, to: event.currentTarget.value })}
					value={props.range.to}
				>
					<For each={allMonths().filter((month) => month >= props.range.from)}>
						{(month) => <option value={month}>{formatMonthOption(month)}</option>}
					</For>
				</select>
			</span>
		</div>
	);
}
```

Диапазон длиннее 24 месяцев в селектах возможен, если история длинная: ограничить опции `from` значениями `>= addMonths(range.to, -23)` и опции `to` значениями `<= addMonths(range.from, 23)` (импорт `addMonths` из `month-keys`).

```scss
// period-range-picker.module.scss
.root {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
}

.label {
    font-size: var(--font-size-label);
    font-weight: 600;
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.preset {
    cursor: pointer;

    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);

    white-space: nowrap;

    background-color: var(--color-surface);

    &[aria-pressed="true"] {
        border-color: var(--color-primary);
        font-weight: 600;
        color: var(--color-primary);
        background-color: var(--color-primary-soft);
    }
}

.range {
    display: inline-flex;
    gap: var(--space-2);
    align-items: center;
}

.select {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background-color: var(--color-surface);
}
```

- [ ] **Step 4: `BreakdownSummary`**

```tsx
// apps/web/src/views/statistics/ui/breakdown-summary/breakdown-summary.tsx
import css from './breakdown-summary.module.scss';

import { cn } from '@/shared/lib';

import type { BreakdownMatrix } from '@/views/statistics/lib/build-breakdown-matrix';

import { createMemo, type JSX, Show } from 'solid-js';

const MONTH_NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const MONTH_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function monthIndex(monthKey: string): number {
	return Number(monthKey.slice(5)) - 1;
}

export type BreakdownSummaryProps = {
	currentMonth: string;
	formatAmount: (minor: number) => string;
	matrix: BreakdownMatrix;
};

export function BreakdownSummary(props: BreakdownSummaryProps): JSX.Element {
	const lastClosedIndex = createMemo(() => props.matrix.months.findLastIndex((month) => month < props.currentMonth));
	const delta = createMemo(() => {
		const last = lastClosedIndex();

		if (last < 1) {
			return undefined;
		}

		const previousTotal = props.matrix.colTotals[last - 1];

		return {
			caption: `${MONTH_NAMES[monthIndex(props.matrix.months[last])]} против ${MONTH_GENITIVE[monthIndex(props.matrix.months[last - 1])]}`,
			percent: previousTotal > 0
				? Math.round(((props.matrix.colTotals[last] - previousTotal) / previousTotal) * 100)
				: null
		};
	});
	const currentIndex = createMemo(() => props.matrix.months.indexOf(props.currentMonth));

	return (
		<div class={css.root}>
			<div class={css.tile}>
				<span class={css.label}>За период</span>
				<span class={css.value}>{props.formatAmount(props.matrix.totalMinor)}</span>
				<span class={css.hint}>{props.matrix.months.length} мес</span>
			</div>
			<div class={css.tile}>
				<span class={css.label}>В среднем</span>
				<span class={css.value}>{props.matrix.avgMinor === null ? '—' : props.formatAmount(props.matrix.avgMinor)}</span>
				<span class={css.hint}>за закрытый месяц</span>
			</div>
			<div class={css.tile}>
				<span class={css.label}>Последний закрытый</span>
				<Show when={delta()} fallback={<span class={css.hint}>нужно минимум два закрытых месяца</span>}>
					{(value) => {
						const percent = () => value().percent;

						return (
							<Show when={percent() !== null} fallback={<><span class={css.value}>—</span><span class={css.hint}>в прошлом месяце трат нет</span></>}>
								<span class={cn(css.value, (percent() ?? 0) > 0 && css.up, (percent() ?? 0) < 0 && css.down)}>
									{(percent() ?? 0) > 0 ? '+' : ''}{percent()}%
								</span>
								<span class={css.hint}>{value().caption}</span>
							</Show>
						);
					}}
				</Show>
			</div>
			<div class={css.tile}>
				<span class={css.label}>Текущий месяц</span>
				<span class={css.value}>{currentIndex() === -1 ? '—' : props.formatAmount(props.matrix.colTotals[currentIndex()])}</span>
				<span class={css.hint}>{currentIndex() === -1 ? 'не входит в период' : 'месяц ещё идёт'}</span>
			</div>
		</div>
	);
}
```

```scss
// breakdown-summary.module.scss
@use "@/shared/styles/mixins" as mx;

.root {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);

    @include mx.media-mn(720) {
        grid-template-columns: repeat(4, minmax(0, 1fr));
    }
}

.tile {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);

    min-inline-size: 0;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);

    background-color: var(--color-surface-subtle);
}

.label {
    font-size: var(--font-size-label);
    font-weight: 600;
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.value {
    font-size: var(--font-size-heading-3);
    font-weight: 650;
    font-variant-numeric: tabular-nums;
}

.hint {
    font-size: var(--font-size-body-sm);
    color: var(--color-text-tertiary);
}

.up {
    color: var(--color-danger);
}

.down {
    color: var(--color-success);
}
```

- [ ] **Step 5: Typecheck, lint, existing tests**

Run: `pnpm --filter @i-finances/web typecheck && pnpm --filter @i-finances/web test && pnpm lint`
Expected: без ошибок (в т.ч. старый `statistics-chart-data.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/shared/styles/tokens.scss apps/web/src/views/statistics
git commit -m "feat(web): add period range picker, comparison summary and series palette"
```

---

### Task 9: График и таблица-матрица

**Files:**
- Create: `apps/web/src/views/statistics/ui/breakdown-chart/breakdown-chart.tsx` + `.module.scss`
- Create: `apps/web/src/views/statistics/ui/breakdown-table/breakdown-table.tsx` + `.module.scss`

**Interfaces:**
- Consumes: `BreakdownMatrix`, `OTHER_SERIES_ID` (Task 5); `resolveThemeColor` (Task 8); токены `--color-series-*` (Task 8).
- Produces:
  - `BreakdownChart(props: { colorOf: (id: string) => string; currentMonth: string; formatExact: (minor: number) => string; matrix: BreakdownMatrix; surfaceColor: string })` — `surfaceColor` рисует 2px зазор между сегментами стека; текущий месяц помечается второй строкой подписи оси «неполный»
  - `BreakdownTable(props: { colorOf: (id: string) => string; currentMonth: string; formatAmount: (minor: number) => string; matrix: BreakdownMatrix; noun: 'category' | 'contact' })`
  - `formatShortMonth(monthKey: string, isFirst: boolean): string` (экспорт из `breakdown-table.tsx`, используется и графиком)

`colorOf` возвращает **литеральный** цвет (результат `resolveThemeColor('--color-series-N', fallback)`), потому что chart.js не понимает `var(...)`. Его строит `CompareTab` (Task 10).

- [ ] **Step 1: `BreakdownChart`**

```tsx
// apps/web/src/views/statistics/ui/breakdown-chart/breakdown-chart.tsx
import css from './breakdown-chart.module.scss';

import { minorUnitsToAmount } from '@/shared/lib';

import type { BreakdownMatrix } from '@/views/statistics/lib/build-breakdown-matrix';
import { formatShortMonth } from '@/views/statistics/ui/breakdown-table/breakdown-table';

import { BarController, BarElement, CategoryScale, Chart, type ChartData, type ChartOptions, LinearScale, Tooltip } from 'chart.js';
import { Bar } from 'solid-chartjs';
import { createMemo, For, type JSX, onMount } from 'solid-js';

export type BreakdownChartProps = {
	colorOf: (id: string) => string;
	currentMonth: string;
	formatExact: (minor: number) => string;
	matrix: BreakdownMatrix;
	surfaceColor: string;
};

export function BreakdownChart(props: BreakdownChartProps): JSX.Element {
	const data = createMemo<ChartData<'bar'>>(() => ({
		datasets: props.matrix.series.map((series) => ({
			backgroundColor: props.colorOf(series.id),
			borderColor: props.surfaceColor,
			borderSkipped: false,
			borderWidth: { bottom: 0, left: 0, right: 0, top: 2 },
			data: series.values.map(minorUnitsToAmount),
			label: series.label,
			maxBarThickness: 46
		})),
		labels: props.matrix.months.map((month, index) => (
			month === props.currentMonth
				? [formatShortMonth(month, index === 0), 'неполный']
				: formatShortMonth(month, index === 0)
		))
	}));
	const options = createMemo<ChartOptions<'bar'>>(() => ({
		interaction: { intersect: false, mode: 'index' },
		maintainAspectRatio: false,
		plugins: {
			legend: { display: false },
			tooltip: {
				callbacks: {
					footer: (items) => `Итого: ${props.formatExact(props.matrix.colTotals[items[0]?.dataIndex ?? 0])}`,
					label: (item) => `${item.dataset.label ?? ''}: ${props.formatExact(Math.round(Number(item.raw) * 100))}`
				},
				filter: (item) => Number(item.raw) > 0
			}
		},
		responsive: true,
		scales: {
			x: { grid: { display: false }, stacked: true },
			y: { beginAtZero: true, stacked: true, ticks: { maxTicksLimit: 6 } }
		}
	}));

	onMount(() => {
		Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);
	});

	return (
		<div class={css.root}>
			<ul class={css.legend}>
				<For each={props.matrix.series}>
					{(series) => (
						<li class={css.legendItem}>
							<span class={css.dot} style={{ 'background-color': props.colorOf(series.id) }}/>
							{series.label}
						</li>
					)}
				</For>
			</ul>
			<div class={css.canvas}>
				<Bar data={data()} options={options()}/>
			</div>
		</div>
	);
}
```

Точные суммы в тултипе: `item.raw` — рубли (после `minorUnitsToAmount`), обратно в минорные через `Math.round(raw * 100)`. Цвет текста осей/тиков chart.js по умолчанию серый — если в тёмной теме нечитаемо, задать `Chart.defaults.color = resolveThemeColor('--color-text-secondary', '#526078')` в `onMount` (проверить, как это сделано в `monthly-trend-chart.tsx`, и повторить тот же приём).

```scss
// breakdown-chart.module.scss
@use "@/shared/styles/mixins" as mx;

.root {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);

    margin: 0;
    padding: 0;

    font-size: var(--font-size-body-sm);
    color: var(--color-text-secondary);

    list-style: none;
}

.legend-item {
    display: inline-flex;
    gap: var(--space-2);
    align-items: center;
}

.dot {
    flex: none;
    inline-size: 10px;
    block-size: 10px;
    border-radius: 3px;
}

.canvas {
    position: relative;
    block-size: 240px;

    @include mx.media-mn(960) {
        block-size: 300px;
    }
}
```

- [ ] **Step 2: `BreakdownTable`**

```tsx
// apps/web/src/views/statistics/ui/breakdown-table/breakdown-table.tsx
import css from './breakdown-table.module.scss';

import { cn } from '@/shared/lib';

import type { BreakdownMatrix } from '@/views/statistics/lib/build-breakdown-matrix';

import { createMemo, For, type JSX, Show } from 'solid-js';

const SHORT_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function formatShortMonth(monthKey: string, isFirst: boolean): string {
	const month = Number(monthKey.slice(5));
	const label = SHORT_MONTHS[month - 1];

	return isFirst || month === 1 ? `${label} ’${monthKey.slice(2, 4)}` : label;
}

export type BreakdownTableProps = {
	colorOf: (id: string) => string;
	currentMonth: string;
	formatAmount: (minor: number) => string;
	matrix: BreakdownMatrix;
	noun: 'category' | 'contact';
};

export function BreakdownTable(props: BreakdownTableProps): JSX.Element {
	const hasBudget = createMemo(() => props.matrix.rows.some((row) => row.budgetMinor !== null));
	const budgetTotal = createMemo(() => props.matrix.rows.reduce((total, row) => total + (row.budgetMinor ?? 0), 0));
	const cell = (value: number) => (value === 0 ? '—' : props.formatAmount(value));
	const isCurrent = (index: number) => props.matrix.months[index] === props.currentMonth;

	return (
		<div class={css.root}>
			<div class={css.scroll}>
				<table class={css.table}>
					<thead>
						<tr>
							<th class={css.name}>{props.noun === 'category' ? 'Категория' : 'Контакт'}</th>
							<For each={props.matrix.months}>
								{(month, index) => (
									<th class={cn(isCurrent(index()) && css.partial)}>
										{formatShortMonth(month, index() === 0)}
										<Show when={isCurrent(index())}><small class={css.partialNote}>неполный</small></Show>
									</th>
								)}
							</For>
							<th class={css.sum}>Итого</th>
							<th>Ср./мес</th>
							<Show when={hasBudget()}><th>Бюджет</th></Show>
						</tr>
					</thead>
					<tbody>
						<For each={props.matrix.rows}>
							{(row) => (
								<tr>
									<td class={css.name}>
										<span class={css.nameInner}>
											<span class={css.dot} style={{ 'background-color': props.colorOf(row.id) }}/>
											<span class={css.nameText} title={row.name}>{row.name}</span>
										</span>
									</td>
									<For each={row.values}>
										{(value, index) => {
											const isOver = row.budgetMinor !== null && value > row.budgetMinor;

											return (
												<td
													class={cn(value === 0 && css.zero, isOver && css.over, isCurrent(index()) && css.partial)}
													title={isOver ? `Бюджет ${props.formatAmount(row.budgetMinor ?? 0)} превышен на ${props.formatAmount(value - (row.budgetMinor ?? 0))}` : undefined}
												>
													{cell(value)}
												</td>
											);
										}}
									</For>
									<td class={css.sum}>{props.formatAmount(row.totalMinor)}</td>
									<td>{row.avgMinor === null ? '—' : props.formatAmount(row.avgMinor)}</td>
									<Show when={hasBudget()}>
										<td class={css.budget}>{row.budgetMinor === null ? '—' : props.formatAmount(row.budgetMinor)}</td>
									</Show>
								</tr>
							)}
						</For>
					</tbody>
					<tfoot>
						<tr>
							<td class={css.name}>Итого</td>
							<For each={props.matrix.colTotals}>
								{(value, index) => <td class={cn(isCurrent(index()) && css.partial)}>{props.formatAmount(value)}</td>}
							</For>
							<td class={css.sum}>{props.formatAmount(props.matrix.totalMinor)}</td>
							<td>{props.matrix.avgMinor === null ? '—' : props.formatAmount(props.matrix.avgMinor)}</td>
							<Show when={hasBudget()}><td class={css.budget}>{props.formatAmount(budgetTotal())}</td></Show>
						</tr>
					</tfoot>
				</table>
			</div>
			<div class={css.notes}>
				<span>Суммы округлены до рубля. «Ср./мес» — среднее по закрытым месяцам периода, текущий неполный месяц не учитывается.</span>
				<Show when={props.matrix.hiddenZeroCount > 0}>
					<span>Скрыто без трат за период: {props.matrix.hiddenZeroCount}.</span>
				</Show>
				<Show when={props.matrix.folded.length > 0}>
					<span>На графике 7 крупнейших отдельно, остальные {props.matrix.folded.length} собраны в «Остальные». В таблице есть все.</span>
				</Show>
				<Show when={hasBudget()}>
					<span><span class={css.overSwatch}/>месяц, в котором бюджет категории превышен</span>
				</Show>
			</div>
		</div>
	);
}
```

```scss
// breakdown-table.module.scss
.root {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.scroll {
    overflow-x: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
}

.table {
    inline-size: 100%;
    border-spacing: 0;
    border-collapse: separate;
    font-variant-numeric: tabular-nums;

    th,
    td {
        padding: var(--space-2) var(--space-3);
        border-block-end: 1px solid var(--color-border);
        text-align: end;
        white-space: nowrap;
    }

    thead th {
        font-size: var(--font-size-body-sm);
        font-weight: 600;
        color: var(--color-text-tertiary);
        background-color: var(--color-surface-subtle);
    }

    tbody tr:hover td {
        background-color: var(--color-surface-subtle);
    }

    tfoot td {
        border-block-end: 0;
        font-weight: 650;
        background-color: var(--color-surface-subtle);
    }
}

.name {
    position: sticky;
    z-index: 1;
    inset-inline-start: 0;

    min-inline-size: 140px;
    max-inline-size: 190px;

    text-align: start;

    background-color: var(--color-surface);
    box-shadow: 1px 0 0 var(--color-border);

    .table & {
        text-align: start;
    }

    thead &,
    tfoot & {
        background-color: var(--color-surface-subtle);
    }
}

.name-inner {
    display: inline-flex;
    gap: var(--space-2);
    align-items: center;
    max-inline-size: 100%;
}

.name-text {
    overflow: hidden;
    text-overflow: ellipsis;
}

.dot {
    flex: none;
    inline-size: 10px;
    block-size: 10px;
    border-radius: 3px;
}

.sum {
    border-inline-start: 1px solid var(--color-border);
    font-weight: 600;
}

.zero {
    color: var(--color-text-tertiary);
}

.over {
    font-weight: 600;
    color: var(--color-danger);

    &,
    tbody tr:hover & {
        background-color: var(--color-danger-soft);
    }
}

.partial {
    font-style: italic;
}

.partial-note {
    display: block;
    font-size: var(--font-size-label);
    font-weight: 400;
    font-style: normal;
}

.budget {
    color: var(--color-text-tertiary);
}

.notes {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--font-size-body-sm);
    color: var(--color-text-tertiary);
}

.over-swatch {
    display: inline-block;

    inline-size: 10px;
    block-size: 10px;
    margin-inline-end: var(--space-2);
    border: 1px solid var(--color-danger);
    border-radius: 3px;

    vertical-align: -1px;

    background-color: var(--color-danger-soft);
}
```

Если stylelint ругается на специфичность `.table &` / `tbody tr:hover &` — упростить до плоских селекторов, **не** добавляя `!important`.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @i-finances/web typecheck && pnpm lint`
Expected: без ошибок.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/views/statistics/ui/breakdown-chart apps/web/src/views/statistics/ui/breakdown-table
git commit -m "feat(web): add stacked comparison chart and month matrix table"
```

---

### Task 10: Вкладка «Сравнение», табы страницы, URL + localStorage, визуальная проверка

**Files:**
- Create: `apps/web/src/views/statistics/ui/compare-tab/compare-tab.tsx` + `.module.scss`
- Modify: `apps/web/src/views/statistics/page.tsx`
- Modify: `apps/web/src/views/statistics/statistics.module.scss`

**Interfaces:**
- Consumes: всё из Tasks 3–9; `createRouteSearchParams` (`apps/web/src/shared/routing/create-route-search-params.ts`); `getCategories`, `getContacts`, `getMonthlyTrend`, `getMonthlyBreakdown`; `toMonthKey` (`views/statistics/ui/month-navigator/month-navigator.tsx`); `formatMinorUnitsCurrency` (`@/shared/lib`).
- Produces: `CompareTab()` — самодостаточная вкладка, читающая и пишущая URL.

- [ ] **Step 1: `CompareTab`**

```tsx
// apps/web/src/views/statistics/ui/compare-tab/compare-tab.tsx
import css from './compare-tab.module.scss';

import { formatMinorUnitsCurrency } from '@/shared/lib';
import { createRouteSearchParams } from '@/shared/routing/create-route-search-params';

import { getCategories } from '@/entities/category';
import { getContacts } from '@/entities/contact';
import { type BreakdownDimension, getMonthlyBreakdown, getMonthlyTrend } from '@/entities/operation';

import { buildBreakdownMatrix, type BreakdownReference, OTHER_SERIES_ID } from '@/views/statistics/lib/build-breakdown-matrix';
import { addMonths } from '@/views/statistics/lib/month-keys';
import { type MonthRange, resolvePeriodPreset } from '@/views/statistics/lib/period-presets';
import { resolveThemeColor } from '@/views/statistics/lib/resolve-theme-color';
import { decodeSelectionParam, encodeSelectionParam, sanitizeSelection } from '@/views/statistics/lib/selection';
import { readStoredComparison, writeStoredComparison } from '@/views/statistics/lib/selection-storage';
import { assignSeriesSlots, type SeriesSlotMap } from '@/views/statistics/lib/series-slots';
import { statisticsSearchParamsSchema } from '@/views/statistics/model/statistics-search-params';
import { BreakdownChart } from '@/views/statistics/ui/breakdown-chart/breakdown-chart';
import { BreakdownSummary } from '@/views/statistics/ui/breakdown-summary/breakdown-summary';
import { BreakdownTable } from '@/views/statistics/ui/breakdown-table/breakdown-table';
import { toMonthKey } from '@/views/statistics/ui/month-navigator/month-navigator';
import { PeriodRangePicker } from '@/views/statistics/ui/period-range-picker/period-range-picker';
import { type ReferenceOption, ReferenceMultiselect } from '@/views/statistics/ui/reference-multiselect/reference-multiselect';

import { createAsync } from '@solidjs/router';
import { createEffect, createMemo, type JSX, Show } from 'solid-js';

const SERIES_FALLBACKS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

function browserStorage(): Storage | undefined {
	try {
		return typeof window === 'undefined' ? undefined : window.localStorage;
	}
	catch {
		return undefined;
	}
}

export function CompareTab(): JSX.Element {
	const currentMonth = toMonthKey(new Date());
	const search = createRouteSearchParams(statisticsSearchParamsSchema);
	const by = createMemo<BreakdownDimension>(() => search.params().by ?? 'category');
	const categories = createAsync(() => getCategories({ status: 'all' }));
	const contacts = createAsync(() => getContacts({ status: 'all' }));
	const trend = createAsync(() => getMonthlyTrend());
	const earliestMonth = createMemo(() => trend()?.points[0]?.month ?? addMonths(currentMonth, -23));
	const range = createMemo<MonthRange>(() => {
		const params = search.params();

		return params.from !== undefined && params.to !== undefined && params.from <= params.to
			? { from: params.from, to: params.to }
			: resolvePeriodPreset('ytd', currentMonth, earliestMonth());
	});
	const breakdown = createAsync(() => getMonthlyBreakdown({ by: by(), from: range().from, to: range().to }));
	const references = createMemo<BreakdownReference[] | undefined>(() => {
		if (by() === 'category') {
			return categories()?.items.map((item) => ({
				budgetMinor: item.monthlyBudgetMinor,
				id: item.id,
				isArchived: item.archivedAt !== null,
				name: item.name
			}));
		}

		return contacts()?.items.map((item) => ({ budgetMinor: null, id: item.id, isArchived: item.archivedAt !== null, name: item.name }));
	});
	const baseCurrency = createMemo(() => breakdown()?.baseCurrency ?? categories()?.baseCurrency ?? 'BYN');
	const allIds = createMemo(() => references()?.map((reference) => reference.id) ?? []);
	const selectedIds = createMemo(() => {
		const fromUrl = decodeSelectionParam(search.params().ids, allIds());

		if (fromUrl !== undefined) {
			return fromUrl;
		}

		const storage = browserStorage();

		return storage === undefined ? [] : sanitizeSelection(readStoredComparison(storage, by()).ids, allIds());
	});
	// Previous slot maps live outside reactivity on purpose: feeding the memo's
	// own output back through a signal would re-trigger it forever.
	const previousSlots: Partial<Record<BreakdownDimension, SeriesSlotMap>> = {};
	const matrix = createMemo(() => {
		const data = breakdown();
		const refs = references();

		return data === undefined || refs === undefined
			? undefined
			: buildBreakdownMatrix({ cells: data.cells, currentMonth, from: range().from, references: refs, selectedIds: selectedIds(), to: range().to });
	});
	const chartedSlots = createMemo(() => {
		const dimension = by();
		const charted = matrix()?.series.filter((series) => series.id !== OTHER_SERIES_ID).map((series) => series.id) ?? [];
		const storage = browserStorage();
		const previous = previousSlots[dimension]
			?? (storage === undefined ? {} : readStoredComparison(storage, dimension).slots);
		const next = assignSeriesSlots(charted, previous);

		previousSlots[dimension] = next;

		return next;
	});
	const options = createMemo<ReferenceOption[]>(() => {
		const data = breakdown();
		const totals = new Map<string, number>();

		for (const cell of data?.cells ?? []) {
			totals.set(cell.referenceId, (totals.get(cell.referenceId) ?? 0) + cell.totalMinor);
		}

		return (references() ?? [])
			.map((reference) => ({ id: reference.id, isArchived: reference.isArchived, name: reference.name, periodTotalMinor: totals.get(reference.id) ?? 0 }))
			.toSorted((left, right) => right.periodTotalMinor - left.periodTotalMinor || left.name.localeCompare(right.name, 'ru'));
	});
	const colorOf = (id: string) => {
		const slot = chartedSlots()[id];

		return slot === undefined
			? resolveThemeColor('--color-series-other', '#a3adbd')
			: resolveThemeColor(`--color-series-${slot + 1}`, SERIES_FALLBACKS[slot]);
	};
	const formatAmount = (minor: number) => formatMinorUnitsCurrency(Math.round(minor / 100) * 100, baseCurrency(), { maximumFractionDigits: 0 });
	const formatExact = (minor: number) => formatMinorUnitsCurrency(minor, baseCurrency());

	const handleSelection = (ids: string[]) => {
		search.setParams({ ids: encodeSelectionParam(ids, allIds()) }, { history: 'replace' });
	};
	const handleDimension = (next: BreakdownDimension) => {
		search.setParams({ by: next, ids: undefined }, { history: 'replace' });
	};
	const handleRange = (next: MonthRange) => {
		search.setParams({ from: next.from, to: next.to }, { history: 'replace' });
	};

	createEffect(() => {
		const storage = browserStorage();

		if (storage !== undefined && references() !== undefined) {
			writeStoredComparison(storage, by(), { ids: selectedIds(), slots: chartedSlots() });
		}
	});

	return (
		<div class={css.root}>
			<div class={css.controls}>
				<div class={css.segment} role='group' aria-label='Разрез'>
					<button aria-pressed={by() === 'category'} class={css.segmentButton} onClick={() => handleDimension('category')} type='button'>Категории</button>
					<button aria-pressed={by() === 'contact'} class={css.segmentButton} onClick={() => handleDimension('contact')} type='button'>Контакты</button>
				</div>
				<ReferenceMultiselect
					colorOf={colorOf}
					formatAmount={formatAmount}
					noun={by()}
					onChange={handleSelection}
					options={options()}
					selectedIds={selectedIds()}
				/>
				<PeriodRangePicker currentMonth={currentMonth} earliestMonth={earliestMonth()} onChange={handleRange} range={range()}/>
			</div>
			<Show when={matrix()} fallback={<p>Загрузка…</p>}>
				{(current) => (
					<Show
						when={selectedIds().length > 0}
						fallback={(
							<div class={css.empty}>
								<b>{by() === 'category' ? 'Выберите категории' : 'Выберите контакты'}</b>
								<span>Можно выбрать несколько или сразу «Все». По месяцам появятся столбцы, итоги и среднее.</span>
							</div>
						)}
					>
						<Show
							when={current().rows.length > 0}
							fallback={(
								<div class={css.empty}>
									<b>За этот период трат нет</b>
									<span>Расширьте период или выберите другие строки.</span>
								</div>
							)}
						>
							<BreakdownSummary currentMonth={currentMonth} formatAmount={formatAmount} matrix={current()}/>
							<BreakdownChart
								colorOf={colorOf}
								currentMonth={currentMonth}
								formatExact={formatExact}
								matrix={current()}
								surfaceColor={resolveThemeColor('--color-surface', '#ffffff')}
							/>
							<BreakdownTable colorOf={colorOf} currentMonth={currentMonth} formatAmount={formatAmount} matrix={current()} noun={by()}/>
						</Show>
					</Show>
				)}
			</Show>
		</div>
	);
}
```

Перед реализацией проверить публичные API (AGENTS.md → «Local API Usage»):
- `createRouteSearchParams(...)` возвращает `{ params, setParams }`? Открыть `apps/web/src/shared/routing/create-route-search-params.ts` (конец файла) и `apps/web/src/views/home/page.tsx:228` — использовать фактические имена полей.
- Как `setParams` сериализует `undefined` (удаляет ключ или нет) — `apps/web/src/shared/lib/search-params/serialize.ts`.
- Сигнатура `formatMinorUnitsCurrency` и поддержка `maximumFractionDigits` в `FormatCurrencyOptions` (`apps/web/src/shared/lib/currency-formatter.ts`). Если опции нет — `formatAmount` делать через `new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(minor / 100)`.
- Экспорты `getCategories` из `@/entities/category` и `getContacts` из `@/entities/contact` (по `index.ts`).
- Кнопки «Выбрать» в пустом состоянии нет: мультиселект стоит прямо над ним.

- [ ] **Step 2: Styles for the tab**

```scss
// compare-tab.module.scss
.root {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
}

.controls {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.segment {
    display: inline-flex;
    gap: 2px;
    align-self: flex-start;

    padding: 3px;
    border-radius: var(--radius-md);

    background-color: var(--color-surface-strong);
}

.segment-button {
    cursor: pointer;

    padding: var(--space-1) var(--space-4);
    border: 0;
    border-radius: var(--radius-sm);

    color: var(--color-text-secondary);
    white-space: nowrap;

    background: transparent;

    &[aria-pressed="true"] {
        font-weight: 600;
        color: var(--color-text-primary);
        background-color: var(--color-surface);
        box-shadow: var(--shadow-sm);
    }
}

.empty {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    align-items: center;

    padding: var(--space-9) var(--space-4);

    color: var(--color-text-secondary);
    text-align: center;
}
```

- [ ] **Step 3: Tabs on the page**

В `apps/web/src/views/statistics/page.tsx`:
- В `StatisticsContent` добавить `const search = createRouteSearchParams(statisticsSearchParamsSchema); const tab = createMemo(() => search.params().tab ?? 'overview');`.
- В `titleRow` справа от `h1` — группа табов с той же разметкой/стилем, что сегмент (`role='tablist'`, кнопки `role='tab'`, `aria-selected`), клики → `search.setParams({ tab: 'overview' | 'compare' })` (history `push` — таб это навигация).
- Существующие две секции обернуть в `<Show when={tab() === 'overview'}>`; для `compare` — `<section class={css.section}><CompareTab/></section>`.
- Запросы «Обзора» (`categoryStats`, `monthlyTrend` и пр.) не должны стартовать на вкладке «Сравнение» лишний раз — перенести их `createAsync` внутрь отдельного компонента `OverviewTab` в том же файле (вместе с `monthAnchor`), чтобы они создавались только при показе.

В `statistics.module.scss` добавить стили табов (копия `.segment`/`.segment-button` из `compare-tab.module.scss`, но с именами `.tabs`/`.tab` и `[aria-selected="true"]`), и `justify-content: space-between; flex-wrap: wrap;` в `.title-row`.

- [ ] **Step 4: Full checks**

Run: `pnpm typecheck && pnpm test && pnpm --filter @i-finances/contracts test && pnpm lint`
Expected: всё зелёное.

- [ ] **Step 5: Visual verification in the browser (обязательно)**

Запустить API и web локально по `README.md`/`docs/` проекта (или через skill `run`) **на disposable-базе**: скопировать `apps/api/data/i-finances.sqlite` в scratchpad и указать `DATABASE_URL` на копию — никогда не на прод.

Проверить через Claude in Chrome (skill `claude-in-chrome`), десктоп 1440px и мобильный 390px, светлая и тёмная тема:
1. `/stats` открывается на «Обзоре», графики как раньше.
2. «Сравнение» → пусто → выбрать «Продукты, Сладости, Фастфуд, Гигиена» → сводка, график, таблица совпадают с макетом (для локальной копии: за январь–сентябрь итог ≈ 10 487 BYN).
3. Разрез «Контакты» → «Все» → чип «Все контакты (N)», «Остальные (N)» серым на графике, в таблице все строки, внизу «Скрыто без трат…».
4. «Все» → снять одну галочку → «Все» в состоянии «—»; вернуть → «Все» снова отмечено; клик по «Все» → пусто.
5. Поповер не закрывается при кликах внутри списка; закрывается по клику снаружи и Esc.
6. Пресеты подсвечиваются; селекты «с — по» не дают `from > to`.
7. Перезагрузка страницы сохраняет состояние из URL; заход на `/stats?tab=compare` без `ids` восстанавливает выбор из localStorage.
8. Мобильный: таблица скроллится горизонтально, первая колонка залипает, ничего не вылезает за экран; оценить отступы и композицию, а не только работоспособность.
9. Сверить, что цифра «Текущий месяц» в «Сравнении» по одной категории совпадает со столбцом этой категории в «Обзоре» за тот же месяц.

Найденные визуальные дефекты исправить в этой же задаче и перепроверить.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/views/statistics
git commit -m "feat(web): add the comparison tab to the statistics page"
```

---

### Task 11: Деплой

**Files:** —

- [ ] **Step 1: Финальная проверка и синхронизация**

```bash
pnpm typecheck && pnpm test && pnpm --filter @i-finances/contracts test && pnpm lint
git fetch origin && git status -sb
```

Expected: всё зелёное; `master` не расходится с `origin/master` (если отстаёт — `git pull --rebase`, прогнать проверки снова).

- [ ] **Step 2: Push**

Спросить пользователя подтверждение на push, затем:

```bash
git push origin master
```

- [ ] **Step 3: Бэкап прод-базы**

Схема не меняется, но правило «прод-база должна выжить любой ценой». На сервере (`ssh stark@185.207.250.67`) снять копию SQLite из боевого тома i-finances тем же способом, что использовался при прошлых деплоях (уточнить у пользователя путь тома/команду, если в `~/sites/homelab` нет готового скрипта бэкапа). Проверить, что файл бэкапа ненулевого размера.

- [ ] **Step 4: Выкатка**

На сервере:

```bash
cd ~/sites/i-finances && git pull
cd ~/sites/homelab && docker compose build i-finances-api i-finances-web && docker compose up -d
```

Имена сервисов сверить с `~/sites/homelab/docker-compose.yml` перед запуском. Статика web публикуется явным копированием (том засевается из образа только пока пуст) — выполнить тот шаг публикации статики, который описан в homelab для i-finances. Никаких правок файлов на сервере руками.

- [ ] **Step 5: Smoke на проде**

1. `https://i-finances.nikkeyl.com/stats` — «Обзор» работает.
2. `https://i-finances.nikkeyl.com/stats?tab=compare` — данные грузятся, «Все» на контактах работает.
3. `curl -s -o /dev/null -w '%{http_code}' 'https://i-finances.nikkeyl.com/api/operations/monthly-breakdown?by=category&from=2026-01&to=2026-09'` без сессии → `401`.
4. Отчитаться пользователю с фактическими результатами.
