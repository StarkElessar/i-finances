// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Select } from './select';

let dispose = () => undefined as void;

afterEach(() => {
	dispose();
	document.body.replaceChildren();
});

describe('Select', () => {
	it('keeps native selection, accessible name and form submission; emits string values', () => {
		const onChange = vi.fn();
		const form = document.createElement('form');
		document.body.append(form);
		dispose = render(() => {
			const [value, setValue] = createSignal('date');

			return (
				<Select
					label='Сортировка'
					name='sort'
					options={[{ value: 'date', label: 'По дате' }, { value: 'amount', label: 'По сумме (BYN)' }]}
					value={value()}
					onChange={(next) => {
						setValue(next);
						onChange(next);
					}}
				/>
			);
		}, form);
		const select = form.querySelector('select') as HTMLSelectElement;

		expect(select).toHaveRole('combobox');
		expect(select).toHaveAccessibleName('Сортировка');
		expect(select.value).toBe('date');
		select.value = 'amount';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		expect(onChange).toHaveBeenCalledExactlyOnceWith('amount');
		expect(new FormData(form).get('sort')).toBe('amount');
	});

	it('associates the error, preserves external descriptions and native required validation', () => {
		const form = document.createElement('form');
		document.body.append(form);
		dispose = render(() => (
			<>
				<span id='external'>Выберите доступный счёт.</span>
				<Select
					aria-describedby='external'
					error='Выберите счёт'
					hint='Подсказка уступает ошибке'
					id='account'
					label='Счёт'
					options={[{ value: '', label: 'Выберите счёт' }]}
					required
					value=''
				/>
			</>
		), form);
		const select = form.querySelector('select') as HTMLSelectElement;

		expect(select).toBeInvalid();
		expect(select).toBeRequired();
		expect(select).toHaveAccessibleDescription('Выберите доступный счёт. Выберите счёт');
		expect(form.checkValidity()).toBe(false);
	});

	it('supports controlled updates, disabled options and disabled form exclusion', () => {
		const form = document.createElement('form');
		const [value, setValue] = createSignal('cash');
		const [disabled, setDisabled] = createSignal(false);
		document.body.append(form);
		dispose = render(() => (
			<Select
				disabled={disabled()}
				label='Счёт'
				name='account'
				options={[{ value: 'cash', label: 'Наличные' }, { value: 'card', label: 'Карта', disabled: true }]}
				value={value()}
			/>
		), form);
		const select = form.querySelector('select') as HTMLSelectElement;

		setValue('card');
		expect(select.value).toBe('card');
		expect(select.options[1]).toBeDisabled();
		setDisabled(true);
		expect(select).toBeDisabled();
		expect(new FormData(form).has('account')).toBe(false);
	});

	it('keeps the controlled selection when options are replaced after a refresh', () => {
		const host = document.createElement('div');
		const [options, setOptions] = createSignal([
			{ value: 'cash', label: 'Наличные' },
			{ value: 'card', label: 'Карта' }
		]);
		document.body.append(host);
		dispose = render(() => <Select label='Счёт' options={options()} value='card'/>, host);
		const select = host.querySelector('select') as HTMLSelectElement;

		setOptions([{ value: 'cash', label: 'Наличные (BYN)' }, { value: 'card', label: 'Карта (BYN)' }]);
		expect(select.value).toBe('card');
	});
});
