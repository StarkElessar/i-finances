# Home Account Search Params Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Persist selected home account in `?account=` via Zod schema + portable Solid Router binding.

**Architecture:** Pure parse/serialize in `shared/lib/search-params`; `createRouteSearchParams` adapter; home schema + wire selection/normalization on `HomeContent`.

**Tech Stack:** Zod 4, Solid 1.9, `@solidjs/router` `useSearchParams`.

## Global Constraints

- Tabs, function declarations top-level, brief JSDoc
- Effects immediately before `return` (solid-component-order)
- User select → `push`; URL normalize → `replace`
- No SolidStart imports in search-params layers
- Do not commit unless asked

---

### Task 1: Pure search-params + tests

**Files:**
- Create: `src/shared/lib/search-params/types.ts`
- Create: `src/shared/lib/search-params/parse.ts`
- Create: `src/shared/lib/search-params/serialize.ts`
- Create: `src/shared/lib/search-params/index.ts`
- Modify: `src/shared/lib/index.ts` (re-export)
- Test: `tests/shared/lib/search-params.test.ts`

- [ ] Write failing tests for parse (optional account, array query value) and serialize (omit empty optional as `undefined`)
- [ ] Implement parse/serialize
- [ ] Export from `shared/lib`
- [ ] `pnpm test -- tests/shared/lib/search-params.test.ts`

### Task 2: Solid adapter

**Files:**
- Create: `src/shared/routing/create-route-search-params.ts`
- Create: `src/shared/routing/index.ts`

- [ ] Implement `createRouteSearchParams(schema)` using `useSearchParams`
- [ ] Map `history: 'replace' | 'push'` to `{ replace: boolean }`

### Task 3: Home schema + page wire

**Files:**
- Create: `src/views/home/model/home-search-params.ts`
- Modify: `src/views/home/page.tsx`

- [ ] Define `homeSearchParamsSchema` / types
- [ ] Replace signal-only selection with URL-driven active account + normalize effect
- [ ] `handleAccountSelect` / create-account success → `setParams` with `push`
- [ ] `pnpm typecheck` + eslint on touched files

### Task 4: Manual verify checklist

- [ ] `/` with no query → lands on first account, URL gains `?account=…` (replace)
- [ ] Select another account → URL updates, reload keeps it
- [ ] Browser back returns previous account
- [ ] `?account=missing` → first account + replaced URL
