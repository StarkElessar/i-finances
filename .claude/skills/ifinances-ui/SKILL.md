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
| **Макет и кит** (Claude Design, 46 досок, одним артефактом) | https://claude.ai/artifact/De31TDNR7feRASBZ73Leq1 |
| Решения владельца, состав холста | `development/ui-mockup.md` |
| Аудит дефектов (A1…C6) | `development/ui-audit.md` |
| Токены в коде (эталон) | `apps/web/src/shared/styles/tokens.scss` |
| Миксины брейкпоинтов | `apps/web/src/shared/styles/mixins.scss` |
| Компоненты кита в коде | `apps/web/src/shared/ui/` |
| Задачи | Ticket Board, IF-14…IF-23, IF-30…IF-34 |

**Как читать доску:** это файл внутри артефакта. `Artifact action: read` с `url` макета и `path: project/<файл>.dc.html`, потом Read сохранённой копии. Весь артефакт читать не нужно. Общие стили и токены макета: `project/ifin.css`. Править макет можно только с `url` артефакта (read без path, затем read нужных файлов, затем publish). Артефакт приватный, доступ у владельца.

## Реестр: доска → код

Статус «есть» значит, что компонент в `shared/ui` существует; он может отставать от доски, сверяй размеры и состояния. «Нет» значит, что сначала его создают по доске (IF-20). Пометка «есть история» значит, что рядом с компонентом лежит `*.stories.tsx` (Storybook, `Kit/<Компонент>`). Новая история: файл `<имя>.stories.tsx` рядом с компонентом, состояния default, hover и focus (`parameters.pseudo`), disabled, loading, error; обе темы и ширины 390/768/1024/1280 переключаются в панели Storybook, не дублируй их историями. Запуск: `pnpm storybook` (порт 6006), сборка: `pnpm build-storybook`. Обёртки раскладки для историй: `@/shared/storybook` (`StoryStack`), без `style={{}}`. Аддоны `storybook-addon-pseudo-states` включён, `a11y` и `docs` нет.

