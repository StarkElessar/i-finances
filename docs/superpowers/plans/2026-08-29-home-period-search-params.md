# Home Period Search Params Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Persist home operations period mode (`week` / `month` / `year`) in `?period=` via existing schema + `createRouteSearchParams`, always with `replace`.

**Architecture:** Extend `homeSearchParamsSchema`; resolve/normalize period in `HomeContent`; make `OperationsTable` period mode controlled. Anchor stays local.

**Tech Stack:** Zod 4, Solid 1.9, `@solidjs/router`, existing `~/shared/lib/search-params` + `~/shared/routing`.

## Global Constraints

- Tabs, function declarations top-level, brief JSDoc
- Effects immediately before `return` when touching component body order
- Period writes always `{ history: 'replace' }`
- Account selection history unchanged (`push` / normalize `replace`)
- Do not commit unless asked

---

### Task 1: Schema + parse safety for `period`

**Files:**
- Modify: `src/views/home/model/home-search-params.ts`
- Modify: `tests/shared/lib/search-params.test.ts` (or add home-schema-focused cases in same file / new `tests/views/home/home-search-params.test.ts`)

**Interfaces:**
- Produces: `homeSearchParamsSchema` with optional `period: 'week' | 'month' | 'year'`
- Invalid raw `period` parses to `undefined` (`.catch(undefined)`), must not throw

- [x] Add failing test: parse `{ period: 'nope' }` → `{}` / `period` undefined without throw
- [x] Add failing test: parse `{ period: 'week' }` → `{ period: 'week' }`
- [x] Extend schema with `period: z.enum(['week', 'month', 'year']).optional().catch(undefined)`
- [x] `pnpm test -- tests/shared/lib/search-params.test.ts` (and home schema test file if split)

### Task 2: Controlled period mode on OperationsTable

**Files:**
- Modify: `src/views/home/ui/operations-table/operations-table.tsx`

**Interfaces:**
- Consumes: `periodMode: OperationPeriodMode`, `onPeriodModeChange: (mode: OperationPeriodMode) => void`
- Removes internal `periodMode` signal; keeps `periodAnchor` local

- [x] Extend `OperationsTableProps` with `periodMode` and `onPeriodModeChange`
- [x] Replace `periodMode()` signal reads with `props.periodMode`
- [x] `handlePeriodModeChange` calls `props.onPeriodModeChange(mode)` when mode differs
- [x] Typecheck / eslint touched file

### Task 3: Wire HomeContent

**Files:**
- Modify: `src/views/home/page.tsx`

**Interfaces:**
- Consumes: `homeSearch` from Task 1 schema
- Produces: resolved period accessor defaulting to `'month'`; normalize effect; handlers always `replace`

- [x] `periodMode` memo: `homeSearch.params().period ?? 'month'`
- [x] Normalize effect: if URL `period !==` resolved → `setParams({ period: resolved }, { history: 'replace' })`
- [x] `handlePeriodModeChange` → `setParams({ period: mode }, { history: 'replace' })`
- [x] Pass props into `<OperationsTable … />`
- [x] `pnpm typecheck` + eslint on touched files

### Task 4: Manual verify

- [ ] No `period` → URL gains `period=month` (replace), table shows month
- [ ] Click «Неделя» → `?period=week`, reload keeps week; browser back does **not** undo mode alone
- [ ] `?period=nope` → `month` + cleaned URL
- [ ] Account `push` / back still works independently
