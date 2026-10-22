/** «1 день», «2 дня», «7 дней»: a whole number of days with the Russian plural. */
export function formatDayCount(days: number): string {
	const lastTwo = days % 100;
	const last = days % 10;

	if (lastTwo >= 11 && lastTwo <= 14) {
		return `${days} дней`;
	}

	if (last === 1) {
		return `${days} день`;
	}

	return last >= 2 && last <= 4 ? `${days} дня` : `${days} дней`;
}
