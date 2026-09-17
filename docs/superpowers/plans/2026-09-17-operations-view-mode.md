# Operations View Mode Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the account operations screen render either the existing resizable `Grid` table (desktop/tablet default, ≥768px) or a new compact card list (mobile default, <768px), with a manual `auto | table | list` override that persists in `localStorage` and is changeable from a new "Профиль" settings popup in the account menu.

**Architecture:** Extract the ledger-fetch/filter/sort/group/search state currently baked into `OperationsTable` into a shared hook owned by a new `OperationsWorkspace` container, which renders one shared toolbar and swaps between the (now presentation-only) `OperationsTable` and a new `OperationsList` body. Display-mode preference is a pure, Node-testable module (`entities/operation/model/display-mode.ts`) plus a thin Solid wrapper with a **module-level singleton signal** so the operations page and the header's profile dialog read/write the exact same reactive state without prop-drilling or context.

**Tech Stack:** SolidJS 1.9, `@solidjs/router`, `lucide-solid`, SCSS Modules, Vitest (`apps/web` test script runs with `--environment node` — no DOM/jsdom available, so only DOM-free logic gets unit tests). Tests live in the top-level `apps/web/tests/` directory (mirroring `apps/api/tests/`), one flat file per unit, importing the code under test via the `@/...` path alias (e.g. `@/entities/operation/model/period`) rather than a relative path — every existing test file there is pure-logic (money formatting, date parsing, selectors, icon registry, etc.), consistent with the no-DOM environment; there is no Solid component/DOM testing anywhere in `apps/web`.

**Spec:** `development/operations-view-mode-grill.md` (grill-session record of every decision this plan implements).

## Global Constraints

