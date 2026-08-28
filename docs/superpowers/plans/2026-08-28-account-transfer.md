# Account Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First-class cross-currency account transfers with a manual rate, optional contact, atomic create/update/delete, and exclusion from expense statistics.

**Architecture:** A `transfers` row is the source of truth. Each transfer atomically maintains two linked `operations` (`expense` from, `income` to) via `transferId`. Balances reuse existing signed ledger math; monthly expense queries filter `transfer_id IS NULL`.

**Tech Stack:** SolidStart 2 + Solid 1.9, SQLite + Drizzle, Zod, Vitest, existing operation/account/contact services.

## Global Constraints

- Tabs indentation; single quotes; semicolons; Stroustrup braces; 140 max line length
- Function declarations at top level; `const` arrows only inside functions
- Brief JSDoc on exported functions/types
- Kebab-case file and directory names
- Mobile-first SCSS via `~/shared/styles/mixins` only
- Never mutate production `data/i-finances.sqlite` for manual checks — use a copy
- v1: different currencies only; manual rate only; no category on transfers
- Spec: `docs/superpowers/specs/2026-08-28-account-transfer-design.md`

## File map

| Path | Responsibility |
|---|---|
| `src/server/db/schema/transfers.ts` | Drizzle `transfers` table |
| `src/server/db/schema/operations.ts` | Add nullable `transferId` |
| `drizzle/0009_*.sql` | Migration |
| `src/entities/transfer/**` | Types, Zod contracts, server actions |
| `src/server/transfer/**` | Repository, rules, use-cases, service, errors, mappers |
| `src/server/operation/**` | Block direct edit/delete of transfer legs; exclude from expense stats; expose `transferId` on DTO |
| `src/views/home/ui/transfer-dialog/**` | Create/edit dialog UI |
| `src/views/home/page.tsx` | Transfer button + wiring |
| `tests/server/transfer/transfer-service.test.ts` | Integration tests |

---

### Task 1: Schema + migration

**Files:**
- Create: `src/server/db/schema/transfers.ts`
- Modify: `src/server/db/schema/operations.ts`
- Modify: `src/server/db/schema/index.ts`
- Create: migration via `pnpm db:generate`

- [ ] **Step 1: Add `transfers` schema**

Create `src/server/db/schema/transfers.ts` mirroring operation audit/soft-delete fields. Include checks: positive amounts, distinct accounts can be enforced in service (SQLite check optional for currencies).

- [ ] **Step 2: Add `transferId` to operations**

Nullable `text('transfer_id').references(() => transfers.id)` + index `(household_id, transfer_id)`.

Careful: avoid circular import — define `transfers` first; `operations` references `transfers`; `transfers` does not reference `operations`.

- [ ] **Step 3: Export and generate migration**

```bash
pnpm db:generate
```

Do **not** run `pnpm db:migrate` against prod sqlite. Tests use `:memory:` + migrate folder.

- [ ] **Step 4: Verify typecheck for schema**

```bash
pnpm typecheck
```

Expected: pass (or only pre-existing unrelated errors).

- [ ] **Step 5: Commit**

```bash
git add src/server/db/schema drizzle
git commit -m "$(cat <<'EOF'
feat(db): add transfers table and operation transferId

EOF
)"
```

---

### Task 2: Transfer entity types + Zod contracts

**Files:**
- Create: `src/entities/transfer/model/types.ts`
- Create: `src/entities/transfer/model/normalization.ts` (reuse operation comment normalize if possible)
- Create: `src/entities/transfer/api/transfer.contract.ts`
- Create: `src/entities/transfer/index.ts`

**Interfaces:**
- Produces: `Transfer`, `CreateTransferInput`, `UpdateTransferInput`, `ChangeTransferDeletionStateInput`, `TransferCommandResult`

- [ ] **Step 1: Define `Transfer` DTO**

Include: ids, accounts, amounts, currencies, rate, happenedOn, contact, comment, version, deletedAt, timestamps. Optionally embed `fromOperationId` / `toOperationId` for UI.

- [ ] **Step 2: Zod schemas**

Validate positive `fromAmountMinor`, normalize rate via `normalizeExchangeRate`, date via `tryParseLocalDateKey`, optional contact/comment.

- [ ] **Step 3: Commit**

```bash
git add src/entities/transfer
git commit -m "$(cat <<'EOF'
feat(transfer): add transfer entity types and contracts

EOF
)"
```

---

### Task 3: Transfer repository + service create/update/delete (TDD)

**Files:**
- Create: `src/server/transfer/*`
- Modify: `src/server/operation/operation-repository.ts` (insert with transferId; findByTransferId; bulk soft-delete by transferId; update legs)
- Test: `tests/server/transfer/transfer-service.test.ts`

