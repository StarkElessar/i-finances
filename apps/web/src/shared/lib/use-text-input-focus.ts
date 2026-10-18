import type { Accessor } from 'solid-js';
import { createSignal, onCleanup } from 'solid-js';

const NON_TEXT_INPUT_TYPES = ['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'];
const TEXT_INPUT_SELECTOR = [
	'textarea',
	'[contenteditable=""]',
	'[contenteditable="true"]',
	`input:not(${NON_TEXT_INPUT_TYPES.map((type) => `[type="${type}"]`).join(',')})`
].join(',');

/**
 * True while a text field has focus, i.e. while the on-screen keyboard is
 * (most likely) open. The phone bottom navigation and the FAB hide on it
 * (mockup Kit-States). Browser-only, call it from component setup code.
 */
export function useTextInputFocus(): Accessor<boolean> {
	const [isFocused, setIsFocused] = createSignal(
		document.activeElement instanceof HTMLElement && document.activeElement.matches(TEXT_INPUT_SELECTOR)
	);
	const handleFocusIn = (event: FocusEvent) => {
		setIsFocused(event.target instanceof HTMLElement && event.target.matches(TEXT_INPUT_SELECTOR));
	};
	const handleFocusOut = () => setIsFocused(false);

	document.addEventListener('focusin', handleFocusIn);
	document.addEventListener('focusout', handleFocusOut);
	onCleanup(() => {
		document.removeEventListener('focusin', handleFocusIn);
		document.removeEventListener('focusout', handleFocusOut);
	});

	return isFocused;
}
