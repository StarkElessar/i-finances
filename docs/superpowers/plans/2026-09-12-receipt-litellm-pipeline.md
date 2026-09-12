# Receipt Pipeline: In-Process LiteLLM Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unrun `claude -p` external worker with an in-process
receipt pipeline that calls the corporate LiteLLM proxy (two DeepSeek
models: OCR, then categorization/contact matching), and make the review
screen editable and the receipts list live.

**Architecture:** A background loop inside `apps/api` claims queued jobs
directly against SQLite (no lease/heartbeat — exactly one process ever
runs it), calls LiteLLM twice per receipt (vision OCR, then text
categorization), and writes the validated result. The worker HTTP
protocol, its auth, and the external script are deleted entirely. The
review screen submits fully-specified operation groups (category per
item, one contact, one title per group) instead of trusting the raw model
output, and the receipts list polls while anything is active.

**Tech Stack:** TypeScript, Hono, Drizzle ORM (SQLite/better-sqlite3),
Zod, SolidJS, Vitest, `sharp` (new dependency).

**Spec:** `docs/superpowers/specs/2026-09-12-receipt-litellm-pipeline-design.md`

## Global Constraints

- Currency: v1 still requires the settlement account's currency to equal
  `receipt.currency` (`BYN` only) — unchanged from today.
- No automatic retries: a failed job stays `failed`; a new attempt is only
  created via the existing "request revision" user action.
- No new contact is ever auto-created from a receipt merchant — the
  categorization model may only pick a `contactId` that already exists in
  the household's contacts snapshot, or `null`.
- Exactly one API process runs the processing loop — do not add any
  lease/lock mechanism "just in case"; a crash is handled by resetting
  stale `leased` jobs back to `queued` on the next boot.
- All new/changed server code follows the existing module layout under
  `apps/api/src/modules/receipt-import/`.

---

## File Structure

```
apps/api/src/infrastructure/database/schema/
  receipt-imports.ts            (modify: +2 columns)
  receipt-processing-jobs.ts    (modify: -4 columns)
apps/api/drizzle/
  NNNN_<generated-name>.sql     (new: generated migration)
packages/contracts/src/receipt.ts (modify: schema/contract changes)
apps/api/src/modules/receipt-import/
  receipt-hash.ts                (new: shared sha256Hex helper)
  receipt-import-repository.ts   (modify: replace lease methods)
  receipt-import-service.ts      (modify: createFromImage, approve, remove lease methods)
  receipt-import-errors.ts       (modify: drop unused error classes)
  receipt-import-mappers.ts      (modify: +parseReceiptContactsSnapshot, drop workerId mapping)
  litellm-client.ts              (new: OCR + categorization HTTP calls)
  receipt-image-normalizer.ts    (new: sharp-based JPEG normalization)
  receipt-processing-loop.ts     (new: in-process poll loop)
  receipt-worker-auth.ts         (delete)
  index.ts                       (modify: export list)
apps/api/src/http/
  receipt-import-controller.ts   (modify: drop ReceiptJobLeaseError branch)
  receipt-worker-controller.ts   (delete)
apps/api/src/
  app.ts                         (modify: drop worker routes)
  composition-root.ts            (modify: drop worker controller, add startReceiptProcessing)
  main.ts                        (modify: call startReceiptProcessing)
apps/api/scripts/
  receipt-claude-worker.ts       (delete)
apps/api/package.json            (modify: +sharp, -receipt:claude-worker/-receipt:worker-key scripts)
.env.example                     (modify: env vars)
apps/api/tests/
  receipt-import-service.test.ts (modify: rewrite around new methods/contract)
  receipt-worker-auth.test.ts    (delete)
  litellm-client.test.ts         (new)
  receipt-image-normalizer.test.ts (new)
apps/web/src/entities/receipt-import/model/types.ts (modify: +contactId, new approve input shape)
apps/web/src/views/receipts/page.tsx (modify: polling + editable review)
apps/web/tests/receipt-import-client.test.ts (modify: new approve() payload)
```

---

### Task 1: Schema migration — drop lease columns, add contacts snapshot

**Files:**
- Modify: `apps/api/src/infrastructure/database/schema/receipt-processing-jobs.ts`
- Modify: `apps/api/src/infrastructure/database/schema/receipt-imports.ts`
- Create: `apps/api/drizzle/<generated>.sql` (via `db:generate`, not hand-written)
- Test: `apps/api/tests/receipt-import-service.test.ts` (existing `beforeEach` already runs `migrate()` against `./drizzle` — this task only needs the migration to apply cleanly; behavioral tests come in Task 4)

**Interfaces:**
- Produces: `receiptImports` table gains `contactsSnapshotJson: string`, `contactsSnapshotVersion: string` (both `NOT NULL`, defaulted for existing rows). `receiptProcessingJobs` table loses `workerId`, `leaseTokenHash`, `leaseExpiresAt`, `lastHeartbeatAt`. `ReceiptImportRecord`/`NewReceiptImportRecord`/`ReceiptProcessingJobRecord`/`NewReceiptProcessingJobRecord` (all `$inferSelect`/`$inferInsert` types) update automatically from the schema edit.

- [ ] **Step 1: Edit `receipt-processing-jobs.ts` to drop the lease columns**

In `apps/api/src/infrastructure/database/schema/receipt-processing-jobs.ts`, remove these three lines from the `sqliteTable` column definition (keep everything else — `attempt`, `status`, `requestedPipelineVersion`, `resultSha256`, `lastError`, timestamps, `version` all stay):

```ts
		workerId: text('worker_id'),
		leaseTokenHash: text('lease_token_hash'),
		leaseExpiresAt: integer('lease_expires_at', { mode: 'timestamp_ms' }),
		lastHeartbeatAt: integer('last_heartbeat_at', { mode: 'timestamp_ms' }),
```

- [ ] **Step 2: Edit `receipt-imports.ts` to add the contacts snapshot columns**

In `apps/api/src/infrastructure/database/schema/receipt-imports.ts`, add these two lines immediately after the existing `categoriesSnapshotVersion` field:

```ts
		contactsSnapshotJson: text('contacts_snapshot_json').notNull().default('[]'),
		contactsSnapshotVersion: text('contacts_snapshot_version').notNull().default(''),
```

- [ ] **Step 3: Generate the migration**

Run: `cd apps/api && pnpm run db:generate`

Expected: a new file appears under `apps/api/drizzle/` (e.g.
`0011_something_something.sql`). Open it and confirm it contains four
`ALTER TABLE receipt_processing_jobs DROP COLUMN ...` statements and two
`ALTER TABLE receipt_imports ADD ... DEFAULT ... NOT NULL` statements. If
drizzle-kit instead proposes a full table recreation (rename-copy-drop),
that is also correct for SQLite — accept it as generated, don't hand-edit
the SQL.

- [ ] **Step 4: Apply and verify locally**

Run: `cd apps/api && pnpm run db:migrate`
Expected: `Database migrations applied.` with no errors, against your
local `apps/api/data/i-finances.sqlite`.

- [ ] **Step 5: Run the existing receipt test suite to confirm the schema still boots clean**

Run: `cd apps/api && pnpm vitest run tests/receipt-import-service.test.ts`
Expected: it will **fail** at this point (the test file still calls
`service.leaseNextJob(...)`, which Task 4 removes) — but the failure must
be a TypeScript/runtime error about `leaseNextJob`, not a migration error.
If you see a migration/SQL error here, fix the schema files before moving
on.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/infrastructure/database/schema/receipt-processing-jobs.ts \
        apps/api/src/infrastructure/database/schema/receipt-imports.ts \
        apps/api/drizzle/
git commit -m "feat(db): drop receipt job lease columns, add contacts snapshot"
```

---

### Task 2: Contracts package — result shape, operations-based approve input

**Files:**
- Modify: `packages/contracts/src/receipt.ts`

**Interfaces:**
- Produces: `receiptContactSnapshotSchema` / `ReceiptContactSnapshot`,
  `receiptWorkerResultSchema.receipt.contactId: string | null`,
  `approveReceiptOperationInputSchema` / new `approveReceiptInputSchema`
  shape (`{ accountId, contactId, id, operations, version }`).
- Consumes: nothing from other tasks (contracts package has no internal
  dependency on `apps/api`).

- [ ] **Step 1: Add the contacts snapshot schema**

In `packages/contracts/src/receipt.ts`, add near `receiptCategorySnapshotSchema`:

```ts
export const receiptContactSnapshotSchema = z.object({
	id: entityIdSchema,
	name: z.string().trim().min(1).max(160)
});

export type ReceiptContactSnapshot = z.infer<typeof receiptContactSnapshotSchema>;
```

- [ ] **Step 2: Add `contactId` to the result's receipt object**

In `receiptWorkerResultSchema`, change:

```ts
	receipt: z.object({
		currency: z.literal('BYN'),
		happenedOn: localDateKeySchema,
		items: z.array(receiptItemSchema).min(1).max(1_000),
		merchant: receiptMerchantSchema,
		totalAmountMinor: positiveIntegerSchema
	}),
```

to:

```ts
	receipt: z.object({
		contactId: entityIdSchema.nullable(),
		currency: z.literal('BYN'),
		happenedOn: localDateKeySchema,
		items: z.array(receiptItemSchema).min(1).max(1_000),
		merchant: receiptMerchantSchema,
		totalAmountMinor: positiveIntegerSchema
	}),
```

- [ ] **Step 3: Set up vitest for `packages/contracts` (it has no test infra yet)**

Confirmed: `packages/contracts/package.json` currently has only `build`
and `typecheck` scripts, no `tests/` directory, no vitest dependency.
Add it, mirroring `apps/mcp`'s setup:

Run: `cd packages/contracts && pnpm add -D vitest@^4.1.10`

Create `packages/contracts/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node'
	}
});
```

Add `"test": "vitest run"` to the `"scripts"` object in
`packages/contracts/package.json` (alongside the existing `build` and
`typecheck` entries).

- [ ] **Step 4: Write a failing test for the new approve input shape**

Create `packages/contracts/tests/receipt.test.ts`:

```ts
import { approveReceiptInputSchema } from '../src/receipt';
import { describe, expect, it } from 'vitest';

describe('approveReceiptInputSchema', () => {
	it('accepts an explicit list of finalized operations with a receipt-level contact', () => {
		const parsed = approveReceiptInputSchema.parse({
			accountId: 'account-1',
			contactId: 'contact-1',
			id: 'receipt-1',
			operations: [{
				amountMinor: 1_250,
				categoryId: 'category-food',
				itemIndexes: [0],
				title: 'Продукты'
			}],
			version: 3
		});

		expect(parsed.operations).toHaveLength(1);
		expect(parsed.contactId).toBe('contact-1');
	});

	it('rejects an operation with no item indexes', () => {
		expect(() => approveReceiptInputSchema.parse({
			accountId: 'account-1',
			contactId: null,
			id: 'receipt-1',
			operations: [{ amountMinor: 100, categoryId: null, itemIndexes: [], title: 'x' }],
			version: 1
		})).toThrow();
	});
});
```

- [ ] **Step 5: Run it to see it fail**

Run: `cd packages/contracts && pnpm vitest run tests/receipt.test.ts`
Expected: FAIL — `approveReceiptInputSchema` still has the old
`{ accountId, id, version }` shape, so `.parse` either throws on the new
fields being present-but-unvalidated or the "rejects" case doesn't throw.

- [ ] **Step 6: Replace `approveReceiptInputSchema` and remove worker-protocol schemas**

Replace:

```ts
export const approveReceiptInputSchema = z.object({
	accountId: entityIdSchema,
	id: entityIdSchema,
	version: z.number().int().positive()
});

export type ApproveReceiptInput = z.infer<typeof approveReceiptInputSchema>;
```

with:

```ts
export const approveReceiptOperationInputSchema = z.object({
	amountMinor: positiveIntegerSchema,
	categoryId: entityIdSchema.nullable(),
	itemIndexes: z.array(z.number().int().nonnegative()).min(1),
	title: z.string().trim().min(1).max(160)
});

