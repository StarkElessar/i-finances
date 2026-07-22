export type FormatDateInput = Date | number | string;

export type FormatDateOptions = {
    locale?: string | string[];
    timeZone?: string;
};

const DATE_PARTS = ['weekday', 'day', 'month', 'year'] as const;

type DatePartType = (typeof DATE_PARTS)[number];

export function formatDate(date: FormatDateInput, options: FormatDateOptions = {}): string {
    const {
        locale = 'ru-BY',
        timeZone
    } = options;
    const dateValue = typeof date === 'string' ? new Date(date) : date;
    const instance = new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'long',
        timeZone,
        weekday: 'long',
        year: 'numeric'
    });
    const parts = instance.formatToParts(dateValue);
    const dateParts = getDateParts(parts);

    return `${dateParts.weekday}, ${dateParts.day} ${dateParts.month} ${dateParts.year}г.`;
}

function getDateParts(parts: Intl.DateTimeFormatPart[]): Record<DatePartType, string> {
    return DATE_PARTS.reduce<Record<DatePartType, string>>(
        (result, type) => {
            const part = parts.find((datePart) => datePart.type === type);

            if (!part) {
                throw new Error(`Missing date part: ${type}`);
            }

            result[type] = part.value;

            return result;
        },
        {
            day: '',
            month: '',
            weekday: '',
            year: ''
        }
    );
}
