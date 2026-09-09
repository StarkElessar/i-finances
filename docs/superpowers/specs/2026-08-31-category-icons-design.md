# Category Icons Design

## Problem

Categories have a color but no icon. Cards and the operations table already reserve a visual slot (empty colored mark / `.categoryIcon` placeholder), but there is nothing meaningful to render. Users cannot assign or change an icon when creating or editing a category.

## Goal

1. Persist an icon id on each category.
2. Ship a curated whitelist of Lucide icons (`lucide-solid`, already in the project) suitable for personal finance categories.
3. Seed sensible icons for existing categories by `normalized_name`; unknown names keep the default.
4. Let users pick an icon in the category create/edit dialog (alongside color), with an auto-default if they leave it untouched.
5. Render the icon everywhere a category is visually identified (cards, summary/operation UIs, operations table, category combobox options).

## Non-goals (v1)

- Autocomplete icon from typed category name in the form
- Custom uploaded SVG / emoji / Iconify packs
- Full Lucide catalog with search
- Icons for accounts or contacts (beyond existing type-specific marks)
- Changing category color semantics

## Approach

**Registry + kebab-case string id in DB (recommended).**

- Code owns a whitelist of icon ids and a static map id → Lucide component (tree-shakeable imports only).
- DB stores `categories.icon` as `text NOT NULL` with default `'tag'`.
- Zod validates create/update against the whitelist.
- Unknown / legacy values resolve to the default at render time via `resolveCategoryIconId`.

Rejected alternatives:

- Storing PascalCase Lucide export names (weaker tree-shake, typo risk, no stable app-level id).
- Separate semantic enum (`food`, `transport`) mapped to Lucide (extra indirection with one icon set).

## Data model

### Schema

Add to `categories`:

| Column | Type | Constraints |
|--------|------|-------------|
| `icon` | `text` | `NOT NULL`, default `'tag'` |

Migration (same pattern as `description` in `0008_wet_salo.sql`):

1. `ALTER TABLE categories ADD icon text DEFAULT 'tag' NOT NULL;`
2. `UPDATE` rows by `normalized_name` for known seed mappings.
3. Unmatched rows remain `'tag'`.

SQLite additive `ADD COLUMN` with default does not rewrite unrelated data; existing indexes/FKs stay intact.

### Domain types

- Extend `Category` / `PersistedCategory` with `icon: CategoryIconId`.
- Extend create/update contracts and mappers/repository/service to read/write `icon`.
- `CategoryDialogValue` includes `icon`.

### Registry (`entities/category`)

Suggested module: `src/entities/category/model/icons.ts` (exported via entity public API).

| Export | Role |
|--------|------|
| `CATEGORY_ICON_IDS` | Readonly tuple / const array of kebab-case ids (~50–70) |
| `CategoryIconId` | Union type derived from the whitelist |
| `DEFAULT_CATEGORY_ICON_ID` | `'tag'` |
| `CATEGORY_ICONS` | Map id → Lucide component |
| `resolveCategoryIconId(value)` | Whitelist hit or default |
| `CATEGORY_ICON_SEED_BY_NORMALIZED_NAME` | Seed map for migration content + tests |

All seed target ids **must** be members of `CATEGORY_ICON_IDS` (enforced by unit test).

### Validation

- Create/update: `icon` required in zod as whitelist enum; UI always sends selected or `DEFAULT_CATEGORY_ICON_ID`.
- No silent server-side default for omitted `icon` after the API cutover — clients must send the field.

## Seed mapping (existing categories)

Use `normalized_name` keys. Implementation **must** include an explicit seed entry for every name below (current household set). Exact Lucide id per row is chosen at implementation from the curated whitelist; groups below are guidance only.

**Food:** еда, продукты, фастфуд, сладости  
**Transport:** транспорт, автомобиль, топливо, обучение - автошкола, прокат  
**Home / utilities:** аренда квартиры, жировка, комунальные платежи, газ, электричество, ремонт, домашнее хозяйство  
**Health / care:** здоровье, гигиена, красота, спорт  
**Leisure / family:** дети/игрушки/развлечения, досуг, путешествие, домашние животные, подарок  
**Money / finance:** заработок, налоги, долги, накопление, платежи, обмен валют, paypal оплата, страхование, пожертвование  
**Services / other named:** одежда, онлайн сервисы, потоковые данные, телефон&связь, образование, канцелярия, сервис, неучтенка, прочие траты  

Any other / future `normalized_name` without a seed row keeps default `'tag'`.

## UI

### Components

1. **`CategoryIcon`** — renders Lucide from resolved id; size via props; color via `currentColor` / CSS variable (`--category-color` where already used).
2. **`CategoryIconPicker`** — grid of whitelist icons (ColorPicker-like: label, selected state, no custom free-text). Active option does not get hover/pointer restyle (project interactive-styles rule).

**Placement:** both under `src/entities/category/ui/`, exported via `~/entities/category`. Keeps Lucide registry + UI next to the domain whitelist and avoids `shared/ui` → entity imports. Views (categories, home, dialogs) import from the entity public API.

### Category dialog

- Icon picker next to color picker.
- Live preview: accent color + selected icon.
- Create: initial icon = `DEFAULT_CATEGORY_ICON_ID`.
- Edit: initial icon from category.
- Submit always includes `icon`.

### Display surfaces

| Surface | Change |
|---------|--------|
| Category card | Replace empty mark with `CategoryIcon` |
| Category summary / related dialogs | Show icon with category identity |
| Operations table `.categoryIcon` | Render resolved category icon (lookup by id/name like color today) |
| Operation form category combobox options | Show icon alongside color/name when options already show color |

## Behavior summary

| Scenario | Behavior |
|----------|----------|
| New category, icon untouched | Saved as `DEFAULT_CATEGORY_ICON_ID` (`tag`) |
| Edit category, change icon | Persisted via update + version lock |
| Unknown icon string in DB | Render default; optional normalize on next update |
| Migration of existing rows | Named seed or `tag` |

## Testing

- Registry: every seed value ∈ whitelist; default ∈ whitelist.
- `resolveCategoryIconId`: known → same; unknown → default.
- Zod create/update: accept whitelist; reject unknown.
- Category service: create/update/list round-trip `icon`.
- In-memory migrate (existing test pattern): column present; known `normalized_name` gets seed icon.

## Out of scope follow-ups

- Name-based icon suggestion while typing
- Searchable full Lucide browser
- Per-household custom icon packs
