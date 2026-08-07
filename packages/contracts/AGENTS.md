# Contracts package

This package contains the public, serializable boundary between the API and the web application.

- Keep schemas and DTOs independent of Hono, Solid, Drizzle, Node-only libraries, and request context.
- Export public APIs from `src/index.ts`; consumers must not import internal files through `src/` paths.
- Do not expose database rows or infrastructure-specific types.
- Use Zod for runtime validation and derive TypeScript types from the schemas where appropriate.
