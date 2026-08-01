export type ClassValue =
	| string
	| number
	| false
	| null
	| undefined
	| ClassValue[]
	| Record<string, boolean | null | undefined>;

export function cn(...values: ClassValue[]): string {
	const classes: string[] = [];

	const append = (value: ClassValue): void => {
		if (!value) {
			return;
		}

		if (typeof value === 'string' || typeof value === 'number') {
			classes.push(String(value));
			return;
		}

		if (Array.isArray(value)) {
			value.forEach(append);
			return;
		}

		for (const [className, enabled] of Object.entries(value)) {
			if (enabled) {
				classes.push(className);
			}
		}
	};

	values.forEach(append);

	return classes.join(' ');
}
