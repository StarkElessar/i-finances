# API application

The API owns HTTP transport, authentication, application services, repositories, SQLite, Drizzle migrations, and worker endpoints.

- Hono types may appear in HTTP controllers and middleware only.
- Application services must not receive Hono `Context`, `Request`, `Response`, or status codes.
- Repositories own Drizzle and database row types.
- Use explicit constructor dependencies and a visible composition root; do not add Inversify, decorators, or a service locator.
- Keep the existing migration files byte-for-byte unchanged when moving or applying them.
- Never use a production or user database for migration experiments.
