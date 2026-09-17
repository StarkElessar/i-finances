import {
	OPERATIONS_DISPLAY_MODE_STORAGE_KEY,
	readStoredOperationsDisplayModePreference,
	resolveOperationsDisplayMode,
	writeStoredOperationsDisplayModePreference
} from '@/entities/operation/model/display-mode';

import { describe, expect, it, vi } from 'vitest';

function createFakeStorage(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));

	return {
		getItem: vi.fn((key: string) => store.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			store.set(key, value);
		})
	};
}

describe('readStoredOperationsDisplayModePreference', () => {
	it('defaults to auto when nothing is stored', () => {
		const storage = createFakeStorage();

		expect(readStoredOperationsDisplayModePreference(storage)).toBe('auto');
	});

	it('defaults to auto for an unrecognized stored value', () => {
		const storage = createFakeStorage({ [OPERATIONS_DISPLAY_MODE_STORAGE_KEY]: 'garbage' });

		expect(readStoredOperationsDisplayModePreference(storage)).toBe('auto');
	});

	it.each(['table', 'list'] as const)('returns the stored %s preference', (stored) => {
		const storage = createFakeStorage({ [OPERATIONS_DISPLAY_MODE_STORAGE_KEY]: stored });

		expect(readStoredOperationsDisplayModePreference(storage)).toBe(stored);
	});
});

describe('writeStoredOperationsDisplayModePreference', () => {
	it('writes under the shared storage key', () => {
		const storage = createFakeStorage();

		writeStoredOperationsDisplayModePreference(storage, 'list');

		expect(storage.setItem).toHaveBeenCalledWith(OPERATIONS_DISPLAY_MODE_STORAGE_KEY, 'list');
	});
});

describe('resolveOperationsDisplayMode', () => {
	it('follows the viewport when preference is auto', () => {
		expect(resolveOperationsDisplayMode('auto', true)).toBe('table');
		expect(resolveOperationsDisplayMode('auto', false)).toBe('list');
	});

	it('ignores the viewport once the user picked a mode explicitly', () => {
		expect(resolveOperationsDisplayMode('table', false)).toBe('table');
		expect(resolveOperationsDisplayMode('list', true)).toBe('list');
	});
});
