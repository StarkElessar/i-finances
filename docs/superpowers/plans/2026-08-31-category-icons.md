# Category Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a curated Lucide icon id on each category, seed existing rows by name, and let users pick/change icons in the category dialog while rendering them everywhere a category is shown.

**Architecture:** Pure whitelist + seed map in `entities/category/model/icons.ts` (no Lucide imports — safe for Zod/server/tests). UI maps ids to `lucide-solid` components in `entities/category/ui`. DB column `categories.icon` with default + migration UPDATEs. Create/update contracts require `icon`.

**Tech Stack:** Solid 1.9, `lucide-solid`, Drizzle/SQLite, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-category-icons-design.md`

## Global Constraints

- Tabs indentation; function declarations at top level; brief JSDoc on exported functions/types
- Solid component body order: state/memos/helpers → handlers → effects → return
- Icon ids are kebab-case strings from the whitelist; default is always `tag`
- Never import `lucide-solid` from `model/icons.ts` (server/Zod/unit tests must stay pure)
- Responsive SCSS: mobile-first + `@include mx.media-mn(...)` from `~/shared/styles/mixins`
- Interactive styles: no hover/focus/pointer on active picker option (`:not(.…-active)`)
- Do not commit unless the user asks
- Receipt category snapshots stay without `icon` in v1 (out of scope)

---

## File map

| File | Responsibility |
|------|----------------|
| `src/entities/category/model/icons.ts` | Whitelist ids, types, default, seed map, `resolveCategoryIconId`, `isCategoryIconId` |
| `src/entities/category/model/types.ts` | Add `icon` to `Category` |
| `src/entities/category/api/category.contract.ts` | Zod `icon` on create/update |
| `src/entities/category/ui/category-icon.tsx` (+ scss if needed) | Render Lucide by id |
| `src/entities/category/ui/category-icon-picker.tsx` (+ scss) | Whitelist grid picker |
| `src/entities/category/ui/index.ts` | Re-export UI |
| `src/entities/category/index.ts` | Public exports |
| `src/server/db/schema/categories.ts` | `icon` column |
| `drizzle/0010_*.sql` + `drizzle/meta/*` | ADD COLUMN + seed UPDATEs |
| `src/server/category/category-mappers.ts` | Map `icon` |
| `src/server/category/category-repository.ts` | `CategoryUpdateValues.icon` |
| `src/server/category/use-cases/create-category.ts` | Persist `icon` |
| `src/server/category/use-cases/update-category.ts` | Persist `icon` |
| `scripts/import-ifinance-categories.ts` | Insert with seed/default icon |
| `src/views/categories/ui/category-dialog/*` | Picker + preview + submit `icon` |
| `src/views/categories/page.tsx` | Pass `icon` in dialog value / commands |
| `src/views/categories/ui/category-card/*` | Show `CategoryIcon` |
| `src/views/categories/ui/category-summary-dialog/*` | Icon in title/header |
| `src/views/home/ui/operations-table/operations-table.tsx` | Resolve + render icon |
| `src/views/home/ui/operation-details-panel/operation-details-form.tsx` | Combobox option icon |
| `tests/entities/category/icons.test.ts` | Registry/seed/resolve |
| `tests/server/category/category-service.test.ts` | Round-trip `icon` |
| `tests/entities/category/public-categories-api.test.ts` | Update if contracts assert fields |

---

### Task 1: Icon registry (pure)

**Files:**
- Create: `src/entities/category/model/icons.ts`
- Create: `tests/entities/category/icons.test.ts`
- Modify: `src/entities/category/index.ts` (export types/helpers; not Lucide UI yet)

**Interfaces:**
- Produces:
  - `CATEGORY_ICON_IDS` — `readonly` tuple of kebab-case ids
  - `CategoryIconId` — `(typeof CATEGORY_ICON_IDS)[number]`
  - `DEFAULT_CATEGORY_ICON_ID: CategoryIconId` = `'tag'`
  - `CATEGORY_ICON_SEED_BY_NORMALIZED_NAME: Readonly<Record<string, CategoryIconId>>`
  - `isCategoryIconId(value: string): value is CategoryIconId`
  - `resolveCategoryIconId(value: string | null | undefined): CategoryIconId`

**Curated whitelist (include all of these):**

```ts
export const CATEGORY_ICON_IDS = [
	'tag',
	'shapes',
	'circle',
	'star',
	'heart',
	'bookmark',
	'utensils',
	'shopping-cart',
	'sandwich',
	'candy',
	'coffee',
	'wine',
	'bus',
	'car',
	'fuel',
	'bike',
	'plane',
	'train-front',
	'home',
	'building-2',
	'key-round',
	'wrench',
	'hammer',
	'zap',
	'flame',
	'droplets',
	'wifi',
	'phone',
	'monitor',
	'tv',
	'shirt',
	'sparkles',
	'scan-face',
	'stethoscope',
	'pill',
	'dumbbell',
	'baby',
	'gamepad-2',
	'party-popper',
	'gift',
	'paw-print',
	'graduation-cap',
	'book-open',
	'briefcase',
	'wallet',
	'piggy-bank',
	'banknote',
	'receipt',
	'landmark',
	'scale',
	'hand-coins',
	'arrow-left-right',
	'shield',
	'file-text',
	'ellipsis'
] as const;
```

**Exact seed map (every current household name):**

```ts
export const CATEGORY_ICON_SEED_BY_NORMALIZED_NAME = {
	'paypal оплата': 'banknote',
	'автомобиль': 'car',
	'аренда квартиры': 'key-round',
	'газ': 'flame',
	'гигиена': 'sparkles',
	'дети/игрушки/развлечения': 'baby',
	'долги': 'scale',
	'домашнее хозяйство': 'home',
	'домашние животные': 'paw-print',
	'досуг': 'party-popper',
	'еда': 'utensils',
	'жировка': 'building-2',
	'заработок': 'briefcase',
	'здоровье': 'stethoscope',
	'канцелярия': 'file-text',
	'комунальные платежи': 'home',
	'красота': 'scan-face',
	'накопление': 'piggy-bank',
	'налоги': 'landmark',
	'неучтенка': 'ellipsis',
	'обмен валют': 'arrow-left-right',
	'образование': 'graduation-cap',
	'обучение - автошкола': 'car',
	'одежда': 'shirt',
	'онлайн сервисы': 'monitor',
	'платежи': 'receipt',
	'подарок': 'gift',
	'пожертвование': 'hand-coins',
	'потоковые данные': 'tv',
	'продукты': 'shopping-cart',
	'прокат': 'key-round',
	'прочие траты': 'shapes',
	'путешествие': 'plane',
	'ремонт': 'hammer',
	'сервис': 'wrench',
	'сладости': 'candy',
	'спорт': 'dumbbell',
	'страхование': 'shield',
	'телефон&связь': 'phone',
	'топливо': 'fuel',
	'транспорт': 'bus',
	'фастфуд': 'sandwich',
	'электричество': 'zap'
} as const satisfies Readonly<Record<string, CategoryIconId>>;
```

If a Lucide export name differs in `lucide-solid@1.x` during Task 4 (e.g. missing `Candy`), replace that whitelist id with the nearest available Lucide icon and keep the kebab id stable **or** rename the id consistently in whitelist + seed + UI map in the same commit. Prefer keeping the list above; verify exports when wiring UI.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';

import {
	CATEGORY_ICON_IDS,
	CATEGORY_ICON_SEED_BY_NORMALIZED_NAME,
	DEFAULT_CATEGORY_ICON_ID,
	isCategoryIconId,
	resolveCategoryIconId
} from '../../../src/entities/category/model/icons';

describe('category icons registry', () => {
	it('uses tag as the default icon id', () => {
		expect(DEFAULT_CATEGORY_ICON_ID).toBe('tag');
		expect(CATEGORY_ICON_IDS.includes(DEFAULT_CATEGORY_ICON_ID)).toBe(true);
	});

	it('resolves known ids and falls back for unknown values', () => {
		expect(resolveCategoryIconId('bus')).toBe('bus');
		expect(resolveCategoryIconId('nope')).toBe('tag');
		expect(resolveCategoryIconId(undefined)).toBe('tag');
		expect(isCategoryIconId('car')).toBe(true);
		expect(isCategoryIconId('Car')).toBe(false);
	});

	it('seeds only whitelist ids and covers required normalized names', () => {
		const requiredNames = [
			'paypal оплата',
			'автомобиль',
			'аренда квартиры',
			'газ',
			'гигиена',
			'дети/игрушки/развлечения',
			'долги',
			'домашнее хозяйство',
			'домашние животные',
			'досуг',
			'еда',
			'жировка',
			'заработок',
			'здоровье',
			'канцелярия',
			'комунальные платежи',
			'красота',
			'накопление',
			'налоги',
			'неучтенка',
			'обмен валют',
			'образование',
			'обучение - автошкола',
			'одежда',
			'онлайн сервисы',
			'платежи',
			'подарок',
			'пожертвование',
			'потоковые данные',
			'продукты',
			'прокат',
			'прочие траты',
			'путешествие',
			'ремонт',
			'сервис',
			'сладости',
			'спорт',
			'страхование',
			'телефон&связь',
			'топливо',
			'транспорт',
			'фастфуд',
			'электричество'
		];

		for (const name of requiredNames) {
			expect(CATEGORY_ICON_SEED_BY_NORMALIZED_NAME[name]).toBeDefined();
		}

		for (const iconId of Object.values(CATEGORY_ICON_SEED_BY_NORMALIZED_NAME)) {
			expect(CATEGORY_ICON_IDS.includes(iconId)).toBe(true);
		}
	});
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `pnpm test -- tests/entities/category/icons.test.ts`

- [ ] **Step 3: Implement `icons.ts` + export from entity index**

```ts
/**
 * Curated Lucide-backed icon ids allowed for categories.
 */