| Доска (файл) | Что на ней | Код | Статус |
|---|---|---|---|
| `Foundations` | цвет обеих тем, палитра категорий, типографика, отступы, радиусы, брейкпоинты, z-index | `shared/styles/tokens.scss` | частично, добивает IF-14 |
| | типографика (компонент `Typography`) | `shared/ui/typography` | есть, есть история |
| | контейнер страницы: ширина и боковые отступы | `shared/ui/container` | есть, есть история |
| `Kit-Controls` | Button | `shared/ui/button` | есть, есть история |
| | поля ввода (text, textarea, сумма) | `shared/ui/text-field` | есть, есть история |
| | телефон | `shared/ui/phone-field` | есть, есть история |
| | Combobox | `shared/ui/combobox` | есть, есть история |
| | Switch | `shared/ui/switch` | есть, есть история |
| | цвет счёта | `shared/ui/color-picker` | есть, есть история |
| | Segmented | `shared/ui/segmented` (`radiogroup`, стрелки; в операциях, панели операции, сравнении статистики) | есть, есть история |
| | Tabs | `shared/ui/tabs` (`tablist`, стрелки; вкладки статистики) | есть, есть история |
| | Chip | `shared/ui/chip` (пресеты периода в `views/statistics/ui/period-range-picker`) | есть, есть история |
| | Badge | `shared/ui/badge` (статусы чеков `views/receipts/ui/status-badge` ещё свои, IF-18) | есть, есть история |
| | Checkbox | `shared/ui/checkbox` | есть, есть история |
| | навигатор периода | `shared/ui/period-navigator` (операции, месяц статистики: `views/statistics/ui/month-navigator` тонкая обёртка) | есть, есть история |
| | копии сегмента периода и навигатора | остаются в `views/categories/ui/category-summary-dialog` и `views/contacts/ui/contact-summary-dialog` до IF-39 | не переведены, IF-39 |
| | Select, поле даты | нет в `shared/ui` (нативные в оболочке кита, часть 2 IF-20) | нет, IF-20 |
| `Kit-Pickers` | Select и поле даты (нативные, оболочка кита), Combobox на телефоне с клавиатурой | `shared/ui/combobox` (есть), select и дата: нативные `<select>`, `type=date` в оболочке | оболочка нет, IF-20 |
| | мультивыбор в popover, диапазон периода (статистика) | нет | нет, IF-19, IF-20 |
| | выбор цвета категории (10 оттенков `k-1…k-10`, свой запрещён) | `shared/ui/color-picker` (6 цветов, hex) | не по доске, IF-19 |
| `Kit-Surfaces` | Dialog | `shared/ui/dialog` | есть, есть история |
| | Menu / Popover | `shared/ui/context-menu` | есть, есть история |
| | Card счёта, категории, контакта, KPI | `views/home/page.tsx` (счета), `views/categories/ui`, `views/contacts/ui`, `views/statistics/ui/breakdown-summary` | нет общего компонента, IF-20 |
| | строка операции, группа дня | `views/home/ui/operations-table`, `operations-list`, `operation-group-row` | экранный код |
| | таблица: сетка колонок с сортировкой и строками (операции, чеки) | `shared/ui/grid` | есть, есть история |
| | Bottom sheet, Drawer / панель | панель операции: `views/home/ui/operation-details-panel` | нет общего, IF-20, IF-21 |
| | Empty state | `shared/ui/empty-state` (сравнение статистики) | есть, есть история |
| | Toast, Skeleton | нет | нет, IF-20 |
| `Kit-States` | Toast (место, длительность, стопка), Skeleton списка и таблицы, ошибка загрузки и офлайн | нет | нет, IF-20 |
| | подтверждение удаления внутри диалога | `shared/ui/dialog` (режим подтверждения не сделан) | нет, IF-21 |
| | панель операции в просмотре | `views/home/ui/operation-details-panel` | нет, IF-16, IF-21 |
| | FAB и нижняя навигация | `shared/ui/fab` (FAB, IF-17), `widgets/app-header` (нижняя навигация, 5 ячеек; токены `--bottom-nav-*`) | есть; панель до 960 px (на 640–959 нижняя, верхняя не помещается), история Storybook в IF-20 |
| | жест по строке (зона `drag-action`) | `shared/ui/drag-action` | есть, есть история, z-index не по шкале, IF-14 |
| `Kit-Currency` | знаки валют ₴ BYN ₽ ¥ € $ zł, размеры, правило «знак или код», формат суммы (минус U+2212, ноль, копейки, сокращения на графиках) | `shared/ui/currency-sign` и `money` (IF-32) | нет, IF-32 |
| `Kit-AccountCard` | CardFace (full, mini, истёк, светлый цвет) | `shared/ui/card-face` | есть, есть история |
| | поля номера и срока карты | `shared/ui/card-number-field`, `card-expiry-field` | есть, есть история |
| | выбор типа счёта, блок реквизитов в форме | `features/account-details` (`ui/card`, `model`) | есть |
| | шапка счёта с мини-картой | `features/account-details/ui/card/card-header-visual.tsx` | есть |
| | иконка типа счёта (карта, наличные, сбережения, прочее) | `shared/ui/account-icon` | есть, есть история |
| `Layout-Spec`, `Ops-C-1280/1024/768`, `OpsLayout` | раскладка операций, колонки по контейнеру, тулбар периода | `views/home/ui/operations-workspace` (контейнер, `mx.container-mn`, колонки и тулбар по ширине контейнера, IF-15) | тулбар и колонки по доске; раскладка (лента счетов, панель 340) не по доске, IF-16 |
| `Sheet-Lab` | правило листов S4 | диалоги: `views/home/ui/*-dialog`, `shared/ui/dialog` | не по правилу, IF-21 |
| `M-Security`, `D-Security` | раздел «Безопасность»: Telegram, ключи, пароль, сеансы и состояния | `features/passkey-registration` (добавление ключа), остальное новое | нет, IF-33, IF-41 |
| `M-ProfileEdit`, `D-Profile` | диалог «Профиль»: имя, тема, валюта отображения, Telegram, push | `widgets/app-header/ui/profile-menu.tsx` (меню), диалога нет | нет, IF-5, IF-7…IF-9 |
| `Auth-Telegram`, `M-SignIn`, `D-SignIn` | вход через Telegram первым, 9 состояний | `features/auth` | нет, IF-10, IF-39 |
| | логотип «iF» на панели входа и в шапке | `shared/ui/app-logo` | есть, есть история |
| `Flow-Onboarding`, `Flow-Invite`, `M-Household`, `D-Household`, `Bot-Telegram` | онбординг, приглашение и принятие, участники окружения, тексты бота | нет | нет, IF-10 |
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
| `--c-on-primary` | `--color-on-primary` (светлая `#fff`, тёмная `#0b1424`) |
| `--c-scrim` | `--color-scrim` |
| `--c-ink-card` | `--color-ink-card` |
| `--s-1…12` | `--space-1…12` (значения совпадают) |
| `--r-xs…xl` | `--radius-xs…xl` |
| `--r-pill` | `--radius-pill` |
| `--ctl-sm`, `--ctl`, `--ctl-lg` | `--control-size-sm`, `-md`, `-lg` |
| `--ctl` в `.i-touch` (44 px на телефоне) | `--control-size-touch` (44 px), миксин `mx.pointer-coarse` (запрос `pointer: coarse`) |
| `--fs-display`, `-h1`, `-h2`, `-h3`, `-lg`, `-md` | `--font-size-display`, `-heading-1`, `-2`, `-3`, `-body-lg`, `-body-md` |
| `--fs-sm` (13 px) | `--font-size-caption` |
| `--fs-label` (12 px) | `--font-size-label` |
| `--sh-sm`, `--sh-md`, `--sh-lg` | `--shadow-sm`, `--shadow-md`, `--shadow-lg` |
| `--dur-fast`, `--dur`, `--ease` | `--duration-fast`, `--duration-normal`, `--ease-standard` |
| `--k-1…10`, `--k-other` (палитра категорий) | `--color-series-1…10`, `--color-series-other` (графики берут первые 8, остальное в «прочее») |
| `--z-sticky`, `--z-nav`, `--z-drawer`, `--z-modal`, `--z-popover`, `--z-toast` (10, 20, 30, 40, 50, 60) | то же имя: `--z-sticky`, `--z-nav`, `--z-drawer`, `--z-modal`, `--z-popover`, `--z-toast` |
| нет, локальный слой внутри компонента | `--z-raised` (1) |
| `--s-focus-gutter` (4 px) | `--space-focus-gutter` (4 px) и миксин `mx.scroll-gutter` (класс макета `i-gutter`) |
| нет переменной, значение 420 px (`development/ui-mockup.md`) | `--panel-overlay-inline-size` (420 px) |
| нет переменной, значение 340 px (`development/ui-mockup.md`) | `--panel-docked-inline-size` (340 px) |
| нет переменной, 44 px (`.i-tr`), на телефоне 64 px (`development/ui-mockup.md`) | `--row-height-compact` (44 px), `--row-height-comfortable` (64 px) |

