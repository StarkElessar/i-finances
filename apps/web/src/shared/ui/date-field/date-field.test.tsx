// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DateField } from './date-field';

let dispose = () => undefined as void;

afterEach(() => {
	dispose();
	document.body.replaceChildren();
});

describe('DateField', () => {
	it('preserves the native date input and emits YYYY-MM-DD or empty strings without timezone conversion', () => {
		const onChange = vi.fn();
		const form = document.createElement('form');
		document.body.append(form);
		dispose = render(() => {
			const [value, setValue] = createSignal('2026-10-18');

			return (
				<DateField
					label='Дата'
					name='date'
					value={value()}
					onChange={(next) => {
						setValue(next);
						onChange(next);
					}}
				/>
			);
		}, form);
		const input = form.querySelector('input') as HTMLInputElement;

		expect(input).toHaveAttribute('type', 'date');
		expect(input).toHaveAccessibleName('Дата');
		// Native date inputs have no implicit ARIA role. A textbox override would misrepresent the picker.
		expect(input).not.toHaveAttribute('role');
		expect(input.value).toBe('2026-10-18');
		input.value = '2026-11-01';
		input.dispatchEvent(new Event('change', { bubbles: true }));
		expect(onChange).toHaveBeenLastCalledWith('2026-11-01');
		expect(new FormData(form).get('date')).toBe('2026-11-01');
		input.value = '';
		input.dispatchEvent(new Event('change', { bubbles: true }));
		expect(onChange).toHaveBeenLastCalledWith('');
	});

	it('uses native min/max and required validation, and updates a controlled date', () => {
		const host = document.createElement('div');
		const [value, setValue] = createSignal('2026-10-18');
		document.body.append(host);
		dispose = render(() => <DateField label='Дата' max='2026-10-31' min='2026-10-01' required value={value()}/>, host);
		const input = host.querySelector('input') as HTMLInputElement;

		expect(input.checkValidity()).toBe(true);
		setValue('2026-09-30');
		expect(input.validity.rangeUnderflow).toBe(true);
		setValue('2026-11-01');
		expect(input.validity.rangeOverflow).toBe(true);
		setValue('');
		expect(input.validity.valueMissing).toBe(true);
	});

	it('announces the error, keeps supporting descriptions, and excludes disabled dates from the form', () => {
		const form = document.createElement('form');
		document.body.append(form);
		dispose = render(() => (
			<>
				<span id='external'>Дата операции.</span>
				<DateField
					aria-describedby='external'
					disabled
					error='Выберите дату'
					hint='Не показывать одновременно'
					label='Дата'
					name='date'
					value='2026-10-18'
				/>
			</>
		), form);
		const input = form.querySelector('input') as HTMLInputElement;

		expect(input).toBeDisabled();
		expect(input).toHaveAttribute('aria-invalid', 'true');
		expect(input).toHaveAccessibleDescription('Дата операции. Выберите дату');
		expect(new FormData(form).has('date')).toBe(false);
	});
});
