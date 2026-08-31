# Home Account URL Search Params Design

## Problem

Selected account on the home page lives only in a component signal. Reload or shared links lose selection.

## Goal

Persist the selected account in the URL query string with a **schema-based**, **portable** approach that:

- survives reload and is shareable;
- uses browser history (`push`) for user-driven selection;
- normalizes invalid/missing values with `replace`;
- scales to more home filters later (period, etc.) without per-page ad-hoc parsers;
- does **not** depend on SolidStart — only Zod + Solid + `@solidjs/router`.

## Non-goals (v1)

- Persisting period / other filters (schema is ready to grow)
- localStorage / cookies
- Encoding account selection into the path (`/accounts/:id`)

## Architecture

### Layer A — pure (`src/shared/lib/search-params/`)

No Solid imports.

- `parseRouteSearchParams(schema, raw)` — coerce `string | string[]` query values, Zod-parse into typed state
- `serializeRouteSearchParams(schema, state)` — flat `Record<string, string | undefined>` for the router setter (`undefined` / `''` / `null` removes keys)
- Preserve unknown keys: serialization only emits keys from the schema; router merge leaves other query keys intact

### Layer B — Solid adapter (`src/shared/routing/create-route-search-params.ts`)

Depends on `solid-js` + `@solidjs/router` only.

```ts
createRouteSearchParams(schema) → {
  params: Accessor<T>;
  setParams: (patch: Partial<T>, options?: { history?: 'push' | 'replace' }) => void;
}
```

- `history: 'push'` (default for user actions) → `setSearchParams(…, { replace: false })`
- `history: 'replace'` → `{ replace: true }` (normalization)

### Home schema (`src/views/home/model/home-search-params.ts`)

```ts
homeSearchParamsSchema = z.object({
  account: z.string().trim().min(1).max(128).optional()
});
```

Query key: **`account`**.

## Behavior (home)

| Event | Behavior |
|------|----------|
| User selects account | `setParams({ account: id }, { history: 'push' })` |
| Valid `account` in URL + accounts loaded | That account is active |
| Missing/invalid `account` after accounts load | Active = first account; `setParams({ account }, { history: 'replace' })` |
| Accounts still loading | Do not write URL |
| Account created | `setParams({ account: newId }, { history: 'push' })` |

URL is the source of truth after accounts are available. No parallel “preferred” signal beyond one-shot create → push.

## Testing

- Unit tests for parse/serialize (empty, valid, array values, strip empty optional)
- Manual: select account → reload → same account; back/forward; invalid id → first account + cleaned URL

## Portability note

Moving off SolidStart: copy `shared/lib/search-params` + `shared/routing/create-route-search-params` + screen schemas unchanged, as long as the app still uses `@solidjs/router`.
