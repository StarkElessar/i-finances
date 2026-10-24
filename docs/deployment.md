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

The same-origin deployment does not require cross-origin cookies or a general
CORS policy. The public categories GET/OPTIONS pair sets its own CORS headers
in `apps/api/src/http/category-controller.ts`. Browser smoke and the full
authenticated flow remain manual deployment checks; this document does not
record that they have passed.

## Client IP behind the proxy

The API derives the client address (sign-in rate limits, `sessions.ip_address`) in
`apps/api/src/http/client-ip.ts`. Set `TRUSTED_PROXY_COUNT=1` for the API when exactly one
reverse proxy (the homelab nginx, which appends `$remote_addr` to `X-Forwarded-For`) sits in
front of it. Outside production the default is `0`: no forwarding header is trusted and the TCP peer is used.
With `NODE_ENV=production`, `TRUSTED_PROXY_COUNT` must be set explicitly or the API refuses to start
(`apps/api/src/modules/auth/auth-config.ts`).
Rationale and caveats: `development/decisions/client-ip.md`.

## Environment inventory (2026-10-23)

The template is `.env.example` at the workspace root; there is no
`apps/api/.env.example`. It declares 35 variables. `NODE_ENV` is also consumed by
the API but is not declared in the template. API and MCP package scripts load
`../../.env`; relative database/image paths are resolved from the API process's
working directory (`apps/api` when run through its package commands).

The tables below cover every template variable plus `NODE_ENV`. Defaults are
code defaults unless explicitly described as template values. Auth config is in
`apps/api/src/modules/auth/auth-config.ts`; Telegram and invitation configuration
is listed in the next section. Receipt settings are read in `composition-root.ts`
and `modules/receipt-import/receipt-image-storage.ts`; not every setting uses a
strict config parser.

| Variable | Default / use |
|---|---|
| `API_PORT` | `3001`; TCP port 1–65535, checked in `apps/api/src/main.ts`. |
| `DATABASE_URL` | `./data/i-finances.sqlite`; optional `file:` prefix or `:memory:` (`infrastructure/database/client.ts`). |
| `NODE_ENV` | No default here. `production` enables Secure auth cookies, requires explicit proxy count, enforces production Telegram checks, and disables the development global database cache. |
| `AUTH_ORIGIN` | `http://localhost:5173`; absolute URL used for mutation-origin checks, WebAuthn, invitation links, and Telegram webhook URL/confirmation host. |
| `SESSION_COOKIE_NAME` | `i_finances_session`; letters, digits, `_`, `-`. |
| `SESSION_TTL_DAYS` | `30`; integer 1–365. |
| `TRUSTED_PROXY_COUNT` | `0` outside production; integer 0–10, explicitly required in production. Use `1` behind the homelab nginx. |
| `WEBAUTHN_RP_ID` | `localhost`; nonempty RP ID. |
| `WEBAUTHN_RP_NAME` | `iFinances`; nonempty RP display name. |
| `RECEIPT_IMAGE_ROOT` | `./storage/receipts`; private image directory. |
| `RECEIPT_IMAGE_RETENTION_DAYS` | Positive integer; the template sets `5`, but unset/invalid values fall back to **30** in `ReceiptImportService`. Sets the image deadline after approval. |
| `RECEIPT_LITELLM_BASE_URL` | `https://litellm.holdingbp.ru:4000/v1`; corporate LiteLLM proxy. |
| `RECEIPT_LITELLM_API_KEY` | Secret; unset/blank disables the receipt processing loop while HTTP remains available. |
| `RECEIPT_LITELLM_MODEL` | `deepseek-flash`. |
| `RECEIPT_PROCESSING_POLL_INTERVAL_MS` | `5000`; fallback for unset/nonpositive/noninteger values. |
| `RECEIPT_PROCESSING_TIMEOUT_MS` | `120000`; fallback for unset/nonpositive/noninteger values. |
| `MCP_API_KEY` | Secret shared by API and MCP. API bearer authentication requires at least 32 characters (`http/api-key-session-resolver.ts`). |
| `MCP_USER_ID` | User ID impersonated by the bearer key; must identify an active user. Finance access requires household membership (otherwise 403 `household-required`); production policy uses the household owner's ID. |
| `MCP_BASE_URL` | `http://localhost:3001`; consumed by the separate MCP process (`apps/mcp/src/main.ts`). |
| `WEB_PORT` | Template value `5173`; current web scripts/config do not read it. `apps/web/package.json` starts `vite --port 5173`, and `vite.config.ts` proxies `/api` to `http://localhost:3001`. |
| `SEED_USERNAME` | Required by `apps/api/scripts/seed-auth-user.ts` only; 3–64 characters, reserved `tg-` prefix refused. |
| `SEED_PASSWORD` | Secret, required by the seed script only; 12–256 characters. |
| `SEED_DISPLAY_NAME` | Required by the seed script only; 1–100 characters after trimming. |
| `SEED_HOUSEHOLD_ID` | `default-household`; seed script only. |
| `SEED_HOUSEHOLD_NAME` | `Семья`; seed script only. |

