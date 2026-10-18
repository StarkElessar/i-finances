# Миграции схемы для Telegram и окружений (DB-1, DB-2, DB-3): выкатка, бэкап, откат

Раздел 8.1 решения `telegram-auth-and-households-v1.md`. Автор: Opus, 2026-10-18. Здесь записано, что делают миграции, как их выкатывать, как откатываться и что откатить нельзя. Все команды для сервера ниже **агент не запускал**: их выполняет тот, кто деплоит, и только по слову владельца.

## 1. Что в релизе

| Файл | Задача | Что делает | Как получен |
|---|---|---|---|
| `0014_telegram_auth_and_invitations.sql` | DB-1 | Создаёт `telegram_accounts`, `telegram_login_requests`, `household_invitations` с индексами. Существующие таблицы не трогает | `db:generate`, без правок |
| `0015_users_optional_password_hash.sql` | DB-2 | `users.password_hash` становится NULL-able: пересборка `users` (`__new_users`, копирование, `DROP`, `RENAME`), затем заново `users_username_unique` | `db:generate` + предохранитель в начале (раздел 3) |
| `0016_household_members_one_household_per_user.sql` | DB-3 | `household_members_user_id_idx` заменяется уникальным `household_members_user_id_unique`, затем пользователи без членства добавляются в `default-household` как `member` | `db:generate` + шаг с данными в конце |

Существующие миграции 0000–0013, их снапшоты и записи журнала не менялись (контрольные суммы в отчёте ветки). Журнал только дополнен тремя записями, снапшоты 0014–0016 порождены `drizzle-kit`; `drizzle-kit check` чистый, повторный `db:generate` говорит «No schema changes».

## 2. Как мигратор их применяет

- `scripts/migrate-db.ts` вызывает `applyMigrations` при каждом старте контейнера `if-api` (`command` в compose: `migrate-db.ts && main.ts`). Если миграция падает, API не стартует, контейнер не становится `healthy`.
- Мигратор Drizzle выполняет **все ожидающие миграции в одной транзакции**. Если 0016 упадёт, откатятся и 0014, и 0015: база останется ровно такой, какой была до старта.
- `applyMigrations` выключает `foreign_keys` **до** транзакции (внутри транзакции `PRAGMA foreign_keys` ничего не делает) и после миграций проверяет `PRAGMA foreign_key_check`.
- `foreign_key_check` выполняется **после** `COMMIT`. Если он найдёт нарушения, миграции уже записаны, а API не стартует, пока нарушения не убраны (проверка повторяется при каждом старте). Поэтому пробный прогон 5.3 смотрит `fk violations`.

## 3. Опасное место DB-2 и предохранитель

`DROP TABLE users` при включённых внешних ключах делает неявный `DELETE FROM users`. Каскадные дети (`sessions`, `webauthn_credentials`, `webauthn_challenges`, `household_members`) при этом **молча удаляются**, а NO ACTION-ссылки (`operations.created_by_user_id` и другие) роняют миграцию. Проверено тестом: обычный `migrate()` с включёнными ключами на базе, где у пользователя есть только сеанс, оставляет 0 сеансов.

Через `applyMigrations` этого не происходит. Чтобы ошибочный запуск (`drizzle-kit migrate`, ручной `migrate()`, другой скрипт) не стёр данные, в начале 0015 стоит предохранитель: если ключи включены и в `users` есть строки, миграция падает с `CHECK constraint failed: users_rebuild_requires_foreign_keys_off_use_apply_migrations`. Пустые базы (тесты, новая установка) он пропускает. `drizzle-kit migrate` при срабатывании только завершается с кодом 1 и причину не печатает; база при этом не меняется. **Миграции на проде запускать только `scripts/migrate-db.ts` (или стартом контейнера), не `drizzle-kit migrate`.**

## 4. Правило DB-3 для дублей и пользователей без членства

- **Дубли** (пользователь в двух окружениях). До DB-3 схема их допускала. Правило: миграция их **не исправляет и не выбирает победителя**, потому что любое автоматическое решение отрезает человека от данных одного из окружений. `CREATE UNIQUE INDEX` падает с `UNIQUE constraint failed: household_members.user_id` (в логе Drizzle: `Failed to run the query 'CREATE UNIQUE INDEX ...'`, причина в `cause`), транзакция откатывается целиком, данные не меняются, API не стартует. Дальше владелец решает вручную, какое членство убрать, и деплой повторяется. Проверено тестом на данных с дублем.
- **Пользователи без членства** добавляются в `default-household` с ролью `member` и `joined_at` = время миграции (с точностью до секунды). Это заменяет автосоздание в резолвере, которое сделало бы их `owner`. В число попадают и неактивные (`is_active = 0`): так сказано в решении («все пользователи без членства»), войти они всё равно не могут. Существующие роли не меняются. Если `default-household` нет, ничего не вставляется.

