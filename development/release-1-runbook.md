# Релиз 1: регламент выкатки

Состав: весь `master` на момент выкатки. UI-изменения (токены, шрифт IBM Plex, навигация, компоненты кита), API «Безопасности» (IF-41), укрепление (IF-45), ротация сеанса (IF-46), миграции 0014–0016, код Telegram и окружений (A2–A5, A10). Telegram при этом выключен. `/api/public/categories` остаётся открытым (решение владельца 2026-10-18).

Подробности по каждому шагу: `development/decisions/schema-migrations-v1.md` (разделы 5–7), `client-ip.md`, `login-rate-limit.md`, память `i-finances-deploy`. Все команды по SSH от `stark`, без sudo, SQL только через stdin.

Правило остановки: любое неожиданное значение на шагах 1–3 значит стоп, ничего не чинить на ходу.

## Шаги

0. **Локально.** `master` совпадает с `origin/master`, `pnpm typecheck && pnpm lint && pnpm test && pnpm build` зелёные.
1. **Чтение прод-базы, только чтение** (запросы 5.1 документа миграций):
   - пользователей с двумя и более членствами должно быть 0, иначе стоп (миграция 0016 упадёт и откатит всё, но выкатывать нельзя);
   - список пользователей без членства (они станут `member` в `default-household`);
   - `default-household` существует; роли участников; `MCP_USER_ID` из серверного env — участник окружения;
   - количество строк по всем таблицам, `PRAGMA integrity_check`, `PRAGMA foreign_key_check`.
2. **Бэкап** через контейнер `backup` (`.backup` и `integrity_check` копии). Нет бэкапа, значит стоп.
3. **Пробный прогон миграций на копии** (5.3 документа): 0014–0016 применяются, `foreign_key_check` пуст, строки старых таблиц на месте, сеансы и ключи целы.
4. **Серверный env** `~/sites/homelab/env/i-finances.env` (в git не хранится): добавить `TRUSTED_PROXY_COUNT=1` (без неё API в production не стартует); токен бота и `TELEGRAM_BOT_USERNAME=i_finances_bot` можно положить заранее, оставив `TELEGRAM_UPDATES` незаданным или `off`. Токен через stdin SSH, не в аргументах и не в репозитории. Перед правкой копия файла `cp -p`.
5. **Homelab:** в `env/i-finances.env.example` добавить `TRUSTED_PROXY_COUNT=1` и закомментированный блок Telegram, закоммитить, запушить, `git pull --ff-only` на сервере.
6. **Выкатка:** `cd ~/sites/i-finances && git pull --ff-only`; `cd ~/sites/homelab && docker compose build if-api if-web`; `docker compose up -d if-api`, дождаться `healthy` (в логе «Database migrations applied.»); `docker compose run --rm if-web` (иначе nginx отдаёт старый фронт). API и web выкатываются вместе: ответ сеанса изменился.
7. **Проверка:** `integrity_check`, `foreign_key_check`, число строк как на шаге 1 (меняется только `household_members`, плюс три новые пустые таблицы), в журнале 17 миграций; `GET /api/health` 200, `GET /api/auth/session` и `/api/accounts` без cookie 401, `GET /api/public/categories` 200, `POST /api/telegram/webhook` 404, в логах нет ошибок и токена. Войти владельцем и убедиться, что семья и данные на месте.
8. **Откат** (только по документу, `git revert` + push + pull; базу из бэкапа только если миграции повредили данные). Откатывать код ниже A5 нельзя, если появились пользователи без членства.

## Не входит в релиз 1 (отдельные задачи)
- Заголовки SPA в nginx и `limit_req` на вход (IF-47, пп. 3–4).
- Включение Telegram (`TELEGRAM_UPDATES=webhook`) и регистрации: релиз 2, после UI входа и привязки.
- `DEV_TELEGRAM_LOGIN` на сервере не включать никогда.

## Запись в боевую базу (урок выкатки 2026-10-22)
- Контейнер `backup` монтирует `/if-data` **только на чтение** (`:ro`): он годится для чтения и `.backup`, запись даёт `attempt to write a readonly database`.
- Точечные правки данных делаются через контейнер `if-api` (база доступна на запись): `ssh stark@<хост> 'cd ~/sites/homelab && docker compose exec -T if-api node -' < скрипт.js`, скрипт использует `better-sqlite3`, `PRAGMA foreign_keys=ON`, `BEGIN IMMEDIATE`, проверки числа строк с откатом и выводит состояние до и после.
- Выполнено 2026-10-22: удалён тестовый пользователь `sergei` («Sergei Test», авторства данных не было), `vicotya` понижена до `member`; `stark` единственный owner, `integrity_check` ok, нарушений внешних ключей нет.
