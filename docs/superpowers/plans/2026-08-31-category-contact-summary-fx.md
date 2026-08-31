# Category / Contact Summary FX Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In category and contact summary dialogs, show foreign-operation equivalents and period totals using today’s NBRB rates (family currency primary + optional smaller USD secondary).

**Architecture:** Client-side recalculation via existing `getCurrentExchangeRates` + `convertCurrency`/`sumMoney`. Extract `toCurrencyExchangeRates` for reuse; add pure operation summary FX helpers; wire both dialogs. Do not change stored historical rates or server operation APIs.

**Tech Stack:** Solid 1.9, SolidStart queries, Vitest, existing `~/shared/lib` money/FX helpers, NBRB-backed `getCurrentExchangeRates`.

**Spec:** `docs/superpowers/specs/2026-08-31-category-contact-summary-fx-design.md`

## Global Constraints

- Tabs indentation; function declarations at top level; brief JSDoc on exported functions/types
- Solid component body order: state/memos → handlers → effects → return
- Minor units (integers) for money in helpers and UI (`Math.round` after `convertCurrency`)
- Do not use `amountInHouseholdBaseCurrencyMinor` for these dialog totals/equivalents
- Secondary USD line only when household base ≠ `USD`
- Do not commit unless the user asks

---

## File map

| File | Responsibility |
|------|----------------|
| `src/entities/exchange-rate/model/current-rates.ts` | Map `CurrentExchangeRates` → `CurrencyExchangeRates` |
| `src/entities/exchange-rate/index.ts` | Re-export mapper |
| `src/entities/operation/model/summary-fx.ts` | Signed amounts, row equivalent, period base+USD totals |
| `src/entities/operation/index.ts` | Re-export summary FX helpers |
| `src/views/home/page.tsx` | Import shared mapper; delete local `toCurrencyExchangeRates` |
| `src/views/categories/ui/category-summary-dialog/*` | Load rates; dual amounts in total + rows |
| `src/views/contacts/ui/contact-summary-dialog/*` | Same FX UI as category (no edit row behavior change) |
| `tests/entities/exchange-rate/current-rates.test.ts` | Mapper tests |
| `tests/entities/operation/summary-fx.test.ts` | Summary FX helper tests |

---

### Task 1: Extract `toCurrencyExchangeRates`

**Files:**
- Create: `src/entities/exchange-rate/model/current-rates.ts`
- Modify: `src/entities/exchange-rate/index.ts`
- Modify: `src/views/home/page.tsx` (replace local helper)
- Create: `tests/entities/exchange-rate/current-rates.test.ts`

**Interfaces:**
- Produces: `toCurrencyExchangeRates(current: CurrentExchangeRates): CurrencyExchangeRates`
- Only quotes with `toCurrency === baseCurrency` and positive finite `Number(rate)` are included

- [x] **Step 1: Write failing test**

```ts
import { describe, expect, it } from 'vitest';

import { toCurrencyExchangeRates } from '../../../src/entities/exchange-rate';
import { CurrencyCode } from '../../../src/shared/lib';

describe('toCurrencyExchangeRates', () => {
	it('maps quotes into ratesToBaseCurrency for the snapshot base', () => {
		const rates = toCurrencyExchangeRates({
			baseCurrency: CurrencyCode.BYN,
			quotes: [
				{
					effectiveOn: '2026-08-31',
					fromCurrency: CurrencyCode.USD,
					rate: '3.25',
					source: 'nbrb',
					toCurrency: CurrencyCode.BYN
				},
				{
					effectiveOn: '2026-08-31',
					fromCurrency: CurrencyCode.EUR,
					rate: '0',
					source: 'nbrb',
					toCurrency: CurrencyCode.BYN
				}
			],
			refreshError: null,
			requestedOn: '2026-08-31',
			unavailableCurrencies: []
		});

		expect(rates).toEqual({
			baseCurrency: CurrencyCode.BYN,
			ratesToBaseCurrency: {
				[CurrencyCode.USD]: 3.25
			}
		});
	});
});
```

- [x] **Step 2: Run test — expect FAIL (export missing)**

Run: `pnpm test -- tests/entities/exchange-rate/current-rates.test.ts`

- [x] **Step 3: Implement mapper + export; switch home to import it**

```ts
// src/entities/exchange-rate/model/current-rates.ts
import type { CurrencyCodeValue, CurrencyExchangeRates } from '~/shared/lib';

import type { CurrentExchangeRates } from './types';

/**
 * Maps a current daily FX snapshot into converter-friendly rates-to-base.
 */
export function toCurrencyExchangeRates(
	currentExchangeRates: CurrentExchangeRates
): CurrencyExchangeRates {
	const ratesToBaseCurrency: Partial<Record<CurrencyCodeValue, number>> = {};

	currentExchangeRates.quotes.forEach((quote) => {
		const rate = Number(quote.rate);

		if (
			quote.toCurrency === currentExchangeRates.baseCurrency
			&& Number.isFinite(rate)
			&& rate > 0
		) {
			ratesToBaseCurrency[quote.fromCurrency] = rate;
		}
	});

	return {
		baseCurrency: currentExchangeRates.baseCurrency,
		ratesToBaseCurrency
	};
}
```