- Tabs indentation everywhere (`.ts`/`.tsx`/`.scss`), matching the rest of `apps/web`.
- Breakpoint for the auto default is **768px** — reuse this exact value in both the JS `matchMedia` query and any new SCSS (`mx.media-mn(768)`), do **not** reuse the unrelated `60.0625em` constant from `home/page.tsx` (that one is for the operation-details panel only).
- Preference storage is `localStorage` only, per device — no API/DB changes in this plan.
- The preference is a persistent 3-state `auto | table | list`, not a session-only override.
- The shared toolbar (search, sort, period navigation) renders identically in both modes — only the body (`OperationsTable` vs `OperationsList`) swaps.
- No new placeholder/disabled sections in the new settings popup — it ships with exactly one real section ("Отображение операций"). The other settings ideas that came up (currency display, theme, push notifications, Telegram link, display name) are already tracked as separate backlog cards (`ifin-profile-currency-display`, `ifin-profile-theme`, `ifin-profile-push-notifications`, `ifin-profile-telegram-link`, `ifin-profile-display-name`) — out of scope here.
- Selecting a mode in the popup applies instantly (no Save/Cancel) and does not close the dialog.
- Do not touch `ContextMenu`'s component API (no new "selected" item state) — the segmented control lives inside the new `Dialog`, not inside a `ContextMenu.Item`.
- Do not commit unless the user asks.

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/web/src/entities/operation/model/display-mode.ts` | Pure types + `localStorage` read/write + breakpoint resolution (no Solid/DOM at module scope — Node-testable) |
| `apps/web/tests/display-mode.test.ts` | Unit tests for the pure functions above |
| `apps/web/src/entities/operation/model/use-operations-display-mode.ts` | Solid wrapper: module-level singleton signal + `useOperationsDisplayMode()` hook |
| `apps/web/src/entities/operation/index.ts` | Export the new types/functions/hook |
| `apps/web/src/shared/lib/use-media-query.ts` | Generic reactive `matchMedia` hook (extracted pattern, not previously shared) |
| `apps/web/src/shared/lib/index.ts` | Export `useMediaQuery` |
| `apps/web/src/views/home/ui/operation-group-row/operation-group-row.tsx` | `OperationGroupRow`/`GroupIcon`/`BalanceDirection`/`formatGroupLabel`, extracted so both Table and List can render group headers |
| `apps/web/src/views/home/ui/operation-group-row/operation-group-row.module.scss` | Styles moved out of `operations-table.module.scss` |
| `apps/web/src/views/home/ui/operations-table/operations-table.tsx` | Trimmed to a presentational Grid renderer (columns unchanged) |
| `apps/web/src/views/home/ui/operations-table/operations-table.module.scss` | Drop the classes moved into `operation-group-row.module.scss` |
| `apps/web/src/views/home/ui/operations-workspace/lib/use-operations-view.ts` | Extracted ledger-fetch/filter/sort/group/category-resolution hook, shared by both bodies |
| `apps/web/src/views/home/ui/operations-workspace/operations-workspace.tsx` | New container: owns the hook + display-mode, renders the shared toolbar, swaps `OperationsTable`/`OperationsList` |
| `apps/web/src/views/home/ui/operations-workspace/operations-workspace.module.scss` | Toolbar styles moved out of `operations-table.module.scss` |
| `apps/web/src/views/home/ui/operations-list/operations-list.tsx` | New compact card body for mobile |
| `apps/web/src/views/home/ui/operations-list/operations-list.module.scss` | Card styles |
| `apps/web/src/views/home/page.tsx` | Swap `OperationsTable` for `OperationsWorkspace` (same props) |
| `apps/web/src/widgets/app-header/ui/profile-settings-dialog.tsx` | New popup: one section, the display-mode segmented control |
| `apps/web/src/widgets/app-header/ui/profile-settings-dialog.module.scss` | Its styles |
| `apps/web/src/widgets/app-header/ui/profile-menu.tsx` | Enable the "Профиль" item, open the new dialog |

---

### Task 1: Pure display-mode logic

**Files:**
- Create: `apps/web/src/entities/operation/model/display-mode.ts`
- Create: `apps/web/tests/display-mode.test.ts`
- Modify: `apps/web/src/entities/operation/index.ts`

**Interfaces:**
- Produces:
  - `OPERATIONS_DISPLAY_MODE_STORAGE_KEY: string`
  - `type OperationsDisplayModePreference = 'auto' | 'table' | 'list'`
  - `type ResolvedOperationsDisplayMode = 'table' | 'list'`
  - `readStoredOperationsDisplayModePreference(storage: Pick<Storage, 'getItem'>): OperationsDisplayModePreference`
  - `writeStoredOperationsDisplayModePreference(storage: Pick<Storage, 'setItem'>, preference: OperationsDisplayModePreference): void`
  - `resolveOperationsDisplayMode(preference: OperationsDisplayModePreference, isWideViewport: boolean): ResolvedOperationsDisplayMode`

This file must **never** import `solid-js` or touch `window`/`localStorage` directly at module scope — it only accepts a `Storage`-shaped object as a parameter, so it stays importable from a plain Node test.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/display-mode.test.ts
import {
	OPERATIONS_DISPLAY_MODE_STORAGE_KEY,
	readStoredOperationsDisplayModePreference,
	resolveOperationsDisplayMode,
	writeStoredOperationsDisplayModePreference
} from '@/entities/operation/model/display-mode';

import { describe, expect, it, vi } from 'vitest';

function createFakeStorage(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));

	return {
		getItem: vi.fn((key: string) => store.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			store.set(key, value);
		})
	};
}

describe('readStoredOperationsDisplayModePreference', () => {
	it('defaults to auto when nothing is stored', () => {
		const storage = createFakeStorage();

		expect(readStoredOperationsDisplayModePreference(storage)).toBe('auto');
	});

	it('defaults to auto for an unrecognized stored value', () => {
		const storage = createFakeStorage({ [OPERATIONS_DISPLAY_MODE_STORAGE_KEY]: 'garbage' });

		expect(readStoredOperationsDisplayModePreference(storage)).toBe('auto');
	});

	it.each(['table', 'list'] as const)('returns the stored %s preference', (stored) => {
		const storage = createFakeStorage({ [OPERATIONS_DISPLAY_MODE_STORAGE_KEY]: stored });

		expect(readStoredOperationsDisplayModePreference(storage)).toBe(stored);
	});
});

describe('writeStoredOperationsDisplayModePreference', () => {
	it('writes under the shared storage key', () => {
		const storage = createFakeStorage();

		writeStoredOperationsDisplayModePreference(storage, 'list');

		expect(storage.setItem).toHaveBeenCalledWith(OPERATIONS_DISPLAY_MODE_STORAGE_KEY, 'list');
	});
});

describe('resolveOperationsDisplayMode', () => {
	it('follows the viewport when preference is auto', () => {
		expect(resolveOperationsDisplayMode('auto', true)).toBe('table');
		expect(resolveOperationsDisplayMode('auto', false)).toBe('list');
	});

	it('ignores the viewport once the user picked a mode explicitly', () => {
		expect(resolveOperationsDisplayMode('table', false)).toBe('table');
		expect(resolveOperationsDisplayMode('list', true)).toBe('list');
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test -- display-mode`
Expected: FAIL — `./display-mode` has no exported members (module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/entities/operation/model/display-mode.ts

/**
 * localStorage key for the user's manual operations-view preference.
 * Shared between the operations screen (reads the resolved mode) and the
 * profile settings popup (writes the preference) — see
 * `use-operations-display-mode.ts` for the reactive wrapper around this.
 */
export const OPERATIONS_DISPLAY_MODE_STORAGE_KEY = 'i-finances:operations-display-mode';

export type OperationsDisplayModePreference = 'auto' | 'table' | 'list';
export type ResolvedOperationsDisplayMode = 'table' | 'list';

function isOperationsDisplayModePreference(value: string | null): value is OperationsDisplayModePreference {
	return value === 'auto' || value === 'table' || value === 'list';
}

/**
 * Reads the stored preference, defaulting to `auto` for anything missing or
 * unrecognized (e.g. a value written by a future, incompatible version).
 */
export function readStoredOperationsDisplayModePreference(
	storage: Pick<Storage, 'getItem'>
): OperationsDisplayModePreference {
	const stored = storage.getItem(OPERATIONS_DISPLAY_MODE_STORAGE_KEY);

	return isOperationsDisplayModePreference(stored) ? stored : 'auto';
}

export function writeStoredOperationsDisplayModePreference(
	storage: Pick<Storage, 'setItem'>,
	preference: OperationsDisplayModePreference
): void {
	storage.setItem(OPERATIONS_DISPLAY_MODE_STORAGE_KEY, preference);
}

/**
 * `auto` follows the current viewport (768px breakpoint); an explicit
 * `table`/`list` choice always wins regardless of viewport width.
 */
export function resolveOperationsDisplayMode(
	preference: OperationsDisplayModePreference,
	isWideViewport: boolean
): ResolvedOperationsDisplayMode {
	if (preference === 'auto') {
		return isWideViewport ? 'table' : 'list';
	}

	return preference;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm test -- display-mode`
Expected: PASS (7 tests)

- [ ] **Step 5: Export from the entity's public surface**

```ts
// apps/web/src/entities/operation/index.ts
// add alongside the existing exports:
export type {
	OperationsDisplayModePreference,
	ResolvedOperationsDisplayMode
} from './model/display-mode';
export {
	OPERATIONS_DISPLAY_MODE_STORAGE_KEY,
	readStoredOperationsDisplayModePreference,
	resolveOperationsDisplayMode,
	writeStoredOperationsDisplayModePreference
} from './model/display-mode';
```

- [ ] **Step 6: Typecheck and commit**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors

```bash
git add apps/web/src/entities/operation/model/display-mode.ts \
        apps/web/tests/display-mode.test.ts \
        apps/web/src/entities/operation/index.ts
git commit -m "feat(operations): add pure display-mode preference logic"
```

---

### Task 2: Reactive display-mode hook

**Files:**
- Create: `apps/web/src/shared/lib/use-media-query.ts`
- Modify: `apps/web/src/shared/lib/index.ts`
- Create: `apps/web/src/entities/operation/model/use-operations-display-mode.ts`
- Modify: `apps/web/src/entities/operation/index.ts`

**Interfaces:**
- Consumes: `resolveOperationsDisplayMode`, `readStoredOperationsDisplayModePreference`, `writeStoredOperationsDisplayModePreference`, `OperationsDisplayModePreference` from Task 1.
- Produces:
  - `useMediaQuery(query: string): Accessor<boolean>`
  - `useOperationsDisplayMode(): { preference: Accessor<OperationsDisplayModePreference>; resolvedMode: Accessor<ResolvedOperationsDisplayMode>; setPreference: (preference: OperationsDisplayModePreference) => void }`

This hook is deliberately **not** unit-tested: it touches `window`/`localStorage`/`matchMedia`, and `apps/web` has no DOM test environment configured anywhere (same as the pre-existing `use-column-resize.ts` in `shared/ui/grid`, which is also untested) — don't add `jsdom`/`happy-dom` just for this.

**Critical detail — do not get this wrong:** the signal backing `preference` must be created **once, at module scope**, not inside the `useOperationsDisplayMode()` function body. The operations page and the profile settings dialog each call `useOperationsDisplayMode()` independently; if the signal were created inside the function, each caller would get its own private copy and changing the mode in the dialog would never update the operations page. A module-level `createSignal` is shared by every importer of this module (Solid modules are singletons), which is exactly the sharing this needs — no Context/prop-drilling required for a value this small.

- [ ] **Step 1: Extract the generic `matchMedia` hook**

```ts
// apps/web/src/shared/lib/use-media-query.ts
import type { Accessor } from 'solid-js';
import { createSignal, onCleanup } from 'solid-js';

/**
 * Reactive wrapper around `window.matchMedia`. Browser-only — call it from
 * component/module setup code that only runs in the browser (this app is a
 * plain SPA with no SSR, so that's everywhere).
 */
export function useMediaQuery(query: string): Accessor<boolean> {
	const mediaQueryList = window.matchMedia(query);
	const [matches, setMatches] = createSignal(mediaQueryList.matches);
	const handleChange = () => setMatches(mediaQueryList.matches);

	mediaQueryList.addEventListener('change', handleChange);
	onCleanup(() => mediaQueryList.removeEventListener('change', handleChange));

	return matches;
}
```

```ts
// apps/web/src/shared/lib/index.ts
// add alongside the existing exports:
export { useMediaQuery } from './use-media-query';
```

- [ ] **Step 2: Add the shared reactive hook**

```ts
// apps/web/src/entities/operation/model/use-operations-display-mode.ts
import { useMediaQuery } from '@/shared/lib';

import { createMemo, createSignal } from 'solid-js';
import type { Accessor } from 'solid-js';

import {
	readStoredOperationsDisplayModePreference,
	resolveOperationsDisplayMode,
	writeStoredOperationsDisplayModePreference
} from './display-mode';
import type { OperationsDisplayModePreference, ResolvedOperationsDisplayMode } from './display-mode';

/** Matches the `768px` breakpoint token used elsewhere in `apps/web`'s SCSS. */
const WIDE_VIEWPORT_QUERY = '(min-width: 768px)';

// Module-level singleton: every caller of `useOperationsDisplayMode()` shares
// this exact signal, so writing the preference from the profile settings
// dialog is immediately visible on the operations page. See the plan's
// Task 2 note for why this must stay at module scope.
const [preference, setPreferenceSignal] = createSignal<OperationsDisplayModePreference>(
	readStoredOperationsDisplayModePreference(window.localStorage)
);

export type OperationsDisplayMode = {
	preference: Accessor<OperationsDisplayModePreference>;
	resolvedMode: Accessor<ResolvedOperationsDisplayMode>;
	setPreference: (nextPreference: OperationsDisplayModePreference) => void;
};

export function useOperationsDisplayMode(): OperationsDisplayMode {
	const isWideViewport = useMediaQuery(WIDE_VIEWPORT_QUERY);
	const resolvedMode = createMemo(() => resolveOperationsDisplayMode(preference(), isWideViewport()));

	const setPreference = (nextPreference: OperationsDisplayModePreference): void => {
		writeStoredOperationsDisplayModePreference(window.localStorage, nextPreference);
		setPreferenceSignal(nextPreference);
	};

	return { preference, resolvedMode, setPreference };
}
```

```ts
// apps/web/src/entities/operation/index.ts
// add alongside the existing exports:
export type { OperationsDisplayMode } from './model/use-operations-display-mode';
export { useOperationsDisplayMode } from './model/use-operations-display-mode';
```

- [ ] **Step 3: Typecheck and commit**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors (there's nothing to run/render yet — nothing imports these hooks until Task 6/7)

```bash
git add apps/web/src/shared/lib/use-media-query.ts \
        apps/web/src/shared/lib/index.ts \
        apps/web/src/entities/operation/model/use-operations-display-mode.ts \
        apps/web/src/entities/operation/index.ts
git commit -m "feat(operations): add reactive operations-display-mode hook"
```

---

### Task 3: Extract `OperationGroupRow`

**Files:**
- Create: `apps/web/src/views/home/ui/operation-group-row/operation-group-row.tsx`
- Create: `apps/web/src/views/home/ui/operation-group-row/operation-group-row.module.scss`
- Modify: `apps/web/src/views/home/ui/operations-table/operations-table.tsx`
- Modify: `apps/web/src/views/home/ui/operations-table/operations-table.module.scss`

**Interfaces:**
- Produces: `OperationGroupRow(props: { group: OperationGroup; resolveCategoryColor: (operation: OperationWithBalance) => string; resolveCategoryIcon: (operation: OperationWithBalance) => string })` — a plain `<div>`-based row, safe to render both inside `Grid`'s `fullWidthRowTemplate` (current use) and as a standalone block in the new card list (Task 6).
- Consumes (from `@/entities/operation`): `OperationGroup`, `OperationWithBalance`; from `@/shared/lib`: `cn`, `formatDate`, `formatMinorUnitsCurrency`, `parseLocalDateKey`; from `@/entities/category`: `CategoryIcon`.

This task is a pure refactor — behavior must be pixel-identical before and after. Do it as its own commit so a regression is trivially bisectable.

- [ ] **Step 1: Move the styles**

In `apps/web/src/views/home/ui/operations-table/operations-table.module.scss`:
- Delete the block at the line range currently occupied by `.group-row { ... }` through `.group-count { ... }` (this is the contiguous range from `.group-row` down to the closing brace of `.group-count`, i.e. everything currently between `.group-header-row` and the `@include mx.media-mn(720)` block — **keep** `.group-header-row` itself, it stays here because `operations-table.tsx` still applies it directly via `Grid`'s `getRowClass`).
- In the shared `.category-icon, .group-category-icon { ... }` rule near the top of the file, remove `.group-category-icon` from the selector list, leaving just `.category-icon { ... }` (the Grid category-column cell keeps this rule; the group row's icon gets its own standalone rule in the new file below).

Create the new file with everything just removed, self-contained (no shared selector with `.category-icon` anymore):

```scss
// apps/web/src/views/home/ui/operation-group-row/operation-group-row.module.scss
@use "@/shared/styles/functions" as fn;

.group-row {
	--group-color: var(--color-text-tertiary);

	display: grid;
	grid-template-columns: minmax(0, auto) minmax(0, 1fr) auto;
	gap: var(--space-5);
	align-items: center;

	min-block-size: fn.rem(36);
	padding: var(--space-4) var(--space-5);

	font-size: var(--font-size-body-sm);

	background-color: color-mix(in srgb, var(--color-surface-subtle) 82%, var(--color-surface));
	box-shadow: inset 3px 0 0 color-mix(in srgb, var(--group-color) 72%, transparent);
}

.group-heading,
.group-balance {
	display: flex;
	gap: var(--space-3);
	align-items: center;
	min-inline-size: 0;
}

.group-heading {
	font-weight: var(--font-weight-bold);

	> span:last-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
}

.group-category-icon {
	display: grid;
	place-items: center;

	inline-size: fn.rem(20);
	block-size: fn.rem(20);
	border-radius: var(--radius-sm);

	color: var(--group-color);

	background-color: color-mix(in srgb, var(--group-color) 13%, var(--color-surface));
}

.group-balance {
	justify-self: start;
	font-variant-numeric: tabular-nums;
	color: var(--color-text-secondary);
	white-space: nowrap;
}

.group-difference {
	color: var(--color-text-tertiary);
}

.group-difference-positive,
.balance-up {
	color: var(--color-success);
}

.group-difference-negative,
.balance-down {
	color: var(--color-danger);
}

.balance-neutral {
	color: var(--color-text-tertiary);
}

.group-count {
	position: sticky;
	inset-inline-end: fn.rem(6);

	justify-self: end;

	min-inline-size: fn.rem(24);
	padding: var(--space-1) var(--space-3);
	border-radius: var(--radius-sm);

	font-size: var(--font-size-label);
	color: var(--color-text-tertiary);
	text-align: center;

	background-color: var(--color-surface);
}
```

- [ ] **Step 2: Move the component**

```tsx
// apps/web/src/views/home/ui/operation-group-row/operation-group-row.tsx
import css from './operation-group-row.module.scss';

import { cn, formatDate, formatMinorUnitsCurrency } from '@/shared/lib';

import { CategoryIcon } from '@/entities/category';
import type { OperationGroup, OperationWithBalance } from '@/entities/operation';
import { parseLocalDateKey } from '@/entities/operation';

import {
	ArrowDownRight,
	ArrowUpRight,
	Building2,
	CalendarDays,
	CircleDollarSign,
	Minus,
	WalletCards
} from 'lucide-solid';
import type { JSX } from 'solid-js';
import { Show } from 'solid-js';

export type OperationGroupRowProps = {
	group: OperationGroup;
	resolveCategoryColor: (operation: OperationWithBalance) => string;
	resolveCategoryIcon: (operation: OperationWithBalance) => string;
};

function formatGroupLabel(group: OperationGroup): string {
	return group.type === 'date' ? formatDate(parseLocalDateKey(group.label)) : group.label;
}

function GroupIcon(props: { categoryIcon: string; group: OperationGroup }) {
	if (props.group.type === 'date') {
		return <CalendarDays aria-hidden='true' size={15}/>;
	}

	if (props.group.type === 'category') {
		return (
			<span aria-hidden='true' class={css.groupCategoryIcon}>
				<CategoryIcon icon={props.categoryIcon} size={14}/>
			</span>
		);
	}

	if (props.group.type === 'contact') {
		return <Building2 aria-hidden='true' size={15}/>;
	}

	if (props.group.type === 'amount') {
		return <CircleDollarSign aria-hidden='true' size={15}/>;
	}

	return <WalletCards aria-hidden='true' size={15}/>;
}

function BalanceDirection(props: { differenceMinor: number }) {
	if (props.differenceMinor > 0) {
		return <ArrowUpRight aria-label='Баланс увеличился' class={css.balanceUp} size={17}/>;
	}

	if (props.differenceMinor < 0) {
		return <ArrowDownRight aria-label='Баланс уменьшился' class={css.balanceDown} size={17}/>;
	}

	return <Minus aria-label='Баланс не изменился' class={css.balanceNeutral} size={17}/>;
}

export function OperationGroupRow(props: OperationGroupRowProps) {
	const currency = () => props.group.operations[0]?.currency;
	const categoryColor = () => props.resolveCategoryColor(props.group.operations[0]);
	const categoryIcon = () => props.resolveCategoryIcon(props.group.operations[0]);
	const groupStyle = (): JSX.CSSProperties => ({ '--group-color': categoryColor() });

	return (
		<div class={css.groupRow} style={groupStyle()}>
			<span class={css.groupHeading}>
				<GroupIcon categoryIcon={categoryIcon()} group={props.group}/>
				<span>{formatGroupLabel(props.group)}</span>
			</span>
			<Show when={props.group.type === 'date' && currency()}>
				{(resolvedCurrency) => (
					<span class={css.groupBalance}>
						<span>{formatMinorUnitsCurrency(
							props.group.openingBalanceMinor ?? 0,
							resolvedCurrency()
						)}</span>
						<BalanceDirection differenceMinor={props.group.differenceMinor ?? 0}/>
						<span>{formatMinorUnitsCurrency(
							props.group.closingBalanceMinor ?? 0,
							resolvedCurrency()
						)}</span>
						<span
							class={cn(
								css.groupDifference,
								(props.group.differenceMinor ?? 0) > 0 && css.groupDifferencePositive,
								(props.group.differenceMinor ?? 0) < 0 && css.groupDifferenceNegative
							)}
						>
							({formatMinorUnitsCurrency(
								props.group.differenceMinor ?? 0,
								resolvedCurrency(),
								{ signDisplay: 'always' }
							)})
						</span>
					</span>
				)}
			</Show>
			<span class={css.groupCount}>{props.group.operations.length}</span>
		</div>
	);
}
```

- [ ] **Step 3: Update `operations-table.tsx`**

Remove from `apps/web/src/views/home/ui/operations-table/operations-table.tsx`:
- The `formatGroupLabel`, `GroupIcon`, `BalanceDirection`, and `OperationGroupRow` function declarations (the block you just moved verbatim into the new file).
- The now-unused icon imports that only `GroupIcon`/`BalanceDirection` used: `ArrowDownRight`, `ArrowUpRight`, `Building2`, `CalendarDays`, `CircleDollarSign`, `Minus`, `WalletCards` (keep any of these that other code in the file still uses — check before deleting each one; `ArrowDownRight`/`ArrowUpRight` in particular may still be used elsewhere in the column render functions, grep the file for each name before removing its import).

Add the import:

```ts
import { OperationGroupRow } from '../operation-group-row/operation-group-row';
```

The `renderGroupRow` function and the `<Grid fullWidthRowTemplate={...}>` usage stay exactly as they are — they already just call `<OperationGroupRow .../>`, which now resolves to the imported component instead of the local one.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors (an unused-import error means Step 3's grep-before-removing was skipped for one of the icons)

- [ ] **Step 5: Manual smoke check**

Run: `pnpm --filter @i-finances/web dev`, open the operations screen, confirm group headers (date/category/contact/amount, depending on current sort) render exactly as before — same icons, same balance line under date groups, same sticky behavior.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/views/home/ui/operation-group-row \
        apps/web/src/views/home/ui/operations-table/operations-table.tsx \
        apps/web/src/views/home/ui/operations-table/operations-table.module.scss
git commit -m "refactor(operations): extract OperationGroupRow for reuse by the future list view"
```

---

### Task 4: Extract the shared data hook and introduce `OperationsWorkspace`

**Files:**
- Create: `apps/web/src/views/home/ui/operations-workspace/lib/use-operations-view.ts`
- Create: `apps/web/src/views/home/ui/operations-workspace/operations-workspace.tsx`
- Create: `apps/web/src/views/home/ui/operations-workspace/operations-workspace.module.scss`
- Modify: `apps/web/src/views/home/ui/operations-table/operations-table.tsx`
- Modify: `apps/web/src/views/home/ui/operations-table/operations-table.module.scss`
- Modify: `apps/web/src/views/home/page.tsx`

**Interfaces:**
- Produces (from `use-operations-view.ts`):
  ```ts
  export type OperationsView = {
  	canMoveToNextPeriod: Accessor<boolean>;
  	groups: Accessor<OperationGroup[]>;
  	isLoading: Accessor<boolean>;
  	periodAnchor: Accessor<Date>;
  	resolveCategoryColor: (operation: OperationWithBalance) => string;
  	resolveCategoryIcon: (operation: OperationWithBalance) => string;
  	searchQuery: Accessor<string>;
  	setSearchQuery: (value: string) => void;
  	setSort: (sort: OperationSort) => void;
  	sort: Accessor<OperationSort>;
  };
  export function useOperationsView(options: {
  	account: Account;
  	categories: readonly Category[];
  	periodFrom: string;
  	periodMode: OperationPeriodMode;
  }): OperationsView;
  ```
- Produces (from `operations-table.tsx`, new trimmed props — **breaking change**, updated in the same task):
  ```ts
  export type OperationsTableProps = {
  	account: Account;
  	emptyContent: string;
  	groups: OperationGroup[];
  	resolveCategoryColor: (operation: OperationWithBalance) => string;
  	resolveCategoryIcon: (operation: OperationWithBalance) => string;
  	selectedOperationId?: string;
  	sort: OperationSort;
  	onOperationSelect: (operation: OperationWithBalance) => void;
  	onSortFieldChange: (columnId: string) => void;
  };
  ```
- Consumes: everything Task 3 already extracted, plus the existing `@/entities/operation` selectors (`filterOperationRows`, `createOperationGroups`, `getAccountLedger`, `getOperationPeriodRange`, `parseLocalDateKey`, `canMoveToNextOperationPeriod`) and `resolveCategoryIconId`/`DEFAULT_CATEGORY_ICON_ID` from `@/entities/category`.

This is the biggest task in the plan. At the end of it, the app must look and behave **exactly** like before — this task only moves code around; Task 5 adds the one missing toolbar control, Task 6 adds the actual list body.

- [ ] **Step 1: Write the data hook**

```ts
// apps/web/src/views/home/ui/operations-workspace/lib/use-operations-view.ts
import type { Category } from '@/entities/category';
import { DEFAULT_CATEGORY_ICON_ID, resolveCategoryIconId } from '@/entities/category';
import type {
	OperationGroup,
	OperationPeriodMode,
	OperationSort,
	OperationWithBalance
} from '@/entities/operation';
import {
	canMoveToNextOperationPeriod,
	createOperationGroups,
	filterOperationRows,
	getAccountLedger,
	getOperationPeriodRange,
	parseLocalDateKey
} from '@/entities/operation';

import type { Account } from '@/entities/account';

import { createAsync } from '@solidjs/router';
import type { Accessor } from 'solid-js';
import { createMemo, createSignal } from 'solid-js';

const FALLBACK_CATEGORY_COLOR = '#778398';

export type UseOperationsViewOptions = {
	account: Account;
	categories: readonly Category[];
	periodFrom: string;
	periodMode: OperationPeriodMode;
};

export type OperationsView = {
	canMoveToNextPeriod: Accessor<boolean>;
	groups: Accessor<OperationGroup[]>;
	isLoading: Accessor<boolean>;
	periodAnchor: Accessor<Date>;
	resolveCategoryColor: (operation: OperationWithBalance) => string;
	resolveCategoryIcon: (operation: OperationWithBalance) => string;
	searchQuery: Accessor<string>;
	setSearchQuery: (value: string) => void;
	setSort: (sort: OperationSort) => void;
	sort: Accessor<OperationSort>;
};

/**
 * Owns everything the operations screen needs regardless of whether it's
 * rendered as a table or a mobile list: the ledger fetch, search/sort state,
 * derived groups, and category color/icon lookups.
 */
export function useOperationsView(options: UseOperationsViewOptions): OperationsView {
	const [sort, setSort] = createSignal<OperationSort>({ direction: 'desc', field: 'date' });
	const [searchQuery, setSearchQuery] = createSignal('');

	const periodAnchor = createMemo(() => parseLocalDateKey(options.periodFrom));
	const periodRange = createMemo(() => getOperationPeriodRange(periodAnchor(), options.periodMode));
	const ledger = createAsync(() => getAccountLedger({
		accountId: options.account.id,
		...periodRange()
	}));
	const accountRows = () => ledger()?.items ?? [];
	const visibleRows = createMemo(() => filterOperationRows(accountRows(), periodRange(), searchQuery()));
	const groups = createMemo(() => createOperationGroups(visibleRows(), accountRows(), sort()));

	const categoryColorById = createMemo(() => {
		const colorById = new Map<string, string>();

		options.categories.forEach((category) => colorById.set(category.id, category.color));

		return colorById;
	});
	const categoryColorByName = createMemo(() => {
		const colorByName = new Map<string, string>();

		options.categories.forEach((category) => colorByName.set(category.name, category.color));

		return colorByName;
	});
	const categoryIconById = createMemo(() => {
		const iconById = new Map<string, string>();

		options.categories.forEach((category) => {
			iconById.set(category.id, resolveCategoryIconId(category.icon));
		});

		return iconById;
	});
	const categoryIconByName = createMemo(() => {
		const iconByName = new Map<string, string>();

		options.categories.forEach((category) => {
			iconByName.set(category.name, resolveCategoryIconId(category.icon));
		});

		return iconByName;
	});

	const resolveCategoryColor = (operation: OperationWithBalance): string => {
		if (operation.categoryId) {
			const colorById = categoryColorById().get(operation.categoryId);

			if (colorById) {
				return colorById;
			}
		}

		return operation.categoryName
			? categoryColorByName().get(operation.categoryName) ?? FALLBACK_CATEGORY_COLOR
			: FALLBACK_CATEGORY_COLOR;
	};
	const resolveCategoryIcon = (operation: OperationWithBalance): string => {
		if (operation.categoryId) {
			const iconById = categoryIconById().get(operation.categoryId);

			if (iconById) {
				return iconById;
			}
		}

		return operation.categoryName
			? categoryIconByName().get(operation.categoryName) ?? DEFAULT_CATEGORY_ICON_ID
			: DEFAULT_CATEGORY_ICON_ID;
	};

	return {
		canMoveToNextPeriod: createMemo(() => canMoveToNextOperationPeriod(periodAnchor(), options.periodMode, new Date())),
		groups,
		isLoading: () => ledger() === undefined,
		periodAnchor,
		resolveCategoryColor,
		resolveCategoryIcon,
		searchQuery,
		setSearchQuery,
		setSort,
		sort
	};
}
```

- [ ] **Step 2: Trim `operations-table.tsx` down to a presentational Grid renderer**

Replace the whole file with (columns array content is byte-for-byte the same as before — only copy it over unchanged from the current file; everything else here is new):

```tsx
// apps/web/src/views/home/ui/operations-table/operations-table.tsx
import css from './operations-table.module.scss';

import { cn, formatMinorUnitsCurrency } from '@/shared/lib';
import type { GridColumn } from '@/shared/ui/grid';
import { Grid } from '@/shared/ui/grid';

import { CategoryIcon } from '@/entities/category';
import type {
	OperationGroup,
	OperationSort,
	OperationSortField,
	OperationWithBalance
} from '@/entities/operation';

import type { Account } from '@/entities/account';

import { OperationGroupRow } from '../operation-group-row/operation-group-row';

import { Building2 } from 'lucide-solid';
import type { JSX } from 'solid-js';
import { createMemo, Show } from 'solid-js';

const SORT_FIELDS: OperationSortField[] = ['date', 'amount', 'balance', 'category', 'contact'];

export type OperationsTableProps = {
	account: Account;
	emptyContent: string;
	groups: OperationGroup[];
	resolveCategoryColor: (operation: OperationWithBalance) => string;
	resolveCategoryIcon: (operation: OperationWithBalance) => string;
	selectedOperationId?: string;
	sort: OperationSort;
	onOperationSelect: (operation: OperationWithBalance) => void;
	onSortFieldChange: (columnId: string) => void;
};

type OperationTableGroupItem = {
	group: OperationGroup;
	kind: 'group';
};

type OperationTableOperationItem = {
	categoryColor: string;
	categoryIcon: string;
	kind: 'operation';
	operation: OperationWithBalance;
};

type OperationTableItem = OperationTableGroupItem | OperationTableOperationItem;

function isOperationSortField(value: string): value is OperationSortField {
	return SORT_FIELDS.includes(value as OperationSortField);
}

function formatShortDate(dateKey: string): string {
	const [year, month, day] = dateKey.split('-');

	return `${day}.${month}.${year}`;
}

function getOperationItem(item: OperationTableItem): OperationTableOperationItem | undefined {
	return item.kind === 'operation' ? item : undefined;
}

// <<< PASTE THE EXISTING `columns: GridColumn<OperationTableItem>[] = [ ... ]`
//     ARRAY HERE, UNCHANGED, FROM THE CURRENT (post-Task-3) FILE. Find its exact
//     current line range with: grep -n "^const columns\|^\];$" operations-table.tsx
//     — do not trust line numbers from earlier in this plan, Task 3 already
//     shifted them. >>>
const columns: GridColumn<OperationTableItem>[] = [
	/* ...unchanged... */
];

export function OperationsTable(props: OperationsTableProps) {
	const tableItems = createMemo<OperationTableItem[]>(() => (
		props.groups.flatMap((group) => [
			{ group, kind: 'group' as const },
			...group.operations.map((operation) => ({
				categoryColor: props.resolveCategoryColor(operation),
				categoryIcon: props.resolveCategoryIcon(operation),
				kind: 'operation' as const,
				operation
			}))
		])
	));

	const handleSortFieldChange = (columnId: string) => {
		if (!isOperationSortField(columnId)) {
			return;
		}

		props.onSortFieldChange(columnId);
	};

	const handleTableRowClick = (item: OperationTableItem) => {
		if (item.kind === 'operation') {
			props.onOperationSelect(item.operation);
		}
	};

	const renderGroupRow = (item: OperationTableItem): JSX.Element => {
		if (item.kind === 'group') {
			return (
				<OperationGroupRow
					group={item.group}
					resolveCategoryColor={props.resolveCategoryColor}
					resolveCategoryIcon={props.resolveCategoryIcon}
				/>
			);
		}

		return null;
	};

	return (
		<Grid
			aria-label={`Операции счёта «${props.account.name}»`}
			class={css.grid}
			columns={columns}
			data={tableItems()}
			emptyContent={props.emptyContent}
			fullWidthRowTemplate={({ dataItem }) => renderGroupRow(dataItem)}
			getRowAriaLabel={(item) => item.kind === 'operation'
				? `${item.operation.title}, ${formatMinorUnitsCurrency(
					item.operation.signedAmountMinor,
					item.operation.currency
				)}`
				: item.group.label}
			getRowClass={(item) => item.kind === 'group' ? css.groupHeaderRow : undefined}
			getRowKey={(item) => item.kind === 'group' ? item.group.id : item.operation.id}
			isFullWidthRow={(item) => item.kind === 'group'}
			isRowSelected={(item) => (
				item.kind === 'operation' && item.operation.id === props.selectedOperationId
			)}
			sort={{ columnId: props.sort.field, direction: props.sort.direction }}
			onRowClick={handleTableRowClick}
			onSortChange={handleSortFieldChange}
		/>
	);
}
```

Notes on what changed from the current file, so the column-array copy-paste doesn't silently break:
- Every column's `accessor`/render function that referenced `item().operation...` etc. is untouched — those closures only read from the `item` argument `Grid` passes them, never from component props, so they need no edits.
- `resolveCategoryColor`/`resolveCategoryIcon` are now **props**, not locally computed — `tableItems` calls `props.resolveCategoryColor(operation)` instead of a local function of the same name.
- The toolbar JSX (search field, period switch/nav, create buttons) is entirely gone from this file — it moves to `operations-workspace.tsx` in Step 3.
- `FALLBACK_CATEGORY_COLOR` moved to `use-operations-view.ts` — delete it here if the pasted-in columns array doesn't reference it directly (it doesn't; only the removed local `resolveCategoryColor` used it).
- `DEFAULT_CATEGORY_ICON_ID`/`resolveCategoryIconId` are **not** imported anymore — those were only used by the removed local `resolveCategoryColor`/`resolveCategoryIcon` functions (now props); the columns array itself only reads the precomputed `item().categoryIcon`/`item().categoryColor` fields, never those two identifiers directly.
- `cn` (from `@/shared/lib`) and `Building2` (from `lucide-solid`) **are** still needed — the "Сумма" column's `clientTemplate` calls `cn(css.moneyCell, ...)` and the "Контакт" column's `clientTemplate` renders a `<Building2 .../>` icon. Both were removed from this file by Task 3 (which only needed them for code it moved out) — add them back here. Before typechecking, grep the pasted-in columns array for every identifier this file's import block lists and confirm each has at least one real usage below the imports (and vice versa) — this exact category of mismatch (an import that's actually still needed, or one that's dead) is the most likely way this task's typecheck fails.
- `getOperationItem` is a small local helper (defined above, right before the columns array) that most `clientTemplate`s call via `<Show when={getOperationItem(dataItem)}>` — it's reproduced in this task's code block above; don't drop it when replacing the file.

- [ ] **Step 3: Move the toolbar's styles**

In `apps/web/src/views/home/ui/operations-table/operations-table.module.scss` (**read its current content first** — Task 3 already moved the group-row classes out of it, so the file on disk no longer matches the version described earlier in this plan), cut every toolbar-related class (`.toolbar`, `.toolbar-group`, `.toolbar-actions`, `.period-switch`, `.period-button`, `.period-button-active`, `.period-navigation`, `.period-label`, `.search-row`, `.search-field`) into the new file below. This also includes **both** remaining media-query blocks in the file, since post-Task-3 both are entirely toolbar-scoped now:
- `@include mx.media-mn(720) { .toolbar { ... } .period-navigation { ... } }`
- `@include mx.media-mx(520) { .period-button { padding-inline: var(--space-4); } }` — this one used to also hold `.group-row`/`.group-balance` overrides, but Task 3 already relocated those into `operation-group-row.module.scss`; what's left in this block (`.period-button` only) is a toolbar class and must move with the rest of the toolbar styles, not stay behind (leaving it behind would repeat exactly the dead-class-hash bug Task 3's implementer caught and fixed for `.group-row`, just for `.period-button` instead).

