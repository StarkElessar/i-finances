# Home Period `from` Search Params Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Persist canonical period start as `?from=YYYY-MM-DD` with `period`, always via `replace`.

**Architecture:** Pure `resolveOperationPeriodSearchState` in operation period model; extend home schema; HomeContent normalizes/writes URL; OperationsTable becomes fully controlled for mode + from.

**Tech Stack:** Zod 4, Solid 1.9, existing `createRouteSearchParams`, `~/entities/operation` period helpers.

## Global Constraints

- Tabs, function declarations top-level, brief JSDoc
- Period/from writes always `{ history: 'replace' }`
- Account selection history unchanged
- Do not commit unless asked

---

### Task 1: Export `startOfPeriod` + resolve helper + tests

**Files:**
- Modify: `src/entities/operation/model/period.ts`
- Modify: `src/entities/operation/index.ts`
- Modify: `tests/entities/operation/period.test.ts`

**Interfaces:**
- Produces: `startOfPeriod(date, mode): Date`
- Produces: `resolveOperationPeriodSearchState({ period?, from?, now? }) → { period, from, anchor }`

- [x] Add tests for resolve (month snap, invalid from → now, future clamp, week Monday)
- [x] Export `startOfPeriod`; implement resolve
- [x] `pnpm test -- tests/entities/operation/period.test.ts`

### Task 2: Schema `from` + home schema tests

**Files:**
- Modify: `src/views/home/model/home-search-params.ts`
- Modify: `tests/views/home/home-search-params.test.ts`

- [x] Add `from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined)`
- [x] Tests: valid from, invalid from → undefined, serialize clears omitted from
- [x] `pnpm test -- tests/views/home/home-search-params.test.ts`

### Task 3: Controlled table + HomeContent wire

**Files:**
- Modify: `src/views/home/ui/operations-table/operations-table.tsx`
- Modify: `src/views/home/page.tsx`

- [x] Props: `periodFrom: string`, `onPeriodMove: (offset: number) => void`; drop local anchor
- [x] Home: resolve memo from URL; normalize effect for `period`+`from`; mode/move handlers set both via replace
- [x] `pnpm typecheck` + eslint on touched files

### Task 4: Manual verify

- [ ] No from → current period canonical `from` in URL
- [ ] Arrows update `from` (replace); reload keeps it
- [ ] Mode switch re-snaps `from`; bad/future `from` clamped
