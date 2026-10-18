# Storybook для Solid

Задача IF-30 (этап 2 `development/ui-roadmap.md`). Реализация: ветка `worktree-agent-a929160d06c8c3bc5`, коммиты a542751, f365546, ac0a6ee, ac4536a. Решения: Opus на ревью, 2026-10-18. Статус: принято.

## 1. Связка пакетов

Решение: оставить `storybook@10.6.2` + `storybook-solidjs-vite@10.7.2` + `storybook-addon-pseudo-states@10.6.2`. Версии в `apps/web/package.json` закреплены точно, без `^`, и так должно остаться.

Проверено по `package.json` пакетов и реестру npm:

| Пакет | Кто поддерживает | peerDependencies |
|---|---|---|
| `storybook` 10.6.2 | storybookjs, `latest` в npm на 2026-10-18 | `@types/react`, `prettier`, `vite-plus` (все необязательные) |
| `@storybook/builder-vite` 10.6.2 (зависимость фреймворка) | storybookjs | `storybook ^10.6.2`, `vite ^5 \|\| ^6 \|\| ^7 \|\| ^8` |
| `storybook-solidjs-vite` 10.7.2 | `solidjs-community/storybook`, MIT | `storybook ^0.0.0-0 \|\| ^10.0.0`, `vite ^5 \|\| ^6 \|\| ^7 \|\| ^8`, `vite-plugin-solid ^2 \|\| ^3`, `solid-js ^1.8 \|\| ^2`, `typescript *` (необязательный) |
| `storybook-addon-pseudo-states` 10.6.2 | storybookjs (монорепо, `code/addons/pseudo-states`) | `storybook ^10.6.2` |

Почему приемлемо:
- Официального фреймворка Storybook для Solid нет; `storybook-solidjs-vite` живёт в организации `solidjs-community` и выходит регулярно: 10.6.0 (июль), 10.7.0–10.7.2 (август–сентябрь), ветка `11.0.0-next` (последняя сборка 2026-10-15). Риск брошенного пакета низкий.
- Сам фреймворк тонкий: сборкой занимается официальный `@storybook/builder-vite`, а Solid компилирует наш же `vite-plugin-solid`. Если community-пакет перестанут выпускать, Storybook останется на закреплённой версии, пока не выйдет замена. Переписывать истории не придётся: они используют только `Meta`/`StoryObj` и `storybook/test`.
- Для docgen фреймворк тянет `@typescript/typescript6`, а не наш `typescript7`. Типы пропсов в панели Controls строятся правильно, это проверено в браузере. С `pnpm typecheck` это не связано.

Совместимость:
- **Vite 7 (сейчас):** `pnpm install --frozen-lockfile`, `storybook dev`, `build-storybook` работают, предупреждений о peer нет.
- **Vite 8 (IF-43):** пробная установка `vite@8.3.4` в копии ветки (только оценка, ветку не меняли). `pnpm peers check` сообщил «No peer dependency issues found», `vite build` прошёл, `vitest` в web дал 39 файлов и 170 тестов, `typecheck` прошёл, `build-storybook` собран на `vite v8.3.4`. Блокеров для IF-43 со стороны Storybook нет. Перед IF-43 перепроверить, не стала ли `latest` версия Storybook 11 (сейчас `next` = 11.0.0-alpha.6), и обновлять `storybook`, аддон и фреймворк одним PR.

Правило обновления: `storybook` и `storybook-addon-pseudo-states` меняются только вместе (аддон требует `storybook ^<своя версия>`), `storybook-solidjs-vite` берётся последней версии с peer `storybook ^10`. Номера фреймворка (10.7.x) не совпадают с номерами Storybook (10.6.x), и это нормально.

Отвергнуто:
- `@storybook/html-vite` с ручным `render()` Solid: аргументы, Controls и docgen пришлось бы делать руками ради защиты от риска, которого сейчас не видно.
- Ladle или Histoire: в дорожной карте и скиле записан Storybook, Ladle только для React, Histoire ориентирован на Vue и Svelte.

## 2. `@testing-library/jest-dom` и падение тестов

Решение: оставить `@testing-library/jest-dom` в `devDependencies` `apps/web`, как сделал автор (ac0a6ee).

Первопричина (воспроизведено на коммите f365546, до добавления пакета: `Test Files 39 failed (39)`, ошибка `Cannot find module '.../apps/web/@testing-library/jest-dom/vitest'`):

