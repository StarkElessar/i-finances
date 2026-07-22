import { describe, expect, it } from 'vitest';

import { formatDate } from '../../../src/shared/lib';

describe('formatDate', () => {
    it('formats date with weekday, month name and compact year suffix', () => {
        expect(formatDate(new Date(Date.UTC(2026, 6, 22, 12)), { timeZone: 'Europe/Minsk' }))
            .toBe('среда, 22 июля 2026г.');
    });

    it('accepts timestamps and date strings', () => {
        expect(formatDate(Date.UTC(2026, 6, 22, 12), { timeZone: 'Europe/Minsk' }))
            .toBe('среда, 22 июля 2026г.');
        expect(formatDate('2026-07-22T12:00:00.000Z', { timeZone: 'Europe/Minsk' }))
            .toBe('среда, 22 июля 2026г.');
    });
});
