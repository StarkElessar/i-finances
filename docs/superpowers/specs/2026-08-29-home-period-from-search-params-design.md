# Home Period Anchor URL Search Params Design

## Problem

Home URL stores `period` (week/month/year) but not **which** week/month/year. Arrow navigation and deep links are lost on reload.

## Goal

Persist the canonical period start in the query alongside mode, using one date key and existing period helpers — no mode-specific formats.

## Query contract

| Key | Values | Notes |
|-----|--------|--------|
| `period` | `week` \| `month` \| `year` | Default `month` |
| `from` | `YYYY-MM-DD` | Canonical **start** of the period |

Examples:

- `?period=month&from=2026-08-01`
- `?period=year&from=2025-01-01`
- `?period=week&from=2026-08-24` (Monday)

## Canonicalization

Pure helper (entity layer) `resolveOperationPeriodSearchState({ period?, from?, now })`:

1. `period = period ?? 'month'`
2. Parse `from` via `tryParseLocalDateKey`; missing/invalid → `now`
3. Snap with `startOfPeriod(anchor, period)`
4. If snapped start is **after** the current period start (for `now`) → clamp to current period
5. Return `{ period, from: formatLocalDateKey(anchor), anchor }`

URL normalize always writes both keys when they differ from canonical form (`replace`).

## History

All period writes use **`replace`** (mode toggle, arrows, normalize). Same rationale as mode-only: view preference, not a distinct page.

## User actions

| Action | Behavior |
|--------|----------|
| Change mode | Keep current `from` date, re-snap with new mode, `replace` |
| Prev/next arrows | `shiftOperationPeriod` → new `from`, `replace` |
| Reload / share | Same mode + period |

## UI wiring

- `HomeContent` owns URL via `homeSearchParamsSchema` + resolve helper
- `OperationsTable`: controlled `periodMode` + `periodFrom` (date key) + `onPeriodModeChange` + `onPeriodMove(offset)`
- No local period anchor signal in the table

## Non-goals

- `push` history for period navigation
- ISO week strings (`2026-W34`)
- Separate `year` / `month` query keys
- Category/contact summary dialogs

## Testing

- Unit: resolve helper (valid snap, invalid from, future clamp, mode re-snap)
- Schema: `from` date-shaped optional with catch
- Manual: arrows update `from`; reload; mode switch re-snaps; bad `from` → current period
