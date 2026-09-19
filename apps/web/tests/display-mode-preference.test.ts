import {
	readStoredDisplayModePreference,
	resolveDisplayMode,
	writeStoredDisplayModePreference
} from '@/shared/lib/display-mode-preference';

import { describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'i-finances:test-display-mode';

function createFakeStorage(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));

	return {
		getItem: vi.fn((key: string) => store.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			store.set(key, value);
		})
	};
}

describe('readStoredDisplayModePreference', () => {
	it('defaults to auto when nothing is stored', () => {
		const storage = createFakeStorage();

		expect(readStoredDisplayModePreference(storage, STORAGE_KEY)).toBe('auto');
	});

	it('defaults to auto for an unrecognized stored value', () => {
		const storage = createFakeStorage({ [STORAGE_KEY]: 'garbage' });

		expect(readStoredDisplayModePreference(storage, STORAGE_KEY)).toBe('auto');
	});

	it.each(['table', 'list'] as const)('returns the stored %s preference', (stored) => {
		const storage = createFakeStorage({ [STORAGE_KEY]: stored });

		expect(readStoredDisplayModePreference(storage, STORAGE_KEY)).toBe(stored);
	});

	it('reads independent values for different storage keys', () => {
		const storage = createFakeStorage({
			'i-finances:test-display-mode:a': 'table',
			'i-finances:test-display-mode:b': 'list'
		});

		expect(readStoredDisplayModePreference(storage, 'i-finances:test-display-mode:a')).toBe('table');
		expect(readStoredDisplayModePreference(storage, 'i-finances:test-display-mode:b')).toBe('list');
	});
});

describe('writeStoredDisplayModePreference', () => {
	it('writes under the given storage key', () => {
		const storage = createFakeStorage();

		writeStoredDisplayModePreference(storage, STORAGE_KEY, 'list');

		expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEY, 'list');
	});
});

describe('resolveDisplayMode', () => {
	it('follows the viewport when preference is auto', () => {
		expect(resolveDisplayMode('auto', true)).toBe('table');
		expect(resolveDisplayMode('auto', false)).toBe('list');
	});

	it('ignores the viewport once the user picked a mode explicitly', () => {
		expect(resolveDisplayMode('table', false)).toBe('table');
		expect(resolveDisplayMode('list', true)).toBe('list');
	});
});
