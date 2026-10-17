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

		// A non-empty selection is replaced by the typed text, so the length cap only applies without one.
		const hasSelection = event.currentTarget.selectionStart !== event.currentTarget.selectionEnd;
		const isFull = props.value.replace(/\D/g, '').length >= 4;

		if (/\D/.test(event.data) || (isFull && !hasSelection)) {
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
