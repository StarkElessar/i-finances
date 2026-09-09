# Account Transfer Design

## Problem

Today a currency move (e.g. `500 USD → 1507.5 BYN`) is recorded as two normal operations: an `expense` on the USD account and an `income` on the BYN account, usually with a category and contact. Monthly expense summaries include those rows, so analytics show fake spend/income. The money did not leave the household — it only changed accounts.

## Goal

Add first-class **transfers between accounts of different currencies** so that:

- balances on both accounts update correctly;
- a **manual exchange rate** defines the credited amount (`toAmount = fromAmount × rate`);
- optional **contact** can be attached; **category is never used**;
- transfers are **excluded from expense/income statistics**;
- a transfer can be **edited and soft-deleted as one unit** (both legs always together);
- family total continues to use **current NB rates** on account balances (unchanged).

## Non-goals (v1)

- Same-currency transfers
- Autofill of NB rate in the transfer form
- Category on transfers
- Migrating historical fake expense/income pairs into transfers
- Restore-deleted-transfer UI (API may support restore; UI can wait)

## Chosen approach

**Linked operation pair + `transfers` table (Approach A).**

`transfers` is the source of truth for the user-facing transfer. Creating/updating/deleting a transfer atomically writes/updates/soft-deletes two `operations` rows that reference `transferId`. Account balances keep using the existing ledger signed sum. Statistics ignore rows with `transferId IS NOT NULL`.

## Domain model

### Table `transfers`

| Field | Notes |
|---|---|
| `id` | PK |
| `householdId` | FK |
| `fromAccountId`, `toAccountId` | FKs; must be same household; currencies **must differ** in v1 |
| `fromAmountMinor` | Debit amount in from-account currency |
| `toAmountMinor` | Credit amount = `convertMinorUnitsByExchangeRate(fromAmountMinor, exchangeRate)` |
| `exchangeRate` | Manual normalized decimal string; contract `toAmount = fromAmount × rate` |
| `exchangeFromCurrency`, `exchangeToCurrency` | Snapshots from account currencies at write time |
| `happenedOn` | `YYYY-MM-DD` |
| `contactId` | Optional FK |
| `contactNameSnapshot` | Optional |
| `comment` | Optional, same rules as operations |
| `deletedAt`, `deletedByUserId` | Soft delete |
| `createdByUserId`, `updatedByUserId`, `createdAt`, `updatedAt`, `version` | Same patterns as operations |

### Changes to `operations`

- Add nullable `transferId` FK → `transfers.id` (`ON DELETE` restrict; soft-delete cascade is application-level).
- Transfer legs: `categoryId` / `categoryNameSnapshot` always `null`.
- Types remain `expense` (from leg) and `income` (to leg) so existing signed-balance SQL stays valid.
- Titles are system-generated, e.g. `Перевод → {toAccountName}` / `Перевод ← {fromAccountName}`.
- Direct `update` / `softDelete` of a transfer-linked operation is **rejected**; use transfer commands.

### Household base currency amounts

Both legs must store the **same** `amountInHouseholdBaseCurrencyMinor` so a transfer is value-neutral in base terms:

1. If `toCurrency === householdBaseCurrency`: base = `toAmountMinor`.
2. Else if `fromCurrency === householdBaseCurrency`: base = `fromAmountMinor`.
3. Else (both foreign): convert `fromAmountMinor` with the resolved NB quote `from → base` on `happenedOn`, and use that value for **both** legs.

Per-leg operation exchange-rate snapshots:

- Currency == base → synthetic rate `1`, source `identity`.
- Otherwise → rate such that converting `amountMinor` yields the shared base amount (derived from the transfer math / NB quote above), `exchangeRateSource` = `transfer` or the NB source used.

## Statistics

`listMonthlyCategoryExpenses` / `listMonthlyContactExpenses` add `AND transfer_id IS NULL`.

Transfers never appear in category/contact monthly expense cards.

## API

- `createTransfer`
- `updateTransfer` (optimistic concurrency on `transfers.version`)
- `softDeleteTransfer`
- `getTransfer` (for edit dialog; optional if ledger DTO embeds enough)

Input (create/update):

- `fromAccountId`, `toAccountId`
- `fromAmountMinor`
- `exchangeRate` (string, normalized)
- `happenedOn`
- `contactId` nullable
- `comment`
- update also: `id`, `version`

Server validates:

- both accounts active, same household;
- currencies differ;
- accounts are distinct;
- rate normalizes and `toAmountMinor > 0`;
- contact active if provided (archived contact allowed only when already on the transfer, same pattern as operations).

All writes run in **one DB transaction**: transfer row + both operation rows.

## UI

- Square icon button (transfer / `ArrowLeftRight`) opens `TransferDialog`.
- Fields: from account, to account (other currency only), debit amount, manual rate, read-only credit preview, date (default today), optional contact, optional comment.
- Ledger rows for transfer legs show transfer affordance (no category); clicking opens transfer edit dialog (not the regular operation form).
- Delete in that dialog soft-deletes the whole transfer → balances revert.

## Safety for production DB

Do not run experimental migrations or manual tests against `data/i-finances.sqlite` while iterating.

```bash
cp data/i-finances.sqlite data/i-finances.dev.sqlite
DATABASE_URL=./data/i-finances.dev.sqlite pnpm db:migrate
DATABASE_URL=./data/i-finances.dev.sqlite pnpm dev
```

Automated tests use `:memory:` SQLite as today.

## Example

Wife receives `500 USD` exchanged at Alfa to `1507.5 BYN` (rate `3.015`):

1. Transfer: from USD account → BYN account, amount `500`, rate `3.015`, contact optional `Альфабанк`.
2. USD balance −500; BYN balance +1507.5.
3. Monthly category/contact expenses unchanged.
4. Family total = sum of account balances converted with **today’s** NB rates.
