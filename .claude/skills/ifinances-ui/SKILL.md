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
- **Шкала размеров (владелец, 2026-10-19):** размеры кратны 4, плюс само значение 2 для мелочи (ряд 2, 4, 8, 12, 16, 20, 24 ...); нечётные вроде 13, 57, 81 и чётные вне ряда вроде 6, 10, 14 в новом коде не использовать (исключения: ширина линии, `--radius-pill`, брейкпоинты и ширины панелей макета). Токены, уже стоящие не по шкале (`--font-size-caption` 13, `-body-md` 14, `-heading-2` 22, `-heading-3` 18, `--space-3` и `--radius-sm` 6), описаны в `development/decisions/size-scale.md` вместе с предложениями; без отдельной задачи их не менять. Шапка 60 px (`--header-block-size`).

## Где что лежит

| Что | Где |
|---|---|
| **Макет и кит** (Claude Design, 54 доски, одним артефактом) | https://claude.ai/artifact/De31TDNR7feRASBZ73Leq1 |
| Решения владельца, состав холста | `development/ui-mockup.md` |
| Аудит дефектов (A1…C6) | `development/ui-audit.md` |
| Токены в коде (эталон) | `apps/web/src/shared/styles/tokens.scss` |
| Миксины брейкпоинтов | `apps/web/src/shared/styles/mixins.scss` |
| Компоненты кита в коде | `apps/web/src/shared/ui/` |
| Задачи | Ticket Board, IF-14…IF-23, IF-30…IF-34 |

**Как читать доску:** это файл внутри артефакта. `Artifact action: read` с `url` макета и `path: project/<файл>.dc.html`, потом Read сохранённой копии. Весь артефакт читать не нужно. Общие стили и токены макета: `project/ifin.css`. Править макет можно только с `url` артефакта (read без path, затем read нужных файлов, затем publish). Артефакт приватный, доступ у владельца.

## Реестр: доска → код

Статус «есть» значит, что компонент в `shared/ui` существует; он может отставать от доски, сверяй размеры и состояния. «Нет» значит, что сначала его создают по доске (IF-20). Пометка «есть история» значит, что рядом с компонентом лежит `*.stories.tsx` (Storybook, `Kit/<Компонент>`). Новая история: файл `<имя>.stories.tsx` рядом с компонентом, состояния default, hover и focus (`parameters.pseudo`), disabled, loading, error; обе темы и ширины 390/768/1024/1280 переключаются в панели Storybook, не дублируй их историями. Запуск: `pnpm storybook` (порт 6006), сборка: `pnpm build-storybook`. Обёртки раскладки для историй: `@/shared/storybook` (`StoryStack`, флаг `touch` для предпросмотра 44 px/16 px), без `style={{}}`. Аддоны `storybook-addon-pseudo-states` включён, `a11y` и `docs` нет.