export const CATEGORY_ICON_IDS = [ /* full list from Interfaces */ ] as const;

export type CategoryIconId = (typeof CATEGORY_ICON_IDS)[number];

/**
 * Default icon when create form is untouched or value is unknown.
 */
export const DEFAULT_CATEGORY_ICON_ID: CategoryIconId = 'tag';

const CATEGORY_ICON_ID_SET = new Set<string>(CATEGORY_ICON_IDS);

/**
 * Type guard for whitelist icon ids.
 */
export function isCategoryIconId(value: string): value is CategoryIconId {
	return CATEGORY_ICON_ID_SET.has(value);
}

/**
 * Returns a safe category icon id, falling back to the default.
 */
export function resolveCategoryIconId(value: string | null | undefined): CategoryIconId {
	if (value && isCategoryIconId(value)) {
		return value;
	}

	return DEFAULT_CATEGORY_ICON_ID;
}

/**
 * One-time seed targets keyed by category `normalized_name`.
 */
export const CATEGORY_ICON_SEED_BY_NORMALIZED_NAME = { /* exact map above */ } as const satisfies Readonly<
	Record<string, CategoryIconId>
>;
```

Export from `src/entities/category/index.ts`:
`CATEGORY_ICON_IDS`, `CATEGORY_ICON_SEED_BY_NORMALIZED_NAME`, `DEFAULT_CATEGORY_ICON_ID`, `CategoryIconId`, `isCategoryIconId`, `resolveCategoryIconId`.

- [ ] **Step 4: Run test — expect PASS**

Run: `pnpm test -- tests/entities/category/icons.test.ts`

- [ ] **Step 5: Commit only if the user asked**

---

### Task 2: DB schema + migration + import script

**Files:**
- Modify: `src/server/db/schema/categories.ts`
- Create via drizzle: `drizzle/0010_*.sql`, `drizzle/meta/*`
- Modify: `scripts/import-ifinance-categories.ts`

**Interfaces:**
- Consumes: `CATEGORY_ICON_SEED_BY_NORMALIZED_NAME`, `DEFAULT_CATEGORY_ICON_ID`
- Schema field: `icon: text('icon').notNull().default('tag')`

- [ ] **Step 1: Add column to Drizzle schema**

In `categories` table definition, after `color`:

```ts
icon: text('icon').notNull().default('tag'),
```

- [ ] **Step 2: Generate migration**

Run: `pnpm db:generate`

Expected: new SQL under `drizzle/` with `ALTER TABLE \`categories\` ADD \`icon\` ...`

- [ ] **Step 3: Ensure migration seeds known names**

If generate only emits `ADD COLUMN`, append UPDATEs (same file, `--> statement-breakpoint` separated), one per seed entry, e.g.:

```sql
ALTER TABLE `categories` ADD `icon` text DEFAULT 'tag' NOT NULL;--> statement-breakpoint
UPDATE `categories` SET `icon` = 'utensils' WHERE `normalized_name` = 'еда';--> statement-breakpoint
-- ... all seed rows from CATEGORY_ICON_SEED_BY_NORMALIZED_NAME
```

Keep SQL ids identical to the TypeScript seed map.

- [ ] **Step 4: Apply migration locally**

Run: `pnpm db:migrate`

Expected: `Database migrations applied.`

Spot-check (dev DB path may vary):

```bash
sqlite3 data/i-finances.dev.sqlite "SELECT normalized_name, icon FROM categories WHERE normalized_name IN ('еда','транспорт','неучтенка') ORDER BY normalized_name;"
```

Expected icons: `utensils`, `bus`, `ellipsis`.

- [ ] **Step 5: Update import script inserts**

In `scripts/import-ifinance-categories.ts`, when building `.values({...})`, set:

```ts
icon: CATEGORY_ICON_SEED_BY_NORMALIZED_NAME[
	normalizeCategoryIdentity(category.name)
] ?? DEFAULT_CATEGORY_ICON_ID,
```

Import helpers from `~/entities/category` (or model path used by other scripts).

- [ ] **Step 6: Commit only if the user asked**

---

### Task 3: Domain types, contract, persistence

**Files:**
- Modify: `src/entities/category/model/types.ts`
- Modify: `src/entities/category/api/category.contract.ts`
- Modify: `src/server/category/category-mappers.ts`
- Modify: `src/server/category/category-repository.ts` (`CategoryUpdateValues`)
- Modify: `src/server/category/use-cases/create-category.ts`
- Modify: `src/server/category/use-cases/update-category.ts`
- Modify: `tests/server/category/category-service.test.ts`
- Modify: `tests/entities/category/public-categories-api.test.ts` (if it constructs create/update payloads)

**Interfaces:**
- `Category.icon: CategoryIconId` (or `string` narrowed via zod; prefer `CategoryIconId`)
- `editableCategoryFields.icon` via `z.enum(CATEGORY_ICON_IDS)` (Zod 4: use compatible enum/tuple helper already used in repo; if `z.enum` needs a non-empty tuple, cast `CATEGORY_ICON_IDS` accordingly)
- Create/update use-cases pass `icon: input.icon` into repository
- `toPersistedCategory` includes `icon: resolveCategoryIconId(record.category.icon)`

- [ ] **Step 1: Extend service test create input + assertions (fail first)**

Update `validCreateInput` / expectations:

```ts
const validCreateInput = createCategoryInputSchema.parse({
	color: AccentColor.BLUE,
	description: 'Аптеки, врачи и лекарства для всей семьи.',
	icon: 'stethoscope',
	keywords: ['аптека', 'лекарства'],
	monthlyBudgetMinor: 150_000,
	name: 'Здоровье'
});

// in create assertion:
expect(created).toMatchObject({
	icon: 'stethoscope',
	// ...existing fields
});
```

Add a focused case:

```ts
it('updates the category icon', async () => {
	const created = await categoryService.create(USER_ID, validCreateInput);
	const updated = await categoryService.update(USER_ID, {
		...validCreateInput,
		id: created.id,
		icon: 'pill',
		version: created.version
	});

	expect(updated.icon).toBe('pill');
	expect(updated.version).toBe(created.version + 1);
});
```

- [ ] **Step 2: Run targeted tests — expect FAIL (schema/types/zod)**

Run: `pnpm test -- tests/server/category/category-service.test.ts`

- [ ] **Step 3: Wire types → contract → mapper → repository → use-cases**

`types.ts`:

```ts
export type Category = {
	color: string;
	createdAt: string;
	description: string;
	icon: CategoryIconId;
	id: string;
	keywords: string[];
	monthlyBudgetMinor: number | null;
	name: string;
	updatedAt: string;
};
```

Contract: add `icon` next to `color` in `editableCategoryFields` using whitelist enum.

Mapper: `icon: resolveCategoryIconId(record.category.icon)`.

Repository `CategoryUpdateValues`: add `icon: string`.

Create use-case insert values: `icon: input.icon`.

Update use-case update values: `icon: input.icon`.

Fix any other create/update call sites in tests that omit `icon`.

- [ ] **Step 4: Run tests — expect PASS**

Run:

```bash
pnpm test -- tests/server/category/category-service.test.ts tests/entities/category/icons.test.ts tests/entities/category/public-categories-api.test.ts
```

- [ ] **Step 5: Commit only if the user asked**

---

### Task 4: `CategoryIcon` + `CategoryIconPicker`

**Files:**
- Create: `src/entities/category/ui/category-icon.tsx`
- Create: `src/entities/category/ui/category-icon.module.scss` (optional thin wrapper)
- Create: `src/entities/category/ui/category-icon-picker.tsx`
- Create: `src/entities/category/ui/category-icon-picker.module.scss`
- Create: `src/entities/category/ui/index.ts`
- Modify: `src/entities/category/index.ts`

**Interfaces:**
- Consumes: `CATEGORY_ICON_IDS`, `resolveCategoryIconId`, `CategoryIconId`
- Produces:
  - `CategoryIcon(props: { icon: string; class?: string; size?: number })`
  - `CategoryIconPicker(props: { value: string; onChange: (icon: CategoryIconId) => void; label?: string; class?: string })`

**Lucide map** (kebab → component). Import only listed icons from `lucide-solid`:

| id | Lucide export |
|----|---------------|
| `tag` | `Tag` |
| `shapes` | `Shapes` |
| `circle` | `Circle` |
| `star` | `Star` |
| `heart` | `Heart` |
| `bookmark` | `Bookmark` |
| `utensils` | `Utensils` |
| `shopping-cart` | `ShoppingCart` |
| `sandwich` | `Sandwich` |
| `candy` | `Candy` |
| `coffee` | `Coffee` |
| `wine` | `Wine` |
| `bus` | `Bus` |
| `car` | `Car` |
| `fuel` | `Fuel` |
| `bike` | `Bike` |
| `plane` | `Plane` |
| `train-front` | `TrainFront` |
| `home` | `Home` |
| `building-2` | `Building2` |
| `key-round` | `KeyRound` |
| `wrench` | `Wrench` |
| `hammer` | `Hammer` |
| `zap` | `Zap` |
| `flame` | `Flame` |
| `droplets` | `Droplets` |
| `wifi` | `Wifi` |
| `phone` | `Phone` |
| `monitor` | `Monitor` |
| `tv` | `Tv` |
| `shirt` | `Shirt` |
| `sparkles` | `Sparkles` |
| `scan-face` | `ScanFace` |
| `stethoscope` | `Stethoscope` |
| `pill` | `Pill` |
| `dumbbell` | `Dumbbell` |
| `baby` | `Baby` |
| `gamepad-2` | `Gamepad2` |
| `party-popper` | `PartyPopper` |
| `gift` | `Gift` |
| `paw-print` | `PawPrint` |
| `graduation-cap` | `GraduationCap` |
| `book-open` | `BookOpen` |
| `briefcase` | `Briefcase` |
| `wallet` | `Wallet` |
| `piggy-bank` | `PiggyBank` |
| `banknote` | `Banknote` |
| `receipt` | `Receipt` |
| `landmark` | `Landmark` |
| `scale` | `Scale` |
| `hand-coins` | `HandCoins` |
| `arrow-left-right` | `ArrowLeftRight` |
| `shield` | `Shield` |
| `file-text` | `FileText` |
| `ellipsis` | `Ellipsis` |

Keep the map as `Record<CategoryIconId, Component>` so TypeScript errors if a whitelist id is missing.

- [ ] **Step 1: Implement `CategoryIcon`**

```tsx
/**
 * Renders the Lucide icon for a category icon id.
 */
