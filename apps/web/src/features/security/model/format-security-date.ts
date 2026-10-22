const LOCALE = 'ru-RU';

function isSameDay(left: Date, right: Date): boolean {
	return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

/**
 * A moment as a date without time, the way the «Безопасность» board writes it: «сегодня», «17 октября», and with the
 * year («12 сентября 2026») when it is not this year or when `withYear` asks for it. An unreadable value gives `null`,
 * so a bad date never prints «Invalid Date».
 */
export function formatSecurityDay(value: string, now: Date, options: { withYear?: boolean } = {}): string | null {
	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return null;
	}

	if (isSameDay(date, now)) {
		return 'сегодня';
	}

	const withYear = options.withYear === true || date.getFullYear() !== now.getFullYear();

	return new Intl.DateTimeFormat(LOCALE, {
		day: 'numeric',
		month: 'long',
		year: withYear ? 'numeric' : undefined
	}).format(date).replace(/\s*г\.$/, '');
}

export function capitalizeFirst(value: string): string {
	return value.length === 0 ? value : `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
