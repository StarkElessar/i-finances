# Web application

The web app is a client-only Solid.js application built with Vite.

- Communicate with the API over HTTP; do not import `@i-finances/api` or server-only modules.
- `@i-finances/contracts` is the only workspace package allowed as a direct shared-code dependency at this stage.
- Do not import Hono server APIs, Drizzle, `better-sqlite3`, Node-only auth packages, or database schemas.
- SolidStart, server actions, server queries, and Nitro do not belong here.
