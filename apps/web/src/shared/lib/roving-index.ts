export type RovingTargetOptions = {
	/** Key from `KeyboardEvent.key`. */
	key: string;
	/** Index of the item that has focus now; -1 when none of the items has it. */
	current: number;
	/** `true` at the position of every item that cannot be focused. */
	disabled: readonly boolean[];
};

/**
 * Index of the item that arrow keys, Home and End move to in a roving-tabindex group
 * (radiogroup, tablist): forward arrows go forward, backward arrows go back, both wrap
 * around, Home/End jump to the first and last item. Disabled items are skipped. When no item
 * has focus (`current` is out of range), a forward arrow goes to the first enabled item and a
 * backward arrow to the last one.
 * Returns `undefined` for any other key or when no item can take focus.
 */
export function resolveRovingTarget({ key, current, disabled }: RovingTargetOptions): number | undefined {
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

	const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0;

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
