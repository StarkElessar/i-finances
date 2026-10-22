import { formatDayWithYear, formatDeadline, formatTimeLeft, getInitials } from '@/shared/lib';

import { HouseholdLossNoticeStore } from '@/entities/viewer/model/household-loss-notice-store';

import { formatDayCount } from '@/features/household/model/format-day-count';

import { describe, expect, it } from 'vitest';

const MINSK = { timeZone: 'Europe/Minsk' };

describe('formatDeadline', () => {
	it('writes day, month and time as the boards do', () => {
		expect(formatDeadline('2026-10-25T18:04:00.000Z', MINSK)).toBe('25 октября, 21:04');
		expect(formatDeadline('2026-10-24T06:30:00.000Z', MINSK)).toBe('24 октября, 09:30');
	});

	it('gives nothing for what is not a date', () => {
		expect(formatDeadline('not a date')).toBeUndefined();
	});
});

describe('formatDayWithYear', () => {
	it('writes the day with the year and no «г.»', () => {
		expect(formatDayWithYear('2026-10-18T18:04:00.000Z', MINSK)).toBe('18 октября 2026');
		expect(formatDayWithYear('2026-03-03T09:00:00.000Z', MINSK)).toBe('3 марта 2026');
	});

	it('gives nothing for what is not a date', () => {
		expect(formatDayWithYear('')).toBeUndefined();
	});
});

describe('formatTimeLeft', () => {
	const now = Date.parse('2026-10-18T18:04:00.000Z');

	it('writes days and hours for a fresh invitation', () => {
		expect(formatTimeLeft('2026-10-25T17:04:00.000Z', now)).toBe('6 д 23 ч');
		expect(formatTimeLeft('2026-10-24T06:30:00.000Z', now)).toBe('5 д 12 ч');
	});

	it('writes hours and minutes under a day and minutes under an hour', () => {
		expect(formatTimeLeft('2026-10-18T23:14:00.000Z', now)).toBe('5 ч 10 мин');
		expect(formatTimeLeft('2026-10-18T18:16:00.000Z', now)).toBe('12 мин');
	});

	it('gives nothing for a moment that has passed or is under a minute away', () => {
		expect(formatTimeLeft('2026-10-18T18:04:00.000Z', now)).toBeUndefined();
		expect(formatTimeLeft('2026-10-18T18:04:30.000Z', now)).toBeUndefined();
		expect(formatTimeLeft('2026-10-17T18:04:00.000Z', now)).toBeUndefined();
		expect(formatTimeLeft('nonsense', now)).toBeUndefined();
	});
});

describe('formatDayCount', () => {
	it.each([
		[1, '1 день'],
		[2, '2 дня'],
		[4, '4 дня'],
		[5, '5 дней'],
		[7, '7 дней'],
		[11, '11 дней'],
		[14, '14 дней'],
		[21, '21 день'],
		[22, '22 дня']
	])('writes %i as «%s»', (days, text) => {
		expect(formatDayCount(days)).toBe(text);
	});
});

describe('getInitials', () => {
	it('takes the first letters of the first two words', () => {
		expect(getInitials('Алексей Иванов')).toBe('АИ');
		expect(getInitials('anna maria kowalska')).toBe('AM');
	});

	it('takes two letters of a single word', () => {
		expect(getInitials('Анна')).toBe('АН');
	});

	it('falls back to ID for no name', () => {
		expect(getInitials('')).toBe('ID');
		expect(getInitials('   ')).toBe('ID');
		expect(getInitials(null)).toBe('ID');
		expect(getInitials(undefined)).toBe('ID');
	});
});

describe('HouseholdLossNoticeStore', () => {
	function createStorage() {
		const values = new Map<string, string>();

		return {
			getItem: (key: string) => values.get(key) ?? null,
			removeItem: (key: string) => {
				values.delete(key);
			},
			setItem: (key: string, value: string) => {
				values.set(key, value);
			}
		};
	}

	it('keeps the name of the lost household until it is cleared', () => {
		const store = new HouseholdLossNoticeStore(createStorage());

		expect(store.read()).toBeUndefined();

		store.save('Семья');
		expect(store.read()).toBe('Семья');

		store.clear();
		expect(store.read()).toBeUndefined();
	});

	it('survives a browser without storage', () => {
		const broken = {
			getItem: () => {
				throw new DOMException('blocked', 'SecurityError');
			},
			removeItem: () => {
				throw new DOMException('blocked', 'SecurityError');
			},
			setItem: () => {
				throw new DOMException('blocked', 'SecurityError');
			}
		};

		for (const store of [new HouseholdLossNoticeStore(broken), new HouseholdLossNoticeStore(undefined)]) {
			expect(() => store.save('Семья')).not.toThrow();
			expect(store.read()).toBeUndefined();
			expect(() => store.clear()).not.toThrow();
		}
	});
});