1. `storybook@10.6.2` жёстко зависит от `@testing-library/jest-dom@6.9.1`: он нужен для `storybook/test`.
2. У `vite-plugin-solid` пакет `@testing-library/jest-dom` объявлен как **необязательный** peer. Как только jest-dom появился в графе, pnpm подставил его этому peer. Это видно в lock на f365546: `vite-plugin-solid@2.11.14(@testing-library/jest-dom@6.9.1)...`. Пакет лёг ссылкой рядом с плагином в `node_modules/.pnpm/vite-plugin-solid@..._@testing-library+jest-dom@6.9.1.../node_modules/` и ещё в скрытый hoist `node_modules/.pnpm/node_modules`.
3. В режиме `test` плагин вызывает `require.resolve('@testing-library/jest-dom/vitest')` **из своего каталога** (`getJestDomExport` в `dist/esm/index.mjs`). Вызов успешен, и плагин дописывает в `test.setupFiles` голый спецификатор `@testing-library/jest-dom/vitest`.
4. Vitest разрешает `setupFiles` **от корня проекта** `apps/web`. При изолированной раскладке pnpm у `apps/web` такой зависимости нет, и все 39 файлов падают на загрузке setup.

То есть раньше jest-dom не «резолвился», а просто отсутствовал: плагин ничего не находил и setup не добавлял. Сломало несогласованность плагина: проверяет он из своего каталога, а подключает из каталога проекта.

Почему devDependency:
- плагин рассчитан именно на это: если jest-dom есть у проекта, он подключается как setup vitest;
- решение не зависит от того, как pnpm раскладывает и поднимает пакеты, и переживёт обновление Storybook, даже если тот перестанет тянуть jest-dom;
- цена небольшая: одна dev-зависимость, а DOM-матчеры будут нужны тестам компонентов в IF-20.

Отвергнуто:
- Отключить подключение в `vite-plugin-solid`: опции для этого нет. Пропуск срабатывает, только если в `setupFiles` уже есть путь, подходящий под `/jest-dom/`, или включён browser mode. Назвать свой файл `*jest-dom*` значит опираться на внутреннюю регулярку плагина.
- Отдельный `vitest.config.ts` без плагина Solid: дублирует алиасы и CSS-настройки и сломается на первом `.test.tsx`.
- `publicHoistPattern` для jest-dom в `pnpm-workspace.yaml`: это узаконенная фантомная зависимость, а настройка действовала бы на весь workspace.
- `test.setupFiles: ['@testing-library/jest-dom/vitest']` явно в `vite.config.ts`: повторяет то, что плагин уже делает, и требует типов `vitest/config` в конфиге Vite. Вернуться к этому варианту, когда появятся тесты компонентов (IF-20).

В lock теперь две версии jest-dom: 6.9.1 (внутренняя у Storybook) и 7.0.1 (наша, ей пользуется плагин). Так и должно быть.

## 3. Истории в typecheck, lint и сборке

Решение:
- **Typecheck и lint историй и `.storybook/` оставить включёнными** (`apps/web/tsconfig.json` включает `.storybook/**/*`, ESLint по `apps/**/*.{js,ts,tsx}` проверяет 2 файла `.storybook` и 17 историй). Главная польза историй в том, что они ломаются при смене публичных пропсов, и это ловит именно `tsc`. Правила IF-40 (`style={{}}` с литералами) действуют и на истории: проверено пробным файлом после слияния с IF-40.
- **Исключать истории из `pnpm build` не нужно.** Vite собирает приложение от `index.html` → `main.tsx`, а истории и `@/shared/storybook` никто из кода приложения не импортирует. Проверено: в `apps/web/dist` нет вхождений `storybook`, `StoryStack`, `pseudo-states`, а бандл ветки побайтно совпадает с бандлом master 6d58989 (одинаковые хэши `index-Cngo_gdA.js` 646.92 kB и `index-2V0r_PLR.css` 137.97 kB).
- `apps/web/src/shared/storybook` (`StoryStack`) нужен только историям. Код приложения его не импортирует; если импорт появится, его отклонит ревью.
- `storybook-static` в `.gitignore`, ESLint и Stylelint его игнорируют.

## Цвета в историях (IF-40)

`CardFace` «Light Color» (`#f5d76e`) и `ColorPicker` «Custom Color» и «Custom Options» оставить hex. Это не стиль, а **данные**: цвет счёта хранится в БД как hex (решение владельца 1: счета и контакты пока на текущем выборе, включая свой цвет), `CardFace` получает его пропсом `color: string` и разбирает в `getReadableTextColor`. Токен `var(--…)` эту функцию сломал бы. История «Light Color» проверяет контраст текста на светлом пользовательском цвете, ради неё она и написана. Правила IF-40 hex-строки в TS не запрещают, только литералы в `style={{}}`. `pnpm lint` после слияния с IF-40 зелёный. Когда IF-19 переведёт выбор цвета категории на палитру `k-1…k-10`, истории `ColorPicker` переписываются вместе с компонентом.
