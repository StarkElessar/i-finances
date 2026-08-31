import css from './phone-field.module.scss';

import {
	countMaskDigitSlots,
	extractPhoneDigits,
	formatPhoneInput,
	getPhoneCountry,
	listPhoneCountries,
	type PhoneCountryCode,
	sanitizeNationalPhoneDigits
} from '~/shared/lib';
import { TextField } from '~/shared/ui/text-field';

import { For } from 'solid-js';

/**
 * Controlled phone field with country select and national mask.
 */
export type PhoneFieldProps = {
	countryCode: PhoneCountryCode;
	value: string;
	onCountryCodeChange: (code: PhoneCountryCode) => void;
	onValueChange: (display: string) => void;
	disabled?: boolean;
	error?: string;
	label?: string;
	optional?: boolean;
};

/**
 * Whether a value is a known phone country code from the registry.
 */
function isPhoneCountryCode(value: string): value is PhoneCountryCode {
	return listPhoneCountries().some((country) => country.code === value);
}

/**
 * Formats raw input into the national mask for the selected country.
 */
function formatRawPhoneInput(rawValue: string, countryCode: PhoneCountryCode): string {
	const selectedCountry = getPhoneCountry(countryCode);
	return formatPhoneInput(
		sanitizeNationalPhoneDigits(rawValue, selectedCountry),
		selectedCountry
	);
}

/**
 * Country select + masked tel input for scalable phone entry.
 */
export function PhoneField(props: PhoneFieldProps) {
	const country = () => getPhoneCountry(props.countryCode);
	const maxDigits = () => countMaskDigitSlots(country().mask);

	const handleCountryChange = (event: Event & { currentTarget: HTMLSelectElement }) => {
		const nextCode = event.currentTarget.value;

		if (!isPhoneCountryCode(nextCode) || nextCode === props.countryCode) {
			return;
		}

		props.onCountryCodeChange(nextCode);
		props.onValueChange('');
	};

	const handleBeforeInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
		if (!event.inputType.startsWith('insert') || event.data === null) {
			return;
		}

		// Paste/drop may include +, spaces, punctuation — onInput normalizes digits.
		if (
			event.inputType === 'insertFromPaste'
			|| event.inputType === 'insertFromDrop'
		) {
			return;
		}

		if (/\D/.test(event.data)) {
			event.preventDefault();
			return;
		}

		const currentDigits = extractPhoneDigits(props.value);

		if (currentDigits.length >= maxDigits()) {
			event.preventDefault();
		}
	};

	const handleInput = (event: InputEvent & { currentTarget: HTMLInputElement }) => {
		const input = event.currentTarget;
		const display = formatRawPhoneInput(input.value, props.countryCode);

		if (props.value !== display) {
			props.onValueChange(display);
		}

		// Controlled inputs skip DOM writes when the signal value is unchanged
		// (letters / overflow digits). Force-sync so the mask stays authoritative.
		input.value = display;
		const caret = display.length;
		input.setSelectionRange(caret, caret);
	};

	return (
		<TextField
			autocomplete='tel-national'
			disabled={props.disabled}
			error={props.error}
			inputMode='numeric'
			label={props.label ?? 'Телефон'}
			optional={props.optional}
			placeholder={country().mask}
			startContent={(
				<select
					aria-label='Страна телефона'
					class={css.countrySelect}
					disabled={props.disabled}
					value={props.countryCode}
					onChange={handleCountryChange}
				>
					<For each={[...listPhoneCountries()]}>
						{(item) => (
							<option value={item.code}>
								{item.code.toUpperCase()}
							</option>
						)}
					</For>
				</select>
			)}
			type='tel'
			value={props.value}
			onBeforeInput={handleBeforeInput}
			onInput={handleInput}
		/>
	);
}
