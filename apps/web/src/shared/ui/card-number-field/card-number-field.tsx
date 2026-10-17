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