export type ApproveReceiptOperationInput = z.infer<typeof approveReceiptOperationInputSchema>;

export const approveReceiptInputSchema = z.object({
	accountId: entityIdSchema,
	contactId: entityIdSchema.nullable(),
	id: entityIdSchema,
	operations: z.array(approveReceiptOperationInputSchema).min(1).max(50),
	version: z.number().int().positive()
});

export type ApproveReceiptInput = z.infer<typeof approveReceiptInputSchema>;
```

Then delete these exports entirely (they were the HTTP worker protocol,
which no longer exists): `workerIdentitySchema`, `WorkerIdentity`,
`completeReceiptJobInputSchema`, `CompleteReceiptJobInput`,
`failReceiptJobInputSchema`, `FailReceiptJobInput`,
`heartbeatReceiptJobInputSchema`, `HeartbeatReceiptJobInput`,
`leasedReceiptProcessingJobSchema`, `LeasedReceiptProcessingJob`,
`receiptWorkerLeaseResponseSchema`, `receiptWorkerResultResponseSchema`,
`receiptHeartbeatResponseSchema`.

In `receiptProcessingJobSchema`, remove the `workerId: z.string().nullable()`
field (the column is gone).

In `receiptImportCommandErrorCodeSchema`, remove `'worker-authentication'`
and `'worker-configuration'` from the enum list (their error classes are
deleted in Task 4).

- [ ] **Step 7: Run the test again to confirm it passes**

Run: `cd packages/contracts && pnpm vitest run tests/receipt.test.ts`
Expected: PASS.

- [ ] **Step 8: Typecheck the whole workspace to surface every call site that still uses the removed exports**

Run: `pnpm -r run typecheck`
Expected: FAIL, with errors in `apps/api/src/modules/receipt-import/*`,
`apps/api/src/http/receipt-worker-controller.ts`,
`apps/api/scripts/receipt-claude-worker.ts`. This is expected — Tasks 4,
8 fix these. Keep the list of errors; it's your checklist for those tasks.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/ pnpm-lock.yaml
git commit -m "feat(contracts): switch receipt approve input to client-built operations"
```

---

### Task 3: Repository layer — replace lease methods with a single-claimant model

**Files:**
- Modify: `apps/api/src/modules/receipt-import/receipt-import-repository.ts`
- Test: `apps/api/tests/receipt-import-service.test.ts` (covered end-to-end in Task 4 — this task is verified via typecheck + the Task 1 migration test)

**Interfaces:**
- Consumes: `receiptImports`, `receiptProcessingJobs` schemas (Task 1).
- Produces:
  - `claimNextQueuedJob(now: Date): Promise<ClaimedReceiptJobRecord | undefined>`
  - `completeJob(input: CompleteReceiptJobRecordInput): Promise<ReceiptImportAggregateRecord | undefined>` (new input shape: `{ completedAt, jobId, resultJson, resultSha256 }`, no `leaseTokenHash`)
  - `failJob(input: FailReceiptJobRecordInput): Promise<ReceiptImportAggregateRecord | undefined>` (new input shape: `{ error, failedAt, jobId }`, no `leaseTokenHash`)
  - `resetStaleProcessingJobs(now: Date): Promise<number>`
  - `findJobById` stays (drop the `Leased` naming — rename type to `ReceiptJobRecord`)
  - `heartbeatJob` and `leaseNextJob` are removed entirely.

- [ ] **Step 1: Replace the lease-related types**

Replace:

```ts
export type LeasedReceiptJobRecord = {
	import: ReceiptImportRecord;
	job: ReceiptProcessingJobRecord;
};

export type LeaseReceiptJobInput = {
	leaseExpiresAt: Date;
	leaseTokenHash: string;
	now: Date;
	workerId: string;
};

export type CompleteReceiptJobRecordInput = {
	completedAt: Date;
	jobId: string;
	leaseTokenHash: string;
	resultJson: string;
	resultSha256: string;
};

export type FailReceiptJobRecordInput = {
	error: string;
	failedAt: Date;
	jobId: string;
	leaseTokenHash: string;
};
```

with:

```ts
export type ReceiptJobRecord = {
	import: ReceiptImportRecord;
	job: ReceiptProcessingJobRecord;
};

export type ClaimedReceiptJobRecord = ReceiptJobRecord;

export type CompleteReceiptJobRecordInput = {
	completedAt: Date;
	jobId: string;
	resultJson: string;
	resultSha256: string;
};

export type FailReceiptJobRecordInput = {
	error: string;
	failedAt: Date;
	jobId: string;
};
```

- [ ] **Step 2: Update the `ReceiptImportRepository` type**

In the `ReceiptImportRepository` type, replace:

```ts
	findJobById: (jobId: string) => Promise<LeasedReceiptJobRecord | undefined>;
	...
	heartbeatJob: (
		jobId: string,
		leaseTokenHash: string,
		heartbeatAt: Date,
		leaseExpiresAt: Date
	) => Promise<ReceiptProcessingJobRecord | undefined>;
	leaseNextJob: (input: LeaseReceiptJobInput) => Promise<LeasedReceiptJobRecord | undefined>;
```

with:

```ts
	findJobById: (jobId: string) => Promise<ReceiptJobRecord | undefined>;
	...
	claimNextQueuedJob: (now: Date) => Promise<ClaimedReceiptJobRecord | undefined>;
	resetStaleProcessingJobs: (now: Date) => Promise<number>;
```

(leave `completeJob`/`failJob` entries as-is — same names, new input
types already updated in Step 1).

- [ ] **Step 3: Replace the `leaseNextJob` implementation with `claimNextQueuedJob`**

Replace the entire `leaseNextJob` function body (lines defining
`const leaseNextJob = async (...) => database.transaction(...)`, which
included the "reclaim expired leases" block) with:

```ts
	const claimNextQueuedJob = async (
		now: Date
	): Promise<ClaimedReceiptJobRecord | undefined> => database.transaction((transaction) => {
		const row = transaction.select({
			import: receiptImports,
			job: receiptProcessingJobs
		})
			.from(receiptProcessingJobs)
			.innerJoin(receiptImports, eq(receiptProcessingJobs.receiptImportId, receiptImports.id))
			.where(and(
				eq(receiptProcessingJobs.status, 'queued'),
				inArray(receiptImports.status, ['queued', 'revision_requested'])
			))
			.orderBy(asc(receiptProcessingJobs.createdAt), asc(receiptProcessingJobs.id))
			.limit(1)
			.get();

		if (row === undefined) {
			return undefined;
		}

		const claimedJob = transaction.update(receiptProcessingJobs)
			.set({
				attempt: sql`${receiptProcessingJobs.attempt} + 1`,
				status: 'leased',
				updatedAt: now,
				version: sql`${receiptProcessingJobs.version} + 1`
			})
			.where(and(
				eq(receiptProcessingJobs.id, row.job.id),
				eq(receiptProcessingJobs.status, 'queued')
			))
			.returning()
			.get() as ReceiptProcessingJobRecord | undefined;

		if (claimedJob === undefined) {
			return undefined;
		}

		const updatedImport = transaction.update(receiptImports)
			.set({
				status: 'processing',
				updatedAt: now,
				version: sql`${receiptImports.version} + 1`
			})
			.where(eq(receiptImports.id, row.import.id))
			.returning()
			.get();

		return { import: updatedImport, job: claimedJob };
	});
```

Note the job `status` still uses the value `'leased'` — that enum value
is unchanged in the contracts package; only its meaning simplifies to
"currently being processed by the one loop that exists," with no token or
expiry attached to it.

- [ ] **Step 4: Delete `heartbeatJob`**

Delete the entire `heartbeatJob` function.

- [ ] **Step 5: Simplify `completeJob` and `failJob` to drop lease-token matching**

In `completeJob`, remove the `leaseTokenHash` field from both the
`.set({...})` call and the `.where(and(...))` clause — the `where` should
become just `and(eq(receiptProcessingJobs.id, input.jobId), eq(receiptProcessingJobs.status, 'leased'))`
(drop the `eq(receiptProcessingJobs.leaseTokenHash, ...)` and
`gt(receiptProcessingJobs.leaseExpiresAt, ...)` conditions, and drop
`leaseExpiresAt: null, leaseTokenHash: null` from the `.set({...})`).

Apply the same simplification to `failJob`.

- [ ] **Step 6: Add `resetStaleProcessingJobs`**

Add this new function, and add `resetStaleProcessingJobs` to the returned
object at the bottom of the file:

```ts
	const resetStaleProcessingJobs = async (now: Date): Promise<number> => database.transaction((transaction) => {
		const staleJobs = transaction.select({
			id: receiptProcessingJobs.id,
			receiptImportId: receiptProcessingJobs.receiptImportId
		})
			.from(receiptProcessingJobs)
			.where(eq(receiptProcessingJobs.status, 'leased'))
			.all();

		if (staleJobs.length === 0) {
			return 0;
		}

		const staleImportIds = staleJobs.map((job) => job.receiptImportId);

		transaction.update(receiptProcessingJobs)
			.set({ status: 'queued', updatedAt: now, version: sql`${receiptProcessingJobs.version} + 1` })
			.where(eq(receiptProcessingJobs.status, 'leased'))
			.run();

		transaction.update(receiptImports)
			.set({ status: 'queued', updatedAt: now, version: sql`${receiptImports.version} + 1` })
			.where(and(
				inArray(receiptImports.id, staleImportIds),
				eq(receiptImports.status, 'processing')
			))
			.run();

		return staleJobs.length;
	});
```

- [ ] **Step 7: Update the returned object and rename `LeasedReceiptJobRecord` usages**

In the `return { ... }` object at the bottom of `createReceiptImportRepository`,
replace `heartbeatJob, leaseNextJob,` with `claimNextQueuedJob, resetStaleProcessingJobs,`.
Update the `findJobById` return type annotation to `Promise<ReceiptJobRecord | undefined>`.

- [ ] **Step 8: Typecheck this file in isolation**

Run: `cd apps/api && node ./node_modules/typescript7/bin/tsc -p tsconfig.json --noEmit 2>&1 | grep receipt-import-repository`
Expected: no output (no errors originating from this file). Errors from
`receipt-import-service.ts` / controllers are expected and fixed in later
tasks — ignore those for this check.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/receipt-import/receipt-import-repository.ts
git commit -m "feat(receipt-import): replace lease/heartbeat repository methods with single-claimant equivalents"
```

---

### Task 4: Service layer — contacts snapshot, claim/complete/fail, client-driven approve

**Files:**
- Create: `apps/api/src/modules/receipt-import/receipt-hash.ts`
- Modify: `apps/api/src/modules/receipt-import/receipt-import-service.ts`
- Modify: `apps/api/src/modules/receipt-import/receipt-import-mappers.ts`
- Modify: `apps/api/src/modules/receipt-import/receipt-import-errors.ts`
- Modify: `apps/api/tests/receipt-import-service.test.ts`

**Interfaces:**
- Consumes: `ContactRepository.list(householdId, 'active'): Promise<ContactRecord[]>`
  (`apps/api/src/modules/contact/contact-repository.ts:68`, `ContactRecord`
  has `id`/`name`); repository methods from Task 3.
- Produces:
  - `ReceiptImportService.recoverStaleProcessingJobs(): Promise<number>`
  - `ReceiptImportService.claimNextQueuedJob(): Promise<ClaimedReceiptProcessingJob | undefined>`
    (a plain-data shape processing-loop code can act on — see Step 6)
  - `ReceiptImportService.completeJob(jobId: string, result: ReceiptWorkerResult): Promise<ReceiptImport>`
  - `ReceiptImportService.failJob(jobId: string, error: string): Promise<ReceiptImport>`
  - `ReceiptImportService.approve(userId, input: ApproveReceiptInput): Promise<ReceiptImport>` (new input shape from Task 2)
  - `leaseNextJob`, `heartbeatJob`, `readImageForWorker` are removed.

- [ ] **Step 1: Extract the shared hash helper**

Create `apps/api/src/modules/receipt-import/receipt-hash.ts`:

```ts
import { createHash } from 'node:crypto';

export function sha256Hex(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}
```

- [ ] **Step 2: Write the failing tests for the new service behavior**

Replace the entire contents of `apps/api/tests/receipt-import-service.test.ts`
with the version below. It keeps the same fixtures (`beforeEach`,
`createService`, `createWorkerResult`) but adapts every test to the new
claim/complete/approve API, and adds one new test for the editable-review
validation (item coverage + contact-snapshot membership):

```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AppDatabase } from '@/infrastructure/database/client';
import * as schema from '@/infrastructure/database/schema';
import { accounts, categories, contacts, householdMembers, households, users } from '@/infrastructure/database/schema';
import { AccountRepository } from '@/modules/account';
import { CategoryRepository } from '@/modules/category';
import { ContactRepository } from '@/modules/contact';
import { ExchangeRateRepository, ExchangeRateService } from '@/modules/exchange-rate';
import { HouseholdRepository, HouseholdResolver } from '@/modules/household';
import { OperationRepository, OperationService } from '@/modules/operation';
import {
	createReceiptImageStorage,
	createReceiptImportRepository,
	ReceiptImportService
} from '@/modules/receipt-import';

import { receiptWorkerResultSchema } from '@i-finances/contracts';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const USER_ID = 'user-receipt';
const HOUSEHOLD_ID = 'household-receipt';
const FIXED_DATE = new Date('2026-08-08T10:00:00.000Z');

let connection: Database.Database;
let database: AppDatabase;
let imageRoot: string;
let currentDate: Date;

beforeEach(async () => {
	connection = new Database(':memory:');
	connection.pragma('foreign_keys = ON');
	database = drizzle(connection, { schema });
	migrate(database, { migrationsFolder: './drizzle' });
	imageRoot = await mkdtemp(join(tmpdir(), 'i-finances-receipts-'));
	currentDate = FIXED_DATE;

	await database.insert(users).values({
		createdAt: FIXED_DATE,
		displayName: 'Receipt User',
		id: USER_ID,
		isActive: true,
		passwordHash: 'hash',
		updatedAt: FIXED_DATE,
		username: 'receipt-user'
	});
	await database.insert(households).values({
		baseCurrency: 'BYN',
		createdAt: FIXED_DATE,
		id: HOUSEHOLD_ID,
		name: 'Receipt Household',
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
		id: 'account-receipt',
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
	await database.insert(contacts).values({
		archivedAt: null,
		color: '#a06368',
		createdAt: FIXED_DATE,
		createdByUserId: USER_ID,
		householdId: HOUSEHOLD_ID,
		id: 'contact-shop',
		legalName: null,
		name: 'Магазин',
		normalizedLegalName: null,
		normalizedName: 'магазин',
		phone: null,
		type: 'company',
		updatedAt: FIXED_DATE,
		version: 1
	});
});

afterEach(async () => {
	connection.close();
	await rm(imageRoot, { force: true, recursive: true });
});

function createService(): ReceiptImportService {
	let idSequence = 0;
	const householdResolver = new HouseholdResolver(new HouseholdRepository(database), () => currentDate);
	const exchangeRateService = new ExchangeRateService(new ExchangeRateRepository(database));
	const contactRepository = new ContactRepository(database);
	const operationService = new OperationService({
		accountRepository: new AccountRepository(database),
		categoryRepository: new CategoryRepository(database),
		contactRepository,
		exchangeRateResolver: exchangeRateService,
		householdResolver,
		operationRepository: new OperationRepository(database),
		now: () => currentDate
	});

	return new ReceiptImportService({
		accountRepository: new AccountRepository(database),
		categoryRepository: new CategoryRepository(database),
		contactRepository,
		householdResolver,
		imageStorage: createReceiptImageStorage({ rootDirectory: imageRoot }),
		operationService,
		receiptImportRepository: createReceiptImportRepository(database),
		createId: () => `receipt-${++idSequence}`,
		now: () => currentDate
	});
}

function createWorkerResult() {
	return receiptWorkerResultSchema.parse({
		categorizedItems: [{ categoryId: 'category-food', confidence: 0.99, itemIndex: 0 }],
		processor: {
			finishedAt: FIXED_DATE.toISOString(),
			modelVersions: ['deepseek-v4-flash-vision-exp', 'deepseek-v4-flash'],
			pipelineVersion: 'receipt-litellm-v1',
			startedAt: FIXED_DATE.toISOString(),
			workerId: 'api-inprocess'
		},
		rawOcrText: 'Продукты 12.50',
		receipt: {
			contactId: 'contact-shop',
			currency: 'BYN',
			happenedOn: '2026-08-08',
			items: [{
				discountMinor: 0,
				name: 'Продукты',
				quantity: 1,
				totalMinor: 1_250,
				unitPriceMinor: 1_250
			}],
			merchant: {
				address: null,
				displayName: 'Магазин',
				legalName: null,
				unp: null
			},
			totalAmountMinor: 1_250
		},
		schemaVersion: 1,
		warnings: []
	});
}

describe('ReceiptImportService', () => {
	it('keeps the review boundary and creates linked operations only after approval', async () => {
		const service = createService();
		const created = await service.createFromImage(USER_ID, {
			bytes: new Uint8Array([1, 2, 3]),
			contentType: 'image/jpeg',
			originalName: 'receipt.jpg'
		});
		const claimed = await service.claimNextQueuedJob();

		expect(created.status).toBe('queued');
		expect(claimed).toMatchObject({ receiptImportId: created.id, requestedPipelineVersion: 'receipt-litellm-v1' });

		if (claimed === undefined) {
			throw new Error('Expected a claimed receipt job.');
		}

		const completed = await service.completeJob(claimed.processingJobId, createWorkerResult());

		expect(completed.status).toBe('needs_review');
		expect(completed.operationIds).toEqual([]);

		const updatedReview = await service.updateReview(USER_ID, {
			id: created.id,
			review: {
				categorizedItems: [{ categoryId: 'category-food', confidence: null, itemIndex: 0 }],
				happenedOn: '2026-08-07',
				items: [{
					discountMinor: 0,
					name: 'Исправленные продукты',
					quantity: 1,
					totalMinor: 1_300,
					unitPriceMinor: 1_300
				}],
				merchant: {
					address: null,
					displayName: 'Исправленный магазин',
					legalName: null,
					unp: null
				},
				totalAmountMinor: 1_300
			},
			version: completed.version
		});

		expect(updatedReview.result?.receipt.happenedOn).toBe('2026-08-07');

		const approved = await service.approve(USER_ID, {
			accountId: 'account-receipt',
			contactId: 'contact-shop',
			id: created.id,
			operations: [{
				amountMinor: 1_300,
				categoryId: 'category-food',
				itemIndexes: [0],
				title: 'Продукты'
			}],
			version: updatedReview.version
		});

		expect(approved.status).toBe('approved');
		expect(approved.operationIds).toHaveLength(1);

		const operations = await database.select().from(schema.operations);

		expect(operations).toHaveLength(1);
		expect(operations[0]).toMatchObject({ amountMinor: 1_300, categoryId: 'category-food', contactId: 'contact-shop' });
	});

	it('rejects approval when the submitted operations do not cover every item exactly once', async () => {
		const service = createService();
		const created = await service.createFromImage(USER_ID, {
			bytes: new Uint8Array([1, 2, 3]),
			contentType: 'image/jpeg',
			originalName: 'receipt.jpg'
		});
		const claimed = await service.claimNextQueuedJob();

		if (claimed === undefined) {
			throw new Error('Expected a claimed receipt job.');
		}

		const completed = await service.completeJob(claimed.processingJobId, createWorkerResult());

		await expect(service.approve(USER_ID, {
			accountId: 'account-receipt',
			contactId: null,
			id: created.id,
			operations: [],
			version: completed.version
		})).rejects.toThrow();
	});

	it('rejects approval when the contact is not in the stored contacts snapshot', async () => {
		const service = createService();
		const created = await service.createFromImage(USER_ID, {
			bytes: new Uint8Array([1, 2, 3]),
			contentType: 'image/jpeg',
			originalName: 'receipt.jpg'
		});
		const claimed = await service.claimNextQueuedJob();

		if (claimed === undefined) {
			throw new Error('Expected a claimed receipt job.');
		}

		const completed = await service.completeJob(claimed.processingJobId, createWorkerResult());

		await expect(service.approve(USER_ID, {
			accountId: 'account-receipt',
			contactId: 'contact-does-not-exist',
			id: created.id,
			operations: [{
				amountMinor: 1_250,
				categoryId: 'category-food',
				itemIndexes: [0],
				title: 'Продукты'
			}],
			version: completed.version
		})).rejects.toThrow();
	});

	it('resets a job stuck in leased status back to queued on recovery', async () => {
		const service = createService();

		await service.createFromImage(USER_ID, {
			bytes: new Uint8Array([1, 2, 3]),
			contentType: 'image/jpeg',
			originalName: 'receipt.jpg'
		});
		await service.claimNextQueuedJob();

		const recovered = await service.recoverStaleProcessingJobs();

		expect(recovered).toBe(1);

		const claimedAgain = await service.claimNextQueuedJob();

		expect(claimedAgain).not.toBeUndefined();
	});

	it('deletes receipt images only after their retention period passes', async () => {
		const service = createService();
		const created = await service.createFromImage(USER_ID, {
			bytes: new Uint8Array([1, 2, 3]),
			contentType: 'image/jpeg',
			originalName: 'receipt.jpg'
		});
		const claimed = await service.claimNextQueuedJob();

		if (claimed === undefined) {
			throw new Error('Expected a claimed receipt job.');
		}

		const completed = await service.completeJob(claimed.processingJobId, createWorkerResult());

		await service.approve(USER_ID, {
			accountId: 'account-receipt',
			contactId: 'contact-shop',
			id: created.id,
			operations: [{
				amountMinor: 1_250,
				categoryId: 'category-food',
				itemIndexes: [0],
				title: 'Продукты'
			}],
			version: completed.version
		});

		const beforeRetention = await service.deleteExpiredImages();

		expect(beforeRetention.deletedCount).toBe(0);

		currentDate = new Date(FIXED_DATE.getTime() + 40 * 24 * 60 * 60 * 1_000);

		const afterRetention = await service.deleteExpiredImages();

		expect(afterRetention.deletedCount).toBe(1);
	});
});
```

- [ ] **Step 3: Run the suite to confirm it fails for the right reason**

Run: `cd apps/api && pnpm vitest run tests/receipt-import-service.test.ts`
Expected: FAIL — `service.claimNextQueuedJob is not a function`,
`service.completeJob` signature mismatch, `service.recoverStaleProcessingJobs`
missing. These are exactly the methods this task adds.

- [ ] **Step 4: Update the mapper for contacts snapshot and dropped `workerId`**

In `apps/api/src/modules/receipt-import/receipt-import-mappers.ts`, add
next to `parseReceiptCategoriesSnapshot`:

```ts
const contactsSnapshotSchema = z.array(receiptContactSnapshotSchema);

export function parseReceiptContactsSnapshot(value: string) {
	return contactsSnapshotSchema.parse(JSON.parse(value));
}
```

(add `receiptContactSnapshotSchema` to the existing import from
`@i-finances/contracts`). In `toProcessingJob`, remove the `workerId:
record.workerId` line (the field no longer exists on `ReceiptProcessingJobRecord`
after Task 1, and was removed from the contract in Task 2).

- [ ] **Step 5: Remove the now-dead error classes**

In `apps/api/src/modules/receipt-import/receipt-import-errors.ts`, delete
`ReceiptJobLeaseError`, `ReceiptWorkerAuthenticationError`, and
`ReceiptWorkerConfigurationError` — nothing throws them once the lease
protocol and the worker HTTP surface are gone. Keep
`ReceiptImportNotFoundError`, `ReceiptImportVersionConflictError`,
`ReceiptImportStateError`, `ReceiptWorkerResultError` (still thrown by
validation), `ReceiptImageValidationError`.

- [ ] **Step 6: Rewrite `receipt-import-service.ts`**

Apply these changes to `apps/api/src/modules/receipt-import/receipt-import-service.ts`:

1. Update imports: drop `randomBytes` (no more lease tokens — keep
   `createHash`... actually drop `createHash` too, replaced by
   `sha256Hex`); drop `normalizeContactIdentity`,
   `type CompleteReceiptJobInput`, `completeReceiptJobInputSchema`,
   `type FailReceiptJobInput`, `failReceiptJobInputSchema`,
   `type LeasedReceiptProcessingJob` from the `@i-finances/contracts`
   import; add `type ReceiptContactSnapshot`,
   `receiptContactSnapshotSchema` (not directly needed here but confirms
   the mapper import works) and keep everything else. Add
   `import { sha256Hex } from './receipt-hash';` and
   `import { parseReceiptContactsSnapshot } from './receipt-import-mappers';`
   (alongside the existing mapper imports). Drop the import of
   `ReceiptJobLeaseError` from `./receipt-import-errors`.

2. Delete `DEFAULT_LEASE_MILLISECONDS`, the `leaseMilliseconds` field/param,
   and every private `hashValue` definition — replace all call sites of
   `hashValue(...)` with `sha256Hex(...)`.

3. Rename `REQUESTED_PIPELINE_VERSION` value from `'receipt-local-v1'` to
   `'receipt-litellm-v1'`.

4. Delete these functions entirely: `resolveContactIdByMerchantName`,
   `createOperationGroups`, `getCategoryName` (all superseded — contact
   matching and category grouping now happen client-side against the
   model's `contactId`/`categorizedItems`, validated server-side by the
   new `assertApproveOperations` in Step 8 below).

5. In `createFromImage`, right after building `categories`, also build the
   contacts snapshot:

```ts
		const contactRecords = await this.dependencies.contactRepository.list(household.id, 'active');
		const contacts: ReceiptContactSnapshot[] = contactRecords.map((record) => ({
			id: record.id,
			name: record.name
		}));
```

   Then in the `receiptImportRepository.create(...)` call's first
   argument, add:

```ts
					contactsSnapshotJson: JSON.stringify(contacts),
					contactsSnapshotVersion: sha256Hex(JSON.stringify(contacts)),
```

   (next to the existing `categoriesSnapshotJson`/`categoriesSnapshotVersion`
   lines). In the second argument (the job insert literal), remove the
   four lines `lastHeartbeatAt: null,`, `leaseExpiresAt: null,`,
   `leaseTokenHash: null,`, `workerId: null,` (columns no longer exist).

6. In `requestRevision`, remove the same four lines from its job insert
   literal.

7. Replace `leaseNextJob` with:

```ts
	public async claimNextQueuedJob(): Promise<ClaimedReceiptProcessingJob | undefined> {
		const claimed = await this.dependencies.receiptImportRepository.claimNextQueuedJob(this.now());

		if (claimed === undefined) {
			return undefined;
		}

		return {
			attempt: claimed.job.attempt,
			categories: parseReceiptCategoriesSnapshot(claimed.import.categoriesSnapshotJson),
			contacts: parseReceiptContactsSnapshot(claimed.import.contactsSnapshotJson),
			imageStorageKey: claimed.import.imageStorageKey,
			previousResult: parseReceiptWorkerResult(claimed.import.resultJson),
			processingJobId: claimed.job.id,
			receiptImportId: claimed.import.id,
			requestedPipelineVersion: claimed.job.requestedPipelineVersion,
			reviewComment: claimed.import.reviewComment
		};
	}
```

   Add the new exported type right above the class (next to
   `CreateReceiptFromImageInput`):

```ts
export type ClaimedReceiptProcessingJob = {
	attempt: number;
	categories: ReceiptCategorySnapshot[];
	contacts: ReceiptContactSnapshot[];
	imageStorageKey: string;
	previousResult: ReceiptWorkerResult | null;
	processingJobId: string;
	receiptImportId: string;
	requestedPipelineVersion: string;
	reviewComment: string;
};
```

   Note this exposes `imageStorageKey` directly (not a lease-scoped image
   URL) — the processing loop (Task 7) reads the file straight from
   `imageStorage`, in-process, with no HTTP hop.

8. Add `recoverStaleProcessingJobs`:

```ts
	public async recoverStaleProcessingJobs(): Promise<number> {
		return this.dependencies.receiptImportRepository.resetStaleProcessingJobs(this.now());
	}
```

9. Delete `heartbeatJob` and `readImageForWorker` entirely.

10. Replace `completeJob`:

```ts
	public async completeJob(jobId: string, result: ReceiptWorkerResult): Promise<ReceiptImport> {
		const serializedResult = JSON.stringify(result);
		const resultSha256 = sha256Hex(serializedResult);
		const current = await this.dependencies.receiptImportRepository.findJobById(jobId);

		if (current?.job.status === 'completed' && current.job.resultSha256 === resultSha256) {
			const aggregate = await this.dependencies.receiptImportRepository.findById(
				current.import.householdId,
				current.import.id
			);

			if (aggregate !== undefined) {
				return toReceiptImport(aggregate);
			}
		}

		if (current === undefined || current.job.status !== 'leased') {
			throw new ReceiptImportNotFoundError();
		}

		const allowedCategoryIds = new Set(
			parseReceiptCategoriesSnapshot(current.import.categoriesSnapshotJson).map((category) => category.id)
		);
		const invalidCategory = result.categorizedItems.find((item) => (
			item.categoryId !== null && !allowedCategoryIds.has(item.categoryId)
		));

		if (invalidCategory !== undefined) {
			throw new ReceiptWorkerResultError('Результат содержит категорию, которой не было в задании.');
		}

		const allowedContactIds = new Set(
			parseReceiptContactsSnapshot(current.import.contactsSnapshotJson).map((contact) => contact.id)
		);

		if (result.receipt.contactId !== null && !allowedContactIds.has(result.receipt.contactId)) {
			throw new ReceiptWorkerResultError('Результат содержит контакт, которого не было в задании.');
		}

		const completed = await this.dependencies.receiptImportRepository.completeJob({
			completedAt: this.now(),
			jobId,
			resultJson: serializedResult,
			resultSha256
		});

		if (completed === undefined) {
			throw new ReceiptImportNotFoundError();
		}

		return toReceiptImport(completed);
	}
```

11. Replace `failJob`:

```ts
	public async failJob(jobId: string, error: string): Promise<ReceiptImport> {
		const failed = await this.dependencies.receiptImportRepository.failJob({
			error: error.slice(0, 2_000),
			failedAt: this.now(),
			jobId
		});

		if (failed === undefined) {
			throw new ReceiptImportNotFoundError();
		}

		return toReceiptImport(failed);
	}
```

12. Replace `approve` and add `assertApproveOperations` as a private
    method (place it near `assertReviewCategories`, which stays
    unchanged — it's still used by `updateReview`):

```ts
	public async approve(userId: string, unsafeInput: ApproveReceiptInput): Promise<ReceiptImport> {
		const input = approveReceiptInputSchema.parse(unsafeInput);
		const current = await this.requireAggregate(userId, input.id);
		const result = parseReceiptWorkerResult(current.aggregate.import.resultJson);

		if (current.aggregate.import.status !== 'needs_review' || result === null) {
			throw new ReceiptImportStateError('Чек ещё не готов к подтверждению.');
		}

		const account = await this.dependencies.accountRepository.findById(current.householdId, input.accountId);

		if (account === undefined || account.archivedAt !== null) {
			throw new ReceiptImportStateError('Выбранный счёт недоступен.');
		}

		if (account.currency !== result.receipt.currency) {
			throw new ReceiptImportStateError('В первой версии валюта счёта должна совпадать с валютой чека.');
		}

		const categories = parseReceiptCategoriesSnapshot(current.aggregate.import.categoriesSnapshotJson);
		const contacts = parseReceiptContactsSnapshot(current.aggregate.import.contactsSnapshotJson);

		this.assertApproveOperations(input, result, categories, contacts);

		const approvalStarted = await this.dependencies.receiptImportRepository.markApprovalStarted(
			current.householdId,
			input.id,
			input.version,
			input.accountId,
			this.now()
		);

		if (approvalStarted === undefined) {
			throw new ReceiptImportVersionConflictError();
		}

		const linkedGroupKeys = new Set(current.aggregate.links.map((link) => link.groupKey));

		try {
			for (const [operationIndex, operationInput] of input.operations.entries()) {
				const groupKey = String(operationIndex);

				if (linkedGroupKeys.has(groupKey)) {
					continue;
				}

				const itemNames = operationInput.itemIndexes.map(
					(itemIndex) => result.receipt.items[itemIndex].name
				);
				const operation = await this.dependencies.operationService.create(userId, {
					accountId: input.accountId,
					amountMinor: operationInput.amountMinor,
					categoryId: operationInput.categoryId,
					comment: itemNames.join(', ').slice(0, 1_000),
					contactId: input.contactId,
					happenedOn: result.receipt.happenedOn,
					title: operationInput.title,
					type: 'expense'
				});

				await this.dependencies.receiptImportRepository.addOperationLink({
					createdAt: this.now(),
					groupKey,
					operationId: operation.id,
					receiptImportId: input.id
				});
			}
		}
		catch (error: unknown) {
			await this.dependencies.receiptImportRepository.restoreReviewAfterApprovalFailure(
				current.householdId,
				input.id,
				'Не все операции удалось создать. Повторите подтверждение.',
				this.now()
			);
			throw error;
		}

		const approvedAt = this.now();
		const approved = await this.dependencies.receiptImportRepository.finishApproval(
			current.householdId,
			input.id,
			approvedAt,
			new Date(approvedAt.getTime() + this.imageRetentionDays * 24 * 60 * 60 * 1_000)
		);

		if (approved === undefined) {
			throw new ReceiptImportVersionConflictError();
		}

		const aggregate = await this.dependencies.receiptImportRepository.findById(current.householdId, input.id);

		if (aggregate === undefined) {
			throw new ReceiptImportNotFoundError();
		}

		return toReceiptImport(aggregate);
	}

	private assertApproveOperations(
		input: ApproveReceiptInput,
		result: ReceiptWorkerResult,
		categories: readonly ReceiptCategorySnapshot[],
		contacts: readonly ReceiptContactSnapshot[]
	): void {
		const allowedCategoryIds = new Set(categories.map((category) => category.id));
		const allowedContactIds = new Set(contacts.map((contact) => contact.id));

		if (input.contactId !== null && !allowedContactIds.has(input.contactId)) {
			throw new ReceiptImportStateError('Выбранный контакт недоступен для этого чека.');
		}

		const seenItemIndexes = new Set<number>();
		let totalMinor = 0;

		for (const operation of input.operations) {
			if (operation.categoryId !== null && !allowedCategoryIds.has(operation.categoryId)) {
				throw new ReceiptImportStateError('Указана категория, которой не было в задании.');
			}

			for (const itemIndex of operation.itemIndexes) {
				if (itemIndex >= result.receipt.items.length) {
					throw new ReceiptImportStateError('Операция ссылается на отсутствующую строку чека.');
				}

				if (seenItemIndexes.has(itemIndex)) {
					throw new ReceiptImportStateError('Строка чека не может входить в две операции.');
				}

				seenItemIndexes.add(itemIndex);
			}

			totalMinor += operation.amountMinor;
		}

		if (seenItemIndexes.size !== result.receipt.items.length) {
			throw new ReceiptImportStateError('Каждая строка чека должна попасть ровно в одну операцию.');
		}

		if (totalMinor !== result.receipt.totalAmountMinor) {
			throw new ReceiptImportStateError('Сумма операций не совпадает с итогом чека.');
		}
	}
```

13. Delete `readImageForWorker` and `requireActiveLease` entirely (no more
    lease tokens to validate). `readImageForUser` stays unchanged.

- [ ] **Step 7: Run the service test suite again**

Run: `cd apps/api && pnpm vitest run tests/receipt-import-service.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 8: Update `index.ts` exports**

In `apps/api/src/modules/receipt-import/index.ts`:
- Drop the `export { assertReceiptWorkerApiKey } from './receipt-worker-auth';`
  line (file deleted in Task 8).
- Drop `ReceiptJobLeaseError`, `ReceiptWorkerAuthenticationError`,
  `ReceiptWorkerConfigurationError` from the errors export list.
- Update the repository export list: replace `type CompleteReceiptJobRecordInput,`
  (keep it — name unchanged) and drop `type FailReceiptJobRecordInput,`
  — keep it too (name unchanged); drop `type LeasedReceiptJobRecord,` and
  `type LeaseReceiptJobInput,`; add `type ReceiptJobRecord,` and
  `type ClaimedReceiptJobRecord,`.
- Add to the service export list: `type ClaimedReceiptProcessingJob,`.

- [ ] **Step 9: Full workspace typecheck**

Run: `pnpm -r run typecheck`
Expected: remaining errors should now be confined to
`apps/api/src/http/receipt-worker-controller.ts`,
`apps/api/src/composition-root.ts`, `apps/api/src/app.ts`,
`apps/api/scripts/receipt-claude-worker.ts`, and the web files listed in
Tasks 9-11. If `receipt-import-service.ts` or its test still show errors,
fix them before proceeding.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/receipt-import/ apps/api/tests/receipt-import-service.test.ts
git commit -m "feat(receipt-import): in-process job claiming and client-driven approve validation"
```

---

### Task 5: LiteLLM client — OCR and categorization calls

**Files:**
- Create: `apps/api/src/modules/receipt-import/litellm-client.ts`
- Create: `apps/api/tests/litellm-client.test.ts`

**Interfaces:**
- Consumes: `ReceiptCategorySnapshot`, `ReceiptContactSnapshot`,
  `ReceiptWorkerResult`, `receiptWorkerResultSchema` from
  `@i-finances/contracts`.
- Produces:
  - `createLiteLlmClient(options: LiteLlmClientOptions): LiteLlmClient`
  - `LiteLlmClient.extractReceiptText(imageBytes: Uint8Array, imageContentType: string): Promise<string>`
  - `LiteLlmClient.categorizeReceipt(input: CategorizeReceiptInput): Promise<ReceiptWorkerResult>`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/litellm-client.test.ts`:

```ts
import { createLiteLlmClient } from '@/modules/receipt-import/litellm-client';

import { afterEach, describe, expect, it, vi } from 'vitest';

const BASE_OPTIONS = {
	apiKey: 'test-key',
	baseUrl: 'https://litellm.example.com/v1',
	categorizationModel: 'deepseek-v4-flash',
	ocrModel: 'deepseek-v4-flash-vision-exp',
	timeoutMs: 5_000
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('createLiteLlmClient', () => {
	it('sends the image as an OpenAI-style image_url content block and returns the model text', async () => {
		const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
			expect(url).toBe('https://litellm.example.com/v1/chat/completions');
			const body = JSON.parse(init.body as string);

			expect(body.model).toBe('deepseek-v4-flash-vision-exp');
			expect(body.messages[0].content[1].type).toBe('image_url');
			expect(body.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);

			return new Response(JSON.stringify({
				choices: [{ message: { content: 'ИТОГО 62.47' } }]
			}), { status: 200 });
		});

		vi.stubGlobal('fetch', fetchMock);

		const client = createLiteLlmClient(BASE_OPTIONS);
		const text = await client.extractReceiptText(new Uint8Array([1, 2, 3]), 'image/jpeg');

		expect(text).toBe('ИТОГО 62.47');
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('parses a fenced JSON response from the categorization model into a valid ReceiptWorkerResult', async () => {
		const modelJson = {
			categorizedItems: [{ categoryId: 'category-food', confidence: 0.9, itemIndex: 0 }],
			rawOcrText: 'Продукты 12.50',
			receipt: {
				contactId: null,
				currency: 'BYN',
				happenedOn: '2026-08-08',
				items: [{
					discountMinor: 0,
					name: 'Продукты',
					quantity: 1,
					totalMinor: 1_250,
					unitPriceMinor: 1_250
				}],
				merchant: { address: null, displayName: 'Магазин', legalName: null, unp: null },
				totalAmountMinor: 1_250
			},
			warnings: []
		};

		vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
			choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(modelJson)}\n\`\`\`` } }]
		}), { status: 200 })));

		const client = createLiteLlmClient(BASE_OPTIONS);
		const result = await client.categorizeReceipt({
			categories: [{ description: '', id: 'category-food', keywords: [], name: 'Продукты' }],
			contacts: [],
			ocrText: 'Продукты 12.50',
			previousResult: null,
			reviewComment: '',
			startedAt: new Date('2026-08-08T10:00:00.000Z')
		});

		expect(result.schemaVersion).toBe(1);
		expect(result.receipt.totalAmountMinor).toBe(1_250);
		expect(result.processor.pipelineVersion).toBe('receipt-litellm-v1');
	});

	it('throws when the LiteLLM response is not ok', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => new Response('server error', { status: 500 })));

		const client = createLiteLlmClient(BASE_OPTIONS);

		await expect(client.extractReceiptText(new Uint8Array([1]), 'image/jpeg')).rejects.toThrow();
	});
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd apps/api && pnpm vitest run tests/litellm-client.test.ts`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement `litellm-client.ts`**

```ts
import type {
	ReceiptCategorySnapshot,
	ReceiptContactSnapshot,
	ReceiptWorkerResult
} from '@i-finances/contracts';
import { receiptWorkerResultSchema } from '@i-finances/contracts';

const PIPELINE_VERSION = 'receipt-litellm-v1';

export type LiteLlmClientOptions = {
	apiKey: string;
	baseUrl: string;
	categorizationModel: string;
	ocrModel: string;
	timeoutMs: number;
};

export type CategorizeReceiptInput = {
	categories: readonly ReceiptCategorySnapshot[];
	contacts: readonly ReceiptContactSnapshot[];
	ocrText: string;
	previousResult: ReceiptWorkerResult | null;
	reviewComment: string;
	startedAt: Date;
};

export type LiteLlmClient = {
	categorizeReceipt: (input: CategorizeReceiptInput) => Promise<ReceiptWorkerResult>;
	extractReceiptText: (imageBytes: Uint8Array, imageContentType: string) => Promise<string>;
};

type ChatCompletionResponse = {
	choices?: Array<{ message?: { content?: string } }>;
};

function extractJsonObject(text: string): unknown {
	const trimmed = text.trim();

	try {
		return JSON.parse(trimmed);
	}
	catch {
		const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/iu.exec(trimmed);

		if (fenceMatch) {
			return JSON.parse(fenceMatch[1].trim());
		}

		const start = trimmed.indexOf('{');
		const end = trimmed.lastIndexOf('}');

		if (start !== -1 && end > start) {
			return JSON.parse(trimmed.slice(start, end + 1));
		}

		throw new Error('Model output did not contain a JSON object.');
	}
}

function buildCategorizationPrompt(input: CategorizeReceiptInput): string {
	const revisionNote = input.reviewComment.trim().length > 0
		? `Пользователь уже отправлял этот чек на доработку с замечанием: "${input.reviewComment.trim()}". Обязательно учти его.`
		: 'Это первая попытка обработки данного чека.';
	const previousResultNote = input.previousResult !== null
		? `Прошлый (отклонённый) результат для сравнения:\n${JSON.stringify(input.previousResult)}`
		: '';

	return [
		'Ты получаешь сырой OCR-текст фотографии чека для семейного бюджетного приложения.',
		`Текст чека:\n${input.ocrText}`,
		revisionNote,
		previousResultNote,
		'',
		'Собери структурированный JSON чека и распредели каждую товарную строку по одной из переданных категорий. '
			+ 'Также попробуй сопоставить продавца чека с одним из переданных контактов.',
		'',
		'Доступные категории (используй только эти id, либо null для "Без категории"):',
		JSON.stringify(input.categories),
		'',
		'Доступные контакты (используй только эти id, либо null, если продавец не совпадает ни с одним):',
		JSON.stringify(input.contacts),
		'',
		'Верни ОДИН JSON-объект и больше ничего — без markdown-разметки, без пояснений до или после. Строго такой формы:',
		JSON.stringify({
			categorizedItems: [{ categoryId: 'id-категории-или-null', confidence: 0.9, itemIndex: 0 }],
			rawOcrText: input.ocrText,
			receipt: {
				contactId: 'id-контакта-или-null',
				currency: 'BYN',
				happenedOn: 'YYYY-MM-DD',
				items: [{
					discountMinor: 0,
					name: 'Название товара',
					quantity: 1,
					totalMinor: 100,
					unitPriceMinor: 100
				}],
				merchant: { address: null, displayName: 'Название магазина или null', legalName: null, unp: null },
				totalAmountMinor: 100
			},
			warnings: []
		}),
		'',
		'Правила: суммы — целые числа в копейках (47.90 BYN -> 4790); ровно одна запись в categorizedItems на '
			+ 'каждую строку receipt.items, itemIndex ссылается на позицию в этом массиве; неизвестные поля — null, '
			+ 'а не пропуск поля; не придумывай данные, которых нет в тексте.'
	].filter((line) => line.length > 0).join('\n');
}

async function postChatCompletion(
	options: LiteLlmClientOptions,
	body: Record<string, unknown>
): Promise<string> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

	try {
		const response = await fetch(`${options.baseUrl}/chat/completions`, {
			body: JSON.stringify(body),
			headers: {
				authorization: `Bearer ${options.apiKey}`,
				'content-type': 'application/json'
			},
			method: 'POST',
			signal: controller.signal
		});

		if (!response.ok) {
			throw new Error(`LiteLLM request failed with status ${response.status}: ${await response.text()}`);
		}

		const payload = await response.json() as ChatCompletionResponse;
		const content = payload.choices?.[0]?.message?.content;

		if (typeof content !== 'string') {
			throw new Error('LiteLLM response did not contain message content.');
		}

		return content;
	}
	finally {
		clearTimeout(timeout);
	}
}

export function createLiteLlmClient(options: LiteLlmClientOptions): LiteLlmClient {
	const extractReceiptText = async (imageBytes: Uint8Array, imageContentType: string): Promise<string> => {
		const base64 = Buffer.from(imageBytes).toString('base64');
		const content = await postChatCompletion(options, {
			messages: [{
				content: [
					{
						text: 'Прочитай изображение чека. Верни только plain-text транскрипцию всего видимого текста '
							+ 'в естественном порядке чтения, построчно. Не добавляй комментариев, не переводи, не '
							+ 'придумывай текст, которого нет.',
						type: 'text'
					},
					{ image_url: { url: `data:${imageContentType};base64,${base64}` }, type: 'image_url' }
				],
				role: 'user'
			}],
			model: options.ocrModel
		});

		return content.trim();
	};

	const categorizeReceipt = async (input: CategorizeReceiptInput): Promise<ReceiptWorkerResult> => {
		const content = await postChatCompletion(options, {
			messages: [{ content: buildCategorizationPrompt(input), role: 'user' }],
			model: options.categorizationModel
		});
		const parsed = extractJsonObject(content) as Record<string, unknown>;

		return receiptWorkerResultSchema.parse({
			...parsed,
			processor: {
				finishedAt: new Date().toISOString(),
				modelVersions: [options.ocrModel, options.categorizationModel],
				pipelineVersion: PIPELINE_VERSION,
				startedAt: input.startedAt.toISOString(),
				workerId: 'api-inprocess'
			},
			schemaVersion: 1
		});
	};

	return { categorizeReceipt, extractReceiptText };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && pnpm vitest run tests/litellm-client.test.ts`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Export from the module index**

In `apps/api/src/modules/receipt-import/index.ts`, add:

```ts
export {
	createLiteLlmClient,
	type CategorizeReceiptInput,
	type LiteLlmClient,
	type LiteLlmClientOptions
} from './litellm-client';
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/receipt-import/litellm-client.ts \
        apps/api/src/modules/receipt-import/index.ts \
        apps/api/tests/litellm-client.test.ts
git commit -m "feat(receipt-import): add LiteLLM client for OCR and categorization"
```

---

### Task 6: Image normalizer — HEIC/PNG/JPEG to JPEG for the outbound model request

**Files:**
- Modify: `apps/api/package.json` (add `sharp` dependency)
- Create: `apps/api/src/modules/receipt-import/receipt-image-normalizer.ts`
- Create: `apps/api/tests/receipt-image-normalizer.test.ts`

**Interfaces:**
- Produces: `normalizeReceiptImageForModel(bytes: Uint8Array): Promise<{ bytes: Uint8Array; contentType: 'image/jpeg' }>`

- [ ] **Step 1: Add the `sharp` dependency**

Run: `cd apps/api && pnpm add sharp`
Expected: `sharp` appears under `dependencies` in `apps/api/package.json`
and `pnpm-lock.yaml` updates. `sharp` ships prebuilt binaries for
`node:24-bookworm-slim` (the Dockerfile's runtime base), so no extra
Dockerfile changes are needed — confirm this later in Task 8's Docker
build check.

- [ ] **Step 2: Write the failing test**

Create `apps/api/tests/receipt-image-normalizer.test.ts`:

```ts
import { normalizeReceiptImageForModel } from '@/modules/receipt-import/receipt-image-normalizer';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

describe('normalizeReceiptImageForModel', () => {
	it('converts a PNG to a JPEG', async () => {
		const png = await sharp({
			create: { background: { b: 0, g: 0, r: 220 }, channels: 3, height: 64, width: 64 }
		}).png().toBuffer();

		const normalized = await normalizeReceiptImageForModel(new Uint8Array(png));

		expect(normalized.contentType).toBe('image/jpeg');
		// JPEG files start with the SOI marker 0xFFD8.
		expect(normalized.bytes[0]).toBe(0xff);
		expect(normalized.bytes[1]).toBe(0xd8);
	});

	it('downsizes an oversized image to at most 2000px on the long edge', async () => {
		const large = await sharp({
			create: { background: { b: 0, g: 0, r: 220 }, channels: 3, height: 3_000, width: 1_000 }
		}).png().toBuffer();

		const normalized = await normalizeReceiptImageForModel(new Uint8Array(large));
		const metadata = await sharp(Buffer.from(normalized.bytes)).metadata();

		expect(metadata.height).toBeLessThanOrEqual(2_000);
	});
});
```

- [ ] **Step 3: Run to confirm it fails**

Run: `cd apps/api && pnpm vitest run tests/receipt-image-normalizer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the normalizer**

```ts
import sharp from 'sharp';

const MAX_DIMENSION = 2_000;
const JPEG_QUALITY = 85;

export type NormalizedReceiptImage = {
	bytes: Uint8Array;
	contentType: 'image/jpeg';
};

export async function normalizeReceiptImageForModel(bytes: Uint8Array): Promise<NormalizedReceiptImage> {
	const buffer = await sharp(bytes)
		.rotate()
		.resize({ fit: 'inside', height: MAX_DIMENSION, width: MAX_DIMENSION, withoutEnlargement: true })
		.jpeg({ quality: JPEG_QUALITY })
		.toBuffer();

	return { bytes: new Uint8Array(buffer), contentType: 'image/jpeg' };
}
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && pnpm vitest run tests/receipt-image-normalizer.test.ts`
Expected: PASS.

- [ ] **Step 6: Export from the module index**

In `apps/api/src/modules/receipt-import/index.ts`, add:

```ts
export { normalizeReceiptImageForModel } from './receipt-image-normalizer';
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml \
        apps/api/src/modules/receipt-import/receipt-image-normalizer.ts \
        apps/api/src/modules/receipt-import/index.ts \
        apps/api/tests/receipt-image-normalizer.test.ts
git commit -m "feat(receipt-import): normalize receipt images to JPEG before sending to the model"
```

---

### Task 7: Processing loop — the in-process replacement for the worker

**Files:**
- Create: `apps/api/src/modules/receipt-import/receipt-processing-loop.ts`
- Create: `apps/api/tests/receipt-processing-loop.test.ts`

**Interfaces:**
- Consumes: `ReceiptImportService.claimNextQueuedJob/completeJob/failJob`
  (Task 4), `LiteLlmClient` (Task 5), `normalizeReceiptImageForModel`
  (Task 6), `ReceiptImageStorage.read` (existing,
  `apps/api/src/modules/receipt-import/receipt-image-storage.ts`).
- Produces: `startReceiptProcessingLoop(options: ReceiptProcessingLoopOptions): ReceiptProcessingLoop`
  with `ReceiptProcessingLoop.stop(): void`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/receipt-processing-loop.test.ts`. This test uses
fake in-memory service/client stubs (not the real DB or network) so it
runs fast and deterministically:

```ts
import { startReceiptProcessingLoop } from '@/modules/receipt-import/receipt-processing-loop';

import type { ReceiptWorkerResult } from '@i-finances/contracts';
import { describe, expect, it, vi } from 'vitest';

function sleep(ms: number): Promise<void> {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

const SAMPLE_RESULT: ReceiptWorkerResult = {
	categorizedItems: [{ categoryId: null, confidence: null, itemIndex: 0 }],
	processor: {
		finishedAt: '2026-08-08T10:00:00.000Z',
		modelVersions: ['ocr-model', 'categorization-model'],
		pipelineVersion: 'receipt-litellm-v1',
		startedAt: '2026-08-08T10:00:00.000Z',
		workerId: 'api-inprocess'
	},
	rawOcrText: 'text',
	receipt: {
		contactId: null,
		currency: 'BYN',
		happenedOn: '2026-08-08',
		items: [{ discountMinor: 0, name: 'x', quantity: 1, totalMinor: 100, unitPriceMinor: 100 }],
		merchant: { address: null, displayName: null, legalName: null, unp: null },
		totalAmountMinor: 100
	},
	schemaVersion: 1,
	warnings: []
};

describe('startReceiptProcessingLoop', () => {
	it('processes one queued job end to end and then waits when the queue is empty', async () => {
		const claimNextQueuedJob = vi.fn()
			.mockResolvedValueOnce({
				attempt: 1,
				categories: [],
				contacts: [],
				imageStorageKey: 'key-1',
				previousResult: null,
				processingJobId: 'job-1',
				receiptImportId: 'receipt-1',
				requestedPipelineVersion: 'receipt-litellm-v1',
				reviewComment: ''
			})
			.mockResolvedValue(undefined);
		const completeJob = vi.fn().mockResolvedValue(undefined);
		const failJob = vi.fn().mockResolvedValue(undefined);
		const readImage = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
		const extractReceiptText = vi.fn().mockResolvedValue('raw ocr text');
		const categorizeReceipt = vi.fn().mockResolvedValue(SAMPLE_RESULT);

		const loop = startReceiptProcessingLoop({
			imageStorage: { read: readImage } as never,
			litellmClient: { categorizeReceipt, extractReceiptText },
			pollIntervalMs: 20,
			receiptImportService: { claimNextQueuedJob, completeJob, failJob } as never
		});

		await sleep(100);
		loop.stop();

		expect(readImage).toHaveBeenCalledWith('key-1');
		expect(extractReceiptText).toHaveBeenCalledTimes(1);
		expect(categorizeReceipt).toHaveBeenCalledTimes(1);
		expect(completeJob).toHaveBeenCalledWith('job-1', SAMPLE_RESULT);
		expect(failJob).not.toHaveBeenCalled();
	});

	it('fails the job when the model call throws, instead of crashing the loop', async () => {
		const claimNextQueuedJob = vi.fn()
			.mockResolvedValueOnce({
				attempt: 1,
				categories: [],
				contacts: [],
				imageStorageKey: 'key-1',
				previousResult: null,
				processingJobId: 'job-1',
				receiptImportId: 'receipt-1',
				requestedPipelineVersion: 'receipt-litellm-v1',
				reviewComment: ''
			})
			.mockResolvedValue(undefined);
		const completeJob = vi.fn();
		const failJob = vi.fn().mockResolvedValue(undefined);

		const loop = startReceiptProcessingLoop({
			imageStorage: { read: vi.fn().mockResolvedValue(new Uint8Array([1])) } as never,
			litellmClient: {
				categorizeReceipt: vi.fn(),
				extractReceiptText: vi.fn().mockRejectedValue(new Error('timeout'))
			},
			pollIntervalMs: 20,
			receiptImportService: { claimNextQueuedJob, completeJob, failJob } as never
		});

		await sleep(100);
		loop.stop();

		expect(failJob).toHaveBeenCalledWith('job-1', 'timeout');
		expect(completeJob).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd apps/api && pnpm vitest run tests/receipt-processing-loop.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the loop**

```ts
import type { ClaimedReceiptProcessingJob, ReceiptImportService } from './receipt-import-service';
import type { ReceiptImageStorage } from './receipt-image-storage';
import { normalizeReceiptImageForModel } from './receipt-image-normalizer';
import type { LiteLlmClient } from './litellm-client';

export type ReceiptProcessingLoopOptions = {
	imageStorage: Pick<ReceiptImageStorage, 'read'>;
	litellmClient: LiteLlmClient;
	pollIntervalMs: number;
	receiptImportService: Pick<ReceiptImportService, 'claimNextQueuedJob' | 'completeJob' | 'failJob'>;
};

export type ReceiptProcessingLoop = {
	stop: () => void;
};

function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolveSleep) => {
		setTimeout(resolveSleep, milliseconds);
	});
}

async function processJob(
	job: ClaimedReceiptProcessingJob,
	options: ReceiptProcessingLoopOptions
): Promise<void> {
	try {
		const imageBytes = await options.imageStorage.read(job.imageStorageKey);
		const normalized = await normalizeReceiptImageForModel(imageBytes);
		const ocrText = await options.litellmClient.extractReceiptText(normalized.bytes, normalized.contentType);
		const result = await options.litellmClient.categorizeReceipt({
			categories: job.categories,
			contacts: job.contacts,
			ocrText,
			previousResult: job.previousResult,
			reviewComment: job.reviewComment,
			startedAt: new Date()
		});

		await options.receiptImportService.completeJob(job.processingJobId, result);
	}
	catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);

		await options.receiptImportService.failJob(job.processingJobId, message);
	}
}

export function startReceiptProcessingLoop(options: ReceiptProcessingLoopOptions): ReceiptProcessingLoop {
	let stopped = false;

	const loop = async (): Promise<void> => {
		while (!stopped) {
			const job = await options.receiptImportService.claimNextQueuedJob();

			if (job === undefined) {
				await sleep(options.pollIntervalMs);
				continue;
			}

			await processJob(job, options);
		}
	};

	void loop();

	return {
		stop: () => {
			stopped = true;
		}
	};
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && pnpm vitest run tests/receipt-processing-loop.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Export from the module index**

In `apps/api/src/modules/receipt-import/index.ts`, add:

```ts
export {
	startReceiptProcessingLoop,
	type ReceiptProcessingLoop,
	type ReceiptProcessingLoopOptions
} from './receipt-processing-loop';
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/receipt-import/receipt-processing-loop.ts \
        apps/api/src/modules/receipt-import/index.ts \
        apps/api/tests/receipt-processing-loop.test.ts
git commit -m "feat(receipt-import): add the in-process receipt processing loop"
```

---

### Task 8: Remove the worker HTTP surface; wire the loop into boot

**Files:**
- Delete: `apps/api/src/http/receipt-worker-controller.ts`
- Delete: `apps/api/src/modules/receipt-import/receipt-worker-auth.ts`
- Delete: `apps/api/scripts/receipt-claude-worker.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/composition-root.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/http/receipt-import-controller.ts`
- Modify: `apps/api/package.json`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `createLiteLlmClient` (Task 5), `startReceiptProcessingLoop`
  (Task 7), `ReceiptImportService.recoverStaleProcessingJobs` (Task 4).
- Produces: `createApiDependencies()` return type gains
  `startReceiptProcessing: () => Promise<ReceiptProcessingLoop | undefined>`.

- [ ] **Step 1: Delete the four worker-only files**

```bash
git rm apps/api/src/http/receipt-worker-controller.ts \
       apps/api/src/modules/receipt-import/receipt-worker-auth.ts \
       apps/api/scripts/receipt-claude-worker.ts \
       apps/api/tests/receipt-worker-auth.test.ts
```

- [ ] **Step 2: Remove worker routes from `app.ts`**

In `apps/api/src/app.ts`:
- Remove the `import type { ReceiptWorkerHttpController } from '@/http/receipt-worker-controller';` line.
- Remove `receiptWorkerController?: ReceiptWorkerHttpController;` from `ApiAppDependencies`.
- Remove the entire block:

```ts
	if (dependencies.receiptWorkerController !== undefined) {
		const receiptWorkerController = dependencies.receiptWorkerController;

		app.post('/api/receipt-worker/jobs/lease', receiptWorkerController.lease());
		app.get('/api/receipt-worker/jobs/:id/image', receiptWorkerController.image());
		app.post('/api/receipt-worker/jobs/:id/heartbeat', receiptWorkerController.heartbeat());
		app.post('/api/receipt-worker/jobs/:id/complete', receiptWorkerController.complete());
		app.post('/api/receipt-worker/jobs/:id/fail', receiptWorkerController.fail());
	}
```

- [ ] **Step 3: Fix `receipt-import-controller.ts`'s error mapping**

In `apps/api/src/http/receipt-import-controller.ts`, in `domainFailure`,
change:

```ts
		if (error instanceof ReceiptImportVersionConflictError || error instanceof ReceiptJobLeaseError) {
```

to:

```ts
		if (error instanceof ReceiptImportVersionConflictError) {
```

and remove `ReceiptJobLeaseError` from the import at the top of the file.

- [ ] **Step 4: Rewire `composition-root.ts`**

In `apps/api/src/composition-root.ts`:
- Remove `import { ReceiptWorkerHttpController } from './http/receipt-worker-controller';`.
- Add `import { createLiteLlmClient, startReceiptProcessingLoop, type ReceiptProcessingLoop } from './modules/receipt-import';`
  (merge into the existing `from './modules/receipt-import'` import
  block).
- Remove `receiptWorkerController: ReceiptWorkerHttpController;` from the
  return type, and add `startReceiptProcessing: () => Promise<ReceiptProcessingLoop | undefined>;`.
- Remove `receiptWorkerController: new ReceiptWorkerHttpController(receiptImportService),`
  from the returned object.
- Add this function above the `return { ... }` statement, and add
  `startReceiptProcessing` (defined below) to the returned object:

```ts
	const startReceiptProcessing = async (): Promise<ReceiptProcessingLoop | undefined> => {
		const apiKey = process.env.RECEIPT_LITELLM_API_KEY;

		if (apiKey === undefined || apiKey.trim() === '') {
			console.warn('RECEIPT_LITELLM_API_KEY is not set; the receipt processing loop will not start.');

			return undefined;
		}

		await receiptImportService.recoverStaleProcessingJobs();

		return startReceiptProcessingLoop({
			imageStorage: createReceiptImageStorage(),
			litellmClient: createLiteLlmClient({
				apiKey,
				baseUrl: process.env.RECEIPT_LITELLM_BASE_URL ?? 'https://litellm.holdingbp.ru:4000/v1',
				categorizationModel: process.env.RECEIPT_LITELLM_CATEGORIZATION_MODEL ?? 'deepseek-v4-flash',
				ocrModel: process.env.RECEIPT_LITELLM_OCR_MODEL ?? 'deepseek-v4-flash-vision-exp',
				timeoutMs: Number(process.env.RECEIPT_PROCESSING_TIMEOUT_MS ?? 120_000)
			}),
			pollIntervalMs: Number(process.env.RECEIPT_PROCESSING_POLL_INTERVAL_MS ?? 5_000),
			receiptImportService
		});
	};
```

(place it after `receiptImportService` is constructed, before the
`return` statement) and add `startReceiptProcessing,` to the returned
object.

- [ ] **Step 5: Start the loop from `main.ts`**

Replace the contents of `apps/api/src/main.ts` with:

```ts
import { createApiApp } from '@/app';
import { createApiDependencies } from '@/composition-root';

import { serve } from '@hono/node-server';

const port = Number(process.env.API_PORT ?? 3001);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error('API_PORT must be a valid TCP port.');
}

const dependencies = createApiDependencies();

void dependencies.startReceiptProcessing();

serve({
	fetch: createApiApp(dependencies).fetch,
	port
}, (info) => {
	console.warn(`API listening on http://localhost:${info.port}`);
});
```

- [ ] **Step 6: Update `package.json` scripts**

In `apps/api/package.json`, remove the `"receipt:claude-worker"` and
`"receipt:worker-key"` script entries — `receipt:claude-worker` pointed at
the now-deleted worker script, and `receipt:worker-key` generated a
`RECEIPT_WORKER_API_KEY`, a concept that no longer exists. Keep
`"receipt:cleanup-images"` (unaffected — image retention cleanup is
unrelated to this redesign). Also delete the now-orphaned
`apps/api/scripts/generate-receipt-worker-api-key.ts` file:

```bash
git rm apps/api/scripts/generate-receipt-worker-api-key.ts
```

- [ ] **Step 7: Update `.env.example`**

In `.env.example`, remove the entire `RECEIPT_WORKER_*` block (from
`# Receipt worker runs as a separate process...` through
`RECEIPT_WORKER_CLAUDE_MODEL=`), and add in its place:

```
# Receipt processing runs in-process inside the API, calling the
# corporate LiteLLM proxy directly. Leave RECEIPT_LITELLM_API_KEY empty
# to disable receipt processing entirely (the API still serves normally).
RECEIPT_LITELLM_BASE_URL=https://litellm.holdingbp.ru:4000/v1
RECEIPT_LITELLM_API_KEY=
RECEIPT_LITELLM_OCR_MODEL=deepseek-v4-flash-vision-exp
RECEIPT_LITELLM_CATEGORIZATION_MODEL=deepseek-v4-flash
RECEIPT_PROCESSING_POLL_INTERVAL_MS=5000
RECEIPT_PROCESSING_TIMEOUT_MS=120000
```

Also update your local `.env` the same way (it's gitignored, so this
step is manual, not part of the commit).

- [ ] **Step 8: Full workspace typecheck**

Run: `pnpm -r run typecheck`
Expected: remaining errors confined to the web files (Tasks 9-11).

- [ ] **Step 9: Full API test suite**

Run: `cd apps/api && pnpm vitest run`
Expected: PASS. This confirms nothing in `app.ts`/`composition-root.ts`
broke the existing HTTP-level tests for other controllers.

- [ ] **Step 10: Verify the Docker build still works with `sharp`**

Run: `docker build -f apps/api/Dockerfile -t i-finances-api-sharp-test .`
from the repo root.
Expected: builds successfully (this confirms `sharp`'s prebuilt binary
resolves cleanly on `node:24-bookworm-slim`, same base image already
used). Clean up afterwards: `docker rmi i-finances-api-sharp-test`.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/composition-root.ts apps/api/src/main.ts \
        apps/api/src/http/receipt-import-controller.ts apps/api/package.json .env.example
git commit -m "feat(receipt-import): remove the worker HTTP surface, start processing in-process"
```

---

### Task 9: Web — sync duplicated types and the new approve() payload

**Files:**
- Modify: `apps/web/src/entities/receipt-import/model/types.ts`
- Modify: `apps/web/tests/receipt-import-client.test.ts`

**Interfaces:**
- Produces: `ReceiptMerchant`/`ReceiptWorkerResult.receipt` type gains
  `contactId: string | null`; new `ApproveReceiptOperationInput`/
  `ApproveReceiptInput` local types matching the contracts package;
  `ReceiptProcessingJob` type drops `workerId`.

Background: this repo keeps a second, independent copy of the receipt
types in `apps/web/src/entities/receipt-import/model/types.ts` — the
actual runtime client (`apps/web/src/features/receipt-import/api/receipt-import-client.ts`)
imports its Zod schemas straight from `@i-finances/contracts`, but
`apps/web/src/views/receipts/page.tsx` imports its **types** from this
local file via the entity's public `index.ts`. There's also a third,
completely unused copy in `apps/web/src/entities/receipt-import/api/receipt-import.contract.ts`
(confirmed via `grep -rn "from '@/entities/receipt-import/api/receipt-import.contract'" apps/web/src`
returning nothing) — leave that file alone, it's pre-existing dead code
unrelated to this feature.

- [ ] **Step 1: Update `model/types.ts`**

In `apps/web/src/entities/receipt-import/model/types.ts`:

1. Add `contactId: string | null;` to the `ReceiptWorkerResult['receipt']`
   inline type (inside the `receipt: { ... }` block of `ReceiptWorkerResult`).
2. Remove `workerId: string | null;` from `ReceiptProcessingJob`.
3. Delete the `LeasedReceiptProcessingJob` type entirely (the worker
   protocol it described no longer exists).
4. Add these new types, matching `packages/contracts/src/receipt.ts`
   exactly:

```ts
export type ApproveReceiptOperationInput = {
	amountMinor: number;
	categoryId: string | null;
	itemIndexes: number[];
	title: string;
};

export type ApproveReceiptInput = {
	accountId: string;
	contactId: string | null;
	id: string;
	operations: ApproveReceiptOperationInput[];
	version: number;
};
```

- [ ] **Step 2: Update the entity's public `index.ts`**

In `apps/web/src/entities/receipt-import/index.ts`, remove
`LeasedReceiptProcessingJob` from the `export type { ... }` list and add
`ApproveReceiptInput` and `ApproveReceiptOperationInput`.

- [ ] **Step 3: Update the client test fixture**

In `apps/web/tests/receipt-import-client.test.ts`, remove `workerId: null,`
from the mocked `latestJob` object in the second test, and change the
final `client.approve(...)` call from:

```ts
	await client.approve({ accountId: 'account-1', id: 'receipt-1', version: 2 });
```

to:

```ts
	await client.approve({
		accountId: 'account-1',
		contactId: null,
		id: 'receipt-1',
		operations: [{ amountMinor: 1_000, categoryId: null, itemIndexes: [0], title: 'Продукты' }],
		version: 2
	});
```

- [ ] **Step 4: Run the web test suite**

Run: `cd apps/web && pnpm vitest run tests/receipt-import-client.test.ts`
Expected: PASS (the client itself didn't change behavior — it still just
parses-and-POSTs whatever `ApproveReceiptInput` shape the contracts
package defines — this test only needed its fixtures updated).

- [ ] **Step 5: Typecheck the web app**

Run: `cd apps/web && pnpm run typecheck` (check the exact script name in
`apps/web/package.json`; it mirrors the API's `typecheck` script).
Expected: errors remaining only in `page.tsx`, fixed in Tasks 10-11.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/entities/receipt-import/ apps/web/tests/receipt-import-client.test.ts
git commit -m "feat(web): sync receipt-import types with the operations-based approve contract"
```

---

### Task 10: Web — live status polling on the receipts list

**Files:**
- Modify: `apps/web/src/views/receipts/page.tsx`

**Interfaces:**
- Consumes: existing `ACTIVE_STATUSES` set, `handleRefresh`,
  `receiptImports()` accessor (all already defined in `ReceiptsContent`).

- [ ] **Step 1: Add the polling effect**

In `apps/web/src/views/receipts/page.tsx`, add `onCleanup` to the
`solid-js` import list (it currently imports `createEffect, createMemo,
createSignal, ErrorBoundary, For, Show` — add `onCleanup`).

Inside `ReceiptsContent()`, right after the `handleRefresh` function
definition, add:

```ts
	const POLL_INTERVAL_MS = 2_500;

	createEffect(() => {
		const hasActiveReceipt = (receiptImports() ?? []).some(
			(receiptImport) => ACTIVE_STATUSES.has(receiptImport.status)
		);

		if (!hasActiveReceipt) {
			return;
		}

		const timer = setInterval(() => {
			void handleRefresh();
		}, POLL_INTERVAL_MS);

		onCleanup(() => clearInterval(timer));
	});
```

This re-runs whenever `receiptImports()` changes (Solid tracks the
signal read inside `.some(...)`), starts an interval only while at least
one receipt is active, and `onCleanup` tears down the previous interval
before either re-arming it or leaving it off once nothing is active
anymore.

- [ ] **Step 2: Manually verify in the browser**

This is a timing-dependent UI behavior that isn't worth a headless test
for a 2.5s poll — verify by hand:

1. Start the dev server (`pnpm run dev` from `apps/api`, and the web dev
   server per `apps/web/package.json`).
2. Upload a receipt photo on `/receipts`.
3. Confirm the row's status updates from "В очереди" through
   "Обрабатывается" to "Нужно проверить" without you clicking the
   refresh button.
4. Confirm that once no receipt is active, the network tab stops showing
   repeated `/api/receipt-imports` requests (open browser devtools →
   Network, filter by that path).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/views/receipts/page.tsx
git commit -m "feat(web): poll the receipts list while a receipt is actively processing"
```

---

### Task 11: Web — editable review (category per item, contact, per-operation title)

**Files:**
- Modify: `apps/web/src/views/receipts/page.tsx`
- Modify: `apps/web/src/views/receipts/receipts.module.scss`

**Interfaces:**
- Consumes: `ApproveReceiptInput`/`ApproveReceiptOperationInput` (Task
  9), existing `approveReceiptAction` from `@/entities/receipt-import`.
- Produces: `ReviewDialog`'s `handleApprove` now builds and submits the
  full `operations[]` array instead of relying on server-side grouping.

Background: today, `createOperationPreviews` (top of `page.tsx`) derives
read-only groups from `result.categorizedItems`. This task keeps that
grouping as the *initial* state but makes it editable before submit.

- [ ] **Step 1: Add local editable state to `ReviewDialog`**

Replace the `operationPreviews` memo and its usage inside `ReviewDialog`
with editable signals. Add near the other `createSignal` calls in
`ReviewDialog`:

```ts
	type EditableOperation = {
		amountMinor: number;
		categoryId: string | null;
		itemIndexes: number[];
		title: string;
	};

	const [editableOperations, setEditableOperations] = createSignal<EditableOperation[]>([]);

	const categoryOptions = createMemo(() => props.receiptImport?.categories ?? []);

	function buildInitialOperations(receiptImport: ReceiptImport): EditableOperation[] {
		const result = receiptImport.result;

		if (result === null) {
			return [];
		}

		const categoriesById = new Map(receiptImport.categories.map((category) => [category.id, category]));
		const groups = new Map<string, EditableOperation>();

		result.receipt.items.forEach((item, itemIndex) => {
			const categoryId = result.categorizedItems.find((entry) => entry.itemIndex === itemIndex)?.categoryId ?? null;
			const groupKey = categoryId ?? 'uncategorized';
			const group = groups.get(groupKey) ?? {
				amountMinor: 0,
				categoryId,
				itemIndexes: [],
				title: categoryId === null ? 'Без категории' : categoriesById.get(categoryId)?.name ?? 'Без категории'
			};

			group.amountMinor += item.totalMinor;
			group.itemIndexes.push(itemIndex);
			groups.set(groupKey, group);
		});

		return [...groups.values()].filter((group) => group.amountMinor > 0);
	}

	function moveItemToCategory(itemIndex: number, categoryId: string | null): void {
		const receiptImport = props.receiptImport;

		if (receiptImport?.result === undefined || receiptImport.result === null) {
			return;
		}

		const items = receiptImport.result.receipt.items;
		const current = editableOperations();
		const remaining = current
			.map((operation) => ({
				...operation,
				itemIndexes: operation.itemIndexes.filter((index) => index !== itemIndex)
			}))
			.filter((operation) => operation.itemIndexes.length > 0);
		const amountMinor = items[itemIndex].totalMinor;
		const targetGroupKey = categoryId ?? 'uncategorized';
		const existingTarget = remaining.find((operation) => operation.categoryId === categoryId);

		if (existingTarget !== undefined) {
			existingTarget.itemIndexes.push(itemIndex);
			existingTarget.amountMinor += amountMinor;
		}
		else {
			const categoriesById = new Map(receiptImport.categories.map((category) => [category.id, category]));

			remaining.push({
				amountMinor,
				categoryId,
				itemIndexes: [itemIndex],
				title: categoryId === null ? 'Без категории' : categoriesById.get(categoryId)?.name ?? targetGroupKey
			});
		}

		setEditableOperations(remaining.map((operation) => ({
			...operation,
			itemIndexes: [...operation.itemIndexes].sort((a, b) => a - b)
		})));
	}

	function updateOperationTitle(operationIndex: number, title: string): void {
		setEditableOperations((operations) => operations.map(
			(operation, index) => (index === operationIndex ? { ...operation, title } : operation)
		));
	}
```

- [ ] **Step 2: Reset editable state whenever the dialog opens for a receipt**

In `syncDefaults` (already called from the existing `createEffect` when
`props.open && props.receiptImport !== undefined`), add:

```ts
		if (receiptImport.result !== null) {
			setEditableOperations(buildInitialOperations(receiptImport));
		}
```

right after the existing `setComment(receiptImport.reviewComment);` line.
Also add a `[contactId, setContactId] = createSignal<string | null>(null)`
signal next to `accountId`/`comment`, initialized in `syncDefaults` with
`setContactId(receiptImport.result?.receipt.contactId ?? null);`.

- [ ] **Step 3: Replace the read-only operations preview markup**

Replace the `<section class={css.operationsPreview}>...</section>` block
(the one rendering `<For each={operationPreviews()}>`) with an editable
version:

```tsx
								<section class={css.operationsPreview}>
									<h3>Будущие операции</h3>
									<For each={editableOperations()}>
										{(operation, operationIndex) => (
											<article class={css.operationCard}>
												<input
													class={css.operationTitleInput}
													value={operation.title}
													onInput={(event) => updateOperationTitle(
														operationIndex(),
														event.currentTarget.value
													)}
												/>
												<b>{formatMinor(operation.amountMinor)}</b>
												<ul class={css.operationItemList}>
													<For each={operation.itemIndexes}>
														{(itemIndex) => (
															<li>
																<span>{result().receipt.items[itemIndex].name}</span>
																<select
																	value={operation.categoryId ?? ''}
																	onChange={(event) => moveItemToCategory(
																		itemIndex,
																		event.currentTarget.value || null
																	)}
																>
																	<option value=''>Без категории</option>
																	<For each={categoryOptions()}>
																		{(category) => (
																			<option value={category.id}>{category.name}</option>
																		)}
																	</For>
																</select>
															</li>
														)}
													</For>
												</ul>
											</article>
										)}
									</For>
								</section>

								<label class={css.selectField}>
									<span>Продавец / контакт</span>
									<select
										value={contactId() ?? ''}
										onChange={(event) => setContactId(event.currentTarget.value || null)}
									>
										<option value=''>Без контакта</option>
										<For each={props.contacts}>
											{(contact) => (
												<option value={contact.id}>{contact.name}</option>
											)}
										</For>
									</select>
								</label>
```

The contact `<select>` needs a real list of household contacts — this
view doesn't currently load contacts. Fetch them the same way `accounts`
is already fetched, but note `getContacts` has a **different signature**
than `getAccounts`: it takes `{ status: ContactListStatus }` (not a plain
boolean) and resolves to `ContactCollection` — `{ baseCurrency, items:
PersistedContact[] }` — not a bare array (confirmed by reading
`apps/web/src/entities/contact/api/contact.client.ts:19` and
`apps/web/src/entities/contact/model/types.ts:22-25`). `PersistedContact`
has `id`/`name` fields, same shape need as the categories snapshot.

In `ReceiptsContent`, near the existing
`const accounts = createAsync(() => getAccounts(false));`, add:

```ts
	const contacts = createAsync(() => getContacts({ status: 'active' }));
```

Import `getContacts` from `@/entities/contact/api`. Pass
`contacts={contacts()?.items ?? []}` down to `<ReviewDialog>` as a new
prop, and add `contacts: readonly PersistedContact[];` to
`ReviewDialogProps` (import `PersistedContact` from `@/entities/contact` —
mirror how `PersistedAccount` is already imported for `accounts` in this
same file).

- [ ] **Step 4: Rewrite `handleApprove` to submit `operations[]`**

Replace the current `handleApprove` body:

```ts
	const handleApprove = async () => {
		const receiptImport = props.receiptImport;

		if (receiptImport === undefined || !accountId()) {
			setError('Выберите счёт списания.');
			return;
		}

		const result = await runApprove({
			accountId: accountId(),
			contactId: contactId(),
			id: receiptImport.id,
			operations: editableOperations().map((operation) => ({
				amountMinor: operation.amountMinor,
				categoryId: operation.categoryId,
				itemIndexes: operation.itemIndexes,
				title: operation.title
			})),
			version: receiptImport.version
		});

		if (!result.ok) {
			setError(result.message);
			return;
		}

		await props.onUpdated();
		props.onOpenChange(false);
	};
```

- [ ] **Step 5: Add the new SCSS classes**

In `apps/web/src/views/receipts/receipts.module.scss`, add (matching the
existing file's conventions — check `.operationCard`'s current rules and
follow the same spacing/border-radius tokens):

```scss
.operationTitleInput {
	background: transparent;
	border: none;
	border-bottom: 1px solid var(--border-color, #ccc);
	font: inherit;
	padding-block-end: 0.25em;
	width: 100%;
}

.operationItemList {
	display: grid;
	gap: 0.5em;
	list-style: none;
	margin: 0;
	padding: 0;

	li {
		align-items: center;
		display: flex;
		gap: 0.5em;
		justify-content: space-between;
	}
}
```

(Adjust the custom property name to whatever the file already uses for
borders — grep the file for `border` before adding a new token name.)

- [ ] **Step 6: Manually verify in the browser**

1. Upload and let a receipt fully process.
2. Open its review dialog. Confirm each item shows a category `<select>`
   pre-filled with the model's pick, and moving an item to a different
   category updates the group totals live.
3. Confirm the contact `<select>` is pre-filled from the model's match
   (or "Без контакта" if none).
4. Edit an operation's title text field, then click "Создать операции".
5. Confirm the created operation(s) show the edited title/category/contact
   by checking the operations table.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/views/receipts/page.tsx apps/web/src/views/receipts/receipts.module.scss
git commit -m "feat(web): make receipt review categories, contact, and titles editable"
```

---

### Task 12: Final full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Full workspace typecheck**

Run: `pnpm -r run typecheck`
Expected: PASS, zero errors anywhere in the workspace.

- [ ] **Step 2: Full workspace test suite**

Run: `pnpm -r run test`
Expected: PASS, including every file touched in Tasks 1-11 and every
pre-existing test untouched by this plan.

- [ ] **Step 3: Confirm the deleted worker script and files are gone**

Run: `find apps/api -iname "*receipt*worker*"`
Expected: no output — `receipt-claude-worker.ts`,
`receipt-worker-controller.ts`, `receipt-worker-auth.ts`,
`receipt-worker-auth.test.ts`, and `generate-receipt-worker-api-key.ts`
must all be gone.

- [ ] **Step 4: Grep for any leftover references to removed exports**

Run: `grep -rn "leaseNextJob\|heartbeatJob\|LeasedReceiptProcessingJob\|ReceiptJobLeaseError\|ReceiptWorkerAuthenticationError\|ReceiptWorkerConfigurationError\|RECEIPT_WORKER_" apps/ packages/ --include="*.ts" --include="*.tsx"`
Expected: no output. If anything remains, it's a missed call site from
an earlier task — fix it and re-run Steps 1-2.

- [ ] **Step 5: Commit if any cleanup was needed**

Only if Step 4 found something to fix:

```bash
git add -A
git commit -m "chore(receipt-import): remove leftover references to the deleted worker protocol"
```

At this point the feature branch (`feat/parse-receipt`) is ready for a
manual end-to-end smoke test against the real corporate LiteLLM (per the
spec's "Verification already done" section) before opening a PR — set
`RECEIPT_LITELLM_API_KEY` in your local `.env`, run `pnpm run dev` from
`apps/api`, and upload a real receipt photo through `/receipts`.
