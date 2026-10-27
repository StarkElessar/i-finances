/**
 * Shows a `YYYY-MM-DD` key as `DD.MM.YYYY` without going through `Date`, so the day cannot shift with the time zone.
 */
export function formatDateKey(dateKey: string): string {
	const [year, month, day] = dateKey.split('-');

	return year && month && day ? `${day}.${month}.${year}` : dateKey;
}