export function CategoryIcon(props: {
	icon: string;
	class?: string;
	size?: number;
}) {
	const iconId = () => resolveCategoryIconId(props.icon);
	const Icon = () => CATEGORY_ICON_COMPONENTS[iconId()];

	return (
		<span aria-hidden='true' class={cn(css.root, props.class)}>
			<Icon size={props.size ?? 18} strokeWidth={2.2} />
		</span>
	);
}
```

(Adapt to Solid’s component-as-variable pattern used elsewhere if needed — e.g. assign `const Cmp = CATEGORY_ICON_COMPONENTS[iconId()]` inside JSX via a small helper.)

- [ ] **Step 2: Implement `CategoryIconPicker`**

Mirror `ColorPicker` structure:
- optional `label`
- flex-wrap grid of buttons
- each button: `CategoryIcon`, `aria-label={id}`, `aria-pressed={active}`
- selected class `optionActive`; hover/focus only under `&:not(.optionActive)`
- `onClick` → `props.onChange(id)`

Default label text: `Иконка`.

- [ ] **Step 3: Export via `ui/index.ts` and entity `index.ts`**

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`

Fix any missing Lucide export names by swapping to an available sibling icon (update whitelist + seed + map together if id changes).

- [ ] **Step 5: Commit only if the user asked**

