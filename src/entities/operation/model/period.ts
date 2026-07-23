import type { OperationDateRange, OperationPeriodMode } from './table-types';

export function getOperationPeriodRange(anchorDate: Date, mode: OperationPeriodMode): OperationDateRange {
    const startDate = startOfPeriod(anchorDate, mode);
    const endDate = new Date(startDate);

    if (mode === 'week') {
        endDate.setDate(endDate.getDate() + 6);
    }
    else if (mode === 'month') {
        endDate.setMonth(endDate.getMonth() + 1, 0);
    }
    else {
        endDate.setFullYear(endDate.getFullYear() + 1, 0, 0);
    }

    return {
        end: formatLocalDateKey(endDate),
        start: formatLocalDateKey(startDate)
    };
}

export function shiftOperationPeriod(
    anchorDate: Date,
    mode: OperationPeriodMode,
    offset: number
): Date {
    const shiftedDate = startOfPeriod(anchorDate, mode);

    if (mode === 'week') {
        shiftedDate.setDate(shiftedDate.getDate() + offset * 7);
    }
    else if (mode === 'month') {
        shiftedDate.setMonth(shiftedDate.getMonth() + offset);
    }
    else {
        shiftedDate.setFullYear(shiftedDate.getFullYear() + offset);
    }

    return shiftedDate;
}

export function canMoveToNextOperationPeriod(
    anchorDate: Date,
    mode: OperationPeriodMode,
    currentDate: Date
): boolean {
    const nextPeriod = shiftOperationPeriod(anchorDate, mode, 1);
    const currentPeriod = startOfPeriod(currentDate, mode);

    return nextPeriod.getTime() <= currentPeriod.getTime();
}

export function formatLocalDateKey(date: Date): string {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/**
 * Parses a date field value without throwing while the user is editing it.
 */
export function tryParseLocalDateKey(dateKey: string): Date | undefined {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);

    if (!match) {
        return undefined;
    }

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day, 12);

    if (
        date.getFullYear() !== year
        || date.getMonth() !== month
        || date.getDate() !== day
    ) {
        return undefined;
    }

    return date;
}

export function parseLocalDateKey(dateKey: string): Date {
    const date = tryParseLocalDateKey(dateKey);

    if (!date) {
        throw new Error(`Invalid local date key: ${dateKey}`);
    }

    return date;
}

function startOfPeriod(date: Date, mode: OperationPeriodMode): Date {
    const startDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);

    if (mode === 'week') {
        const mondayOffset = (startDate.getDay() + 6) % 7;

        startDate.setDate(startDate.getDate() - mondayOffset);
    }
    else if (mode === 'month') {
        startDate.setDate(1);
    }
    else {
        startDate.setMonth(0, 1);
    }

    return startDate;
}
