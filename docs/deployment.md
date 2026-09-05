# Deployment boundary

The frontend and API are separate processes and separate packages. Nginx is
the public entry point:

```text
Browser
  │ same origin
  ▼
Nginx ── /            ──► apps/web/dist
      └─ /api/*       ──► apps/api
```

`apps/web` is built as static files. `apps/api` owns the database, migrations,
sessions, private receipt images, and worker endpoints. Nginx must preserve the
`/api` prefix when proxying and forward the request host/origin information used
by the API origin checks.

The migration does not require CORS or cross-origin cookies. Browser smoke and
the full authenticated flow are intentionally left for manual verification
after the source split and cleanup are complete.