**Расхождения, закрытые IF-14** (проверено по `tokens.scss`; решения ревью в `development/decisions/ui-breakpoints.md`): шкала `--z-*` (10…60) и `--z-raised`; `--space-focus-gutter` 4 px и `mx.scroll-gutter`; `--color-scrim`, `--color-ink-card`, `--radius-pill`, `--shadow-lg` заведены; размер 13 px (`--font-size-caption`) и подпись 12 px (`--font-size-label`); `--color-text-secondary` светлая тема приведена к макету, `--color-text-tertiary` совпадает с макетом; категории 9–10 (`--color-series-9`, `-10`); панели 420 и 340 px, высоты строк 44 и 64 px; шрифт IBM Plex Sans.

**Расхождения, которые IF-14 не закрыл** (до их закрытия не выдумывай значения, бери из макета и отмечай в задаче):
- `--color-primary-hover` и `-active`: в коде `color-mix` 6 % и 10 %, в макете hover `#386a97`, active нет. IF-20.
- Затемнения литералами 32…42 % вместо `--color-scrim` (макет 45 %). IF-21.
- Поле 16 px при `(pointer: coarse)`: миксин `mx.pointer-coarse` есть (IF-20, часть 1), сам размер шрифта в полях ещё не переведён.
- Мобильные значения `--font-size-display` 28, `--font-size-heading-1` 24, `--space-12` 48 ниже 640 (в макете 32, 28, 64). Экранные задачи.
- Пока не используются: `--panel-docked-inline-size` (IF-16), `--row-height-*` (IF-13), `--color-series-9`, `-10` (IF-19). `--font-size-body-sm` (12 px) устаревший: экраны уходят с него в своих задачах.

