export type RovingTargetOptions = {
	/** Key from `KeyboardEvent.key`. */
	key: string;
	/** Index of the item that has focus now; -1 when none of the items has it. */
	current: number;
	/** `true` at the position of every item that cannot be focused. */
	disabled: readonly boolean[];
	/**
	 * Which arrow keys move the focus: `both` for a radiogroup (ArrowUp and ArrowDown work too),
	 * `horizontal` for a horizontal tablist, where vertical arrows must keep scrolling the page.
	 * Default `both`.
	 */
	axis?: 'horizontal' | 'both';
};

function resolveStep(key: string, axis: 'horizontal' | 'both'): -1 | 0 | 1 {
	if (key === 'ArrowRight' || (axis === 'both' && key === 'ArrowDown')) {
		return 1;
	}

	if (key === 'ArrowLeft' || (axis === 'both' && key === 'ArrowUp')) {
		return -1;
	}

	return 0;
}

/**
 * Index of the item that arrow keys, Home and End move to in a roving-tabindex group
 * (radiogroup, tablist): forward arrows go forward, backward arrows go back, both wrap
 * around, Home/End jump to the first and last item. Disabled items are skipped. When no item
 * has focus (`current` is out of range), a forward arrow goes to the first enabled item and a
 * backward arrow to the last one.
 * Returns `undefined` for any other key or when no item can take focus.
 */
export function resolveRovingTarget({ key, current, disabled, axis = 'both' }: RovingTargetOptions): number | undefined {
	const count = disabled.length;

	if (count === 0 || disabled.every(Boolean)) {
		return undefined;
	}

	if (key === 'Home') {
		return disabled.findIndex((isDisabled) => !isDisabled);
	}

	if (key === 'End') {
		return disabled.findLastIndex((isDisabled) => !isDisabled);
	}

	const step = resolveStep(key, axis);

	if (step === 0) {
		return undefined;
	}

	if (current < 0 || current >= count) {
		return step === 1
			? disabled.findIndex((isDisabled) => !isDisabled)
			: disabled.findLastIndex((isDisabled) => !isDisabled);
	}

	for (let offset = 1; offset <= count; offset += 1) {
		const index = (((current + step * offset) % count) + count) % count;

		if (!disabled[index]) {
			return index;
		}
	}

	return undefined;
}
