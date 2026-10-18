import { resolveRovingTarget } from '@/shared/lib';

import { describe, expect, it } from 'vitest';

const none = [false, false, false, false];

describe('resolveRovingTarget', () => {
	it('moves forward on ArrowRight and ArrowDown, wrapping to the first item', () => {
		expect(resolveRovingTarget({ key: 'ArrowRight', current: 1, disabled: none })).toBe(2);
		expect(resolveRovingTarget({ key: 'ArrowDown', current: 1, disabled: none })).toBe(2);
		expect(resolveRovingTarget({ key: 'ArrowRight', current: 3, disabled: none })).toBe(0);
	});

	it('moves back on ArrowLeft and ArrowUp, wrapping to the last item', () => {
		expect(resolveRovingTarget({ key: 'ArrowLeft', current: 2, disabled: none })).toBe(1);
		expect(resolveRovingTarget({ key: 'ArrowUp', current: 2, disabled: none })).toBe(1);
		expect(resolveRovingTarget({ key: 'ArrowLeft', current: 0, disabled: none })).toBe(3);
	});

	it('jumps to the first and last item on Home and End', () => {
		expect(resolveRovingTarget({ key: 'Home', current: 2, disabled: none })).toBe(0);
		expect(resolveRovingTarget({ key: 'End', current: 1, disabled: none })).toBe(3);
	});

	it('skips disabled items', () => {
		const disabled = [true, false, true, false];

		expect(resolveRovingTarget({ key: 'ArrowRight', current: 1, disabled })).toBe(3);
		expect(resolveRovingTarget({ key: 'ArrowRight', current: 3, disabled })).toBe(1);
		expect(resolveRovingTarget({ key: 'ArrowLeft', current: 1, disabled })).toBe(3);
		expect(resolveRovingTarget({ key: 'Home', current: 3, disabled })).toBe(1);
		expect(resolveRovingTarget({ key: 'End', current: 1, disabled })).toBe(3);
	});

	it('stays on the only enabled item', () => {
		const disabled = [true, false, true];

		expect(resolveRovingTarget({ key: 'ArrowRight', current: 1, disabled })).toBe(1);
		expect(resolveRovingTarget({ key: 'ArrowLeft', current: 1, disabled })).toBe(1);
	});

	it('ignores other keys', () => {
		expect(resolveRovingTarget({ key: 'Enter', current: 1, disabled: none })).toBeUndefined();
		expect(resolveRovingTarget({ key: 'a', current: 1, disabled: none })).toBeUndefined();
	});

	it('returns undefined when nothing can take focus', () => {
		expect(resolveRovingTarget({ key: 'ArrowRight', current: 0, disabled: [true, true] })).toBeUndefined();
		expect(resolveRovingTarget({ key: 'Home', current: 0, disabled: [] })).toBeUndefined();
	});
});