**Брейкпоинты.** Три значения и больше ничего: `sm` 640 px (телефон кончается, планшет), `md` 960 px, `lg` 1280 px. В SCSS только `@include mx.media-mn(sm)` (или `md`, `lg`), mobile-first: база под телефон, выше `min-width`. В TS `minWidthQuery('md')` из `apps/web/src/shared/lib/breakpoints.ts`. Сырых `@media` в компонентах нет. Линта, который это запрещает, пока нет (этап 2), проверяй в ревью. Четвёртое значение не вводи без обсуждения в задаче.

## Деньги

Знак белорусского рубля: официальный знак 2026 года (постановление Нацбанка № 25), это **SVG, не символ шрифта** (Unicode U+20C5 ещё не вышел). Остальные знаки (₴ ₽ ¥ € $ zł) нарисованы в одном стиле на доске `Kit-Currency`: в макете классы `i-cur-*` (`i-byn` = `i-cur-byn`), маски, наследуют цвет текста, высота 0,7 em на базовой линии. В коде: компонент `currency-sign` и формат денег `money` (IF-32), не вставлять «Б», «Br» или «BYN» в подписи сумм вручную. **Правило:** на экранах знак; в графиках Chart.js суммы без знака, код в заголовке оси; в атрибутах (`title`, `aria-label`), нативном `<option>`, формах, API и MCP код (`BYN`).

Размеры панелей: поверх контента **420 px** (одно значение везде), docked **340 px**, шторка счетов 340 px, диалог 560 px. Ниже 960 px счета в шторке, ленты счетов только на 960–1279 px (`development/ui-mockup.md`, решения 2026-10-18).

## Частые ошибки

- Правишь `views/*` по памяти, не открыв доску. Сначала доска.
- Копируешь стиль из соседнего экрана вместо токена и компонента кита.
- Добавляешь второй вариант того же компонента (второй сегмент, второй бейдж): расширяй существующий.
- Меняешь макет и забываешь `development/ui-mockup.md` и таблицу выше.
- Пишешь в `Kit-*` доску значения, которых нет в `Foundations`.
- Контейнер с `overflow` auto, scroll или hidden без внутреннего отступа `--s-focus-gutter` (4 px): обрезаются обводка фокуса, кольцо выбранного элемента и тени. Добавь отступ и погаси его отрицательным margin (класс `i-gutter` в макете), чтобы раскладка не сдвинулась. У полноширинных строк таблицы в карточке с `overflow: hidden` фокус рисуется внутрь.

## Что сделать после изменения

Добавил или переименовал компонент `shared/ui`, доску или токен: обнови таблицы выше, `development/ui-mockup.md` и задачу в Ticket Board.
