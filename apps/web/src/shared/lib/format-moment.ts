export type FormatMomentOptions = {
	timeZone?: string;
};

const LOCALE = 'ru-RU';

const MS_PER_MINUTE = 60_000;

const MINUTES_PER_HOUR = 60;

const HOURS_PER_DAY = 24;

function toDate(value: string | number | Date): Date | undefined {
	const date = new Date(value);

	return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * «25 октября, 21:04»: a deadline written as day, month and time (boards `Flow-Invite`, `M-Household`: «Действует до …»).
 * `undefined` for a value that is not a date.
 */
export function formatDeadline(value: string | number | Date, options: FormatMomentOptions = {}): string | undefined {
	const date = toDate(value);

	if (date === undefined) {
		return undefined;
	}

	const text = new Intl.DateTimeFormat(LOCALE, {
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		month: 'long',
		timeZone: options.timeZone
	}).format(date);

	// ru-RU joins the date and the time with «в»; the boards have a comma.
	return text.replace(' в ', ', ');
}

/**
 * «18 октября 2026»: a calendar day with the year (board `M-Household`: «с 18 октября 2026»). `undefined` for a value that
 * is not a date.
 */
export function formatDayWithYear(value: string | number | Date, options: FormatMomentOptions = {}): string | undefined {
	const date = toDate(value);

	if (date === undefined) {
		return undefined;
	}

	return new Intl.DateTimeFormat(LOCALE, {
		day: 'numeric',
		month: 'long',
		timeZone: options.timeZone,
		year: 'numeric'
	}).format(date).replace(/\s?г\.$/, '');
}

/**
 * «6 д 23 ч», «5 ч 10 мин», «12 мин»: how long until `expiresAt`, rounded down to the minute and written with the
 * two largest units (board `M-Household`: «Осталось 6 д 23 ч»). `undefined` for a value that is not a date and for a
 * moment that has passed.
 */
export function formatTimeLeft(expiresAt: string | number | Date, now: number): string | undefined {
	const date = toDate(expiresAt);

	if (date === undefined) {
		return undefined;
	}

	const minutesLeft = Math.floor((date.getTime() - now) / MS_PER_MINUTE);

	if (minutesLeft <= 0) {
		return undefined;
	}

	const days = Math.floor(minutesLeft / (MINUTES_PER_HOUR * HOURS_PER_DAY));
	const hours = Math.floor(minutesLeft / MINUTES_PER_HOUR) % HOURS_PER_DAY;
	const minutes = minutesLeft % MINUTES_PER_HOUR;

	if (days > 0) {
		return `${days} д ${hours} ч`;
	}

	if (hours > 0) {
		return `${hours} ч ${minutes} мин`;
	}

	return `${minutes} мин`;
}