---

### Task 5: Category dialog + page wiring

**Files:**
- Modify: `src/views/categories/ui/category-dialog/category-dialog.tsx`
- Modify: `src/views/categories/ui/category-dialog/category-dialog.module.scss` (picker spacing if needed)
- Modify: `src/views/categories/page.tsx`

**Interfaces:**
- `CategoryDialogValue.icon: CategoryIconId` (or string)
- Create initial: `DEFAULT_CATEGORY_ICON_ID`
- Edit initial: `category.icon`
- Submit payload includes `icon`

- [ ] **Step 1: Extend dialog value + state**

Add `icon` to `CategoryDialogValue`. Signal `categoryIcon` initialized from `initialValue?.icon ?? DEFAULT_CATEGORY_ICON_ID` inside the existing open `createEffect`. Submit includes `icon: categoryIcon()`.

Place `<CategoryIconPicker label='Иконка' value={categoryIcon()} onChange={setCategoryIcon} />` immediately after `ColorPicker`.

Replace preview empty mark with:

```tsx
<CategoryIcon class={css.previewIconGlyph} icon={categoryIcon()} size={18} />
```

(Adjust SCSS so the preview icon inherits `--category-color` / `currentColor`.)

- [ ] **Step 2: Update `toDialogValue` and create/update handlers on the page**

