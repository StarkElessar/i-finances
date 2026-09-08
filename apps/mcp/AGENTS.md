# MCP application

Stdio MCP server letting an AI agent record and query household expenses. A
thin HTTP client of `apps/api` — no direct database or service imports.

- Authenticates with `Authorization: Bearer $MCP_API_KEY` (see `ApiKeySessionResolver` in `apps/api`), impersonating `MCP_USER_ID`. Generate a key with `pnpm --filter @i-finances/api mcp:api-key`.
- Sets its own `Origin` header on mutations — Node's `fetch` doesn't set one, and the API rejects mutations without a same-origin `Origin`/`Referer`.
- Reuses `@i-finances/contracts` for response shapes; never duplicates a schema already defined there.
- `update_expense` requires every field — the API has no partial-update or single-record GET endpoint to merge against.
- Use `@/*` for imports rooted at `apps/mcp/src`.