Export from `src/entities/exchange-rate/index.ts`. In `src/views/home/page.tsx`, remove the local function and import `toCurrencyExchangeRates` from `~/entities/exchange-rate`.

- [x] **Step 4: Run test — expect PASS**

Run: `pnpm test -- tests/entities/exchange-rate/current-rates.test.ts`

---

### Task 2: Summary FX pure helpers

**Files:**
- Create: `src/entities/operation/model/summary-fx.ts`
- Modify: `src/entities/operation/index.ts`
- Create: `tests/entities/operation/summary-fx.test.ts`

**Interfaces:**
- Consumes: `CurrencyExchangeRates`, `convertCurrency`, `CurrencyCode`
- Produces:
  - `SummaryFxOperation = { amountMinor; currency; type: 'expense' | 'income' }`
  - `getSignedAccountAmountMinor(operation): number`
  - `getOperationBaseEquivalentMinor(operation, baseCurrency, rates | undefined): number | undefined` — `undefined` if same currency or conversion impossible
  - `getSummaryPeriodFxTotals(operations, baseCurrency, rates | undefined): { baseCurrency; baseTotalMinor; usdTotalMinor: number | undefined } | undefined` — `undefined` if any needed conversion fails

Conversion rule: `Math.round(convertCurrency(signedMinor, from, to, rates))`. Same-currency conversion is identity (no rates needed). Period USD secondary omitted when `baseCurrency === CurrencyCode.USD`.

- [ ] **Step 1: Write failing tests**

Cover at least:
1. Signed expense/income
2. Foreign row → base equivalent at today rates; same-currency → `undefined`
3. Period total: mixed BYN+USD → base sum; USD secondary present when base is BYN
4. Base already USD → `usdTotalMinor === undefined`
5. Missing rates with foreign op → period totals `undefined`; missing rates with only base ops → base total works, USD secondary `undefined` if base ≠ USD

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm test -- tests/entities/operation/summary-fx.test.ts`

- [ ] **Step 3: Implement helpers + export from entity index**

Sketch:

```ts
export function getSignedAccountAmountMinor(operation: SummaryFxOperation): number {
	const sign = operation.type === 'expense' ? -1 : 1;
	return sign * operation.amountMinor;
}

function tryConvertMinor(
	amountMinor: number,
	fromCurrency: CurrencyCodeValue,
	toCurrency: CurrencyCodeValue,
	rates: CurrencyExchangeRates
): number | undefined {
	try {
		return Math.round(convertCurrency(amountMinor, fromCurrency, toCurrency, rates));
	}
	catch {
		return undefined;
	}
}

export function getOperationBaseEquivalentMinor(
	operation: SummaryFxOperation,
	householdBaseCurrency: CurrencyCodeValue,
	rates: CurrencyExchangeRates | undefined
): number | undefined {
	if (operation.currency === householdBaseCurrency) {
		return undefined;
	}
	if (rates === undefined) {
		return undefined;
	}
	return tryConvertMinor(
		getSignedAccountAmountMinor(operation),
		operation.currency,
		householdBaseCurrency,
		rates
	);
}