| Доска (файл) | Что на ней | Код | Статус |
|---|---|---|---|
| `Foundations` | цвет обеих тем, палитра категорий, типографика, отступы, радиусы, брейкпоинты, z-index; токены disabled `--c-disabled-surface`, `-text`, `-border`, `-fill` (код `--color-disabled-*`); размеры контролов: точный указатель 40 и 32, касание 44 (Chip 36); шапка 60 (`--header-h`, код `--header-block-size`) | `shared/styles/tokens.scss` | частично, добивает IF-14; disabled-токены (`--color-disabled-*`) и размеры на тач (`--control-size-sm/md` = 44 при `pointer: coarse`) нарисованы и сделаны в коде 2026-10-19 |
| | типографика (компонент `Typography`) | `shared/ui/typography` | есть, есть история |
| | контейнер страницы: ширина и боковые отступы | `shared/ui/container` | есть, есть история |
| `Kit-Controls` | Button (строка Ghost icon sm, Ghost в disabled без фона; тихое опасное действие `danger-ghost`: удалить ключ, участника, покинуть окружение) | `shared/ui/button` | есть, есть история; disabled цветом, а не `opacity` (решение 2026-10-19), в коде |
| | поля ввода (text, textarea, сумма) | `shared/ui/text-field` | есть, есть история |
| | телефон | `shared/ui/phone-field` | есть, есть история |
| | Combobox | `shared/ui/combobox` | есть, есть история |
| | Switch | `shared/ui/switch` | есть, есть история |
| | цвет счёта | `shared/ui/color-picker` | есть, есть история |
| | Segmented (строка состояний: hover, кольцо фокуса на дорожке, вариант и вся группа отключены, тач 44) | `shared/ui/segmented` (`radiogroup`, стрелки; в операциях, панели операции, сравнении статистики) | есть, есть история; состояния и disabled по доске 2026-10-19, disabled и размеры в коде |
| | Tabs (строка состояний: hover, кольцо на полосе с отступом 4 px, отключена, тач 44; на десктопе справа от заголовка, подчёркнутые, «таблеток» нет) | `shared/ui/tabs` (`tablist`, стрелки; вкладки статистики) | есть, есть история; раскладка шапки статистики IF-19; disabled и высота 40 (44 на тач) в коде |
| | Chip (строка состояний из девяти, точка категории в disabled сохраняет цвет, тач 36) | `shared/ui/chip` (пресеты периода в `views/statistics/ui/period-range-picker`) | есть, есть история; состояния и disabled по доске 2026-10-19, IF-20 |
| | Badge | `shared/ui/badge` (статусы чеков `views/receipts/ui/status-badge` ещё свои, IF-18) | есть, есть история |
| | Banner (`.i-banner`: neutral, info, ok, warn, err; жирное начало и текст) | `shared/ui/banner` (тона `neutral`, `info`, `success`, `warning`, `danger`; экран входа, онбординг) | есть, есть история |
| | ссылка в виде кнопки (кнопка Telegram на входе) | `shared/ui/button` (`ButtonLink`, те же варианты и размеры, без disabled: пока адреса нет, показывать `Button`) | есть, есть история |
| | Avatar, IconTile, List и ListRow (участники, приглашения, причины), ChoiceCard (выбор «Создать окружение / У меня есть приглашение»), FlatCard, PageCard (страница-карточка 480) | `shared/ui/avatar`, `icon-tile`, `list`, `choice-card`, `flat-card`, `page-card` | есть, есть истории (U3, U4, U5); на досках экранов `Flow-*`, `M-Household`, `D-Household`, отдельной доски кита нет |
| | Checkbox, Switch, FAB (состояния и disabled; у выключенного Switch ручка и дорожка с рамкой `--c-disabled-border`, у пустого Checkbox рамка того же токена; строка Checkbox на тач 44) | `shared/ui/checkbox`, `shared/ui/switch`, `shared/ui/fab` | есть, есть история; disabled по доске 2026-10-19, в коде (у FAB история `Kit/Fab`) |
| | навигатор периода | `shared/ui/period-navigator` (операции, месяц статистики: `views/statistics/ui/month-navigator` тонкая обёртка) | есть, есть история |
| | копии сегмента периода и навигатора | остаются в `views/categories/ui/category-summary-dialog` и `views/contacts/ui/contact-summary-dialog` до IF-39 | не переведены, IF-39 |
| | Select (нативный, оболочка кита) | `shared/ui/select` | есть, есть история |
| | поле даты (нативный `type=date`, YYYY-MM-DD, min/max) | `shared/ui/date-field` | есть, есть история |
| `Kit-Pickers` | Select и поле даты (нативные, оболочка кита), Combobox на телефоне с клавиатурой | `shared/ui/select`, `shared/ui/date-field`, `shared/ui/combobox` | Select и поле даты есть, есть истории (IF-20, часть 2, этап А); Combobox с клавиатурой — IF-11 |
| | мультивыбор в popover, диапазон периода (статистика) | нет | нет, IF-19, IF-20 |
| | выбор цвета категории (10 оттенков `k-1…k-10`, свой запрещён) | `shared/ui/color-picker` (6 цветов, hex) | не по доске, IF-19 |
| `Kit-Surfaces` | Шапка: верхняя навигация на 640 (`.i-top.compact`: только знак 36 px, ссылки с отступом 12 px, замеры 585 из 640), 960 и 1280; высота 60 px на всех ширинах и на тач | `widgets/app-header` | высота 60 по доске в коде (2026-10-19); остальное доработка IF-17 |
| | Dialog | `shared/ui/dialog` | есть, есть история |
| | Menu / Popover | `shared/ui/context-menu` | есть, есть история |
| | Card счёта, категории, контакта, KPI | `shared/ui/account-card`, `category-card`, `contact-card`, `kpi-card` (на `FlatCard variant='outlined'`, `IconTile tint`, `Badge`); бюджетный прогресс: `shared/ui/progress` | есть, есть истории (IF-20 часть 2, этап Б, 2026-10-27); экраны пока не переведены, IF-16/18/19/39; архив и общая ошибка счёта на досках отсутствуют |
| | строка операции, группа дня | `views/home/ui/operations-table`, `operations-list`, `operation-group-row` | экранный код; IF-13 этап 1 (2026-10-28): общая плоская модель, виртуализация таблицы и списка, истории `Home/OperationsVirtualized` на 5000; ручная приёмка остаётся |
| | таблица: сетка колонок с сортировкой и строками (операции, чеки) | `shared/ui/grid` | есть, есть история; опциональное виртуальное окно, распорки и ref существующего скролла (IF-13) |
| | Bottom sheet, Drawer / панель | панель операции: `views/home/ui/operation-details-panel` | нет общего, IF-20, IF-21 |
| | Empty state | `shared/ui/empty-state` (сравнение статистики) | есть, есть история |
| | Toast | `shared/ui/toast` (`createToaster`, `Toast`, `ToastContainer`) | есть, есть история |
| | Skeleton (`.i-skel`, плитка и строка, тише при `prefers-reduced-motion`) | `shared/ui/skeleton` | есть, есть история |
| `Kit-States` | Toast (место, длительность, стопка) | `shared/ui/toast` (`createToaster` внутри Solid owner, до трёх, пауза hover/focus) | есть, есть история |
| | Skeleton списка и таблицы, ошибка загрузки и офлайн | Skeleton: `shared/ui/skeleton`; остальное нет | Skeleton есть, остальное нет, IF-20 |
| | подтверждение удаления внутри диалога (плоская карточка: вопрос, «Отмена» и «Удалить»; фокус на «Отмена», Escape закрывает только вопрос) | `shared/ui/confirm-panel` | есть, есть история; режим подтверждения самого `Dialog` не сделан, IF-21 |
| | список строк с плиткой-значком (`.i-list`, `.i-row`, `.i-tile`): ключи, сеансы, привязанный аккаунт | `shared/ui/list` (`List`, `ListRow` со слотом `leading`: `IconTile` или `Avatar`, флаг `comfortable` 64 px); подтверждение внутри диалога: `shared/ui/confirm-panel` (`ConfirmPanel`, с `error`) | есть, есть история |
| | поле пароля с глазом (показать, скрыть) | `shared/ui/password-field` | есть, есть история |
| | панель операции в просмотре | `views/home/ui/operation-details-panel` | нет, IF-16, IF-21 |
| `M-OpMoveAccount`, `D-OpMoveAccount` | поле «Счёт» в правке операции: Combobox первым после «Расход / Приход», только в edit; список активных счетов той же валюты (плитка, название, баланс, «Текущий счёт»), подсказка о переносе, 409 под полем, выключенное поле, архивный счёт, операция-часть перевода без поля (баннер и «Закрыть») | `views/home/ui/operation-details-panel` (`operation-account-field`, `account-option-content`, `transfer-part-summary`, `lib/resolve-operation-account-field`; форма используется ещё в `views/categories/ui/category-operation-dialog`); истории `Home/OperationDetailsPanel` | есть (2026-10-27); расхождения в `development/ui-mockup.md` |
| | FAB и Bottom navigation | `shared/ui/fab` и `shared/ui/bottom-navigation` (5 ячеек; токены `--bottom-nav-*`); подключена в `widgets/app-header` | есть, есть истории; только ниже 640 px, скрытие при фокусе в поле сохранено; с 640 верхняя шапка; карточки экранов пока не переведены |
| | жест по строке (зона `drag-action`) | `shared/ui/drag-action` | есть, есть история, z-index не по шкале, IF-14 |
| `Kit-Currency` | знаки валют ₴ BYN ₽ ¥ € $ zł, размеры, правило «знак или код», формат суммы (минус U+2212, ноль, копейки, сокращения на графиках) | `shared/ui/currency-sign` и `money` (IF-32) | нет, IF-32 |
| `Kit-AccountCard` | CardFace (full, mini, истёк, светлый цвет) | `shared/ui/card-face` | есть, есть история |
| | поля номера и срока карты | `shared/ui/card-number-field`, `card-expiry-field` | есть, есть история |
| | выбор типа счёта, блок реквизитов в форме | `features/account-details` (`ui/card`, `model`) | есть |
| | шапка счёта с мини-картой | `features/account-details/ui/card/card-header-visual.tsx` | есть |
| | иконка типа счёта (карта, наличные, сбережения, прочее) | `shared/ui/account-icon` | есть, есть история |
| `Layout-Spec`, `Ops-C-1280/1024/768`, `OpsLayout`, `M-Ops-Sort` | раскладка операций, колонки по контейнеру, тулбар периода; узкая сортировка (ниже 700 px одна кнопка «Порядок», нативный select с десятью пунктами, иконка направления, активный вид не по умолчанию), тулбар на 1280 весь 40 px | `views/home/ui/operations-workspace` (контейнер, `mx.container-mn`, колонки и тулбар по ширине контейнера, IF-15) | тулбар и колонки по доске; раскладка (лента счетов, панель 340) не по доске, IF-16 |
| `Sheet-Lab` | правило листов S4 | диалоги: `views/home/ui/*-dialog`, `shared/ui/dialog` | не по правилу, IF-21 |
| `M-Security`, `D-Security` | раздел «Безопасность»: Telegram, ключи, пароль, сеансы и состояния; «Задать пароль» (аккаунт без пароля) остаётся на доске как будущий экран (v2), в коде его нет | `features/security` (`ui/security-dialog`: sheet ниже 640 и диалог 560; секции Telegram, ключей, пароля, сеансов; клиенты `api/security-client`, `api/telegram-link-client`; опрос привязки через `features/telegram-request`); пункт включён в `widgets/app-header/ui/profile-menu.tsx`; истории `Security/*` | есть (IF-33, U6, 2026-10-21); не на доске: непривязанный Telegram, крупный `@username` после привязки, подпись «Привязан» без даты, см. `development/ui-mockup.md` |
| `M-ProfileEdit`, `D-Profile` | диалог «Профиль»: имя, тема, валюта отображения, Telegram, push | `widgets/app-header/ui/profile-menu.tsx` (меню, пункт «Безопасность» включён), диалога нет | нет, IF-5, IF-7…IF-9 |
| `Auth-Telegram`, `M-SignIn`, `D-SignIn` | вход через Telegram первым, 9 состояний | `features/auth` (`ui/sign-in-form`, `ui/sign-in-options`, состояния в `model/sign-in-card-view`, опрос в `model/telegram-sign-in-flow`; истории `Auth/SignInOptions`, `Auth/SignedInIdentity`) | есть (U1, 2026-10-19); не на доске: «Вход выполнен» после Telegram, «нет связи», ошибка сети на `start`, форма пароля в карточке |
| | логотип «iF» на панели входа и в шапке | `shared/ui/app-logo` (`size='lg'` 48 px на входе) | есть, есть история |
| `Flow-Onboarding`, `Flow-Invite`, `M-Household`, `D-Household`, `Bot-Telegram` | онбординг, приглашение и принятие (срок 7 дней, экран согласия на удаление пустого окружения, ссылка вида `/invite#токен`), участники окружения, тексты бота (редакция 2026-10-19, на проверку владельцем) | `views/onboarding` и `features/household/ui` (онбординг, диалог «Окружение» из меню профиля), `views/invite` и `features/invitation/ui` (приглашение), `app/access` (маршруты, U2); истории `Household/*`, `Invitation/Cards` | есть (U3, U4, U5, 2026-10-22); отступления в `development/ui-mockup.md`; не сделано: тексты бота (IF-10), уведомление об удалении |
| `Flow-AppInvite`, `M-AppInvitations`, `D-AppInvitations`, `M-Profile`, `D-Profile` | приглашение в приложение (вид «в приложение»: человек входит через Telegram и создаёт своё окружение): страница гостя на 9 состояний, диалог администратора «Приглашения в приложение» (sheet и диалог 560, 20 активных, ссылка один раз, отзыв внутри диалога), пункты меню профиля «Окружение» и «Приглашения в приложение» (только администратору приложения, логин `stark`); `Flow-Invite` теперь с регистрацией через Telegram по ссылке окружения (2026-10-22, на приёмку владельцем) | `views/invite`, `features/invitation/ui`, `widgets/app-header/ui/profile-menu.tsx` | нет, ждёт приёмки владельцем и API; до приёмки код не начинать |
| `M-*` (390 px), `D-*` (1280 px) | экраны по одному | `views/home` (операции, счета, перевод), `views/receipts`, `views/categories`, `views/contacts`, `views/statistics`, `features/auth` (вход), `widgets/app-header` (навигация, меню профиля) | по задачам IF-15…IF-19 |