## 5. Порядок выкатки (релиз 1 из раздела 8.4)

Все шаги по SSH от `stark`, как в обычной выкатке (память деплоя, `docs/deployment.md`).

### 5.1. Чтение прод-базы перед DB-3 (только чтение, показать владельцу)

```sh
cd ~/sites/homelab
cat <<'SQL' | docker compose exec -T backup sqlite3 -readonly -header -column /if-data/i-finances.sqlite
SELECT id, name FROM households;
SELECT m.household_id, u.username, u.display_name, m.role, u.is_active
  FROM household_members m JOIN users u ON u.id = m.user_id ORDER BY m.household_id, m.role;
-- должны остаться пустыми, иначе DB-3 упадёт (это правильно, см. раздел 4)
SELECT user_id, count(*) AS memberships FROM household_members GROUP BY user_id HAVING count(*) > 1;
-- эти пользователи станут member в default-household
SELECT u.id, u.username, u.display_name, u.is_active FROM users u
  WHERE NOT EXISTS (SELECT 1 FROM household_members m WHERE m.user_id = u.id);
SQL
```

Отдельно сверить, что `MCP_USER_ID` из `env/i-finances.env` — участник окружения после миграции (Р13).

### 5.2. Бэкап

Как в обычной выкатке, через контейнер `backup` (`.backup` безопасен при живом API):

```sh
cd ~/sites/homelab
TS=$(date +%Y%m%d-%H%M%S)
docker compose exec -T backup sh -c "OUT=/backups/pre-deploy-db-migrations-$TS; mkdir -p \$OUT; \
  sqlite3 /if-data/i-finances.sqlite \".backup \$OUT/i-finances.sqlite\" && \
  sqlite3 \$OUT/i-finances.sqlite 'PRAGMA integrity_check;'"
```

Ожидается `ok`. Файл лежит на хосте в `~/sites/homelab/backups/pre-deploy-db-migrations-$TS/`. Ниже `$TS` — та же переменная: команды выполнять в той же сессии SSH (в новой сессии задать `TS=<метка из имени каталога>`). Подставлять `<ts>` буквально нельзя: вне кавычек `<` — перенаправление, а в `-v "...-<ts>:..."` Docker молча создаст пустой каталог.

Записать количество строк до миграции. Без `-readonly`: это копия, а копия из `.backup` остаётся в режиме WAL, и `sqlite3 -readonly` без файлов `-wal`/`-shm` её не откроет (`unable to open database file`):

```sh
cat <<'SQL' | docker compose exec -T backup sqlite3 "/backups/pre-deploy-db-migrations-$TS/i-finances.sqlite"
SELECT 'users', count(*) FROM users UNION ALL SELECT 'sessions', count(*) FROM sessions
UNION ALL SELECT 'webauthn_credentials', count(*) FROM webauthn_credentials
UNION ALL SELECT 'household_members', count(*) FROM household_members
UNION ALL SELECT 'operations', count(*) FROM operations UNION ALL SELECT 'transfers', count(*) FROM transfers;
SQL
```

### 5.3. Пробный прогон на копии (до `up`)

После `cd ~/sites/i-finances && git pull --ff-only` и `cd ~/sites/homelab && docker compose build if-api if-web` (оба образа, как в обычной выкатке) прогнать миграции на копии бэкапа в одноразовом контейнере из нового образа. `docker run`, а не `docker compose run`: так не монтируется боевой том и не подхватывается `env_file`. Имя образа проверить (`docker compose images if-api` или `docker image ls`), обычно `homelab-if-api`.

```sh
cd ~/sites/homelab
docker run --rm -i -v "$PWD/backups/pre-deploy-db-migrations-$TS:/check:ro" -e DATABASE_URL=/tmp/trial.sqlite homelab-if-api sh -c '
  cp /check/i-finances.sqlite /tmp/trial.sqlite &&
  ./node_modules/.bin/tsx scripts/migrate-db.ts &&
  node -e "
    const db = new (require(\"better-sqlite3\"))(\"/tmp/trial.sqlite\", { readonly: true });
    console.log(\"integrity\", db.pragma(\"integrity_check\", { simple: true }));
    console.log(\"fk violations\", db.pragma(\"foreign_key_check\").length);
    for (const t of [\"users\", \"sessions\", \"webauthn_credentials\", \"household_members\", \"operations\", \"transfers\"])
      console.log(t, db.prepare(\"SELECT count(*) AS c FROM \" + t).get().c);
    console.log(db.prepare(\"SELECT household_id, user_id, role FROM household_members\").all());
  "'
```

