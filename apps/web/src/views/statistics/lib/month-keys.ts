function toParts(monthKey: string): [number, number] {
	const [year, month] = monthKey.split('-').map(Number);

	return [year, month];
}

function fromIndex(index: number): string {
	const year = Math.floor(index / 12);
	const month = (index % 12) + 1;

	return `${year}-${String(month).padStart(2, '0')}`;
}

function toIndex(monthKey: string): number {
	const [year, month] = toParts(monthKey);

	return year * 12 + (month - 1);
}

export function addMonths(monthKey: string, delta: number): string {
	return fromIndex(toIndex(monthKey) + delta);
}

export function countMonths(from: string, to: string): number {
	return toIndex(to) - toIndex(from) + 1;
}

export function listMonthKeys(from: string, to: string): string[] {
	const length = countMonths(from, to);

	return length > 0 ? Array.from({ length }, (_, offset) => addMonths(from, offset)) : [];
}
