---
name: ifinances-ui
description: Use when creating, changing or reviewing any UI in i-finances (apps/web), including a component, screen, dialog, sheet, SCSS, tokens, colours, spacing, breakpoints, currency display or Storybook story, and when asked where the mockup, UI kit or design tokens live.
---

# UI i-finances: где макет, кит и код

Реестр «что нарисовано → где в коде». Читать перед любой правкой UI, до того как открывать файлы компонентов.

## Правило: сначала бумага

Порядок один: **макет и кит → компонент в коде → история Storybook**. Код следует макету, а не наоборот.
- Нужного компонента или экрана нет в макете: сначала нарисовать его (доска кита или экрана), согласовать с владельцем, потом кодить.
- Макет и код расходятся: правится макет, не код «по вкусу». Зафиксируй расхождение в `development/ui-mockup.md` или в задаче.
- Не придумывай паттерн мимо кита. Не клади литералы (px, hex, z-index) вместо токенов.
- SCSS: mobile-first, миксины `mx.media-mn`, без `!important`, правила интерактивных состояний из `AGENTS.md`.

## Где что лежит

| Что | Где |
|---|---|
| **Макет и кит** (Claude Design, 33 доски, одним артефактом) | https://claude.ai/artifact/De31TDNR7feRASBZ73Leq1 |
| Решения владельца, состав холста | `development/ui-mockup.md` |
| Аудит дефектов (A1…C6) | `development/ui-audit.md` |
| Токены в коде (эталон) | `apps/web/src/shared/styles/tokens.scss` |
| Миксины брейкпоинтов | `apps/web/src/shared/styles/mixins.scss` |
| Компоненты кита в коде | `apps/web/src/shared/ui/` |
| Задачи | Ticket Board, IF-14…IF-23, IF-30…IF-34 |

**Как читать доску:** это файл внутри артефакта. `Artifact action: read` с `url` макета и `path: project/<файл>.dc.html`, потом Read сохранённой копии. Весь артефакт читать не нужно. Общие стили и токены макета: `project/ifin.css`. Править макет можно только с `url` артефакта (read без path, затем read нужных файлов, затем publish). Артефакт приватный, доступ у владельца.

## Реестр: доска → код

Статус «есть» значит, что компонент в `shared/ui` существует; он может отставать от доски, сверяй размеры и состояния. «Нет» значит, что сначала его создают по доске (IF-20).

| Доска (файл) | Что на ней | Код | Статус |
|---|---|---|---|
| `Foundations` | цвет обеих тем, палитра категорий, типографика, отступы, радиусы, брейкпоинты, z-index | `shared/styles/tokens.scss` | частично, добивает IF-14 |
| `Kit-Controls` | Button | `shared/ui/button` | есть |
| | поля ввода (text, textarea, сумма) | `shared/ui/text-field` | есть |
| | телефон | `shared/ui/phone-field` | есть |
| | Combobox | `shared/ui/combobox` | есть |
| | Switch | `shared/ui/switch` | есть |
| | цвет счёта | `shared/ui/color-picker` | есть |
| | Checkbox, Select, поле даты, Segmented, Tabs, Chip, Badge, навигатор периода | нет в `shared/ui` (период живёт в `views/home/ui/operations-workspace`, месяц в `views/statistics/ui/month-navigator`) | нет, IF-20 |
| `Kit-Surfaces` | Dialog | `shared/ui/dialog` | есть |
| | Menu / Popover | `shared/ui/context-menu` | есть |
| | Card счёта, категории, контакта, KPI | `views/home/page.tsx` (счета), `views/categories/ui`, `views/contacts/ui`, `views/statistics/ui/breakdown-summary` | нет общего компонента, IF-20 |
| | строка операции, группа дня | `views/home/ui/operations-table`, `operations-list`, `operation-group-row` | экранный код |
| | Bottom sheet, Drawer / панель | панель операции: `views/home/ui/operation-details-panel` | нет общего, IF-20, IF-21 |
| | Toast, Skeleton, Empty state | нет | нет, IF-20 |
| `Kit-AccountCard` | CardFace (full, mini, истёк, светлый цвет) | `shared/ui/card-face` | есть |
| | поля номера и срока карты | `shared/ui/card-number-field`, `card-expiry-field` | есть |
| | выбор типа счёта, блок реквизитов в форме | `features/account-details` (`ui/card`, `model`) | есть |
| | шапка счёта с мини-картой | `features/account-details/ui/card/card-header-visual.tsx` | есть |
| `Layout-Spec`, `Ops-C-1280/1024/768`, `OpsLayout` | раскладка операций, колонки по контейнеру, тулбар периода | `views/home/ui/operations-workspace` | не по доске, IF-15, IF-16 |
| `Sheet-Lab` | правило листов S4 | диалоги: `views/home/ui/*-dialog`, `shared/ui/dialog` | не по правилу, IF-21 |
| `M-*` (390 px), `D-*` (1280 px) | экраны по одному | `views/home` (операции, счета, перевод), `views/receipts`, `views/categories`, `views/contacts`, `views/statistics`, `features/auth` (вход), `widgets/app-header` (навигация, меню профиля) | по задачам IF-15…IF-19 |