Everything else (`.root`, `.grid`, cell classes, `.category-icon`, `.group-header-row`) stays in `operations-table.module.scss`, which after this task should have no `@include mx.media-mn`/`mx.media-mx` blocks left in it at all — if it does, something wasn't fully moved.

```scss
// apps/web/src/views/home/ui/operations-workspace/operations-workspace.module.scss
// <<< PASTE the toolbar-related classes cut from operations-table.module.scss
//     here verbatim, including the mx.media-mn(720) block. >>>
```

- [ ] **Step 4: Write `OperationsWorkspace`**

This owns the hook, renders the (unchanged) toolbar JSX, and — for now — always renders `OperationsTable` (Task 6 adds the `Show`/`OperationsList` branch):

```tsx
// apps/web/src/views/home/ui/operations-workspace/operations-workspace.tsx
import css from './operations-workspace.module.scss';

import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/button';
import { TextField } from '@/shared/ui/text-field';

import type { Account } from '@/entities/account';
import type { Category } from '@/entities/category';
import type { OperationPeriodMode, OperationSortField, OperationWithBalance } from '@/entities/operation';

import { useOperationsView } from './lib/use-operations-view';
import { OperationsTable } from '../operations-table/operations-table';

import {
	ArrowLeftRight,
	ArrowDownWideNarrow,
	ArrowUpNarrowWide,
	ChevronLeft,
	ChevronRight,
	Plus,
	Search,
	X
} from 'lucide-solid';
import { createSignal, For, Show } from 'solid-js';

const PERIOD_LABELS: Record<OperationPeriodMode, string> = {
	month: 'Месяц',
	week: 'Неделя',
	year: 'Год'
};
const PERIOD_MODES: OperationPeriodMode[] = ['week', 'month', 'year'];

export type OperationsWorkspaceProps = {
	account: Account;
	categories: readonly Category[];
	periodFrom: string;
	periodMode: OperationPeriodMode;
	selectedOperationId?: string;
	onCreateOperation: () => void;
	onCreateTransfer: () => void;
	onOperationSelect: (operation: OperationWithBalance) => void;
	onPeriodModeChange: (mode: OperationPeriodMode) => void;
	onPeriodMove: (offset: number) => void;
};

function formatPeriodLabel(anchorDate: Date, mode: OperationPeriodMode): string {
	if (mode === 'year') {
		return String(anchorDate.getFullYear());
	}

	if (mode === 'month') {
		const value = new Intl.DateTimeFormat('ru-BY', { month: 'long', year: 'numeric' }).format(anchorDate);

		return value.charAt(0).toLocaleUpperCase('ru-BY') + value.slice(1);
	}

	// 'week' falls through to the imported range formatter below.
	return '';
}

export function OperationsWorkspace(props: OperationsWorkspaceProps) {
	let searchInput: HTMLInputElement | undefined;
	const view = useOperationsView(props);
	const [isSearchOpen, setIsSearchOpen] = createSignal(false);

	const handleSortDirectionChange = () => {
		view.setSort({
			...view.sort(),
			direction: view.sort().direction === 'desc' ? 'asc' : 'desc'
		});
	};

	const handleOpenSearch = () => {
		setIsSearchOpen(true);
		queueMicrotask(() => searchInput?.focus());
	};

	const handleCloseSearch = () => {
		view.setSearchQuery('');
		setIsSearchOpen(false);
	};

	const handleSearchKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			handleCloseSearch();
		}
	};

	return (
		<section aria-busy={view.isLoading()} aria-label='Операции счёта' class={css.root}>
			<div class={css.toolbar}>
				<div class={css.toolbarGroup}>
					<Button
						aria-label={view.sort().direction === 'desc' ? 'Показать в обратном порядке' : 'Показать в прямом порядке'}
						iconOnly
						size='sm'
						title={view.sort().direction === 'desc' ? 'По убыванию' : 'По возрастанию'}
						variant='secondary'
						onClick={handleSortDirectionChange}
					>
						<Show fallback={<ArrowUpNarrowWide size={17}/>} when={view.sort().direction === 'desc'}>
							<ArrowDownWideNarrow size={17}/>
						</Show>
					</Button>
					<div aria-label='Период' class={css.periodSwitch} role='group'>
						<For each={PERIOD_MODES}>
							{(mode) => (
								<button
									aria-pressed={props.periodMode === mode}
									class={cn(css.periodButton, props.periodMode === mode && css.periodButtonActive)}
									disabled={props.periodMode === mode}
									type='button'
									onClick={() => props.periodMode !== mode && props.onPeriodModeChange(mode)}
								>
									{PERIOD_LABELS[mode]}
								</button>
							)}
						</For>
					</div>
				</div>

				<div class={css.periodNavigation}>
					<Button aria-label='Предыдущий период' iconOnly size='sm' variant='ghost' onClick={() => props.onPeriodMove(-1)}>
						<ChevronLeft size={18}/>
					</Button>
					<span class={css.periodLabel}>{formatPeriodLabel(view.periodAnchor(), props.periodMode)}</span>
					<Button
						aria-label='Следующий период'
						disabled={!view.canMoveToNextPeriod()}
						iconOnly
						size='sm'
						variant='ghost'
						onClick={() => props.onPeriodMove(1)}
					>
						<ChevronRight size={18}/>
					</Button>
				</div>

				<div class={cn(css.toolbarGroup, css.toolbarActions)}>
					<Show when={!isSearchOpen()}>
						<Button aria-label='Открыть поиск' iconOnly size='sm' variant='ghost' onClick={handleOpenSearch}>
							<Search size={18}/>
						</Button>
					</Show>
					<Button aria-label='Добавить перевод' iconOnly size='sm' variant='secondary' onClick={props.onCreateTransfer}>
						<ArrowLeftRight size={18}/>
					</Button>
					<Button aria-label='Добавить операцию' iconOnly size='sm' variant='primary' onClick={props.onCreateOperation}>
						<Plus size={18}/>
					</Button>
				</div>
			</div>

			<Show when={isSearchOpen()}>
				<div class={css.searchRow}>
					<TextField
						ref={(element) => { searchInput = element; }}
						aria-label='Поиск операций'
						class={css.searchField}
						placeholder='Название, комментарий, категория, получатель или сумма'
						size='sm'
						startContent={<Search size={16}/>}
						value={view.searchQuery()}
						onInput={(event) => view.setSearchQuery(event.currentTarget.value)}
						onKeyDown={handleSearchKeyDown}
					/>
					<Button aria-label='Закрыть поиск' iconOnly size='sm' variant='ghost' onClick={handleCloseSearch}>
						<X size={17}/>
					</Button>
				</div>
			</Show>

			<OperationsTable
				account={props.account}
				emptyContent={view.isLoading()
					? 'Загрузка операций…'
					: view.searchQuery()
						? 'По вашему запросу ничего не найдено'
						: 'В этом периоде операций нет'}
				groups={view.groups()}
				resolveCategoryColor={view.resolveCategoryColor}
				resolveCategoryIcon={view.resolveCategoryIcon}
				selectedOperationId={props.selectedOperationId}
				sort={view.sort()}
				onOperationSelect={props.onOperationSelect}
				onSortFieldChange={(columnId) => {
					if (view.sort().field === columnId) {
						return;
					}

					view.setSort({ direction: columnId === 'date' ? 'desc' : 'asc', field: columnId as OperationSortField });
				}}
			/>
		</section>
	);
}
```

