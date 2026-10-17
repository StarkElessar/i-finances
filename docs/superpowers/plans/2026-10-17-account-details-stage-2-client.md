# Account Details — Stage 2: Client (masks, card visual, registry) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ввод и показ реквизитов карты в web: маски номера и срока, живое превью карты в форме, мини-карта вместо иконки в шапке счёта (вариант B1), подсветка истёкшего срока — через расширяемый клиентский реестр типов счёта.

**Architecture:** Чистые функции масок в `shared/lib/card`, обёртки над `TextField` в `shared/ui`, визуальный компонент `CardFace` (два размера), реестр `ACCOUNT_DETAILS_REGISTRY: Record<AccountTypeValue, AccountDetailsDescriptor | null>` в `features/account-details`. `AccountDialog` и шапка счёта работают только через реестр, без `if (type === 'card')`.

**Tech Stack:** Solid.js, TypeScript strict, CSS Modules (SCSS, mobile-first, `mx.media-mn`), vitest (только чистая логика и клиенты — компонентных тестов в проекте нет).

**Spec:** `docs/superpowers/specs/2026-10-17-account-type-details-design.md`
**Prerequisite:** Stage 1 (`docs/superpowers/plans/2026-10-17-account-details-stage-1-backend.md`) выполнен и смёржен: в контрактах есть `owner`, union-схемы, `cardAccountDetailsViewSchema`, `extractCardDigits`, `collectFieldErrors`; API отдаёт `GET /api/accounts/:id`; `views/home/page.tsx` прогоняет payload через `safeParse` и передаёт `owner`.
**Mockups:** доска «Кит: карточка счёта» (`project/Kit-AccountCard.dc.html`) в макете https://claude.ai/artifact/De31TDNR7feRASBZ73Leq1 (прежний артефакт «Счета: детали карты» удалён 2026-10-17, утверждённые варианты перенесены сюда) — утверждены: **B1** (мини-карта 92×58 вместо плитки-иконки в шапке) и форма «B · редактирование» (превью слева, поля справа; на мобильном превью над полями).

## Global Constraints

- Один класс/компонент — один файл; kebab-case для всех файлов, включая компоненты.
- SCSS: mobile-first, только `@include mx.media-mn(...)` из `@/shared/styles/mixins`, логические свойства, двойные кавычки, `declaration-no-important`, интерактивные стили гардим `:not(.active)` (AGENTS.md). Брейкпоинт «мобильный → десктоп» на главной — `961`.
- Функции верхнего уровня — `function`-декларации; внутри компонентов — `const` стрелки; порядок в компоненте: сигналы/мемо → обработчики → эффекты → `return`.
- Импорты: `simple-import-sort` (стили → побочные → `node:` → внешние → `@/` → относительные). После правок `pnpm lint:fix`.
- CVV нигде. Полный номер в UI — только в форме редактирования (загружается отдельным `GET /api/accounts/:id`, не кладётся в `query('accounts')`).
- Маски: `inputMode='numeric'`, `type='text'`, `autocomplete='cc-number'` / `'cc-exp'`.
- Без `!important`; цифры — `font-variant-numeric: tabular-nums`.
- Команды из корня: `pnpm --filter @i-finances/web test`, `pnpm --filter @i-finances/web typecheck`, `pnpm lint`.
- Вёрстка не считается готовой без визуальной проверки в браузере на мобильном (390 px) и десктопном вьюпорте.

## Deviations from spec / mockup (намеренные)

- Сайдбар остаётся как утверждено в макете: `Карта · Сергей` (владелец вместо «Без группы»), без `•••• 1234` — строка в сайдбаре уже обрезается. Номер виден на мини-карте в шапке. (Спека предлагала `owner · •••• 1234`.)
- Вместо `Summary`/`formatListHint` дескриптор даёт `HeaderVisual` (мини-карта с запасным вариантом «обычная иконка») — это то, что утверждено в B1.
- Цвета счёта — фиксированная палитра из `AccentColor` (все тёмные, белый текст на карте проходит по контрасту), отдельного расчёта контраста не делаем.
- Поповер с полной картой по клику (B3) не входит в этап: только B1.

## File Structure

| Файл | Действие | Ответственность |
|---|---|---|
| `apps/web/src/shared/lib/card/card-number.ts` | Create | формат/маска номера |
| `apps/web/src/shared/lib/card/card-expiry.ts` | Create | формат срока, `isCardExpired` |
| `apps/web/src/shared/lib/card/index.ts` | Create | реэкспорт |
| `apps/web/src/shared/lib/index.ts` | Modify | экспорт `card` |
| `apps/web/tests/card-number.test.ts`, `card-expiry.test.ts` | Create | тесты масок |
| `apps/web/src/shared/ui/card-number-field/{card-number-field.tsx,index.ts}` | Create | поле номера |
| `apps/web/src/shared/ui/card-expiry-field/{card-expiry-field.tsx,index.ts}` | Create | поле срока |
| `apps/web/src/shared/ui/card-face/{card-face.tsx,card-face.module.scss,index.ts}` | Create | карта (mini/full) |
| `apps/web/src/shared/ui/index.ts` | Modify | экспорты |
| `apps/web/src/features/accounts/api/account-client.ts` | Modify | `getFull` |
| `apps/web/src/entities/account/api/account.client.ts` (+`index.ts`) | Modify | `getAccountFull` |
| `apps/web/tests/account-client.test.ts` | Modify | тест `getFull` |
| `apps/web/src/features/account-details/model/card-draft.ts` | Create | черновик формы ⇄ контракт |
| `apps/web/src/features/account-details/model/account-details-descriptor.ts` | Create | тип дескриптора |
| `apps/web/src/features/account-details/model/account-details-registry.ts` | Create | реестр |
| `apps/web/src/features/account-details/ui/card/card-details-form-section.{tsx,module.scss}` | Create | секция формы |
| `apps/web/src/features/account-details/ui/card/card-header-visual.tsx` | Create | мини-карта в шапке |
| `apps/web/src/features/account-details/index.ts` | Create | публичный вход |
| `apps/web/tests/card-draft.test.ts` | Create | тесты черновика |
| `apps/web/src/views/home/ui/account-dialog/account-dialog.tsx` | Modify | слот деталей через реестр |
| `apps/web/src/views/home/page.tsx` | Modify | загрузка `GET /:id`, шапка |

---

### Task 1: Маска и формат номера карты

**Files:**
- Create: `apps/web/src/shared/lib/card/card-number.ts`
- Create: `apps/web/src/shared/lib/card/index.ts`
- Modify: `apps/web/src/shared/lib/index.ts`
- Test: `apps/web/tests/card-number.test.ts`