```ts
function toDialogValue(category: PersistedCategory): CategoryDialogValue {
	return {
		color: category.color,
		description: category.description,
		icon: resolveCategoryIconId(category.icon),
		keywords: category.keywords,
		monthlyBudgetMinor: category.monthlyBudgetMinor,
		name: category.name
	};
}
```

Ensure create/update actions pass `icon` through to server functions (same object fields as dialog value).

- [ ] **Step 3: Typecheck + manual smoke (dev)**

Run: `pnpm typecheck`

Manual: open Categories → edit → change icon → save → reopen dialog shows new icon.

- [ ] **Step 4: Commit only if the user asked**

---

### Task 6: Display surfaces (card, summary, home)

**Files:**
- Modify: `src/views/categories/ui/category-card/category-card.tsx` (+ scss if needed)
- Modify: `src/views/categories/ui/category-summary-dialog/category-summary-dialog.tsx` (+ scss)
- Modify: `src/views/home/ui/operations-table/operations-table.tsx`
- Modify: `src/views/home/ui/operation-details-panel/operation-details-form.tsx`

**Interfaces:**
- Card/summary: `CategoryIcon` with `category.icon`
- Operations table row model: add `categoryIcon: CategoryIconId` resolved like color (by id then name), default `tag` when missing
- `CategoryOption` gains `icon: string`; orphan option uses `tag`