**Interfaces:**
- Produces: `createTransferService` with `create`, `update`, `softDelete`, `getById`
- Consumes: account/contact repos, household resolver, exchange-rate resolver (only for both-foreign base conversion), operation repository, `db.transaction`

- [ ] **Step 1: Write failing tests**

Cover:
1. Create USD→BYN: `500_00` × `3.015` → `1507_50`; two ops; balances move; contact optional.
2. Monthly expense summary unchanged when transfer has a contact (and no category).
3. Soft delete restores balances (ops deleted).
4. Update amount/rate recalculates both legs atomically.
5. Reject same currency / same account.
6. Reject direct operation update/delete when `transferId` set (after Task 4 hooks; can be same PR).

- [ ] **Step 2: Run tests — expect fail**

```bash
pnpm test tests/server/transfer/transfer-service.test.ts
```

- [ ] **Step 3: Implement repository + use-cases + service**

Base-amount rules from the design doc. Use `convertMinorUnitsByExchangeRate` for `toAmountMinor`. Source for transfer-derived op rates: `transfer`. Identity rate when currency == household base.

Generate titles from account names at write time.

- [ ] **Step 4: Run tests — expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/server/transfer src/server/operation tests/server/transfer
git commit -m "$(cat <<'EOF'
feat(transfer): add transfer service create/update/delete

EOF
)"
```

---

### Task 4: Protect transfer legs + exclude from statistics + DTO field

**Files:**
- Modify: `src/server/operation/use-cases/update-operation.ts`
- Modify: `src/server/operation/use-cases/change-operation-deletion-state.ts`
- Modify: `src/server/operation/operation-repository.ts` (`listMonthlyReferenceExpenses`)
- Modify: `src/entities/operation/model/types.ts`, mappers

- [ ] **Step 1: Tests asserting transfer ops excluded from monthly expenses and blocked from direct edit**

- [ ] **Step 2: Implement filters and guards** (`OperationTransferLinkedError` → invalid-state in command adapter)

- [ ] **Step 3: Expose `transferId: string | null` on `Operation` DTO**

- [ ] **Step 4: Commit**

---

### Task 5: Server actions for transfers

**Files:**
- Create: `src/entities/transfer/api/transfer.server.ts`
- Create: `src/entities/transfer/api/transfer-command.ts`
- Modify: `src/entities/transfer/api/index.ts` / entity index

Mirror `operation.server.ts` patterns: `action` + command executor + revalidate ledger/balances/monthly summary.

- [ ] **Step 1: Implement actions `createTransferAction`, `updateTransferAction`, `softDeleteTransferAction`**

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

---

### Task 6: Transfer dialog + home wiring

**Files:**
- Create: `src/views/home/ui/transfer-dialog/transfer-dialog.tsx`
- Create: `src/views/home/ui/transfer-dialog/transfer-dialog.module.scss`
- Create: `src/views/home/ui/transfer-dialog/index.ts`
- Modify: `src/views/home/page.tsx`
- Modify: `src/views/home/ui/operations-table/operations-table.tsx` (click transfer leg → open transfer dialog)

- [ ] **Step 1: Build dialog**

Fields: from/to account comboboxes, amount, rate, read-only credit preview, date (default today), optional contact, comment. Submit create/update. Delete button in edit mode.

- [ ] **Step 2: Add square transfer icon button near create-operation control**

- [ ] **Step 3: When ledger row has `transferId`, open transfer edit instead of operation panel**

Need `getTransfer` query or load transfer by id from action result / dedicated query.

- [ ] **Step 4: Manual smoke on DB copy**

```bash
cp data/i-finances.sqlite data/i-finances.dev.sqlite
DATABASE_URL=./data/i-finances.dev.sqlite pnpm db:migrate
DATABASE_URL=./data/i-finances.dev.sqlite pnpm dev
```

- [ ] **Step 5: Commit**

```bash
git add src/views/home src/entities/transfer
git commit -m "$(cat <<'EOF'
feat(transfer): add transfer dialog and home wiring

EOF
)"
```

---

### Task 7: Update project plan status

**Files:**
- Modify: `development/plan.md` — mark transfers as in progress / done for the checklist items touched

- [ ] **Step 1: Flip `[ ] Переводы между счетами` related bullets**

- [ ] **Step 2: Commit**

---

## Self-review checklist

1. Spec coverage: create/update/delete, manual rate, optional contact, no category, stats exclusion, UI button+dialog, prod DB safety — each has a task.
2. No placeholders in tasks.
3. Types: `Transfer`, `transferId` on `Operation`, Zod inputs named consistently across tasks.
