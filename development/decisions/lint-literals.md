# Линт против литералов

Дата: 2026-10-18. Задача IF-40 (этап 2 `development/ui-roadmap.md`). Цель: новый литерал цвета, слоя, брейкпоинта или формата денег не проходит `pnpm lint`.

## Где живёт

| Что | Где |
|---|---|
| Правила Stylelint | `lint/stylelint-literals.js`, подключены в `stylelint.config.js` |
| Правила ESLint | `lint/eslint-literals.js`, подключены в `eslint.config.js` |
| Список исключений по файлам | `lint/literal-exceptions.js` |
| Тесты правил | `apps/web/tests/lint-literals.test.js` (идёт в `pnpm test`) |

Общий конфиг `@stark/stylelint-config` живёт в отдельном репозитории и не менялся: все правила локальные. `declaration-no-important` уже включён в нём (проверено, нарушений нет).

## Правила

### Stylelint (все `.scss` в `apps/`, кроме `apps/web/src/shared/styles/**`)

| Правило | Что запрещает | Что разрешено |
|---|---|---|
| `color-no-hex` | `#fff`, `#1b2333`, в том числе внутри `color-mix()`, градиентов, теней | токены `var(--color-*)` |
| `color-named` | `white`, `black`, `red` и другие именованные цвета, в том числе как запасное значение `var(--x, white)` | `transparent`, `currentcolor` |
| `function-disallowed-list` | `rgb()`, `rgba()`, `hsl()`, `hsla()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()` | `color-mix()` поверх токенов, `transparent`, `currentcolor` (литерал внутри `color-mix` ловит `color-no-hex`) |
| `declaration-property-value-allowed-list` для `z-index` | числовой `z-index`, `calc()` над слоем | `var(--z-*)`, `auto`, `0`, `-1` |
| `media-feature-name-disallowed-list` | сырой `@media` по размеру: `width`, `min-width`, `max-width`, `height`, `aspect-ratio`, `resolution` и их `min-`/`max-`/`device-` варианты, включая запись диапазоном `(width >= 640px)` | миксины `@include mx.media-mn(sm\|md\|lg)`; запросы про предпочтения пользователя (`prefers-reduced-motion`, `hover`, `pointer`) |
| `no-unknown-custom-properties` | `var(--x)` на свойство, которого нет | свойства из `tokens.scss` (`referenceFiles`), объявленные в том же файле, и `var(--x, fallback)` |
| `declaration-no-important` | `!important` | (правило из общего конфига) |

В `shared/styles/**` отключены правила про литералы (там значения и живут), `no-unknown-custom-properties` включено и там.

### ESLint (`apps/web/**/*.{ts,tsx}`, кроме `apps/web/src/shared/lib/**`)

| Правило | Что запрещает | Что разрешено |
|---|---|---|
| `no-restricted-syntax` | `style="..."`; `style={{ ... }}` со значением-литералом (строка, число, шаблон без подстановок) под любым ключом, кроме CSS-переменной | динамические значения (`` `${w}px` ``, `props.color`), `style={fn()}`, ключи `'--name'` с любым значением |
| `no-restricted-properties` | `new Intl.NumberFormat(...)` и `Intl.NumberFormat(...)` | `Intl.DateTimeFormat`, `Intl.Collator`, типы `Intl.NumberFormatOptions`; в `shared/lib` разрешено всё |

Деньги выводит `formatCurrency` (позже `money`, IF-32).

## Что не запрещено и почему

`px` и `fn.rem(N)` не запрещены: их около 400, и сначала нужна шкала размеров (этап 1 и 5 карты). Правила ESLint смотрят только на синтаксис: стиль, собранный отдельным объектом (`const s = { color: 'red' }; <i style={s}/>`), они не ловят. `#hex` в строках TS (например `SERIES_FALLBACKS` в `compare-tab.tsx`) тоже не ловятся; это уйдёт с токенами палитры в IF-19.

## Обоснование

- Правила включены сразу как `error`, потому что `lint` идёт с `--max-warnings 0`: предупреждения не работают.
- Существующие нарушения не чинятся ради линта (экранные компоненты не трогаем), а перечислены по файлам с задачей, которая их снимет. Список только сокращается: новый файл в него не добавляют, литерал заменяют токеном.
- Исключение отключает правило для файла целиком, поэтому в исключённом файле новые нарушения этого правила тоже пройдут. Это цена простого механизма; файл должен выйти из списка в своей задаче.
- Тест `has no stale exceptions` падает, если файл из списка больше не нарушает правило. Так список нельзя забыть сократить: вычистил файл, тест требует убрать его из `lint/literal-exceptions.js`.
- Свойства, которые ставит TSX через `style={{ '--x': ... }}` или объявляет соседний компонент, правило `no-unknown-custom-properties` не видит. Для них стоят точечные `stylelint-disable` с причиной: `--category-color` в `operations-list.module.scss`, `--grid-header-block-size` в `operations-table.module.scss`.

## Исправлено в коде при внедрении

- `transfer-dialog.module.scss`: пять несуществующих токенов заменены по смыслу, `#fff` на токен. `--color-surface-muted` -> `--color-surface-subtle`, `--color-text-muted` -> `--color-text-tertiary`, `--font-size-sm` -> `--font-size-caption`, `--font-size-xs` -> `--font-size-label`, `--font-size-lg` -> `--font-size-body-lg`, `color: #fff` -> `--color-text-inverse`. Раньше эти `var()` были невалидными (значение наследовалось), теперь размеры и цвета заданы токенами: вид блока предпросмотра и подписей чуть изменится, проверить глазами в IF-16.
- `operation-details-panel.module.scss`: `--line-height-body` -> `--line-height-body-md`.
- `grid.tsx`: инлайновый `'min-width': '100%'` перенесён в `.table` как `min-inline-size: 100%`.

## Исключения на момент внедрения

Метрика прогресса IF-34: число файлов в списке по задачам. Закрывается, когда везде 0.

| Задача | Файлов | Что и где |
|---|---|---|
| IF-16 (операции) | 1 | `views/home/home.module.scss`: `rgb()` скрима |
| IF-17 (навигация) | 1 | `widgets/app-header/app-header.module.scss`: `rgb()` в тенях |
| IF-18 (чеки) | 1 | `views/receipts/page.tsx`: `Intl.NumberFormat` |
| IF-19 (статистика) | 1 | `views/statistics/ui/compare-tab/compare-tab.tsx`: `Intl.NumberFormat` |
| IF-20 (кит) | 2 | `shared/ui/context-menu`: `rgb()`; `shared/ui/drag-action`: `rgb()` и hex (19 + 3 места) |
| IF-21 (панели, диалоги) | 2 | `shared/ui/dialog`: `rgb()` скрима; `views/home/ui/operation-details-panel`: `rgb()` скрима |
| IF-39 (вход, категории, контакты) | 0 | нарушений нет |
| **Всего** | **8** | 9 пар «файл, правило» (7 Stylelint, 2 ESLint) |

Нарушений по числовому `z-index`, сырому `@media`, `style={{}}` с литералами (после правки `grid.tsx`) и `!important` в коде на момент внедрения нет: эти правила работают как ограждение без исключений.

## Как снять исключение

1. Заменить литерал токеном (`--color-scrim`, `--shadow-*`, `--z-*`) или компонентом кита, для денег `formatCurrency`.
2. Убрать файл из `lint/literal-exceptions.js`; без этого тест `has no stale exceptions` упадёт.
3. Обновить таблицу выше.
