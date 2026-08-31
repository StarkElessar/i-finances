# Category / Contact Summary FX Display Design

## Problem

In category and contact summary dialogs:

- Foreign-currency operations show only the account-currency amount (e.g. `$`), with no family-currency equivalent.
- Period totals use stored `amountInHouseholdBaseCurrencyMinor` (rate on the **operation date**).
- There is no secondary USD estimate for the period total.

For viewing statistics, a dollar spent from a USD account should stay a dollar until display time; conversion to the household currency (and optional USD total) must use the **NBRB rate for the day the app is used**, not the historical operation-date rate. Historical rates remain relevant for **transfers** between currencies, not for this summary UI.

## Goal

In `CategorySummaryDialog` and `ContactSummaryDialog`:

1. For each foreign-currency operation: keep the account-currency amount as primary; show a smaller family-currency equivalent at today’s NBRB rate.
2. Recalculate the period total in the household base currency at today’s NBRB rate (do not use `amountInHouseholdBaseCurrencyMinor` for this UI).
3. Below that total, show a smaller secondary line in `USD` at the same today’s rate, unless the household base currency is already `USD`.

## Non-goals (v1)

- Category / contact **cards** on list pages
- Changing how operations store historical rates or `amountInHouseholdBaseCurrencyMinor`
- Changing transfer rate semantics
- Configurable secondary currency (always `USD` when shown)
- Server API changes to `getCategoryOperations` / `getContactOperations`

## Approach

**Client-side recalculation** in the two dialogs, reusing:

- `getCurrentExchangeRates` (Belarus local “today”, NBRB-backed)
- `convertCurrency` / `sumMoney`
- A shared `toCurrencyExchangeRates` mapper (currently duplicated on home) moved to a shared module

Optional thin pure helpers for signed amounts / optional equivalents keep Solid out of unit tests.

## Behavior

### Operation row

| Condition | Display |
|-----------|---------|
| Account currency ≠ household base | Primary: signed amount in account currency. Secondary (smaller/muted): `≈` equivalent in base at today’s rate |
| Account currency = household base | Primary only |
| Rate missing for needed currency | Primary only; no secondary |

### Period total

| Condition | Display |
|-----------|---------|
| Rates available | Primary: sum of all operations converted to household base at today’s rate |
| Household base ≠ `USD` and USD rate available | Secondary (smaller/muted): same total converted to `USD` |
| Household base = `USD` | No secondary USD line |
| Rates unavailable | Do not crash the list; omit recalculated total / secondary (same spirit as home family total `try/catch` → `undefined`) |

### Rate date

Always the current snapshot from `getCurrentExchangeRates` (`requestedOn` = Belarus local date at query time). Do not use `operation.exchangeRate` or `amountInHouseholdBaseCurrencyMinor` for these display totals/equivalents.

## Data flow

```text
getCategoryOperations / getContactOperations  →  items (account amounts)
getCurrentExchangeRates                       →  quotes for “today”
toCurrencyExchangeRates                       →  CurrencyExchangeRates
convertCurrency / sumMoney                    →  row equivalents + period totals
```

## UI

- Amount column: stack primary + optional secondary.
- Total block: primary base amount + optional secondary USD.
- Styles: existing dialog SCSS modules; secondary smaller `font-size` and muted color; mobile-first mixins if any layout change is needed.

## Shared code

1. Extract `toCurrencyExchangeRates` from `src/views/home/page.tsx` into a shared place (`~/entities/exchange-rate` or `~/shared/lib`) and switch home to import it.
2. Add pure helpers (suggested location: entity or view-adjacent util used by both dialogs) for:
   - signed account amount
   - optional base equivalent
   - period base total + optional USD total

## Testing

- Unit: foreign → base secondary; same-currency → no secondary; base=`USD` → no USD total line; missing rate → `undefined` / omit secondary.
- Unit: `toCurrencyExchangeRates` mapping of quotes to `ratesToBaseCurrency`.
- Manual: mixed BYN + USD month in category and contact summary dialogs.

## Error handling

Missing or non-positive rates must not throw into the UI. Prefer omitting the dependent secondary/total values over blocking the operations list.