export function getSummaryPeriodFxTotals(
	operations: readonly SummaryFxOperation[],
	householdBaseCurrency: CurrencyCodeValue,
	rates: CurrencyExchangeRates | undefined
): SummaryPeriodFxTotals | undefined {
	let baseTotalMinor = 0;

	for (const operation of operations) {
		const signed = getSignedAccountAmountMinor(operation);

		if (operation.currency === householdBaseCurrency) {
			baseTotalMinor += signed;
			continue;
		}

		if (rates === undefined) {
			return undefined;
		}

		const converted = tryConvertMinor(
			signed,
			operation.currency,
			householdBaseCurrency,
			rates
		);

		if (converted === undefined) {
			return undefined;
		}

		baseTotalMinor += converted;
	}

	let usdTotalMinor: number | undefined;

	if (householdBaseCurrency !== CurrencyCode.USD) {
		if (rates === undefined) {
			usdTotalMinor = undefined;
		}
		else {
			usdTotalMinor = tryConvertMinor(
				baseTotalMinor,
				householdBaseCurrency,
				CurrencyCode.USD,
				rates
			);
		}
	}

	return {
		baseCurrency: householdBaseCurrency,
		baseTotalMinor,
		usdTotalMinor
	};
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm test -- tests/entities/operation/summary-fx.test.ts`

---

### Task 3: Wire `CategorySummaryDialog`

**Files:**
- Modify: `src/views/categories/ui/category-summary-dialog/category-summary-dialog.tsx`
- Modify: `src/views/categories/ui/category-summary-dialog/category-summary-dialog.module.scss`

**Interfaces:**
- Consumes: `getCurrentExchangeRates`, `toCurrencyExchangeRates`, summary FX helpers, `formatMinorUnitsCurrency`

- [ ] **Step 1: Load rates + memos**

```ts
const currentExchangeRates = createAsync(() => getCurrentExchangeRates());

const exchangeRates = createMemo(() => {
	const snapshot = currentExchangeRates();
	return snapshot ? toCurrencyExchangeRates(snapshot) : undefined;
});

const periodFxTotals = createMemo(() => {
	const base = periodCurrency();
	if (!base) {
		return undefined;
	}
	return getSummaryPeriodFxTotals(items(), base, exchangeRates());
});
```

Remove use of `getSignedBaseAmountMinor` / historical `amountInHouseholdBaseCurrencyMinor` for the total.

- [ ] **Step 2: Update total UI**

Primary: `periodFxTotals().baseTotalMinor` in `baseCurrency`.  
Secondary (smaller): when `usdTotalMinor != null`, `formatMinorUnitsCurrency(usdTotalMinor, CurrencyCode.USD)`.

Show total block when `!isLoading() && periodFxTotals()` (or keep currency gate + totals).

- [ ] **Step 3: Update row UI**

Wrap amount in a column:

```tsx
<div class={css.amountColumn}>
	<span class={cn(css.amount, ...)}>{formatMinorUnitsCurrency(signed, currency)}</span>
	<Show when={baseEquivalentMinor()}>
		{(value) => (
			<span class={css.amountSecondary}>
				{`≈ ${formatMinorUnitsCurrency(value(), baseCurrency)}`}
			</span>
		)}
	</Show>
</div>
```

Pass `householdBaseCurrency` and `exchangeRates` into the row (or compute equivalent in parent). Prefer passing rates + base into row props.

- [ ] **Step 4: SCSS**

```scss
.amount-column {
	display: grid;
	flex: none;
	gap: var(--space-1);
	justify-items: end;
}

.amount-secondary {
	font-size: var(--font-size-body-sm);
	font-variant-numeric: tabular-nums;
	color: var(--color-text-tertiary);
	white-space: nowrap;
}

.total-amounts {
	display: grid;
	gap: var(--space-1);
	justify-items: end;
}

.total-amount-secondary {
	font-size: var(--font-size-body-sm);
	font-weight: var(--font-weight-semibold);
	font-variant-numeric: tabular-nums;
	color: var(--color-text-tertiary);
	white-space: nowrap;
}
```

Keep expense/income color on primary only; secondary stays muted.

- [ ] **Step 5: Typecheck dialog**

Run: `pnpm typecheck` (or eslint on touched files)

---

### Task 4: Wire `ContactSummaryDialog`

**Files:**
- Modify: `src/views/contacts/ui/contact-summary-dialog/contact-summary-dialog.tsx`
- Modify: `src/views/contacts/ui/contact-summary-dialog/contact-summary-dialog.module.scss`

**Interfaces:**
- Same FX display contract as Task 3 (no operation-edit dialog changes)

- [ ] **Step 1: Mirror Task 3 data wiring** (`getCurrentExchangeRates`, memos, helpers)
- [ ] **Step 2: Mirror total + row markup and SCSS classes**
- [ ] **Step 3: Remove historical `getSignedBaseAmountMinor` usage for totals**
- [ ] **Step 4: `pnpm typecheck`**

---

### Task 5: Verification

- [ ] **Step 1:** `pnpm test -- tests/entities/exchange-rate/current-rates.test.ts tests/entities/operation/summary-fx.test.ts`
- [ ] **Step 2:** `pnpm typecheck`
- [ ] **Step 3:** Manual (optional): open category «Ремонт» and a contact with mixed BYN/`$` ops — primary `$`, secondary base; total base + smaller `$` when base ≠ USD

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Row foreign → base secondary at today rate | 2, 3, 4 |
| Same currency → no secondary | 2, 3, 4 |
| Period total at today rate in family currency | 2, 3, 4 |
| Secondary USD under total when base ≠ USD | 2, 3, 4 |
| Hide USD when base is USD | 2 |
| Use `getCurrentExchangeRates`, not historical op rate | 3, 4 |
| Extract shared `toCurrencyExchangeRates` | 1 |
| Category + contact dialogs only | 3, 4 |
| Missing rate → omit, don’t crash | 2, 3, 4 |
| No server API / stored rate changes | — (non-goal) |