Домашний слой: UI экранов живёт в `views/<экран>/page.tsx` и `views/<экран>/ui`. `features/*/api` это клиенты API; UI в `features` есть только у `account-details`, `auth`, `passkey-registration`.

## Токены: имена макета и кода

Макет (`ifin.css`) и код называют токены по-разному. Пиши в коде **имена кода**, числа сверяй по макету.

| Макет | Код |
|---|---|
| `--c-canvas`, `--c-surface`, `--c-subtle`, `--c-strong` | `--color-canvas`, `--color-surface`, `--color-surface-subtle`, `--color-surface-strong` |
| `--c-text`, `--c-text-2`, `--c-text-3` | `--color-text-primary`, `-secondary`, `-tertiary` |
| `--c-border`, `--c-border-2` | `--color-border`, `--color-border-strong` |
| `--c-primary`, `-h`, `-soft` | `--color-primary`, `-hover`, `-soft` |
| `--c-danger`, `--c-success`, `--c-warning` (+ `-soft`) | `--color-danger`, `--color-success`, `--color-warning` (+ `-soft`) |
| `--c-focus` | `--color-focus-ring` |
| `--s-1…12` | `--space-1…12` (значения совпадают) |
| `--r-xs…xl` | `--radius-xs…xl` |
| `--ctl-sm`, `--ctl`, `--ctl-lg` | `--control-size-sm`, `-md`, `-lg` |
| `--fs-display`, `-h1`, `-h2`, `-h3`, `-lg`, `-md` | `--font-size-display`, `-heading-1`, `-2`, `-3`, `-body-lg`, `-body-md` |
| `--sh-sm`, `--sh-md` | `--shadow-sm`, `--shadow-md` |
| `--dur-fast`, `--dur`, `--ease` | `--duration-fast`, `--duration-normal`, `--ease-standard` |
| `--k-1…10`, `--k-other` (палитра категорий) | `--color-series-1…8`, `--color-series-other` |

**Расхождения, которых в коде пока нет** (закрывает IF-14, до тех пор не выдумывай значения, бери из макета и отмечай в задаче): шкала `--z-*` (10…60); `--c-scrim`, `--c-ink-card`, `--r-pill`, `--sh-lg`; размер 13 px (`--fs-sm`); подпись 12 px вместо 11 px (`--font-size-label`); более тёмные `--color-text-secondary` и `-tertiary`; категории 9–10; три брейкпоинта 640/960/1280.

## Деньги

Знак белорусского рубля: официальный знак 2026 года (постановление Нацбанка № 25), это **SVG, не символ шрифта** (Unicode U+20C5 ещё не вышел). В макете класс `i-byn` (маска, наследует цвет текста). В коде: единый компонент формата денег (IF-32), не вставлять «Б», «Br» или «BYN» в подписи сумм вручную. Код `BYN` остаётся в формах и API.

## Частые ошибки

- Правишь `views/*` по памяти, не открыв доску. Сначала доска.
- Копируешь стиль из соседнего экрана вместо токена и компонента кита.
- Добавляешь второй вариант того же компонента (второй сегмент, второй бейдж): расширяй существующий.
- Меняешь макет и забываешь `development/ui-mockup.md` и таблицу выше.
- Пишешь в `Kit-*` доску значения, которых нет в `Foundations`.

## Что сделать после изменения

Добавил или переименовал компонент `shared/ui`, доску или токен: обнови таблицы выше, `development/ui-mockup.md` и задачу в Ticket Board.
