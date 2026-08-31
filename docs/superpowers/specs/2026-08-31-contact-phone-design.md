# Contact Phone Number Design

## Problem

Contacts have no phone field. Users need an optional phone on create/edit, with country-specific input masks (Belarus and Russia first), storing a raw international string in SQLite.

## Goal

1. Add nullable `phone` on contacts (`+375…`, `+7…`).
2. Provide a scalable phone mask stack in `~/shared` (registry + pure helpers + Solid `PhoneField`).
3. Wire phone only into `ContactDialog` (not cards / summary).
4. Validation: empty → `null`; incomplete/invalid mask → field error; complete → save E.164-like string.

## Non-goals (v1)

- Showing phone on contact cards or summary dialogs
- Full 201-country catalog / flag sprite (as in [international-phone-number](https://github.com/StarkElessar/international-phone-number))
- `imask` / `@solid-primitives/input-mask` / libphonenumber
- SMS, dial links, or duplicate-phone uniqueness

## Approach

**Custom lightweight mask** (no third-party mask lib), inspired by the IPN data model:

- Country select + masked input
- Registry entries: `code`, `label`, `prefix`, `mask`
- Persist `prefix + nationalDigits` (no spaces/punctuation)

v1 registry: **BY** and **RU** only; adding a country later is a registry entry (+ optional UI label).

## Data model

| Layer | Change |
|-------|--------|
| DB | `contacts.phone` `text` nullable |
| `Contact` / `PersistedContact` | `phone: string \| null` |
| Create/update input | `phone` optional/nullable |
| Mapper | map `phone` through |

Stored format examples: `+375297266821`, `+79431233223`.

## Validation rules

| Input state | Result |
|-------------|--------|
| Empty / whitespace-only | `null` (OK) |
| Digits entered but mask incomplete or not matching selected country length | Field validation error |
| Complete for selected country | Save `toE164(digits, country)` |

Server must re-validate: after normalize, value is either `null` or matches an allowed country (prefix + exact national digit count from registry). Reject unknown prefixes / wrong length.

## Shared phone library (`~/shared/lib/phone`)

Framework-agnostic:

- `PHONE_COUNTRIES` / `listPhoneCountries` / `getPhoneCountry`
- Mask token: `9` = digit; other chars are literals
- BY: `prefix +375`, `mask (99) 999-99-99` (9 national digits)
- RU: `prefix +7`, `mask (999) 999-99-99` (10 national digits)
- `extractPhoneDigits`, `formatPhoneInput`, `isPhoneComplete`, `toE164`
- `resolvePhoneCountry(e164)` — longest matching `prefix`; fallback `by`
- Save helper used by dialog / zod-friendly normalize

Caret: best-effort restore on input; acceptable v1 fallback is placing caret after last digit.

## UI (`~/shared/ui/phone-field`)

- Country select (BY / RU) + tel input
- Controlled: country + display value; form submits E.164 via helpers
- Changing country clears national digits and applies new mask/placeholder
- Default country on create: **BY**
- Edit: resolve country from stored phone, fill formatted national part
- Styles consistent with `TextField`; dialog-only placement

## Contact dialog

- Extend `ContactDialogValue` with `phone: string | null`
- Label «Телефон», optional
- On submit: empty → `null`; incomplete → `fieldErrors.phone`; complete → E.164 string

## Layers to touch

- Schema + Drizzle migration
- Entity types, contract, mappers, repository, use-cases, tests
- `PhoneField` + contact dialog wiring
- Unit tests for phone helpers; contract/service tests for null / valid / invalid

## Scalability

New country = add registry item (`code`, `label`, `prefix`, `mask`). Select renders from `listPhoneCountries()`. No change to storage shape. Flags/search UI can come later without changing E.164 persistence.
