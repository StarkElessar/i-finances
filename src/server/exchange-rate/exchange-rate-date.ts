const BELARUS_TIME_ZONE = 'Europe/Minsk';

/**
 * Formats the Belarus-local calendar date used by NBRB daily rates.
 */
export function formatBelarusLocalDateKey(date: Date): string {
    const parts = new Intl.DateTimeFormat('en', {
        day: '2-digit',
        month: '2-digit',
        timeZone: BELARUS_TIME_ZONE,
        year: 'numeric'
    }).formatToParts(date);

    return [
        getDatePart(parts, 'year'),
        getDatePart(parts, 'month'),
        getDatePart(parts, 'day')
    ].join('-');
}

function getDatePart(
    parts: Intl.DateTimeFormatPart[],
    type: Intl.DateTimeFormatPartTypes
): string {
    const part = parts.find((item) => item.type === type);

    if (part === undefined) {
        throw new Error(`Missing date part: ${type}`);
    }

    return part.value;
}