Домашний слой: UI экранов живёт в `views/<экран>/page.tsx` и `views/<экран>/ui`. `features/*/api` это клиенты API; UI в `features` есть у `account-details`, `auth`, `household`, `invitation`, `security`. `features/telegram-request` общий поток заявки Telegram (вход и привязка): состояния, опрос, проверка ссылки `https://t.me`; правки потока делай там, а не в `auth` или `security`.

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
| `--header-h` (60 px, `.i-top`) | `--header-block-size` (60 px) |
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
| нет переменной, 44 px (`.i-tr`), на телефоне 64 px (`development/ui-mockup.md`) | `--row-height-compact` (44 px), `--row-height-comfortable` (64 px); используются IF-13 |
| заголовок группы дня (оценка существующей раскладки, IF-13) | `--row-height-group` (64 px ниже `sm`, 36 px с `sm`), минимум группы `--row-height-group-compact` (36 px); фактическая высота измеряется виртуализатором |

**Расхождения, закрытые IF-14** (проверено по `tokens.scss`; решения ревью в `development/decisions/ui-breakpoints.md`): шкала `--z-*` (10…60) и `--z-raised`; `--space-focus-gutter` 4 px и `mx.scroll-gutter`; `--color-scrim`, `--color-ink-card`, `--radius-pill`, `--shadow-lg` заведены; размер 13 px (`--font-size-caption`) и подпись 12 px (`--font-size-label`); `--color-text-secondary` светлая тема приведена к макету, `--color-text-tertiary` совпадает с макетом; категории 9–10 (`--color-series-9`, `-10`); панели 420 и 340 px, высоты строк 44 и 64 px; шрифт IBM Plex Sans.

**Расхождения, которые IF-14 не закрыл** (до их закрытия не выдумывай значения, бери из макета и отмечай в задаче):
- `--color-primary-hover` и `-active`: в коде `color-mix` 6 % и 10 %, в макете hover `#386a97`, active нет. IF-20.
- Затемнения литералами 32…42 % вместо `--color-scrim` (макет 45 %). IF-21.
- Поле 16 px при `(pointer: coarse)`: миксин `mx.pointer-coarse` есть (IF-20, часть 1), сам размер шрифта в полях ещё не переведён.
- Мобильные значения `--font-size-display` 28, `--font-size-heading-1` 24, `--space-12` 48 ниже 640 (в макете 32, 28, 64). Экранные задачи.
- Пока не используются: `--panel-docked-inline-size` (IF-16), `--color-series-9`, `-10` (IF-19). `--font-size-body-sm` (12 px) устаревший: экраны уходят с него в своих задачах.

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
