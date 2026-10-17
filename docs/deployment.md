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

## Client IP behind the proxy

The API derives the client address (sign-in rate limits, `sessions.ip_address`) in
`apps/api/src/http/client-ip.ts`. Set `TRUSTED_PROXY_COUNT=1` for the API when exactly one
reverse proxy (the homelab nginx, which appends `$remote_addr` to `X-Forwarded-For`) sits in
front of it. With the default `0` no forwarding header is trusted and the TCP peer is used.
Rationale and caveats: `development/decisions/client-ip.md`.
