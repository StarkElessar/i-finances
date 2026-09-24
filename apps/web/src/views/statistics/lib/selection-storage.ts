import type { BreakdownDimension } from '@/entities/operation';

import type { SeriesSlotMap } from './series-slots';

export type StoredComparison = {
	ids: string[];
	slots: SeriesSlotMap;
};

const EMPTY: StoredComparison = { ids: [], slots: {} };

function storageKey(by: BreakdownDimension): string {
	return `i-finances:statistics-compare:${by}`;
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isSlotMap(value: unknown): value is SeriesSlotMap {
	return typeof value === 'object' && value !== null
		&& Object.values(value).every((slot) => Number.isInteger(slot));
}

export function readStoredComparison(storage: Pick<Storage, 'getItem'>, by: BreakdownDimension): StoredComparison {
	try {
		const parsed: unknown = JSON.parse(storage.getItem(storageKey(by)) ?? 'null');

		if (typeof parsed !== 'object' || parsed === null) {
			return EMPTY;
		}

		const { ids, slots } = parsed as { ids?: unknown; slots?: unknown };

		return {
			ids: isStringArray(ids) ? ids : [],
			slots: isSlotMap(slots) ? slots : {}
		};
	}
	catch {
		return EMPTY;
	}
}

export function writeStoredComparison(
	storage: Pick<Storage, 'setItem'>,
	by: BreakdownDimension,
	value: { ids: readonly string[]; slots: SeriesSlotMap }
): void {
	try {
		storage.setItem(storageKey(by), JSON.stringify(value));
	}
	catch {
		// Storage can be unavailable (private mode, quota); the page works without it.
	}
}