## Telegram sign-in and households

The design and its reasons: `development/decisions/telegram-auth-and-households-v1.md` (Р1–Р13, rollout in 8.4).
Schema migrations 0014–0016, their backup, trial run and rollback: `development/decisions/schema-migrations-v1.md`.
The release 1 steps: `development/release-1-runbook.md`. This section is the operating guide for the pieces around
them. Everything below that touches the server is done by whoever deploys, and only on the owner's word.

### Environment

Server variables live in `~/sites/homelab/env/i-finances.env` (not in git). The workspace-root `.env.example` is the
template and holds no secrets. Telegram configuration, invitation TTLs, and administrator logins are validated at
startup; their errors name the variable without printing its value. Receipt numeric settings instead use the
fallbacks documented above.

| Variable | Secret | Meaning |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes | Token from BotFather. Required with `webhook`/`polling`; missing with either mode stops startup. With `off`, no update runner starts. A bot username plus `DEV_TELEGRAM_LOGIN=true` can enable local sign-in without a token. |
| `TELEGRAM_BOT_USERNAME` | no | Bot name without `@`, for `https://t.me/<name>` links. Required whenever `TELEGRAM_UPDATES` is not `off`. |
| `TELEGRAM_UPDATES` | no | `off` (default), `webhook` (production), `polling` (local, with a separate dev bot). |
| `TELEGRAM_WEBHOOK_SECRET` | yes | `webhook` only. 1-256 characters of `A-Za-z0-9_-`, at least 32 in production. Generate with `openssl rand -hex 32`. |
| `TELEGRAM_WEBHOOK_URL` | no | `webhook` only. Default `${AUTH_ORIGIN}/api/telegram/webhook`; must be https in production. |
| `TELEGRAM_LOGIN_TTL_MINUTES` | no | Lifetime of a sign-in or link request, 1-60, default 10. |
| `TELEGRAM_REGISTRATION_ENABLED` | no | `false` (default, and the owner's decision of 2026-10-22): an unknown Telegram account is refused unless the person came with a live invitation link. `true`: any unknown Telegram account creates a user. |
| `HOUSEHOLD_INVITATION_TTL_HOURS` | no | Lifetime of an invitation link, 1-168, default 168 (7 days). |
| `PLATFORM_ADMIN_USERNAMES` | no | Logins (`users.username`, not display names) of the platform administrators, separated by commas; on production `stark`. Only they create invitations into the application. Empty: nobody. An entry that cannot be a login stops the start. |
| `APP_INVITATION_TTL_HOURS` | no | Lifetime of an invitation into the application, 1-168, default 168 (7 days). |
| `DEV_TELEGRAM_LOGIN` | no | Local development only. **Never in production**: the API refuses to start with it when `NODE_ENV=production`. |

### Creating the bot

1. In BotFather: `/newbot`, a name and a username ending in `bot`. Make a **separate** bot for production and, if wanted, another for development. The bots of ServicePlanner must not be reused: a bot has one consumer of updates, and a second one gets `409 Conflict`.
2. `/setdomain` is **not** needed (that is for the old login widget). Links and the webhook are built from `AUTH_ORIGIN`.
3. Put the token into the server env file without leaving it in shell history or process arguments (for example over `ssh` with the line on stdin). Never put it into git, `~/personal-kb`, a chat or a ticket. Copy the env file with `cp -p` before editing it.
4. Set `TELEGRAM_BOT_USERNAME`. Leave `TELEGRAM_UPDATES` unset (or `off`) until the web sign-in screen is deployed.

### Webhook

With `TELEGRAM_UPDATES=webhook` the API registers the webhook itself at start (`setWebhook` with `secret_token` and `allowed_updates: ["message","callback_query"]`). Nginx already proxies `/api/*` to the API without cutting the prefix, so no nginx change is needed for it. Telegram sends no `Origin` header, so the route skips the origin check; the only credential is the `X-Telegram-Bot-Api-Secret-Token` header (compared in constant time), a wrong or missing one gets 401, and the body is limited to 64 KB. In any other mode the route does not exist (404).

To check it (the token is read inside the container, so it never appears in a command line):

```sh
cd ~/sites/homelab
docker compose exec if-api node -e "fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/getWebhookInfo').then((r)=>r.json()).then((j)=>console.log(JSON.stringify(j.result,null,2)))"
```

`url` must be `https://<domain>/api/telegram/webhook`, `last_error_message` empty, `pending_update_count` near 0.

### Rollout order

The releases are those of section 8.4 of the decision. The sequence below retains that rollout history; the
2026-10-22 decision in `app-invitations-v1.md` supersedes its open-registration step: keep
`TELEGRAM_REGISTRATION_ENABLED=false` and register new people through live invitations. Every deploy starts with a backup (`schema-migrations-v1.md`, 5.2); migrations are applied by the container at start.

1. **Release 1, no visible change.** Migrations 0014–0016, household without auto-creation, `TRUSTED_PROXY_COUNT=1`. Telegram stays off. Steps: `development/release-1-runbook.md`.
2. **Release 2, Telegram for the family.** Deploy API and web together (the session response changed). Set the bot token, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_UPDATES=webhook`, `TELEGRAM_WEBHOOK_SECRET`, and keep `TELEGRAM_REGISTRATION_ENABLED=false`. Then link Telegram in this order (Р9), so that no duplicate user appears:
   1. Registration stays **off**: Telegram signs in only accounts that already linked it.
   2. The owner signs in as usual (password or passkey), opens «Безопасность» and presses «Привязать Telegram». The screen shows the linked `@username`: check that it is theirs.
   3. The family member does the same.
   4. The original rollout called for `TELEGRAM_REGISTRATION_ENABLED=true` after both linked, on the owner's word. **Superseded on 2026-10-22:** keep it `false`; new registrations require a live invitation (next section).
   If a duplicate was created anyway (registration turned on early), linking merges it only when it has no password, no passkey and an empty household; otherwise the answer is 409 and the owner decides by hand.
3. **Release 3, households for other people.** Invitations, members, onboarding. Before it, a read-only query on the production database for the roles in `default-household`. There must be one owner: the head of the family, who is also `MCP_USER_ID`. A second `owner` (a leftover of the old resolver) can remove the owner and end their sessions; lowering that user to `member` is done only on the owner's word, after a backup. On the nginx side add `Referrer-Policy: same-origin` for `/invite` (below).

`TELEGRAM_UPDATES=webhook` goes on only when the sign-in and link screens are deployed: before that the bot would answer people for whom the site has no button.

### Invitations into the application (migration 0017)

Design, threat model and decisions: `development/decisions/app-invitations-v1.md`. Registration stays closed (`TELEGRAM_REGISTRATION_ENABLED=false`); a person signs up only with a live invitation link: into a household (any owner creates it) or into the application (only a platform administrator). Order of the deploy:

1. **Backup** through the `backup` container, as in `schema-migrations-v1.md`, 5.2 (directory `pre-deploy-app-invitations-$TS`), and note the row counts of `users`, `household_invitations`, `telegram_login_requests`.
2. **Env.** Add `PLATFORM_ADMIN_USERNAMES=stark` to `~/sites/homelab/env/i-finances.env` (copy the file with `cp -p` first). `APP_INVITATION_TTL_HOURS` may stay unset (7 days). Keep `TELEGRAM_REGISTRATION_ENABLED=false`.
3. **Trial run on the copy** from step 1, exactly as `schema-migrations-v1.md`, 5.3, with the new image. Expected: `Database migrations applied.`, `integrity ok`, `fk violations 0`, the same row counts; the new table `app_invitations` is empty. 0017 only adds (`CREATE TABLE app_invitations` and two `ALTER TABLE ... ADD` of nullable columns), it rebuilds no table and touches no row.
4. **Deploy API and web together** (the session answer has `isPlatformAdmin`, the preview has `kind`): `docker compose up -d if-api`, wait for `healthy`, `docker compose run --rm if-web`, smoke `/api/health`. Then, signed in as `stark`, `GET /api/auth/session` says `isPlatformAdmin: true`; as anybody else `false`.
5. **Rollback** is a code rollback (`git revert` of the merge, the usual pull and rebuild). The code before 0017 works on the schema after it: it does not know the new table and columns and never reads them; its migrator applies nothing. What is lost by going back: invitations into the application stop working (their links say «unknown»), people already registered by them stay. Restoring the database from the backup is for a broken database only and loses everything written after it (`schema-migrations-v1.md`, 6).

### The right to found a household (migration 0018)

Design and rule: `development/decisions/app-invitations-v1.md`, section 13. 0018 appends one nullable column, `users.first_household_owner_at` (`ALTER TABLE ... ADD`, no rebuild), and fills it for the current owners only; no other column or row changes. A former owner is not guessed from the household invitations they created (owner's decision 2026-10-23): a person demoted to `member` by hand (`vicotya`, 2026-10-22) must not get the right back.

**Mandatory before the deploy, read only:** the query of section 13.4 («кому миграция даст право», the current owners) through the `backup` container. Expected: exactly one row, `stark`. Any other row means stop and ask the owner. Then deploy it like 0017 above: backup through the `backup` container, trial run on the copy with the new image (`Database migrations applied.`, `integrity ok`, `fk violations 0`, the same row counts), then API and web together. Smoke: only `stark` has `first_household_owner_at`; `GET /api/auth/session` as `stark` says `canCreateHousehold: true`, as `vicotya` or a member who came by a household link `false`. Rollback is a code rollback; the older code ignores the column (section 13.5 has the one caveat).

### `Referrer-Policy` for `/invite`

The invitation token is in the URL fragment, which a browser never sends, so it reaches neither the access log nor `Referer`. As a second line, nginx answers the SPA page `/invite` with `Referrer-Policy: same-origin` (nothing leaves the site, and POST requests keep a real `Origin`: with `no-referrer` some browsers may send `Origin: null`, which the API rejects with 403 `invalid-origin`). The nginx config belongs to the homelab repository, not to this one, so this repository only records the requirement:

```nginx
location = /invite {
    add_header Referrer-Policy "same-origin" always;
    try_files /index.html =404;
}
```

Adapt it to how homelab serves the SPA, and remember that `add_header` inside a `location` replaces the headers inherited from above.

### Recovery of access: `reset-user-telegram`

Used when a person lost the Telegram account that was linked (the account was deleted, so the new one has a new id) or a stranger's Telegram got linked by mistake (Р10, Р11). It removes **only the Telegram link** of one user and revokes their open login requests. It does not delete the user, the password, the passkeys, the membership or any data, it issues no password, and it prints no token or hash. It does print the linked Telegram's id and `@username` so that the operator can check the account with the person (for a private chat the Telegram id is also the chat id); names from the database are printed without control characters. Only on the owner's word.

```sh
cd ~/sites/homelab
# 1. Backup, as before a deploy (schema-migrations-v1.md, 5.2).
# 2. Dry run (the default): prints what would happen and changes nothing.
docker compose exec if-api ./node_modules/.bin/tsx scripts/reset-user-telegram.ts <username>
# 3. Apply: the username must be typed again. --end-sessions also ends every session of the user.
docker compose exec if-api ./node_modules/.bin/tsx scripts/reset-user-telegram.ts <username> --apply [--end-sessions]
```

It works on the database from `DATABASE_URL` and can run while the API is up. It needs a terminal for the confirmation (`docker compose exec` gives one). Locally: `pnpm --filter @i-finances/api telegram:reset <username>`.

The person signs in with the password or passkey they still have and links the new Telegram in «Безопасность». A user with **no** password and **no** passkey would have no way in after the reset, so the script refuses them unless `--allow-lockout` is given. Such an account stays unreachable: the user row is never deleted, and a person who signs up through Telegram again becomes a different user. `seed-auth-user.ts` cannot give a password to a `tg-<id>` user (the prefix is reserved).

A person who signed up through Telegram (no password, no passkey) and lost that Telegram account does not need the script: the owner removes the old account from the household in «Окружение» (that also ends its sessions) and sends a new household invitation. The person opens that link and signs in through the new Telegram account: the live invitation permits registration as a new user, then they accept it to join the household. Registration is by invitation only; keep `TELEGRAM_REGISTRATION_ENABLED=false` (see `development/decisions/app-invitations-v1.md`; this supersedes the open-registration recovery instructions in Р10 of `telegram-auth-and-households-v1.md`). The old user row remains, and the household's data stays with the household. `--allow-lockout` is for cutting a Telegram off an account on purpose, with `--end-sessions`, when nobody is to sign in to it any more.

### Warnings

- **`DEV_TELEGRAM_LOGIN` never goes to production and never onto a copy of the production database.** It confirms a sign-in for *any* Telegram id, that is, it signs in as any user. The API refuses it with `NODE_ENV=production` and answers it only to loopback peers, but a stand over a copy of the real database is as dangerous as production.
- **Do not work with the production token locally.** `getUpdates` against a bot that has a webhook gets `409` (it does not remove the webhook), and any message the local API sends reaches real people. Tests and stands use `TELEGRAM_UPDATES=off` or a separate dev bot; a stand over a copy of the production database gets an empty `TELEGRAM_BOT_TOKEN` and zeroed `chat_id`.
- **`TRUSTED_PROXY_COUNT`.** The sign-in rate limits, the Telegram request limits and `sessions.ip_address` depend on it: too high lets a client forge its address, too low puts everyone behind the proxy's address. `1` behind the homelab nginx. Details: `development/decisions/client-ip.md`.
- **Do not roll the code back below A5 while there are users without a membership.** The old resolver gives such a user the role `owner` in `default-household`, that is, all family finances. Before any rollback after release 2 the query «users without membership» from `schema-migrations-v1.md`, 5.1, must return nothing; the same applies after the first removal of a member. See `schema-migrations-v1.md`, section 6.
- **If Telegram is switched off on the server, users without a password and a passkey are left without a way in.** A user who signed up through Telegram has only that way. An empty `TELEGRAM_BOT_TOKEN`, `TELEGRAM_UPDATES=off` or a deleted webhook hides the button and stops the bot, and such users cannot sign in until Telegram is on again. The way back is to switch Telegram on; the reset script does not help them (it removes the link and gives no password, and it refuses an account without another way in). Risk from the review of A3.
