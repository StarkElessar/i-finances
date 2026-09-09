# Телефон у контакта — план реализации

> **Для агентов:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans`. Шаги с чекбоксами (`- [ ]`).

**Цель:** опциональный телефон у контакта с масками BY/RU, хранение сырого `+…` в SQLite, своя лёгкая маска в `~/shared`.

**Архитектура:** реестр стран + чистые хелперы в `~/shared/lib/phone`; Solid `PhoneField` в `~/shared/ui`; колонка `contacts.phone`; валидация в zod-контракте и диалоге.

**Стек:** Solid 1.9, Zod 4, Drizzle/SQLite, Vitest. Без `imask` / libphonenumber.

**Spec:** `docs/superpowers/specs/2026-08-31-contact-phone-design.md`

## Глобальные ограничения

- Табы; top-level — `function`; краткий JSDoc
- Порядок в Solid-компоненте: state/memos → handlers → effects → return
- Пусто → `null`; неполная маска → ошибка поля; полная → E.164
- UI только в `ContactDialog`; default country `by`
- Коммиты только по просьбе пользователя

---

## Карта файлов

| Файл | Ответственность |
|------|-----------------|
| `src/shared/lib/phone/types.ts` | типы страны / кода |
| `src/shared/lib/phone/countries.ts` | реестр BY, RU |
| `src/shared/lib/phone/format.ts` | format / extract / complete / e164 / resolve |
| `src/shared/lib/phone/normalize.ts` | normalize для save/zod |
| `src/shared/lib/phone/index.ts` | публичный API |
| `src/shared/lib/index.ts` | реэкспорт |
| `tests/shared/lib/phone.test.ts` | unit-тесты хелперов |
| `src/shared/ui/phone-field/*` | селект + masked input |
| `src/server/db/schema/contacts.ts` + drizzle migration | колонка `phone` |
| entity/server contact layers | типы, contract, mappers, repo, use-cases |
| `src/views/contacts/ui/contact-dialog/*` | поле в форме |
| `src/views/contacts/page.tsx` | `toDialogValue` + submit |

---

### Task 1: Shared phone helpers (TDD)

**Files:**
- Create: `src/shared/lib/phone/types.ts`, `countries.ts`, `format.ts`, `normalize.ts`, `index.ts`
- Modify: `src/shared/lib/index.ts`
- Create: `tests/shared/lib/phone.test.ts`

**Interfaces:**
- `PhoneCountryCode = 'by' | 'ru'`
- `PhoneCountry = { code, label, prefix, mask }` — BY `+375` / `(99) 999-99-99`; RU `+7` / `(999) 999-99-99`
- `listPhoneCountries()`, `getPhoneCountry(code)`, `DEFAULT_PHONE_COUNTRY_CODE = 'by'`
- `extractPhoneDigits(input: string): string`
- `countMaskDigitSlots(mask: string): number` (кол-во `9`)
- `formatPhoneInput(digits: string, country): string`
- `isPhoneComplete(digits, country): boolean`
- `toE164(digits, country): string` — только если complete, иначе throw или использовать только после check
- `resolvePhoneCountry(e164: string): PhoneCountryCode` — longest prefix; иначе `by`
- `parseStoredPhone(e164: string | null): { countryCode, digits, display } | { countryCode: 'by', digits: '', display: '' }`
- `normalizePhoneForSave(displayOrEmpty: string, countryCode): { ok: true, phone: string | null } | { ok: false, message: string }`
  - пусто → `{ ok: true, phone: null }`
  - неполное → `{ ok: false, message: 'Введите номер полностью.' }`
  - полное → `{ ok: true, phone: toE164(...) }`

- [ ] **Step 1:** Написать failing tests (format BY/RU, complete, e164, resolve `+375…`→`by` / `+7…`→`ru`, normalize empty/partial/full)

- [ ] **Step 2:** `pnpm test -- tests/shared/lib/phone.test.ts` — ожидать FAIL

- [ ] **Step 3:** Реализовать модуль и реэкспорт из `~/shared/lib`

- [ ] **Step 4:** Тесты PASS

Пример format (идея):

```ts
export function formatPhoneInput(digits: string, country: PhoneCountry): string {
	let digitIndex = 0;
	let result = '';

	for (const char of country.mask) {
		if (digitIndex >= digits.length) {
			break;
		}

		if (char === '9') {
			result += digits[digitIndex]!;
			digitIndex += 1;
			continue;
		}

		result += char;
	}

	return result;
}
```

`extractPhoneDigits` — только `[0-9]` из строки (без prefix страны в display; prefix живёт в селекте).

---

### Task 2: `PhoneField` UI

**Files:**
- Create: `src/shared/ui/phone-field/phone-field.tsx`, `phone-field.module.scss`, `index.ts`
- Modify: `src/shared/ui/index.ts`

**Interfaces:**
```ts
export type PhoneFieldProps = {
	label?: string;
	error?: string;
	optional?: boolean;
	disabled?: boolean;
	countryCode: PhoneCountryCode;
	value: string; // display (national formatted)
	onCountryCodeChange: (code: PhoneCountryCode) => void;
	onValueChange: (display: string) => void;
};
```

- [ ] **Step 1:** Компонент: `<select>` стран из `listPhoneCountries()` + `TextField`/`input type="tel"` с маской на `onInput`
- [ ] **Step 2:** Смена страны → `onCountryCodeChange` + `onValueChange('')`
- [ ] **Step 3:** Input: `extractPhoneDigits` → truncate до slot count → `formatPhoneInput` → `onValueChange`; caret best-effort (fallback: конец)
- [ ] **Step 4:** Placeholder = mask; `startContent` или соседний select с кодом `BY`/`RU` и prefix в label опционально (`Беларусь (+375)`)
- [ ] **Step 5:** Стили mobile-first через mixins; eslint/typecheck на файлы

---

### Task 3: DB schema + migration

**Files:**
- Modify: `src/server/db/schema/contacts.ts` — `phone: text('phone')`
- Generate: `pnpm db:generate`
- Apply locally: `pnpm db:migrate`

- [ ] **Step 1:** Добавить колонку в schema
- [ ] **Step 2:** `pnpm db:generate`
- [ ] **Step 3:** `pnpm db:migrate`
- [ ] **Step 4:** Убедиться, что `ContactRecord` включает `phone: string | null`

---

### Task 4: Entity + server wiring

**Files:**
- Modify: `src/entities/contact/model/types.ts` — `phone: string | null`
- Modify: `src/entities/contact/api/contact.contract.ts` — schema для phone
- Modify: `src/entities/contact/model/normalization.ts` (опционально thin wrapper) или использовать `normalizePhoneForSave` / server-side `assertValidStoredPhone`
- Modify: mappers, `ContactUpdateValues`, create/update use-cases, repository update values
- Modify: `tests/server/contact/contact-service.test.ts` (+ contract tests при наличии)

**Zod (идея):**

```ts
const contactPhoneSchema = z.union([z.string(), z.null()])
	.transform((value) => {
		if (value === null) return null;
		const trimmed = value.trim();
		return trimmed.length === 0 ? null : trimmed;
	})
	.pipe(
		z.union([
			z.null(),
			z.string().refine(isValidStoredPhone, 'Укажите корректный номер телефона.')
		])
	);
```

`isValidStoredPhone(value)`: `resolvePhoneCountry` + prefix match + `isPhoneComplete(nationalDigits, country)`.

- [ ] **Step 1:** Failing service/contract tests: create with `null`, valid `+375…`, invalid `+37512` → error
- [ ] **Step 2:** Прокинуть `phone` во все слои
- [ ] **Step 3:** Тесты PASS + `pnpm typecheck`

---

### Task 5: ContactDialog + page

**Files:**
- Modify: `contact-dialog.tsx` / types
- Modify: `contacts/page.tsx` (`toDialogValue`, submit payload)

- [ ] **Step 1:** `ContactDialogValue.phone: string | null`
- [ ] **Step 2:** Signals: `phoneCountryCode`, `phoneDisplay`; при open — из `initialValue.phone` через `parseStoredPhone`
- [ ] **Step 3:** Вставить `<PhoneField … />` после названия / перед цветом
- [ ] **Step 4:** Submit: `normalizePhoneForSave(phoneDisplay(), phoneCountryCode())` → если `!ok` set local field error / не вызывать onSubmit; если ok — `phone` в value
- [ ] **Step 5:** Preview `createPreviewContact` включает `phone`
- [ ] **Step 6:** `toDialogValue` на page передаёт `contact.phone`
- [ ] **Step 7:** typecheck + eslint

---

### Task 6: Verification

- [ ] `pnpm test -- tests/shared/lib/phone.test.ts tests/server/contact/contact-service.test.ts`
- [ ] `pnpm typecheck`
- [ ] Вручную: создать контакт с BY-номером; edit; сменить на RU и ввести; пустой телефон → null; неполный → ошибка

---

## Покрытие spec

| Требование | Task |
|------------|------|
| Nullable phone в БД/DTO | 3, 4 |
| Реестр BY/RU + хелперы | 1 |
| PhoneField + селект | 2 |
| Только ContactDialog | 5 |
| empty/incomplete/complete | 1, 4, 5 |
| Без imask / без карточек | — |
| Масштабируемый реестр | 1, 2 |