**Interfaces:**
- Produces:
  - `formatCardNumberInput(raw: string): string` — до 16 цифр, группы по 4 через пробел
  - `formatCardNumberPreview(digits: string): string` — всегда 16 позиций, пустые как `•`
  - `maskCardNumber(last4: string | null): string` → `•••• •••• •••• 1234` или `''`
  - `maskCardNumberShort(last4: string | null): string` → `•••• 1234` или `''`
  - `CARD_NUMBER_DIGITS = 16`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/card-number.test.ts
import {
	CARD_NUMBER_DIGITS,
	formatCardNumberInput,
	formatCardNumberPreview,
	maskCardNumber,
	maskCardNumberShort
} from '@/shared/lib';

import { describe, expect, it } from 'vitest';

describe('card number formatting', () => {
	it('groups digits by four and caps at 16', () => {
		expect(CARD_NUMBER_DIGITS).toBe(16);
		expect(formatCardNumberInput('4')).toBe('4');
		expect(formatCardNumberInput('41111')).toBe('4111 1');
		expect(formatCardNumberInput('4111111111111111999')).toBe('4111 1111 1111 1111');
	});

	it('drops non-digits from pasted text', () => {
		expect(formatCardNumberInput('4111-1111 abc 1111')).toBe('4111 1111 111');
	});

	it('preview pads missing digits with bullets', () => {
		expect(formatCardNumberPreview('')).toBe('•••• •••• •••• ••••');
		expect(formatCardNumberPreview('41111')).toBe('4111 1••• •••• ••••');
	});

	it('masks by last four', () => {
		expect(maskCardNumber('5678')).toBe('•••• •••• •••• 5678');
		expect(maskCardNumberShort('5678')).toBe('•••• 5678');
		expect(maskCardNumber(null)).toBe('');
		expect(maskCardNumberShort(null)).toBe('');
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @i-finances/web test -- card-number`
Expected: FAIL — exports not found

- [ ] **Step 3: Implement**

```ts
// apps/web/src/shared/lib/card/card-number.ts
import { extractCardDigits } from '@i-finances/contracts';

export const CARD_NUMBER_DIGITS = 16;

function groupByFour(value: string): string {
	return value.replace(/(.{4})(?=.)/g, '$1 ');
}

/**
 * Keeps up to 16 digits from raw/pasted input and groups them by four.
 */
export function formatCardNumberInput(raw: string): string {
	return groupByFour(extractCardDigits(raw).slice(0, CARD_NUMBER_DIGITS));
}

/**
 * Always renders 16 positions, filling the missing ones with bullets (card preview).
 */
export function formatCardNumberPreview(digits: string): string {
	const filled = digits.slice(0, CARD_NUMBER_DIGITS).padEnd(CARD_NUMBER_DIGITS, '•');

	return groupByFour(filled);
}

export function maskCardNumber(last4: string | null): string {
	return last4 === null ? '' : `•••• •••• •••• ${last4}`;
}

export function maskCardNumberShort(last4: string | null): string {
	return last4 === null ? '' : `•••• ${last4}`;
}
```

```ts
// apps/web/src/shared/lib/card/index.ts
export {
	CARD_NUMBER_DIGITS,
	formatCardNumberInput,
	formatCardNumberPreview,
	maskCardNumber,
	maskCardNumberShort
} from './card-number';
```

В `apps/web/src/shared/lib/index.ts` добавить (в алфавитном порядке между `account-type` и `cn`):

```ts
export {
	CARD_NUMBER_DIGITS,
	formatCardNumberInput,
	formatCardNumberPreview,
	maskCardNumber,
	maskCardNumberShort
} from './card';
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @i-finances/web test -- card-number`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/lib apps/web/tests/card-number.test.ts
git commit -m "feat(web): card number mask helpers"
```

---

### Task 2: Маска срока и `isCardExpired`

**Files:**
- Create: `apps/web/src/shared/lib/card/card-expiry.ts`
- Modify: `apps/web/src/shared/lib/card/index.ts`, `apps/web/src/shared/lib/index.ts`
- Test: `apps/web/tests/card-expiry.test.ts`

**Interfaces:**
- Produces:
  - `formatCardExpiryInput(raw: string, previous?: string): string` — `/` после двух цифр; первая цифра 2–9 → `0X/`; при удалении символа слэш не возвращается
  - `isCardExpired(expiry: string, today: Date): boolean` — истёк, если месяц `MM/YY` строго раньше текущего (карта действует до конца месяца); невалидная строка → `false`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/card-expiry.test.ts
import { formatCardExpiryInput, isCardExpired } from '@/shared/lib';

import { describe, expect, it } from 'vitest';

describe('card expiry mask', () => {
	it('inserts the slash after two digits', () => {
		expect(formatCardExpiryInput('0')).toBe('0');
		expect(formatCardExpiryInput('08')).toBe('08/');
		expect(formatCardExpiryInput('082')).toBe('08/2');
		expect(formatCardExpiryInput('0827')).toBe('08/27');
		expect(formatCardExpiryInput('082799')).toBe('08/27');
	});

	it('pads a first digit from 2 to 9 with zero', () => {
		expect(formatCardExpiryInput('5')).toBe('05/');
		expect(formatCardExpiryInput('1')).toBe('1');
	});

	it('lets the user delete the slash', () => {
		expect(formatCardExpiryInput('08', '08/')).toBe('08');
		expect(formatCardExpiryInput('08/2x', '08/')).toBe('08/2');
	});
});

describe('isCardExpired', () => {
	it('stays valid through the last day of the expiry month', () => {
		expect(isCardExpired('08/27', new Date(2027, 7, 31))).toBe(false);
	});

	it('is expired from the first day of the next month', () => {
		expect(isCardExpired('08/27', new Date(2027, 8, 1))).toBe(true);
	});

	it('ignores malformed values', () => {
		expect(isCardExpired('', new Date(2030, 0, 1))).toBe(false);
		expect(isCardExpired('13/27', new Date(2030, 0, 1))).toBe(false);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @i-finances/web test -- card-expiry`
Expected: FAIL — exports not found

- [ ] **Step 3: Implement**

```ts
// apps/web/src/shared/lib/card/card-expiry.ts
const EXPIRY_PATTERN = /^(0[1-9]|1[0-2])\/(\d{2})$/;

/**
 * Formats raw input as `MM/YY`. `previous` is the value before the edit and
 * lets the user delete the slash without it being re-inserted.
 */
export function formatCardExpiryInput(raw: string, previous = ''): string {
	let digits = raw.replace(/\D/g, '').slice(0, 4);

	if (digits.length === 1 && Number(digits) > 1) {
		digits = `0${digits}`;
	}

	if (digits.length < 2) {
		return digits;
	}

	const month = digits.slice(0, 2);

	if (digits.length === 2) {
		return raw.length < previous.length ? month : `${month}/`;
	}

	return `${month}/${digits.slice(2)}`;
}

/**
 * A card is valid through the last day of the printed month.
 */
export function isCardExpired(expiry: string, today: Date): boolean {
	const match = EXPIRY_PATTERN.exec(expiry);

	if (match === null) {
		return false;
	}

	const expiryMonthIndex = (2000 + Number(match[2])) * 12 + Number(match[1]);
	const currentMonthIndex = today.getFullYear() * 12 + today.getMonth() + 1;

	return currentMonthIndex > expiryMonthIndex;
}
```

Добавить `formatCardExpiryInput`, `isCardExpired` в экспорты `card/index.ts` и `shared/lib/index.ts` (блок из Task 1).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @i-finances/web test -- card-expiry`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/shared/lib apps/web/tests/card-expiry.test.ts
git commit -m "feat(web): card expiry mask and expiry check"
```

---

### Task 3: Поля `CardNumberField` и `CardExpiryField`

**Files:**
- Create: `apps/web/src/shared/ui/card-number-field/card-number-field.tsx`, `index.ts`
- Create: `apps/web/src/shared/ui/card-expiry-field/card-expiry-field.tsx`, `index.ts`
- Modify: `apps/web/src/shared/ui/index.ts`

**Interfaces:**
- Consumes: `formatCardNumberInput`, `CARD_NUMBER_DIGITS`, `formatCardExpiryInput`, `extractCardDigits`; `TextField` (props: `label`, `hint`, `error`, `optional`, `disabled`, нативные input-атрибуты)
- Produces:
  - `CardNumberField(props: { value: string; onValueChange(display: string): void; disabled?: boolean; error?: string; label?: string; optional?: boolean })`
  - `CardExpiryField(props: { value: string; onValueChange(display: string): void; disabled?: boolean; error?: string; hint?: string; label?: string; optional?: boolean })`

Образец поведения — `PhoneField` (`apps/web/src/shared/ui/phone-field/phone-field.tsx`): `onBeforeInput` отсекает нецифры и переполнение (paste/drop пропускаются), `onInput` нормализует и принудительно синхронизирует `input.value` и каретку.

- [ ] **Step 1: Implement `CardNumberField`**

```tsx
// card-number-field.tsx
import { CARD_NUMBER_DIGITS, formatCardNumberInput } from '@/shared/lib';
import { TextField } from '@/shared/ui/text-field';

import { extractCardDigits } from '@i-finances/contracts';

export type CardNumberFieldProps = {
	value: string;
	onValueChange: (display: string) => void;
	class?: string;
	disabled?: boolean;
	error?: string;
	label?: string;
	optional?: boolean;
};

/**
 * Controlled card number field with a `0000 0000 0000 0000` mask.
 */
export function CardNumberField(props: CardNumberFieldProps) {
	const handleBeforeInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
		if (!event.inputType.startsWith('insert') || event.data === null) {
			return;
		}

		// Paste/drop may contain spaces or dashes — onInput normalizes them.
		if (event.inputType === 'insertFromPaste' || event.inputType === 'insertFromDrop') {
			return;
		}

		if (/\D/.test(event.data) || extractCardDigits(props.value).length >= CARD_NUMBER_DIGITS) {
			event.preventDefault();
		}
	};

	const handleInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
		const input = event.currentTarget;
		const display = formatCardNumberInput(input.value);

		if (props.value !== display) {
			props.onValueChange(display);
		}

		// A controlled input skips DOM writes when the signal is unchanged
		// (letters / overflow digits), so force-sync value and caret.
		input.value = display;
		input.setSelectionRange(display.length, display.length);
	};

	return (
		<TextField
			autocomplete='cc-number'
			class={props.class}
			disabled={props.disabled}
			error={props.error}
			inputMode='numeric'
			label={props.label ?? 'Номер карты'}
			maxLength={19}
			optional={props.optional}
			placeholder='0000 0000 0000 0000'
			type='text'
			value={props.value}
			onBeforeInput={handleBeforeInput}
			onInput={handleInput}
		/>
	);
}
```

```ts
// card-number-field/index.ts
export type { CardNumberFieldProps } from './card-number-field';
export { CardNumberField } from './card-number-field';
```

- [ ] **Step 2: Implement `CardExpiryField`**

```tsx
// card-expiry-field.tsx
import { formatCardExpiryInput } from '@/shared/lib';
import { TextField } from '@/shared/ui/text-field';

export type CardExpiryFieldProps = {
	value: string;
	onValueChange: (display: string) => void;
	class?: string;
	disabled?: boolean;
	error?: string;
	hint?: string;
	label?: string;
	optional?: boolean;
};

/**
 * Controlled card expiry field with an `MM/YY` mask.
 */
export function CardExpiryField(props: CardExpiryFieldProps) {
	const handleBeforeInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
		if (!event.inputType.startsWith('insert') || event.data === null) {
			return;
		}

		if (event.inputType === 'insertFromPaste' || event.inputType === 'insertFromDrop') {
			return;
		}

		if (/\D/.test(event.data) || props.value.replace(/\D/g, '').length >= 4) {
			event.preventDefault();
		}
	};

	const handleInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
		const input = event.currentTarget;
		const display = formatCardExpiryInput(input.value, props.value);

		if (props.value !== display) {
			props.onValueChange(display);
		}

		input.value = display;
		input.setSelectionRange(display.length, display.length);
	};

	return (
		<TextField
			autocomplete='cc-exp'
			class={props.class}
			disabled={props.disabled}
			error={props.error}
			hint={props.hint}
			inputMode='numeric'
			label={props.label ?? 'Срок'}
			maxLength={5}
			optional={props.optional}
			placeholder='ММ/ГГ'
			type='text'
			value={props.value}
			onBeforeInput={handleBeforeInput}
			onInput={handleInput}
		/>
	);
}
```

```ts
// card-expiry-field/index.ts
export type { CardExpiryFieldProps } from './card-expiry-field';
export { CardExpiryField } from './card-expiry-field';
```

В `shared/ui/index.ts` добавить (алфавитно, после `button`/перед `color-picker`):

```ts
export type { CardExpiryFieldProps } from './card-expiry-field';
export { CardExpiryField } from './card-expiry-field';
export type { CardNumberFieldProps } from './card-number-field';
export { CardNumberField } from './card-number-field';
```

- [ ] **Step 3: Проверка**

Run: `pnpm --filter @i-finances/web typecheck && pnpm lint`
Expected: PASS. Поведение полей проверяется визуально в Task 10.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/shared/ui
git commit -m "feat(web): masked card number and expiry fields"
```

---

### Task 4: Компонент `CardFace`

**Files:**
- Create: `apps/web/src/shared/ui/card-face/card-face.tsx`, `card-face.module.scss`, `index.ts`
- Modify: `apps/web/src/shared/ui/index.ts`

**Interfaces:**
- Produces:

```ts
export type CardFaceSize = 'full' | 'mini';
export type CardFaceProps = {
	color: string;            // HEX цвета счёта
	number: string;           // уже отформатированная строка (маска или превью)
	class?: string;
	expired?: boolean;
	expiry?: string;
	holder?: string;
	label?: string;           // aria-label (карта несёт информацию, дублирующую поля формы/шапку)
	size?: CardFaceSize;      // по умолчанию 'full'
	title?: string;
};
```

Размеры по макету: `mini` — 92×58 px (шапка счёта), `full` — ширина 100% контейнера, пропорция 1.586 (превью в форме, контейнер сам задаёт ширину: 190 px на десктопе, ≤ 240 px на мобильном).

- [ ] **Step 1: Implement**

```tsx
// card-face.tsx
import css from './card-face.module.scss';

import { cn } from '@/shared/lib';

import { Show } from 'solid-js';

export type CardFaceSize = 'full' | 'mini';

export type CardFaceProps = {
	color: string;
	number: string;
	class?: string;
	expired?: boolean;
	expiry?: string;
	holder?: string;
	label?: string;
	size?: CardFaceSize;
	title?: string;
};

/**
 * Payment-card visual tinted with the account colour.
 */
export function CardFace(props: CardFaceProps) {
	const isMini = () => props.size === 'mini';

	return (
		<div
			aria-label={props.label}
			class={cn(css.root, isMini() ? css.sizeMini : css.sizeFull, props.class)}
			role={props.label ? 'img' : undefined}
			style={{ '--account-color': props.color }}
		>
			<Show when={!isMini() && props.title}>
				<span class={css.title}>{props.title}</span>
			</Show>
			<Show when={isMini()}>
				<svg
					aria-hidden='true'
					class={css.chip}
					fill='none'
					height='14'
					stroke='currentColor'
					stroke-linecap='round'
					stroke-linejoin='round'
					stroke-width='2'
					viewBox='0 0 24 24'
					width='14'
				>
					<rect height='14' rx='2.5' width='19' x='2.5' y='5'/>
					<path d='M2.5 10h19'/>
				</svg>
			</Show>
			<span class={css.number}>{props.number}</span>
			<span class={css.footer}>
				<Show when={!isMini()}>
					<span class={css.holder}>{props.holder}</span>
				</Show>
				<Show when={props.expiry}>
					<span class={cn(css.expiry, props.expired && css.expiryExpired)}>
						{props.expiry}
					</span>
				</Show>
			</span>
		</div>
	);
}
```

```scss
// card-face.module.scss
@use "@/shared/styles/functions" as fn;

.root {
    --card-face-color: var(--account-color, var(--color-primary));

    display: flex;
    flex-direction: column;
    justify-content: space-between;

    box-sizing: border-box;

    color: var(--color-text-inverse);

    background-color: var(--card-face-color);

    font-variant-numeric: tabular-nums;
}

.size-full {
    aspect-ratio: 1.586 / 1;
    inline-size: 100%;
    padding: var(--space-5) var(--space-6);
    border-radius: var(--radius-lg);

    .title {
        overflow: hidden;

        font-size: var(--font-size-label);
        font-weight: var(--font-weight-semibold);
        text-overflow: ellipsis;
        white-space: nowrap;

        opacity: 0.9;
    }

    .number {
        font-size: var(--font-size-body-lg);
        font-weight: var(--font-weight-semibold);
        letter-spacing: 0.06em;
    }

    .footer {
        display: flex;
        gap: var(--space-4);
        justify-content: space-between;

        font-size: var(--font-size-label);
        font-weight: var(--font-weight-semibold);
    }
}

.size-mini {
    flex: none;
    inline-size: fn.rem(92);
    block-size: fn.rem(58);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);

    .number,
    .footer {
        font-size: fn.rem(8.5);
        font-weight: var(--font-weight-semibold);
    }

    .footer {
        display: flex;
        justify-content: flex-end;
    }
}

.expiry-expired {
    padding-inline: var(--space-3);
    border-radius: var(--radius-round);

    color: var(--color-danger);

    background-color: var(--color-danger-soft);
}
```

Если stylelint (`pnpm lint`) ругается на порядок свойств или `.size-*` вложенность — `pnpm lint:fix` и проверить diff; смысл стилей менять нельзя.

```ts
// index.ts
export type { CardFaceProps, CardFaceSize } from './card-face';
export { CardFace } from './card-face';
```

Экспорт в `shared/ui/index.ts` (перед `card-number-field`):

```ts
export type { CardFaceProps, CardFaceSize } from './card-face';
export { CardFace } from './card-face';
```

- [ ] **Step 2: Проверка**

Run: `pnpm --filter @i-finances/web typecheck && pnpm lint`
Expected: PASS (визуально — в Task 10)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/shared/ui
git commit -m "feat(web): card face visual in mini and full sizes"
```

---

### Task 5: Клиент — загрузка полного счёта

**Files:**
- Modify: `apps/web/src/features/accounts/api/account-client.ts`
- Modify: `apps/web/src/entities/account/api/account.client.ts`, `apps/web/src/entities/account/api/index.ts`
- Modify: `apps/web/tests/account-client.test.ts`

**Interfaces:**
- Consumes: `persistedAccountFullSchema` (Stage 1)
- Produces: `AccountClient.getFull(id: string): Promise<PersistedAccountFull>`; `getAccountFull(id: string): Promise<PersistedAccountFull>` — **обычная функция, не `query`**: полный номер не должен оседать в кеше роутера.

- [ ] **Step 1: Write the failing test** (добавить в `describe('AccountClient')`)

```ts
it('loads one account with full card details', async () => {
	const fullAccount = {
		...account,
		details: { cardNumber: '4111111111111111', cardNumberLast4: '1111', expiry: '08/27' },
		owner: 'Сергей'
	};
	const fetcher: typeof globalThis.fetch = async (input, init) => {
		expect(input).toBe('/api/accounts/account%2Fmain');
		expect(init?.method).toBe('GET');

		return new Response(JSON.stringify(fullAccount), {
			headers: { 'content-type': 'application/json' },
			status: 200
		});
	};
	const client = new AccountClient({ fetcher });

	await expect(client.getFull('account/main')).resolves.toEqual(fullAccount);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @i-finances/web test -- account-client`
Expected: FAIL — `client.getFull is not a function`

- [ ] **Step 3: Implement**

В `account-client.ts`: импортировать `persistedAccountFullSchema` из контрактов и добавить метод после `list`:

```ts
public getFull(id: string) {
	return this.client.get(
		`/api/accounts/${encodeURIComponent(id)}`,
		persistedAccountFullSchema
	);
}
```

В `entities/account/api/account.client.ts` добавить:

```ts
/**
 * Not a router `query`: the response carries the full card number, which must
 * not be cached next to the account list.
 */
export function getAccountFull(id: string) {
	return client.getFull(id);
}
```

и экспортировать `getAccountFull` из `entities/account/api/index.ts` (добавить в блок `export { … } from './account.client'`).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @i-finances/web test -- account-client && pnpm --filter @i-finances/web typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/accounts apps/web/src/entities/account apps/web/tests/account-client.test.ts
git commit -m "feat(web): load a single account with full details"
```

---

### Task 6: Черновик формы карты ⇄ контракт

**Files:**
- Create: `apps/web/src/features/account-details/model/card-draft.ts`
- Test: `apps/web/tests/card-draft.test.ts`

**Interfaces:**
- Consumes: `formatCardNumberInput` (Task 1)
- Produces:
  - `type AccountDetailsDraft = Record<string, string>` (в `account-details-descriptor.ts`, Task 7; здесь используем локально `Record<string, string>`)
  - `createCardDraft(details: unknown): Record<string, string>` — из `GET /:id` (`{ cardNumber: string | null, expiry: string | null }`; прочее/`undefined` → пустой черновик)
  - `cardDraftToInput(draft: Record<string, string>): Record<string, string | null>` — `{ cardNumber: цифры | null, expiry: 'MM/YY' | null }` в форме `cardAccountDetailsInputSchema`
  - `hasCardDraftData(draft: Record<string, string>): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/tests/card-draft.test.ts
import {
	cardDraftToInput,
	createCardDraft,
	hasCardDraftData
} from '@/features/account-details/model/card-draft';

import { describe, expect, it } from 'vitest';

describe('card draft', () => {
	it('creates an empty draft from nothing', () => {
		expect(createCardDraft(undefined)).toEqual({ cardNumber: '', expiry: '' });
		expect(createCardDraft({ cardNumber: null, expiry: null })).toEqual({ cardNumber: '', expiry: '' });
	});

	it('formats stored values for the inputs', () => {
		expect(createCardDraft({ cardNumber: '4111111111111111', expiry: '08/27' }))
			.toEqual({ cardNumber: '4111 1111 1111 1111', expiry: '08/27' });
	});

	it('converts the draft to contract input with nulls for empty fields', () => {
		expect(cardDraftToInput({ cardNumber: '4111 1111 1111 1111', expiry: '08/27' }))
			.toEqual({ cardNumber: '4111111111111111', expiry: '08/27' });
		expect(cardDraftToInput({ cardNumber: '', expiry: '' }))
			.toEqual({ cardNumber: null, expiry: null });
	});

	it('detects whether the draft holds anything', () => {
		expect(hasCardDraftData({ cardNumber: '', expiry: '' })).toBe(false);
		expect(hasCardDraftData({ cardNumber: '', expiry: '08/27' })).toBe(true);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @i-finances/web test -- card-draft`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

```ts
// apps/web/src/features/account-details/model/card-draft.ts
import { formatCardNumberInput } from '@/shared/lib';

import { cardAccountDetailsFullSchema, extractCardDigits } from '@i-finances/contracts';

const EMPTY_DRAFT = { cardNumber: '', expiry: '' } as const;

/**
 * Builds form inputs from `GET /api/accounts/:id` details; anything unexpected becomes an empty draft.
 */
export function createCardDraft(details: unknown): Record<string, string> {
	const parsed = cardAccountDetailsFullSchema.safeParse(details);

	if (!parsed.success) {
		return { ...EMPTY_DRAFT };
	}

	return {
		cardNumber: formatCardNumberInput(parsed.data.cardNumber ?? ''),
		expiry: parsed.data.expiry ?? ''
	};
}

/**
 * Converts input strings to the `cardAccountDetailsInputSchema` shape; empty means `null`.
 */
export function cardDraftToInput(draft: Record<string, string>): Record<string, string | null> {
	const digits = extractCardDigits(draft.cardNumber ?? '');
	const expiry = draft.expiry ?? '';

	return {
		cardNumber: digits === '' ? null : digits,
		expiry: expiry === '' ? null : expiry
	};
}

export function hasCardDraftData(draft: Record<string, string>): boolean {
	return (draft.cardNumber ?? '') !== '' || (draft.expiry ?? '') !== '';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @i-finances/web test -- card-draft`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/account-details apps/web/tests/card-draft.test.ts
git commit -m "feat(web): card details draft conversions"
```

---

### Task 7: Дескриптор, реестр, секция формы и мини-карта в шапке

**Files:**
- Create: `apps/web/src/features/account-details/model/account-details-descriptor.ts`
- Create: `apps/web/src/features/account-details/model/account-details-registry.ts`
- Create: `apps/web/src/features/account-details/ui/card/card-details-form-section.tsx`, `card-details-form-section.module.scss`
- Create: `apps/web/src/features/account-details/ui/card/card-header-visual.tsx`
- Create: `apps/web/src/features/account-details/index.ts`

**Interfaces:**
- Consumes: Tasks 1–6, `CardFace`, `CardNumberField`, `CardExpiryField`, `Account` (entities), `AccountTypeValue`
- Produces:

```ts
export type AccountDetailsDraft = Record<string, string>;

export type AccountDetailsFormSectionProps = {
	accentColor: string;                 // цвет счёта для превью
	disabled: boolean;
	draft: AccountDetailsDraft;
	errors: Record<string, string> | undefined;   // полная карта fieldErrors ('details.cardNumber' → …)
	holder: string;                      // owner из формы
	title: string;                       // название счёта из формы
	onChange: (draft: AccountDetailsDraft) => void;
};

export type AccountDetailsHeaderVisualProps = {
	account: Account;
	fallback: JSX.Element;               // обычная плитка-иконка, если показывать нечего
};

export type AccountDetailsDescriptor = {
	FormSection: Component<AccountDetailsFormSectionProps>;
	HeaderVisual: Component<AccountDetailsHeaderVisualProps>;
	createDraft: (details: unknown) => AccountDetailsDraft;
	hasData: (draft: AccountDetailsDraft) => boolean;
	toInput: (draft: AccountDetailsDraft) => Record<string, string | null>;
};

export const ACCOUNT_DETAILS_REGISTRY: Record<AccountTypeValue, AccountDetailsDescriptor | null>;
```

- [ ] **Step 1: Дескриптор (тип)**

```ts
// account-details-descriptor.ts
import type { Account } from '@/entities/account';

import type { Component, JSX } from 'solid-js';

export type AccountDetailsDraft = Record<string, string>;

export type AccountDetailsFormSectionProps = {
	accentColor: string;
	disabled: boolean;
	draft: AccountDetailsDraft;
	errors: Record<string, string> | undefined;
	holder: string;
	title: string;
	onChange: (draft: AccountDetailsDraft) => void;
};

export type AccountDetailsHeaderVisualProps = {
	account: Account;
	fallback: JSX.Element;
};

/**
 * Everything the UI needs to edit and show one account type's details.
 */
export type AccountDetailsDescriptor = {
	FormSection: Component<AccountDetailsFormSectionProps>;
	HeaderVisual: Component<AccountDetailsHeaderVisualProps>;
	createDraft: (details: unknown) => AccountDetailsDraft;
	hasData: (draft: AccountDetailsDraft) => boolean;
	toInput: (draft: AccountDetailsDraft) => Record<string, string | null>;
};
```

- [ ] **Step 2: Секция формы карты (превью слева, поля справа; на мобильном превью сверху)**

```tsx
// ui/card/card-details-form-section.tsx
import css from './card-details-form-section.module.scss';

import { formatCardNumberPreview } from '@/shared/lib';
import { CardExpiryField } from '@/shared/ui/card-expiry-field';
import { CardFace } from '@/shared/ui/card-face';
import { CardNumberField } from '@/shared/ui/card-number-field';

import { extractCardDigits } from '@i-finances/contracts';

import type { AccountDetailsFormSectionProps } from '../../model/account-details-descriptor';

/**
 * Card number and expiry inputs with a live card preview.
 */
export function CardDetailsFormSection(props: AccountDetailsFormSectionProps) {
	const cardNumber = () => props.draft.cardNumber ?? '';
	const expiry = () => props.draft.expiry ?? '';

	const handleCardNumberChange = (value: string) => {
		props.onChange({ ...props.draft, cardNumber: value });
	};

	const handleExpiryChange = (value: string) => {
		props.onChange({ ...props.draft, expiry: value });
	};

	return (
		<section aria-label='Реквизиты карты' class={css.section}>
			<CardFace
				class={css.preview}
				color={props.accentColor}
				expiry={expiry() || 'ММ/ГГ'}
				holder={props.holder}
				number={formatCardNumberPreview(extractCardDigits(cardNumber()))}
				title={props.title}
			/>
			<div class={css.fields}>
				<CardNumberField
					disabled={props.disabled}
					error={props.errors?.['details.cardNumber']}
					optional
					value={cardNumber()}
					onValueChange={handleCardNumberChange}
				/>
				<CardExpiryField
					class={css.expiryField}
					disabled={props.disabled}
					error={props.errors?.['details.expiry']}
					optional
					value={expiry()}
					onValueChange={handleExpiryChange}
				/>
			</div>
		</section>
	);
}
```

```scss
// ui/card/card-details-form-section.module.scss
@use "@/shared/styles/functions" as fn;
@use "@/shared/styles/mixins" as mx;

.section {
    display: grid;
    gap: var(--space-5);
    padding: var(--space-5);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);

    background-color: var(--color-canvas);

    @include mx.media-mn(600) {
        grid-template-columns: fn.rem(190) minmax(0, 1fr);
        align-items: center;
        gap: var(--space-7);
    }
}

.preview {
    justify-self: center;
    max-inline-size: fn.rem(240);

    @include mx.media-mn(600) {
        justify-self: stretch;
        max-inline-size: none;
    }
}

.fields {
    display: grid;
    gap: var(--space-4);
    min-inline-size: 0;
}

.expiry-field {
    max-inline-size: fn.rem(140);
}
```

(Размеры из утверждённого макета: превью 190 px / ≤ 240 px на мобильном, поле срока ≤ 130–140 px. Превью-карта показывает полный набираемый номер: это форма редактирования.)

- [ ] **Step 3: Мини-карта в шапке (B1)**

```tsx
// ui/card/card-header-visual.tsx
import { isCardExpired, maskCardNumberShort } from '@/shared/lib';
import { CardFace } from '@/shared/ui/card-face';

import { cardAccountDetailsViewSchema } from '@i-finances/contracts';

import { Show } from 'solid-js';

import type { AccountDetailsHeaderVisualProps } from '../../model/account-details-descriptor';

/**
 * Header badge for a card account: mini card with last four digits and expiry.
 * Falls back to the regular icon tile when the card has no details yet.
 */
export function CardHeaderVisual(props: AccountDetailsHeaderVisualProps) {
	const details = () => {
		const parsed = cardAccountDetailsViewSchema.safeParse(props.account.details);

		return parsed.success ? parsed.data : undefined;
	};
	const isExpired = () => {
		const expiry = details()?.expiry;

		return expiry ? isCardExpired(expiry, new Date()) : false;
	};
	const label = () => {
		const current = details();

		if (!current) {
			return undefined;
		}

		const parts = [
			current.cardNumberLast4 ? `Карта ${maskCardNumberShort(current.cardNumberLast4)}` : 'Карта',
			current.expiry ? `действует до ${current.expiry}` : undefined,
			isExpired() ? 'срок истёк' : undefined
		];

		return parts.filter(Boolean).join(', ');
	};

	return (
		<Show
			fallback={props.fallback}
			when={details()?.cardNumberLast4 || details()?.expiry}
		>
			<CardFace
				color={props.account.color}
				expired={isExpired()}
				expiry={details()?.expiry ?? undefined}
				label={label()}
				number={maskCardNumberShort(details()?.cardNumberLast4 ?? null)}
				size='mini'
			/>
		</Show>
	);
}
```

- [ ] **Step 4: Реестр и публичный вход**

```ts
// account-details-registry.ts
import type { AccountTypeValue } from '@/shared/lib';

import { CardDetailsFormSection } from '../ui/card/card-details-form-section';
import { CardHeaderVisual } from '../ui/card/card-header-visual';

import type { AccountDetailsDescriptor } from './account-details-descriptor';
import { cardDraftToInput, createCardDraft, hasCardDraftData } from './card-draft';

const cardDescriptor: AccountDetailsDescriptor = {
	FormSection: CardDetailsFormSection,
	HeaderVisual: CardHeaderVisual,
	createDraft: createCardDraft,
	hasData: hasCardDraftData,
	toInput: cardDraftToInput
};

/**
 * Exhaustive over account types: adding a type fails the build until it is listed.
 * `null` means the type has no type-specific fields.
 */
export const ACCOUNT_DETAILS_REGISTRY: Record<AccountTypeValue, AccountDetailsDescriptor | null> = {
	card: cardDescriptor,
	cash: null,
	other: null,
	savings: null
};
```

```ts
// features/account-details/index.ts
export type {
	AccountDetailsDescriptor,
	AccountDetailsDraft,
	AccountDetailsFormSectionProps,
	AccountDetailsHeaderVisualProps
} from './model/account-details-descriptor';
export { ACCOUNT_DETAILS_REGISTRY } from './model/account-details-registry';
```

Импорты в реестре отсортировать по `simple-import-sort` (`pnpm lint:fix`).

- [ ] **Step 5: Проверка**

Run: `pnpm --filter @i-finances/web typecheck && pnpm --filter @i-finances/web test && pnpm lint`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): account details registry with card form section and header badge"
```

---

### Task 8: `AccountDialog` — слот деталей через реестр

**Files:**
- Modify: `apps/web/src/views/home/ui/account-dialog/account-dialog.tsx`

**Interfaces:**
- Consumes: `ACCOUNT_DETAILS_REGISTRY`, `AccountDetailsDraft`
- Produces: новые поля пропсов `initialDetails?: unknown`, `detailsStatus?: 'failed' | 'loading' | 'ready'`; в `AccountDialogValue` — `details?: Record<string, string | null>`.

- [ ] **Step 1: Изменения** (в порядке: импорты → типы → сигналы → хелперы → обработчики → эффект → JSX)

Импорты: `import { ACCOUNT_DETAILS_REGISTRY, type AccountDetailsDraft } from '@/features/account-details';` (блок `@/features` — после `@/shared/ui/*`, по правилам сортировки), `import { Dynamic } from 'solid-js/web';`, `Show` уже импортирован.

Типы:

```ts
export type AccountDetailsStatus = 'failed' | 'loading' | 'ready';

export type AccountDialogValue = {
	// ...существующие поля (+ owner из Stage 1)...
	details?: Record<string, string | null>;
};

export type AccountDialogProps = {
	// ...существующие...
	detailsStatus?: AccountDetailsStatus;
	initialDetails?: unknown;
};
```

В компоненте (после существующих сигналов):

```ts
const [detailsDrafts, setDetailsDrafts] = createSignal<Partial<Record<AccountTypeValue, AccountDetailsDraft>>>({});

const detailsDescriptor = () => ACCOUNT_DETAILS_REGISTRY[accountType()];
const isDetailsLoading = () => props.detailsStatus === 'loading';
const isFormDisabled = () => Boolean(props.loading) || isDetailsLoading();
const currentDraft = (): AccountDetailsDraft => (
	detailsDrafts()[accountType()] ?? detailsDescriptor()?.createDraft(undefined) ?? {}
);
const hasInitialDetailsToLose = () => {
	const initial = props.initialValue;
	const descriptor = initial ? ACCOUNT_DETAILS_REGISTRY[initial.type] : null;

	return isEditMode()
		&& initial !== undefined
		&& initial.type !== accountType()
		&& descriptor !== null
		&& descriptor.hasData(descriptor.createDraft(props.initialDetails));
};
```

Обработчик:

```ts
const handleDraftChange = (draft: AccountDetailsDraft) => {
	setDetailsDrafts((drafts) => ({ ...drafts, [accountType()]: draft }));
};
```

В `handleSubmit` в `onSubmit({…})` добавить:

```ts
details: detailsDescriptor()?.toInput(currentDraft()),
```

В `createEffect` (уже сбрасывает поля при открытии) добавить в конец:

```ts
const initialType = value.type;
const initialDescriptor = ACCOUNT_DETAILS_REGISTRY[initialType];

setDetailsDrafts(initialDescriptor ? { [initialType]: initialDescriptor.createDraft(props.initialDetails) } : {});
```

(Эффект читает `props.initialDetails`, поэтому пересоздаёт черновик, когда реквизиты догрузились; пока `detailsStatus === 'loading'`, форма `disabled` и пользователь ничего не успел изменить.)

JSX: после `TextField` «Кому принадлежит» (Stage 1) и до блока «Начальный баланс»:

```tsx
<Show when={hasInitialDetailsToLose()}>
	<p class={css.formFieldFull} role='status'>
		Реквизиты карты будут удалены при сохранении.
	</p>
</Show>

<Show keyed when={detailsDescriptor()}>
	{(descriptor) => (
		<div class={css.formFieldFull}>
			<Dynamic
				accentColor={accountColor()}
				component={descriptor.FormSection}
				disabled={isFormDisabled()}
				draft={currentDraft()}
				errors={props.fieldErrors}
				holder={accountOwner().trim()}
				title={accountName().trim()}
				onChange={handleDraftChange}
			/>
		</div>
	)}
</Show>
```

`fieldset disabled={props.loading}` → `disabled={isFormDisabled()}`. Блок ошибки: после существующего `props.error` добавить

```tsx
<Show when={props.detailsStatus === 'failed'}>
	<p class={css.error} role='alert'>
		Не удалось загрузить реквизиты счёта. Закройте окно и повторите попытку.
	</p>
</Show>
```

Кнопка отправки: `disabled={!accountName().trim() || props.detailsStatus === 'failed'}`, `loading={props.loading || isDetailsLoading()}`.

Стиль статуса «будут удалены»: в `account-dialog.module.scss` добавить

```scss
.details-warning {
    font-size: var(--font-size-body-sm);
    color: var(--color-warning);
}
```

и использовать `class={cn(css.formFieldFull, css.detailsWarning)}` для `<p role='status'>`.

- [ ] **Step 2: Проверка**

Run: `pnpm --filter @i-finances/web typecheck && pnpm lint`
Expected: PASS (page.tsx ещё не передаёт новые пропсы — они необязательные).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/views/home/ui/account-dialog
git commit -m "feat(web): account dialog renders type details through the registry"
```

---

### Task 9: Страница — загрузка реквизитов и мини-карта в шапке

**Files:**
- Modify: `apps/web/src/views/home/page.tsx`
- Modify: `apps/web/src/views/home/home.module.scss`

**Interfaces:**
- Consumes: `getAccountFull` (Task 5), `ACCOUNT_DETAILS_REGISTRY`, новые пропсы диалога (Task 8)

- [ ] **Step 1: Состояние и загрузка** (рядом с `editingAccount`, ~строка 231)

```ts
const [editingAccountDetails, setEditingAccountDetails] = createSignal<unknown>();
const [accountDetailsStatus, setAccountDetailsStatus] = createSignal<AccountDetailsStatus>('ready');
```

Импорты: `getAccountFull` в блок `@/entities/account/api`; `type AccountDetailsStatus` из `./ui/account-dialog`(добавить реэкспорт в `account-dialog/index.ts`); `ACCOUNT_DETAILS_REGISTRY` из `@/features/account-details`; `Dynamic` из `solid-js/web` (если ещё не импортирован).

Заменить `handleOpenCreateAccountDialog`/`handleOpenEditAccountDialog`:

```ts
const loadAccountDetails = async (account: PersistedAccount) => {
	if (ACCOUNT_DETAILS_REGISTRY[account.type] === null) {
		setAccountDetailsStatus('ready');
		return;
	}

	setAccountDetailsStatus('loading');

	try {
		const fullAccount = await getAccountFull(account.id);

		if (editingAccount()?.id !== account.id || !isAccountDialogOpen()) {
			return;
		}

		// The full response carries the current version; the form must send that one.
		setEditingAccount(fullAccount);
		setEditingAccountDetails(fullAccount.details);
		setAccountDetailsStatus('ready');
	}
	catch {
		if (editingAccount()?.id === account.id) {
			setAccountDetailsStatus('failed');
		}
	}
};

const handleOpenCreateAccountDialog = () => {
	// ...существующее тело...
	setEditingAccountDetails(undefined);
	setAccountDetailsStatus('ready');
	setIsAccountDialogOpen(true);
};

const handleOpenEditAccountDialog = (account: PersistedAccount) => {
	// ...существующее тело до setIsAccountDialogOpen...
	setEditingAccountDetails(undefined);
	setIsAccountDialogOpen(true);
	void loadAccountDetails(account);
};
```

В `handleAccountDialogOpenChange` при `!open` дополнительно: `setEditingAccountDetails(undefined); setAccountDetailsStatus('ready');`.

В `submitAccount` добавить в `editableFields` строку `details: accountValue.details,` (рядом с `owner`) — payload прогоняется через `safeParse` (Stage 1), `details: undefined` для типов без реестра допустим.

В JSX `<AccountDialog …>` добавить пропсы:

```tsx
detailsStatus={accountDetailsStatus()}
initialDetails={editingAccountDetails()}
```

- [ ] **Step 2: Шапка счёта (B1)** — в блоке `account-heading` (~строка 1122) заменить `<AccountIcon …/>` на

```tsx
{(() => {
	const accountIcon = (
		<AccountIcon
			accountType={account.type}
			class={css.previewAccountIcon}
			style={getAccountItemStyle(account)}
		/>
	);
	const descriptor = ACCOUNT_DETAILS_REGISTRY[account.type];

	return descriptor
		? <Dynamic account={account} component={descriptor.HeaderVisual} fallback={accountIcon}/>
		: accountIcon;
})()}
```

и подпись `previewKicker`:

```tsx
<div class={css.previewKicker}>
	{account.owner ? `${accountTypeMeta.label} · ${account.owner}` : accountTypeMeta.label}
</div>
```

`.account-header` уже `flex-wrap: wrap` — мини-карта 92×58 не ломает перенос на мобильном; отдельных стилей не нужно. Если визуальная проверка (Task 10) покажет, что `.account-heading` сжимает карту — добавить `flex: none` (в `CardFace` mini уже есть).

- [ ] **Step 3: Проверка**

Run: `pnpm --filter @i-finances/web typecheck && pnpm --filter @i-finances/web test && pnpm lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): load card details for editing and show mini card in account header"
```

---

### Task 10: Визуальная и функциональная проверка в браузере

Обязательна по правилам проекта (CSS без реального просмотра «готовым» не считается). Запуск: `cp data/i-finances.sqlite data/i-finances.dev.sqlite && DATABASE_URL=./data/i-finances.dev.sqlite pnpm dev` (боевую БД не трогать). Использовать Claude in Chrome / skill `run`, снять скриншоты.

- [ ] **Step 1: Десктоп (≥ 1280 px).** Создать счёт-карту «Тест» с владельцем «Сергей», номером `4111 1111 1111 1111`, сроком `08/27`:
  - маска номера: буквы не вводятся, группы по 4, вставка `4111-1111-1111-1111` форматируется, 17-я цифра игнорируется;
  - маска срока: `5` → `05/`, backspace удаляет `/`, `13/27` после сохранения подсвечивает ошибку у поля срока (fieldErrors `details.expiry`);
  - номер с опечаткой `4111 1111 1111 1112` → ошибка под полем номера, а не общее «Не удалось сохранить»;
  - превью меняется по мере ввода; заголовок превью — название счёта, внизу владелец и срок;
  - после сохранения в шапке вместо плитки-иконки мини-карта `•••• 1111` + `08/27`, подпись `КАРТА · СЕРГЕЙ`; в сайдбаре `Карта · Сергей`;
  - в devtools → Network: `GET /api/accounts` не содержит 16-значного номера, `GET /api/accounts/:id` содержит.
- [ ] **Step 2: Редактирование.** Открыть карандаш у карты: пока грузится — поля disabled; затем номер и срок предзаполнены; сохранить без изменений — версия увеличилась, детали на месте. Сменить тип на «Наличные» — появилось «Реквизиты карты будут удалены при сохранении», секции реквизитов нет; вернуть «Карта» — черновик сохранился.
- [ ] **Step 3: Истёкший срок.** Сохранить срок `03/26` — мини-карта: срок в красной пилюле; `aria-label` содержит «срок истёк».
- [ ] **Step 4: Карта без реквизитов и счёт «Наличные»** — в шапке обычная плитка-иконка, форма без секции реквизитов.
- [ ] **Step 5: Мобильный (390 px).** Превью над полями (≤ 240 px), поле срока не растягивается, мини-карта в шапке не ломает перенос заголовка и баланса, диалог прокручивается, кнопки доступны. Тёмная тема (`data-theme="dark"`): карта и красная пилюля читаемы.
- [ ] **Step 6: Оценка «на вкус»** (не только «сработало ли»): отступы вокруг мини-карты в шапке, выравнивание с заголовком, высота шапки с картой vs без. Правки — отдельными коммитами.

---

### Task 11: Финальная проверка этапа

- [ ] **Step 1:** `pnpm typecheck && pnpm test && pnpm lint` — зелёное.
- [ ] **Step 2:** `git diff --stat master...HEAD -- apps/api/drizzle` — пусто (этап 2 не трогает миграции).
- [ ] **Step 3:** Выкатка по процедуре из памяти «Деплой i-finances» (бэкап через контейнер `backup`, публикация `if-web`); этап 2 меняет только web.
- [ ] **Step 4:** Обновить Ticket Board (через `ArtifactData`) по правилам из памяти `task-dashboard-artifact.md`, если для фичи заведены карточки.
