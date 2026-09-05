export abstract class AccentColor {
	static readonly AMBER = '#a15c00' as const;

	static readonly BLUE = '#3f77a8' as const;

	static readonly GREEN = '#147a50' as const;

	static readonly ROSE = '#c82d4d' as const;

	static readonly SLATE = '#526078' as const;

	static readonly VIOLET = '#6b5bd2' as const;

	static values(): AccentColorValue[] {
		return [...ACCENT_COLORS];
	}

	static isAccentColor(value: string): value is AccentColorValue {
		return ACCENT_COLORS.includes(value as AccentColorValue);
	}
}

export const ACCENT_COLORS = [
	AccentColor.BLUE,
	AccentColor.GREEN,
	AccentColor.AMBER,
	AccentColor.ROSE,
	AccentColor.VIOLET,
	AccentColor.SLATE
] as const;

export type AccentColorValue = typeof ACCENT_COLORS[number];