- [ ] **Step 1: Category card**

Replace:

```tsx
<span class={css.icon} aria-hidden='true'>
	<span/>
</span>
```

with:

```tsx
<span class={css.icon} aria-hidden='true'>
	<CategoryIcon icon={props.category.icon} size={18} />
</span>
```

Ensure `.icon` uses `color: var(--category-color)` (or equivalent) so Lucide stroke picks it up.

- [ ] **Step 2: Summary dialog header**

Next to title (or as leading mark before `Dialog.Title` content), render `CategoryIcon` when `props.category` is defined, using category color via CSS var on a wrapper.

- [ ] **Step 3: Operations table**

Extend color lookup pattern:

```ts
const categoryIconById = createMemo(() => {
	const iconById = new Map<string, string>();
	props.categories.forEach((category) => {
		iconById.set(category.id, resolveCategoryIconId(category.icon));
	});
	return iconById;
});
```

Same for name. When building row items, set `categoryIcon`. In the category cell placeholder, render `<CategoryIcon icon={item().categoryIcon} size={14} />`.

For category group headers, if they show a mark, use the same resolved icon.

- [ ] **Step 4: Operation details category combobox**

```ts
type CategoryOption = {
	color: string;
	disabled: boolean;
	icon: string;
	id: string;
	name: string;
};
```