Note: `formatPeriodLabel`'s `'week'` branch above is intentionally incomplete (returns `''`) — copy the original file's full `'week'` branch (the `getOperationPeriodRange` + `Intl.DateTimeFormat` range-formatting code, currently the last part of `formatPeriodLabel` in `operations-table.tsx` before Task 3/4 touched it) into it verbatim, including its `getOperationPeriodRange`/`parseLocalDateKey` import from `@/entities/operation`.

- [ ] **Step 5: Point the page at the new workspace**

```ts
// apps/web/src/views/home/page.tsx — change the import (was: OperationsTable)
import { OperationsWorkspace } from './ui/operations-workspace/operations-workspace';
```

Rename the JSX tag at the existing `<OperationsTable ... />` call site to `<OperationsWorkspace ... />` — every prop name it already passes (`account`, `categories`, `periodFrom`, `periodMode`, `selectedOperationId`, `onCreateOperation`, `onCreateTransfer`, `onOperationSelect`, `onPeriodModeChange`, `onPeriodMove`) is unchanged, so this is a drop-in rename.

- [ ] **Step 6: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors

- [ ] **Step 7: Manual regression check**

Run: `pnpm --filter @i-finances/web dev`. On the operations screen, verify: search opens/closes and filters; period switch (week/month/year) and prev/next buttons work and disable correctly at the current period; sort direction toggle flips; clicking a column header still re-sorts (Grid's own `onSortChange`); clicking a row still opens the operation details panel; group headers still show the right balances. This must look and behave identically to before Task 3.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/views/home/ui/operations-workspace \
        apps/web/src/views/home/ui/operations-table/operations-table.tsx \
        apps/web/src/views/home/ui/operations-table/operations-table.module.scss \
        apps/web/src/views/home/page.tsx
git commit -m "refactor(operations): extract OperationsWorkspace, make OperationsTable presentational"
```

---

### Task 5: Add the missing sort-field control to the shared toolbar

**Files:**
- Modify: `apps/web/src/views/home/ui/operations-workspace/operations-workspace.tsx`
- Modify: `apps/web/src/views/home/ui/operations-workspace/operations-workspace.module.scss`

**Why this task exists:** the grill session agreed the list view keeps full sort parity with the table ("тот же переключатель сортировки… просто без resizable-колонок"). But the *only* existing way to change the sort **field** (as opposed to direction) is clicking a `Grid` column header — which only exists in table mode. Without this task, list mode would be stuck sorting by whatever field was last active in table mode, with no way to change it. This closes that gap with one small, shared control instead of duplicating the picker into each body.

**Interfaces:**
- Consumes: `view.sort`, `view.setSort` from `OperationsWorkspace` (already in scope, Task 4).

- [ ] **Step 1: Add the control next to the direction toggle**

In `operations-workspace.tsx`, inside `.toolbarGroup` (the same wrapper as the direction-toggle `Button`), add:

```tsx
<select
	aria-label='Сортировать по'
	class={css.sortField}
	value={view.sort().field}
	onChange={(event) => {
		const field = event.currentTarget.value as OperationSortField;

		view.setSort({
			direction: field === 'date' ? 'desc' : 'asc',
			field
		});
	}}
>
	<option value='date'>По дате</option>
	<option value='amount'>По сумме</option>
	<option value='balance'>По балансу</option>
	<option value='category'>По категории</option>
	<option value='contact'>По контакту</option>
</select>
```

`OperationSortField` is already imported at the top of the file (Task 4 added it for the `onSortFieldChange` handler), so no new import is needed here.

- [ ] **Step 2: Style it to match the existing `periodSwitch`/`periodButton` look**

```scss
// apps/web/src/views/home/ui/operations-workspace/operations-workspace.module.scss
.sort-field {
	inline-size: fn.rem(140);
	padding: var(--space-2) var(--space-3);
	border: 1px solid var(--color-border);
	border-radius: var(--radius-md);

	font: inherit;
	color: var(--color-text-primary);

	background-color: var(--color-surface);
}
```

(Add `@use "@/shared/styles/functions" as fn;` at the top of this file if it isn't already there from Task 4's Step 3 paste.)

- [ ] **Step 3: Typecheck and manual check**

Run: `cd apps/web && pnpm typecheck`. In the dev server, change the new `<select>` and confirm the Grid re-sorts and re-groups (group headers switch between date/category/contact/amount) exactly like clicking the equivalent column header does.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/views/home/ui/operations-workspace
git commit -m "feat(operations): add a toolbar sort-field control shared by table and list"
```

---

### Task 6: Build `OperationsList` and wire up the display-mode switch

**Files:**
- Create: `apps/web/src/views/home/ui/operations-list/operations-list.tsx`
- Create: `apps/web/src/views/home/ui/operations-list/operations-list.module.scss`
- Modify: `apps/web/src/views/home/ui/operations-workspace/operations-workspace.tsx`

**Interfaces:**
- Produces: `OperationsList(props: OperationsTableProps)` — **identical prop shape** to `OperationsTable` from Task 4 (same `OperationsTableProps` type, imported and reused, not redefined) so `OperationsWorkspace` can swap one for the other without any prop translation.
- Consumes: `useOperationsDisplayMode` from `@/entities/operation` (Task 2), `OperationGroupRow` from Task 3.

Card content per the grill session (Q6): line 1 — category icon (colored) + title (truncated) + amount; line 2, smaller — date + balance-after. Contact/comment are intentionally not shown inline (available in the operation details panel that already opens on tap).

- [ ] **Step 1: Write the card list**

```tsx
// apps/web/src/views/home/ui/operations-list/operations-list.tsx
import css from './operations-list.module.scss';

import { cn, formatMinorUnitsCurrency } from '@/shared/lib';

import { CategoryIcon } from '@/entities/category';
import type { OperationWithBalance } from '@/entities/operation';

import { OperationGroupRow } from '../operation-group-row/operation-group-row';
import type { OperationsTableProps } from '../operations-table/operations-table';

import { For, Show } from 'solid-js';

function formatShortDate(dateKey: string): string {
	const [year, month, day] = dateKey.split('-');

	return `${day}.${month}.${year}`;
}

export function OperationsList(props: OperationsTableProps) {
	const handleRowClick = (operation: OperationWithBalance) => {
		props.onOperationSelect(operation);
	};

	return (
		<section aria-label={`Операции счёта «${props.account.name}»`} class={css.root}>
			<Show fallback={<p class={css.empty}>{props.emptyContent}</p>} when={props.groups.length > 0}>
				<For each={props.groups}>
					{(group) => (
						<div class={css.group}>
							<OperationGroupRow
								group={group}
								resolveCategoryColor={props.resolveCategoryColor}
								resolveCategoryIcon={props.resolveCategoryIcon}
							/>
							<ul class={css.items}>
								<For each={group.operations}>
									{(operation) => (
										<li>
											<button
												aria-current={operation.id === props.selectedOperationId}
												class={cn(css.item, operation.id === props.selectedOperationId && css.itemSelected)}
												style={{ '--category-color': props.resolveCategoryColor(operation) }}
												type='button'
												onClick={() => handleRowClick(operation)}
											>
												<span aria-hidden='true' class={css.categoryIcon}>
													<CategoryIcon icon={props.resolveCategoryIcon(operation)} size={16}/>
												</span>
												<span class={css.itemMain}>
													<span class={css.itemTitle}>{operation.title}</span>
													<span class={css.itemAmount}>
														{formatMinorUnitsCurrency(operation.signedAmountMinor, operation.currency)}
													</span>
												</span>
												<span class={css.itemMeta}>
													<span>{formatShortDate(operation.happenedOn)}</span>
													<span>{formatMinorUnitsCurrency(operation.balanceAfterMinor, operation.currency)}</span>
												</span>
											</button>
										</li>
									)}
								</For>
							</ul>
						</div>
					)}
				</For>
			</Show>
		</section>
	);
}
```

- [ ] **Step 2: Style the cards**

```scss
// apps/web/src/views/home/ui/operations-list/operations-list.module.scss
@use "@/shared/styles/functions" as fn;

.root {
	display: grid;
	gap: var(--space-4);
}

.group {
	overflow: hidden;
	border: 1px solid var(--color-border);
	border-radius: var(--radius-lg);
}

.items {
	display: grid;
	list-style: none;
	margin: 0;
	padding: 0;

	li + li {
		border-block-start: 1px solid var(--color-border);
	}
}

.item {
	cursor: pointer;

	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	gap: var(--space-2) var(--space-3);
	align-items: center;

	inline-size: 100%;
	padding: var(--space-3) var(--space-4);
	border: none;

	text-align: start;

	background: none;

	&:hover {
		background-color: var(--color-surface-subtle);
	}
}

.item-selected {
	background-color: var(--color-primary-soft);
}

.category-icon {
	grid-row: 1 / 3;

	display: grid;
	place-items: center;

	inline-size: fn.rem(28);
	block-size: fn.rem(28);
	border-radius: var(--radius-sm);

	color: var(--category-color);

	background-color: color-mix(in srgb, var(--category-color) 13%, var(--color-surface));
}

.item-main {
	display: flex;
	gap: var(--space-3);
	justify-content: space-between;

	min-inline-size: 0;
}

.item-title {
	overflow: hidden;
	min-inline-size: 0;

	text-overflow: ellipsis;
	white-space: nowrap;
}

.item-amount {
	flex: none;
	font-variant-numeric: tabular-nums;
}

.item-meta {
	display: flex;
	gap: var(--space-3);
	justify-content: space-between;

	font-size: var(--font-size-body-sm);
	color: var(--color-text-tertiary);
	font-variant-numeric: tabular-nums;
}

.empty {
	padding: var(--space-8);
	color: var(--color-text-tertiary);
	text-align: center;
}
```

- [ ] **Step 3: Swap bodies by resolved display mode**

In `operations-workspace.tsx`:

```ts
import { useOperationsDisplayMode } from '@/entities/operation';
import { OperationsList } from '../operations-list/operations-list';
```

```tsx
// inside OperationsWorkspace, alongside `const view = useOperationsView(props);`:
const { resolvedMode } = useOperationsDisplayMode();
```

Replace the single `<OperationsTable .../>` call at the end of the component with:

```tsx
const bodyProps = () => ({
	account: props.account,
	emptyContent: view.isLoading()
		? 'Загрузка операций…'
		: view.searchQuery()
			? 'По вашему запросу ничего не найдено'
			: 'В этом периоде операций нет',
	groups: view.groups(),
	resolveCategoryColor: view.resolveCategoryColor,
	resolveCategoryIcon: view.resolveCategoryIcon,
	selectedOperationId: props.selectedOperationId,
	sort: view.sort(),
	onOperationSelect: props.onOperationSelect,
	onSortFieldChange: (columnId: string) => {
		if (view.sort().field === columnId) {
			return;
		}

		view.setSort({ direction: columnId === 'date' ? 'desc' : 'asc', field: columnId as OperationSortField });
	}
});
```

```tsx
<Show fallback={<OperationsList {...bodyProps()}/>} when={resolvedMode() === 'table'}>
	<OperationsTable {...bodyProps()}/>
</Show>
```

(This replaces the inline `<OperationsTable account={...} emptyContent={...} .../>` JSX block from Task 4's Step 4 — delete that block and use the `bodyProps`/`Show` pair instead.)

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors

- [ ] **Step 5: Manual check across widths**

Run: `pnpm --filter @i-finances/web dev`. Resize the browser across 768px: below it the card list renders by default, at/above it the table renders by default. Confirm: tapping/clicking a card opens the same operation details panel as a table row does; group headers appear in both modes with identical balances; the new sort-field `<select>` from Task 5 re-groups the list the same way it re-groups the table; long operation titles truncate with an ellipsis instead of overflowing (this reuses the same `min-inline-size: 0` pattern already fixed for the receipts screen — see `receipt-litellm-fence-parsing-bug`'s neighboring memory on that bug class).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/views/home/ui/operations-list \
        apps/web/src/views/home/ui/operations-workspace/operations-workspace.tsx
git commit -m "feat(operations): add mobile-friendly OperationsList and wire the display-mode switch"
```

---

### Task 7: Profile settings popup with the display-mode control

**Files:**
- Create: `apps/web/src/widgets/app-header/ui/profile-settings-dialog.tsx`
- Create: `apps/web/src/widgets/app-header/ui/profile-settings-dialog.module.scss`
- Modify: `apps/web/src/widgets/app-header/ui/profile-menu.tsx`

**Interfaces:**
- Produces: `ProfileSettingsDialog(props: { open: boolean; onOpenChange: (open: boolean) => void })`.
- Consumes: `Dialog` from `@/shared/ui` (same primitive used by the receipts review dialog), `useOperationsDisplayMode` from `@/entities/operation` (Task 2).

- [ ] **Step 1: Write the dialog**

```tsx
// apps/web/src/widgets/app-header/ui/profile-settings-dialog.tsx
import css from './profile-settings-dialog.module.scss';

import { cn } from '@/shared/lib';
import { Dialog } from '@/shared/ui';

import type { OperationsDisplayModePreference } from '@/entities/operation';
import { useOperationsDisplayMode } from '@/entities/operation';

import { For } from 'solid-js';

const DISPLAY_MODE_OPTIONS: Array<{ label: string; value: OperationsDisplayModePreference }> = [
	{ label: 'Авто', value: 'auto' },
	{ label: 'Таблица', value: 'table' },
	{ label: 'Список', value: 'list' }
];

export type ProfileSettingsDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function ProfileSettingsDialog(props: ProfileSettingsDialogProps) {
	const displayMode = useOperationsDisplayMode();

	return (
		<Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
			<Dialog.Content>
				<Dialog.Header closeLabel='Закрыть настройки профиля'>
					<Dialog.Kicker>Профиль</Dialog.Kicker>
					<Dialog.Title>Настройки</Dialog.Title>
				</Dialog.Header>
				<Dialog.Body>
					<section class={css.section}>
						<h3 class={css.sectionTitle}>Отображение операций</h3>
						<p class={css.sectionDescription}>
							Как показывать список операций на счёте: таблицей, компактным
							списком или автоматически в зависимости от ширины экрана.
						</p>
						<div aria-label='Отображение операций' class={css.segmentedControl} role='group'>
							<For each={DISPLAY_MODE_OPTIONS}>
								{(option) => (
									<button
										aria-pressed={displayMode.preference() === option.value}
										class={cn(
											css.segmentedOption,
											displayMode.preference() === option.value && css.segmentedOptionActive
										)}
										type='button'
										onClick={() => displayMode.setPreference(option.value)}
									>
										{option.label}
									</button>
								)}
							</For>
						</div>
					</section>
				</Dialog.Body>
				<Dialog.Footer>
					<Dialog.Action closeOnClick intent='cancel'>
						Закрыть
					</Dialog.Action>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	);
}
```

- [ ] **Step 2: Style it**

```scss
// apps/web/src/widgets/app-header/ui/profile-settings-dialog.module.scss
.section {
	display: grid;
	gap: var(--space-3);
}

.section-title {
	margin: 0;
	font-size: var(--font-size-heading-3);
}

.section-description {
	margin: 0;
	color: var(--color-text-secondary);
}

.segmented-control {
	display: inline-flex;
	gap: var(--space-1);
	padding: var(--space-1);
	border-radius: var(--radius-md);

	background-color: var(--color-surface-subtle);
}

.segmented-option {
	cursor: pointer;

	padding: var(--space-2) var(--space-4);
	border: none;
	border-radius: var(--radius-sm);

	font: inherit;
	color: var(--color-text-secondary);

	background: none;

	&:hover {
		color: var(--color-text-primary);
	}
}

.segmented-option-active {
	color: var(--color-text-primary);
	background-color: var(--color-surface);
	box-shadow: var(--shadow-sm);
}
```

- [ ] **Step 3: Wire it into the profile menu**

In `apps/web/src/widgets/app-header/ui/profile-menu.tsx`:

```tsx
import { ProfileSettingsDialog } from './profile-settings-dialog';
```

Add local state next to the existing `isSigningOut`/`signOutError` signals:

```ts
const [isSettingsOpen, setIsSettingsOpen] = createSignal(false);
```

Replace:

```tsx
<ContextMenu.Item disabled title='Раздел профиля будет добавлен позже'>
	Профиль
</ContextMenu.Item>
```

with:

```tsx
<ContextMenu.Item onSelect={() => setIsSettingsOpen(true)}>
	Профиль
</ContextMenu.Item>
```

Leave the `Безопасность` disabled placeholder item untouched — it's unrelated to this change.

Render the dialog as a sibling of `<ContextMenu.Root>`'s return (after its closing tag, inside the same top-level fragment/return of `ProfileMenu`):

```tsx
<ProfileSettingsDialog open={isSettingsOpen()} onOpenChange={setIsSettingsOpen}/>
```

If `ProfileMenu` currently returns a single `<ContextMenu.Root>...</ContextMenu.Root>` with no wrapping fragment, wrap both in a Solid fragment (`<>...</>`) so both siblings render.

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: no errors

- [ ] **Step 5: Manual check**

Run: `pnpm --filter @i-finances/web dev`. Open the profile menu (top-right avatar), click "Профиль" — the popup opens and the menu closes. Click each of Авто/Таблица/Список: the active segment updates immediately, the popup stays open, and — with the operations screen open in another tab or after closing the popup — the operations screen reflects the new mode without a reload. Reload the page: the previously chosen mode (if not `auto`) is still in effect (persisted in `localStorage`, key `i-finances:operations-display-mode` — check with devtools' Application/Storage tab).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/widgets/app-header/ui/profile-settings-dialog.tsx \
        apps/web/src/widgets/app-header/ui/profile-settings-dialog.module.scss \
        apps/web/src/widgets/app-header/ui/profile-menu.tsx
git commit -m "feat(profile): add settings popup with the operations display-mode control"
```

---

### Task 8: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite and typecheck**

```bash
cd apps/web && pnpm test && pnpm typecheck
```

Expected: all pass, including the new `display-mode.test.ts` from Task 1.

- [ ] **Step 2: End-to-end manual pass**

Using `pnpm --filter @i-finances/web dev` against a real household (real categories/operations), walk through:
1. Desktop width (≥768px): operations screen shows the table by default. Toggle the profile-menu control to "Список" — the operations screen switches to cards immediately, still at desktop width.
2. Set it back to "Авто". Resize the window below 768px — it switches back to cards (following the viewport again, since the preference is `auto`).
3. Set it to "Таблица" at a narrow width — the table renders (with horizontal scroll if needed), overriding the mobile default.
4. Reload the page after each of the above — the last explicit choice survives; only `auto` is expected to re-derive from viewport width on load.
5. In every mode: search, period switching (week/month/year + prev/next), the new sort-field `<select>`, and clicking/tapping a row/card all behave identically and open the same operation details panel.

- [ ] **Step 3: Final commit (if anything was fixed during the pass)**

Only if Step 2 surfaced a fix — otherwise this task ends at Step 2 with nothing to commit.
