export abstract class AccountColor {
    static readonly AMBER = '#a15c00' as const;

    static readonly BLUE = '#3f77a8' as const;

    static readonly GREEN = '#147a50' as const;

    static readonly ROSE = '#c82d4d' as const;

    static readonly SLATE = '#526078' as const;

    static readonly VIOLET = '#6b5bd2' as const;

    static values(): AccountColorValue[] {
        return [...ACCOUNT_COLORS];
    }

    static isAccountColor(value: string): value is AccountColorValue {
        return ACCOUNT_COLORS.includes(value as AccountColorValue);
    }
}

export const ACCOUNT_COLORS = [
    AccountColor.BLUE,
    AccountColor.GREEN,
    AccountColor.AMBER,
    AccountColor.ROSE,
    AccountColor.VIOLET,
    AccountColor.SLATE
] as const;

export type AccountColorValue = typeof ACCOUNT_COLORS[number];
