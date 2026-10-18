import type { Accessor } from 'solid-js';
import { createSignal, onCleanup } from 'solid-js';

const NON_TEXT_INPUT_TYPES = ['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'];
const TEXT_INPUT_SELECTOR = [
	'textarea',
	'[contenteditable=""]',
	'[contenteditable="true"]',
	`input:not(${NON_TEXT_INPUT_TYPES.map((type) => `[type="${type}"]`).join(',')})`
].join(',');

function asTextField(target: EventTarget | null): HTMLElement | undefined {
	return target instanceof HTMLElement && target.matches(TEXT_INPUT_SELECTOR) ? target : undefined;
}

/**
 * True while a text field has focus, i.e. while the on-screen keyboard is
 * (most likely) open. The phone bottom navigation and the FAB hide on it
 * (mockup Kit-States). Browser-only, call it from component setup code.
 */
export function useTextInputFocus(): Accessor<boolean> {
	const [isFocused, setIsFocused] = createSignal(false);
	let focusedField: HTMLElement | undefined;

	// WebKit fires no `focusout` when the focused field leaves the DOM (the search row
	// closes, a sheet unmounts after a tap on a button that Safari does not focus), so
	// while a field has focus its removal is watched separately.
	const removalObserver = new MutationObserver(() => {
		if (focusedField && !focusedField.isConnected) {
			track(undefined);
		}
	});
	const track = (field: HTMLElement | undefined) => {
		focusedField = field;
		removalObserver.disconnect();

		if (field) {
			removalObserver.observe(document.body, { childList: true, subtree: true });
		}

		setIsFocused(Boolean(field));
	};
	const handleFocusIn = (event: FocusEvent) => track(asTextField(event.target));
	const handleFocusOut = () => track(undefined);

	track(asTextField(document.activeElement));
	document.addEventListener('focusin', handleFocusIn);
	document.addEventListener('focusout', handleFocusOut);
	onCleanup(() => {
		document.removeEventListener('focusin', handleFocusIn);
		document.removeEventListener('focusout', handleFocusOut);
		removalObserver.disconnect();
	});

	return isFocused;
}
