export const SERIES_SLOT_COUNT = 8;

export type SeriesSlotMap = Record<string, number>;

/**
 * Keeps each charted series on the colour slot it already had, so a filter
 * change never repaints the survivors; newcomers take the lowest free slot.
 */
export function assignSeriesSlots(chartedIds: readonly string[], previous: SeriesSlotMap): SeriesSlotMap {
	const next: SeriesSlotMap = {};

	for (const id of chartedIds) {
		if (Object.hasOwn(previous, id)) {
			next[id] = previous[id];
		}
	}

	for (const id of chartedIds) {
		if (Object.hasOwn(next, id)) {
			continue;
		}

		const used = new Set(Object.values(next));
		const free = Array.from({ length: SERIES_SLOT_COUNT }, (_, slot) => slot).find((slot) => !used.has(slot));

		if (free !== undefined) {
			next[id] = free;
		}
	}

	return next;
}
