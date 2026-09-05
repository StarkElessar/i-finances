import { ACCENT_COLORS, AccentColor, type AccentColorValue } from './accent-color';

export abstract class AccountColor {
	static readonly AMBER = AccentColor.AMBER;

	static readonly BLUE = AccentColor.BLUE;

	static readonly GREEN = AccentColor.GREEN;

	static readonly ROSE = AccentColor.ROSE;

	static readonly SLATE = AccentColor.SLATE;

	static readonly VIOLET = AccentColor.VIOLET;

	static values(): AccountColorValue[] {
		return [...ACCOUNT_COLORS];
	}

	static isAccountColor(value: string): value is AccountColorValue {
		return ACCENT_COLORS.includes(value as AccountColorValue);
	}
}

export const ACCOUNT_COLORS = ACCENT_COLORS;

export type AccountColorValue = AccentColorValue;
