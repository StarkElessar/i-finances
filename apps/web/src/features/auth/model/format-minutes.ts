const pluralRules = new Intl.PluralRules('ru-RU');

/** «действует 1 минуту / 2 минуты / 10 минут», «через 5 минут». */
export function formatMinutesAccusative(minutes: number): string {
	const category = pluralRules.select(minutes);
	const word = category === 'one' ? 'минуту' : category === 'few' ? 'минуты' : 'минут';

	return `${minutes} ${word}`;
}

/** «больше 1 минуты / 2 минут / 10 минут» (21 минуты, 22 минут). */
export function formatMinutesGenitive(minutes: number): string {
	return `${minutes} ${pluralRules.select(minutes) === 'one' ? 'минуты' : 'минут'}`;
}