Map `icon: resolveCategoryIconId(category.icon)`; orphan fallback `icon: DEFAULT_CATEGORY_ICON_ID`.

In `CategoryOptionContent`, replace empty `<span/>` with `<CategoryIcon icon={props.option.icon} size={16} />`.

- [ ] **Step 5: Typecheck + tests**

Run:

```bash
pnpm typecheck
pnpm test -- tests/entities/category tests/server/category
```

- [ ] **Step 6: Commit only if the user asked**

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Curated Lucide whitelist | 1, 4 |
| `categories.icon` + safe migration | 2 |
| Seed by `normalized_name` | 1 (map), 2 (SQL) |
| Zod + create/update persistence | 3 |
| Default on create untouched | 5 (`DEFAULT_CATEGORY_ICON_ID`) |
| Picker in category dialog | 4, 5 |
| Card / summary / ops table / combobox | 6 |
| `resolveCategoryIconId` fallback | 1, 3 mapper |
| No receipt snapshot / no custom SVG | Global constraints |

## Self-review notes

- No TBD placeholders; seed list is exhaustive for current DB names.
- Lucide component map is isolated in UI task so server code never imports `lucide-solid`.
- `icon` field name and `CategoryIconId` type are consistent across tasks.
- Commits gated on explicit user request (matches repo preference).