Ожидается: `Database migrations applied.`, `integrity ok`, `fk violations 0`, количества совпадают с 5.2, кроме `household_members` (плюс пользователи из последнего запроса 5.1). Если что-то не так — не выкатывать.

### 5.4. Выкатка

`docker compose up -d if-api` (миграции применятся при старте), дождаться `healthy`, в логе `Database migrations applied.`, затем `docker compose run --rm if-web` и smoke по `/api/health`. Если контейнер не стал `healthy`, смотреть `docker compose logs if-api`: ошибка миграции означает, что транзакция откатилась и база не тронута (раздел 2).

## 6. Откат

**Сначала откат кода, а не базы.** Старый код (до этой ветки) совместим со схемой после миграций, пока у каждого пользователя есть членство (проверено: тесты API текущего master проходят на схеме 0016):

- `password_hash` NULL-able; в типе старого кода это `string`, но во время выполнения старый код перед каждой проверкой пароля вызывает `hasUsablePassword`, который принимает NULL;
- уникальный индекс членства старому резолверу не мешает: он создаёт членство только тому, у кого его нет;
- новые таблицы старый код не видит;
- старый мигратор при старте ничего не применяет: последняя запись в `__drizzle_migrations` новее последней миграции его журнала.

**Опасно после A5:** старый резолвер пользователю без членства **создаёт членство `owner` в `default-household`**. Как только появятся пользователи без членства (онбординг после входа через Telegram, удалённые участники по Р7), откат кода ниже A5 откроет им все финансы семьи с правами владельца. После релиза 2 откат кода — только с предварительной проверкой `SELECT ... WHERE NOT EXISTS (членство)` (запрос из 5.1) на пустой результат.

Порядок: `git revert` слияния в репозитории, `push`, затем на сервере `cd ~/sites/i-finances && git pull --ff-only` (не `git checkout` на сервере: master и origin не должны расходиться), `cd ~/sites/homelab && docker compose build if-api if-web && docker compose up -d if-api && docker compose run --rm if-web`. Данные, внесённые после выкатки, сохраняются.

**Восстановление базы из бэкапа** — только если сама база повреждена или миграция сделала не то. Теряется всё, что записано после бэкапа (операции, сеансы, ключи доступа). Порядок:

1. `docker compose stop if-api`.
2. Сохранить текущую (испорченную) базу рядом, а не удалять: снова `.backup` через контейнер `backup` в `backups/broken-<ts>/`.
3. Подложить бэкап в том `if-sqlite-data`, удалив `-wal` и `-shm` текущей базы (иначе SQLite применит чужой журнал WAL к восстановленному файлу):

   ```sh
   docker compose run --rm --no-deps --user root -v "$PWD/backups/pre-deploy-db-migrations-$TS:/restore:ro" \
     --entrypoint sh if-api -c 'test -s /restore/i-finances.sqlite && cd /app/apps/api/data && rm -f i-finances.sqlite-wal i-finances.sqlite-shm && \
       cp /restore/i-finances.sqlite i-finances.sqlite && chown node:node i-finances.sqlite'
   ```

4. Откатить код на коммит до миграций (иначе новый код при старте снова применит миграции) и `docker compose up -d if-api`.
5. `PRAGMA integrity_check` через контейнер `backup`, smoke.

## 7. Что необратимо

- **DB-3, вставленные членства.** Обратной миграции нет. Добавленные строки опознаются по `role = 'member'`, `household_id = 'default-household'` и `joined_at` = времени выкатки, но удалять их обратно — решение владельца, а не скрипта: человек потеряет доступ к окружению.
- **DB-2 после первого пользователя без пароля.** Пока в `users` нет NULL, обратная пересборка с `NOT NULL` возможна. После релиза 2 (регистрация через Telegram) вернуть `NOT NULL` можно только удалив или поменяв таких пользователей, то есть с потерей данных. Откат кода после этого опасен не из-за NULL в `password_hash` (старый код его переносит), а из-за автосоздания членства `owner` в старом резолвере (раздел 6).
- **DB-1 после записи в новые таблицы.** Удаление таблиц теряет привязки Telegram и приглашения; люди, вошедшие только через Telegram, останутся без входа.
- **Восстановление из бэкапа** теряет всё, что записано после него (раздел 6).

Поэтому обратных миграций (down) в проекте нет и здесь не добавляется: Drizzle их не поддерживает, а ручной откат схемы на живых данных рискованнее, чем откат кода, который здесь совместим.
