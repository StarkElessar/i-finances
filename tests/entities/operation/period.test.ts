import { describe, expect, it } from 'vitest';

import { parseLocalDateKey, tryParseLocalDateKey } from '~/entities/operation';

describe('local operation date parsing', () => {
    it('parses a valid local date at noon', () => {
        const date = tryParseLocalDateKey('2026-07-23');

        expect(date).toEqual(new Date(2026, 6, 23, 12));
    });

    it('does not throw for an empty date field value', () => {
        expect(tryParseLocalDateKey('')).toBeUndefined();
    });

    it('rejects a date that does not exist in the calendar', () => {
        expect(tryParseLocalDateKey('2026-02-31')).toBeUndefined();
        expect(() => parseLocalDateKey('2026-02-31'))
            .toThrow('Invalid local date key: 2026-02-31');
    });
});
