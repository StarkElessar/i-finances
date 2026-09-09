# Home Period Mode URL Search Params Design

## Problem

Operations table period mode (`week` / `month` / `year`) lives only in a local signal. Reload resets to `month`.

## Goal

Persist **only the period display mode** in the home URL query, reusing the existing schema-based search-params stack (`account` already uses it).

## Non-goals (v1)

- Persisting period **anchor** (which week/month/year via arrows) — stays local
- Category / contact summary dialogs
- `push` history for mode changes
- localStorage

## Query contract

| Key | Values | Default when missing/invalid |
|-----|--------|------------------------------|
| `period` | `week` \| `month` \| `year` | `month` |

Schema extension on `homeSearchParamsSchema`:

```ts
period: z.enum(['week', 'month', 'year']).optional().catch(undefined)
```

Invalid values must not throw during parse; they become `undefined` and are normalized.

## History

**Always `replace`** for period writes (user toggle and URL normalization).

Rationale: mode is a view preference on the same data surface, not a distinct “page” like account selection (`account` keeps `push`).

## Behavior

| Event | Behavior |
|------|----------|
| User picks week/month/year | `setParams({ period }, { history: 'replace' })` |
| Valid `period` in URL | Table uses that mode |
| Missing/invalid `period` | UI = `month`; `setParams({ period: 'month' }, { history: 'replace' })` |
| Period arrows (prev/next) | Local `periodAnchor` only — not in URL |

## UI wiring

- `HomeContent` owns URL state via `createRouteSearchParams(homeSearchParamsSchema)`.
- `OperationsTable` becomes controlled for mode: `periodMode` + `onPeriodModeChange`.
- Anchor / search / sort remain internal to the table.

## Testing

- Schema parse: valid enum, missing, invalid → no throw / `undefined`
- Manual: toggle mode → URL updates without new history entry; reload keeps mode; bad `?period=nope` → `month` + cleaned URL
